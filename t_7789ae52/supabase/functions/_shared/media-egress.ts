/**
 * Política de egress dos downloads de mídia disparados por payload de webhook
 * (R2-API-009). Antes dela, `persistMediaToStorage`, o caminho de sticker e
 * `persistProfilePicture` chamavam `fetch(url-do-payload)` direto — SSRF
 * pleno: loopback, link-local/metadata e host arbitrário eram buscados.
 *
 * Destinos permitidos (fail-closed — o que não casar, é rejeitado):
 *   1. `*.whatsapp.net` via HTTPS — CDN oficial de onde a Evolution lê mídia.
 *   2. Origem EXATA (scheme+host+porta) de `EVOLUTION_API_URL` e `SUPABASE_URL`:
 *      infra configurada que a edge já egressa por contrato — cobre o MinIO/S3
 *      interno que a Evolution GO usa para servir `mediaUrl`, inclusive http/IP
 *      privado, sem abrir a rede inteira.
 *   3. Extras declarados pelo operador: `MEDIA_EGRESS_ALLOWED_ORIGINS` (origens
 *      completas, mesma regra do item 2) e `MEDIA_EGRESS_ALLOWED_HOSTS`
 *      (domínios públicos, sempre https, sufixo de host).
 *
 * A revalidação acontece em CADA redirect (`redirect: "manual"`): um host
 * permitido não pode empurrar o download para um destino bloqueado. O corpo é
 * lido em streaming com teto de bytes — `Content-Length` acima do teto reprova
 * antes da leitura e corpo que estoura o teto é cancelado no meio.
 *
 * URL com credencial embutida (`user:pass@`), scheme fora de http(s), literal
 * de IP fora de origem confiável e hostname que só termina com o sufixo
 * (whatsapp.net.evil.com) são rejeitados na validação de destino.
 */
import { isBlockedIpAddress } from "./ssrf.ts";

export type MediaEgressFetcher = (input: string, init: RequestInit) => Promise<Response>;

export interface MediaEgressPolicy {
  /** Origens exatas confiáveis (`https://host[:port]` ou http quando a infra é interna). */
  trustedOrigins: readonly string[];
  /** Domínios públicos permitidos só via https; casa o host e seus subdomínios. */
  hostSuffixes: readonly string[];
}

export interface MediaEgressDownload {
  bytes: Uint8Array;
  contentType: string | null;
  /** URL efetivamente lida depois dos redirects validados. */
  finalUrl: string;
}

export interface MediaEgressDownloadOptions {
  policy?: MediaEgressPolicy;
  fetcher?: MediaEgressFetcher;
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  logTag?: string;
}

/** Teto default de download de mídia (vídeo/documento podem ser grandes). */
export const DEFAULT_MEDIA_DOWNLOAD_MAX_BYTES = 64 * 1024 * 1024;
/** Sticker e avatar são imagens pequenas — teto apertado. */
export const SMALL_MEDIA_DOWNLOAD_MAX_BYTES = 8 * 1024 * 1024;
export const MEDIA_EGRESS_MAX_REDIRECTS = 3;

const MAX_URL_CHARS = 4096;
const DEFAULT_TIMEOUT_MS = 15000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BUILTIN_MEDIA_HOST_SUFFIXES = ["whatsapp.net"] as const;

function safeOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeHostname(value: string): string | null {
  const host = value.trim().toLowerCase().replace(/\.+$/, "");
  if (host.length === 0 || host.includes("/") || host.includes(":")) return null;
  return host;
}

/**
 * Monta a política a partir do ambiente. Qualquer entrada malformada é
 * ignorada — a lista resultante pode ser só a do CDN do WhatsApp, nunca fica
 * mais permissiva por configuração ruim.
 */
export function mediaEgressPolicyFromEnv(
  envGet: (key: string) => string | undefined = (key) => Deno.env.get(key),
): MediaEgressPolicy {
  const origins = new Set<string>();
  for (const name of ["EVOLUTION_API_URL", "SUPABASE_URL"]) {
    const origin = safeOrigin(envGet(name));
    if (origin) origins.add(origin);
  }
  for (const raw of (envGet("MEDIA_EGRESS_ALLOWED_ORIGINS") ?? "").split(",")) {
    const origin = safeOrigin(raw);
    if (origin) origins.add(origin);
  }

  const suffixes = new Set<string>(BUILTIN_MEDIA_HOST_SUFFIXES);
  for (const raw of (envGet("MEDIA_EGRESS_ALLOWED_HOSTS") ?? "").split(",")) {
    const host = normalizeHostname(raw);
    if (host) suffixes.add(host);
  }

  return { trustedOrigins: [...origins], hostSuffixes: [...suffixes] };
}

/**
 * Decide se `raw` pode ser baixada. Devolve a URL normalizada ou null.
 * Origem confiável casa scheme+host+porta (inclui http/IP privado de infra);
 * fora dela só https para sufixo de domínio permitido — literal de IP e
 * credencial embutida nunca passam.
 */
export function resolveMediaEgressUrl(raw: string, policy: MediaEgressPolicy): URL | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_URL_CHARS) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username !== "" || url.password !== "") return null;

  if (policy.trustedOrigins.includes(url.origin)) return url;

  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (isBlockedIpAddress(host)) return null;
  for (const suffix of policy.hostSuffixes) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return url;
  }
  return null;
}

/** Lê o corpo até `maxBytes`; estourou, cancela e devolve null. */
async function readBodyCapped(resp: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(resp.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await resp.body?.cancel().catch(() => {});
    return null;
  }
  const body = resp.body;
  if (!body) return new Uint8Array(0);

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let exceeded = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;
      total += value.length;
      if (total > maxBytes) {
        exceeded = true;
        break;
      }
      chunks.push(value);
    }
    if (exceeded) await reader.cancel().catch(() => {});
  } catch {
    await reader.cancel().catch(() => {});
    return null;
  } finally {
    reader.releaseLock();
  }
  if (exceeded) return null;

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Baixa `rawUrl` respeitando a política de egress: valida o destino antes de
 * cada requisição (incluindo cada redirect), lê o corpo com teto de bytes e
 * devolve null em qualquer reprovação — o chamador trata como "mídia não
 * obtida" e cai no fallback via API da Evolution, como já fazia.
 */
export async function downloadMediaWithEgressPolicy(
  rawUrl: string,
  options: MediaEgressDownloadOptions = {},
): Promise<MediaEgressDownload | null> {
  const policy = options.policy ?? mediaEgressPolicyFromEnv();
  const fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  const maxBytes = options.maxBytes && options.maxBytes > 0
    ? Math.floor(options.maxBytes)
    : DEFAULT_MEDIA_DOWNLOAD_MAX_BYTES;
  const maxRedirects = typeof options.maxRedirects === "number" && options.maxRedirects >= 0
    ? Math.floor(options.maxRedirects)
    : MEDIA_EGRESS_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs && options.timeoutMs > 0
    ? Math.floor(options.timeoutMs)
    : DEFAULT_TIMEOUT_MS;
  const tag = options.logTag ?? "MEDIA-EGRESS";

  let current = resolveMediaEgressUrl(rawUrl, policy);
  if (!current) {
    console.warn(`[${tag}] destino rejeitado pela política de egress`);
    return null;
  }

  for (let hop = 0; ; hop++) {
    let resp: Response;
    try {
      resp = await fetcher(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      console.warn(`[${tag}] download falhou:`, err instanceof Error ? err.message : String(err));
      return null;
    }

    if (REDIRECT_STATUSES.has(resp.status)) {
      await resp.body?.cancel().catch(() => {});
      const location = resp.headers.get("location");
      if (!location || hop >= maxRedirects) {
        console.warn(`[${tag}] redirect sem destino válido (hop ${hop})`);
        return null;
      }
      let next: URL | null;
      try {
        next = resolveMediaEgressUrl(new URL(location, current).toString(), policy);
      } catch {
        next = null;
      }
      if (!next) {
        console.warn(`[${tag}] redirect para destino fora da política — abortado`);
        return null;
      }
      current = next;
      continue;
    }

    if (!resp.ok) {
      await resp.body?.cancel().catch(() => {});
      console.warn(`[${tag}] resposta ${resp.status}`);
      return null;
    }

    const bytes = await readBodyCapped(resp, maxBytes);
    if (!bytes) {
      console.warn(`[${tag}] corpo excede o teto de ${maxBytes} bytes ou falhou na leitura`);
      return null;
    }
    return { bytes, contentType: resp.headers.get("content-type"), finalUrl: current.toString() };
  }
}
