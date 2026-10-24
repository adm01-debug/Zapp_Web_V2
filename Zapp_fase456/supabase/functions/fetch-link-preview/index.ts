import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  enforceRateLimit,
  getClientIP,
  getCorsHeaders,
  handleCors,
  requireAuth,
} from "../_shared/validation.ts";
import { isServiceRoleRequest } from "../_shared/ai-auth.ts";
import { fetchPreviewViaSecureEgress } from "../_shared/secure-egress.ts";
import { isBlockedIpAddress } from "../_shared/ssrf.ts";

interface PreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

const MAX_BYTES = 512 * 1024; // 512KB cap
const FETCH_TIMEOUT_MS = 6000;

// Teto do corpo da imagem embutida na prévia. Mesmo teto que o proxy de egresso
// aplica ao HTML; acima disso a imagem é descartada (uma data URL cortada
// deixaria a imagem quebrada no cliente).
const IMAGE_MAX_BYTES = 512 * 1024;

// SEC-EDGE_FUNCTIONS-03: `verify_jwt = true` no gateway não é autenticação de
// usuário (a anon key pública é um JWT válido do projeto). Sem guarda própria a
// função vira fetcher de URL arbitrária e grava `link_preview_cache` com
// service_role. Como as demais funções de egresso: exige usuário real e limita a
// taxa ANTES do cache/egress. 30/min por usuário é folgado para o único chamador
// (enriquecer o link da própria mensagem enviada).
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

// In-memory LRU-ish cache by URL hash. Persists while the isolate is warm.
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6h for hits
const NEG_CACHE_TTL_MS = 1000 * 60 * 15; // 15min for misses/errors
const CACHE_MAX = 500;
const previewCache = new Map<
  string,
  { expiresAt: number; preview: PreviewData | null }
>();

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const db = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  : null;

async function dbCacheGet(
  key: string,
): Promise<{ hit: boolean; preview: PreviewData | null }> {
  if (!db) return { hit: false, preview: null };
  const { data, error } = await db
    .from("link_preview_cache")
    .select("preview, expires_at")
    .eq("url_hash", key)
    .maybeSingle();
  if (error || !data) return { hit: false, preview: null };
  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    return { hit: false, preview: null };
  }
  return { hit: true, preview: (data.preview as PreviewData | null) ?? null };
}

async function dbCacheSet(
  key: string,
  url: string,
  preview: PreviewData | null,
): Promise<void> {
  if (!db) return;
  const ttl = preview ? CACHE_TTL_MS : NEG_CACHE_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl).toISOString();
  await db
    .from("link_preview_cache")
    .upsert(
      { url_hash: key, url, preview, expires_at: expiresAt },
      { onConflict: "url_hash" },
    );
}

async function hashUrl(raw: string): Promise<string> {
  const buf = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function cacheGet(key: string): { hit: boolean; preview: PreviewData | null } {
  const entry = previewCache.get(key);
  if (!entry) return { hit: false, preview: null };
  if (entry.expiresAt < Date.now()) {
    previewCache.delete(key);
    return { hit: false, preview: null };
  }
  // refresh LRU position
  previewCache.delete(key);
  previewCache.set(key, entry);
  return { hit: true, preview: entry.preview };
}

function cacheSet(key: string, preview: PreviewData | null): void {
  if (previewCache.size >= CACHE_MAX) {
    const oldest = previewCache.keys().next().value;
    if (oldest) previewCache.delete(oldest);
  }
  previewCache.set(key, {
    expiresAt: Date.now() + (preview ? CACHE_TTL_MS : NEG_CACHE_TTL_MS),
    preview,
  });
}

function decodeEntities(s: string): string {
  // `&amp;` por ultimo: decodificar primeiro transformava "&amp;lt;" em "<"
  // (double-unescape, CodeQL js/double-escaping).
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function extractMeta(html: string, names: string[]): string | undefined {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`,
      "i",
    );
    const alt = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`,
      "i",
    );
    const m = html.match(re) || html.match(alt);
    if (m?.[1]) return decodeEntities(m[1]).trim();
  }
  return undefined;
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1] ? decodeEntities(m[1]).trim() : undefined;
}

function absolutize(
  maybeUrl: string | undefined,
  base: URL,
): string | undefined {
  if (!maybeUrl) return undefined;
  try {
    return new URL(maybeUrl, base).toString();
  } catch {
    return undefined;
  }
}

/** Literal de IP (IPv4 "a.b.c.d" ou IPv6 com ":"), não um nome de host. */
function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

/**
 * A imagem da prévia sai como `data:` URL (ver `proxyImage`), mas antes ela é
 * buscada pelo proxy de egresso. Loopback, rede interna, metadados e nomes
 * internos nunca podem ser buscados, e a prévia só embute imagem por `https:`
 * (host que o cliente escolheu não fala http com o atendente).
 */
function isBlockedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host.length === 0) return true;
  if (
    host === "localhost" || host.endsWith(".localhost") ||
    host.endsWith(".local") || host.endsWith(".internal") ||
    host.endsWith(".localdomain")
  ) {
    return true;
  }
  // `isBlockedIpAddress` só entende IP: aplicá-lo a um nome ("fcdn.com" começa
  // com "fc") daria falso positivo.
  return isIpLiteral(host) ? isBlockedIpAddress(host) : false;
}

/** Base64 de um Uint8Array em blocos (espalhar 512 KiB em argumentos estoura a pilha). */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let index = 0; index < bytes.length; index += CHUNK) {
    const chunk = bytes.subarray(index, index + CHUNK);
    parts.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
  }
  return btoa(parts.join(""));
}

/**
 * SEC: a prévia embutia o `og:image` cru e o navegador do atendente conectava
 * no host escolhido pelo cliente (vazamento de IP). Aqui a imagem é buscada
 * pelo proxy de egresso (IP fixado, redirect revalidado) e devolvida como
 * `data:` URL — o atendente nunca fala com o host do link. Recusa fora de
 * `https:`, host interno/metadados, tipo que não é `image/*` e corpo acima do
 * teto. Qualquer falha vira "sem imagem", nunca erro para o cliente.
 */
async function proxyImage(rawImageUrl: string): Promise<string | undefined> {
  let parsed: URL;
  try {
    parsed = new URL(rawImageUrl);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:") return undefined;
  if (isBlockedImageHost(parsed.hostname)) return undefined;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let result: { url: URL; response: Response } | null = null;
  try {
    result = await fetchPreviewViaSecureEgress(rawImageUrl, undefined, {
      signal: ctrl.signal,
    });
  } catch {
    result = null;
  } finally {
    clearTimeout(timer);
  }
  if (!result) return undefined;

  const { response } = result;
  if (!response.ok) return undefined;
  const contentType = (response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!contentType.startsWith("image/")) return undefined;

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    return undefined;
  }
  if (bytes.byteLength === 0 || bytes.byteLength > IMAGE_MAX_BYTES) {
    return undefined;
  }
  return `data:${contentType};base64,${bytesToBase64(bytes)}`;
}

async function fetchPreview(rawUrl: string): Promise<PreviewData | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const result = await fetchPreviewViaSecureEgress(rawUrl, undefined, {
    signal: ctrl.signal,
  });
  clearTimeout(timer);
  if (!result) return null;
  const { url, response: resp } = result;

  if (!resp.ok || !resp.body) return null;
  const ct = resp.headers.get("content-type") || "";
  if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
    return null;
  }

  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    try {
      await reader.cancel();
    } catch { /* noop */ }
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);

  const title = extractMeta(html, ["og:title", "twitter:title"]) ||
    extractTitle(html);
  const description = extractMeta(html, [
    "og:description",
    "twitter:description",
    "description",
  ]);
  // `absolutize` só resolve o valor contra a URL final da página: NÃO valida
  // esquema nem host (um `og:image` absoluto em `http:`/host interno passava
  // intacto e ia para o `<img>` do cliente). A validação e a busca pelo proxy
  // ficam em `proxyImage`.
  const imageCandidate = absolutize(
    extractMeta(html, ["og:image", "og:image:url", "twitter:image"]),
    url,
  );
  const image = imageCandidate ? await proxyImage(imageCandidate) : undefined;
  const siteName = extractMeta(html, ["og:site_name", "application-name"]);

  if (!title && !description && !image) return null;

  return {
    url: url.toString(),
    title,
    description,
    image,
    siteName,
  };
}

export async function handleFetchLinkPreview(req: Request): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  // `verify_jwt = true` no gateway NÃO é autenticação de usuário: a anon key
  // pública (que vai no bundle do frontend) é um JWT válido do projeto. A guarda
  // abaixo é a única barreira antes do egress e da gravação em
  // `link_preview_cache` (feita com service_role).
  //
  // Dois chamadores legítimos, ambos limitados ANTES de tocar o cache/egress:
  //   1. usuário do front (sessão) -> requireAuth, cota por usuário;
  //   2. webhook interno de mensagem RECEBIDA
  //      (`_shared/evolution-webhook-messages.ts` chama esta edge com a service
  //      role key) -> identidade de serviço conferida em tempo constante, cota
  //      própria por IP. Máquina não é usuário, mas também não é passe livre.
  let rateLimitKey: string;
  if (isServiceRoleRequest(req)) {
    rateLimitKey = `fetch-link-preview:service:${getClientIP(req)}`;
  } else {
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    rateLimitKey = `fetch-link-preview:${auth.userId}`;
  }

  const rateLimit = await enforceRateLimit(
    rateLimitKey,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!rateLimit.allowed) {
    const limited = new Response(
      JSON.stringify({ error: "Rate limit exceeded" }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
    limited.headers.set(
      "Retry-After",
      String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
    );
    return limited;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const url = typeof body?.url === "string" ? body.url : "";
    if (!url) {
      return new Response(
        JSON.stringify({ error: 'Missing "url" string in body' }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const key = await hashUrl(url);
    const cached = cacheGet(key);
    if (cached.hit) {
      return new Response(
        JSON.stringify({ preview: cached.preview, cached: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const dbCached = await dbCacheGet(key);
    if (dbCached.hit) {
      cacheSet(key, dbCached.preview);
      return new Response(
        JSON.stringify({
          preview: dbCached.preview,
          cached: true,
          source: "db",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const preview = await fetchPreview(url);
    cacheSet(key, preview);
    await dbCacheSet(key, url, preview);
    return new Response(JSON.stringify({ preview, cached: false }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Detalhe fica no log do servidor; o cliente recebe so o codigo do erro
    // (CodeQL js/stack-trace-exposure).
    console.error(
      "[fetch-link-preview] unexpected_error",
      err instanceof Error ? err.message : String(err),
    );
    return new Response(
      JSON.stringify({ error: "unexpected_error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
}

if (import.meta.main) {
  Deno.serve(handleFetchLinkPreview);
}
