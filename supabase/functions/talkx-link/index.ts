/**
 * talkx-link — Edge function de links rastreáveis (E90) e conversões (X022)
 *
 * GET  /talkx-link?s=<slug>&r=<recipient_id>  → registra clique, adiciona UTM e redireciona (302)
 * POST /talkx-link                            → registra conversão autenticada por HMAC-SHA256
 *
 * O worker é stateless; toda a lógica de persistência fica em RPCs seguras (SECURITY DEFINER).
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, handleCors, getClientIP, enforceRateLimit } from "../_shared/validation.ts";
import { verifyHmacSignature } from "../_shared/hmac-validation.ts";

const CONVERT_WINDOW_MS = 5 * 60 * 1000; // x-talkx-timestamp tolera ±5 min
const MAX_BODY_BYTES = 4096;             // corpo do POST até 4 KB

// R2-API-035: versão do esquema de assinatura. O HMAC-SHA256 (hex minúsculo)
// cobre "v1\n<timestamp_ms>\n<external_ref>\n<corpo_cru>" — o par corpo+
// assinatura capturado não vale com timestamp nem external_ref trocados.
export const SIGNATURE_VERSION = "v1";
export const LEGACY_SIGNATURE_ACCEPT_UNTIL_ENV = "TALKX_LEGACY_SIGNATURE_ACCEPT_UNTIL";
export const DEFAULT_LEGACY_SIGNATURE_ACCEPT_UNTIL = "2026-10-20T23:59:59.999-03:00";

export function buildSignaturePayload(timestamp: string, externalRef: string, rawBody: string): string {
  return [SIGNATURE_VERSION, timestamp, externalRef, rawBody].join("\n");
}

function parseLegacySignatureAcceptUntil(env: TalkxLinkDeps["env"]): { raw: string; ms: number } {
  const configured = env.get(LEGACY_SIGNATURE_ACCEPT_UNTIL_ENV)?.trim();
  const raw = configured || DEFAULT_LEGACY_SIGNATURE_ACCEPT_UNTIL;
  const ms = /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw);
  if (!Number.isFinite(ms)) {
    console.warn(`[talkx-link] ${LEGACY_SIGNATURE_ACCEPT_UNTIL_ENV} inválido; assinatura legada desativada`);
    return { raw, ms: 0 };
  }
  return { raw, ms };
}

async function verifyTalkxConvertSignature(params: {
  rawBody: string;
  signature: string;
  secret: string;
  timestamp: string;
  externalRef: unknown;
  env: TalkxLinkDeps["env"];
}): Promise<{ scheme: "v1" | "legacy"; legacyAcceptUntil?: string } | null> {
  const externalRefForSignature = typeof params.externalRef === "string" ? params.externalRef : "";
  const v1Valid = await verifyHmacSignature(
    buildSignaturePayload(params.timestamp, externalRefForSignature, params.rawBody),
    params.signature,
    params.secret,
  );
  if (v1Valid) {
    return { scheme: "v1" };
  }

  const legacyWindow = parseLegacySignatureAcceptUntil(params.env);
  if (Date.now() > legacyWindow.ms) {
    return null;
  }
  const legacyValid = await verifyHmacSignature(params.rawBody, params.signature, params.secret);
  return legacyValid ? { scheme: "legacy", legacyAcceptUntil: legacyWindow.raw } : null;
}

interface TalkxLinkDeps {
  supabase: SupabaseClient;
  env: { get: (name: string) => string | undefined };
}

export async function handleTalkxLink(req: Request, deps: TalkxLinkDeps): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const { supabase, env } = deps;
  // Endpoint público e sem sessão: nada além do IP identifica o chamador, e
  // TALKX_LINK_IP_SALT pode não estar provisionado ainda. A service role key
  // já é um secret por-projeto presente neste isolate e nunca aparece no
  // código público, então serve como fallback seguro ao literal fixo anterior.
  const ipSalt = env.get("TALKX_LINK_IP_SALT") ?? env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "link-ip-salt";

  const url = new URL(req.url);
  const method = req.method.toUpperCase();
  const clientIp = getClientIP(req);

  // ── GET: clique + redirect ──────────────────────────────────────────────────
  if (method === "GET") {
    const slug      = url.searchParams.get("s");
    const recipient = url.searchParams.get("r") ?? undefined;

    if (!slug) {
      return new Response("Bad request: missing slug", { status: 400 });
    }

    // Rate limit por IP: o link é clicado a partir do WhatsApp de cada
    // destinatário (sem sessão), então o limite é por-IP, não por-usuário.
    // Falha aberta com o fallback em memória se o limiter persistente cair —
    // nunca derruba o redirect real por causa disso.
    const rate = await enforceRateLimit(`talkx-link:click:${clientIp}`, 60, 60_000);
    if (!rate.allowed) {
      return new Response("Too many requests", { status: 429 });
    }

    const ua     = req.headers.get("user-agent") ?? undefined;
    // Hash trivial (não persiste IP raw)
    const ipHash = clientIp === "unknown" ? undefined : await hashIp(clientIp, ipSalt);

    const { data, error } = await supabase.rpc("record_talkx_link_click", {
      p_slug:      slug,
      p_recipient: recipient ?? null,
      p_ua:        ua ?? null,
      p_ip_hash:   ipHash ?? null,
    });

    if (error || data?.error) {
      console.warn("[talkx-link] click error:", error?.message ?? data?.error);
      // X022: slug inexistente/erro de clique → 404 neutro (não redireciona
      // para o projeto nem vaza texto do banco).
      return new Response("Not found", { status: 404 });
    }

    const targetUrl = data?.target_url as string;
    if (!targetUrl) return new Response("Not found", { status: 404 });

    // X022: acrescenta os UTM do link ao destino, sem sobrescrever parâmetro
    // que o destino já tenha.
    const { data: linkRow } = await supabase
      .from("talkx_links")
      .select("utm_source, utm_medium, utm_campaign, utm_content, utm_term")
      .eq("id", data.link_id)
      .maybeSingle();
    const finalUrl = mergeUtm(targetUrl, linkRow as Record<string, unknown> | null | undefined);

    return Response.redirect(finalUrl, 302);
  }

  // ── POST: registrar conversão (autenticado) ────────────────────────────────
  if (method === "POST") {
    // X022: sem o secret de assinatura, o endpoint fica indisponível (503).
    const convertSecret = env.get("TALKX_CONVERT_SECRET");
    if (!convertSecret) {
      return new Response("Service unavailable", { status: 503 });
    }

    // Mesmo limite do GET: webhook/pixel de conversão também é chamado sem
    // sessão, direto do site de destino do link.
    const rate = await enforceRateLimit(`talkx-link:convert:${clientIp}`, 60, 60_000);
    if (!rate.allowed) {
      return new Response("Too many requests", { status: 429 });
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return new Response("Payload too large", { status: 413 });
    }

    // X022: autenticação — timestamp fresco (±5 min). A assinatura HMAC é
    // verificada depois do parse porque a v1 cobre também o external_ref do
    // corpo; durante a janela configurável, o formato legado (HMAC do corpo)
    // continua aceito para coexistência com Bitrix/site.
    const timestampHeader = req.headers.get("x-talkx-timestamp");
    const signatureHeader = req.headers.get("x-talkx-signature");
    if (!timestampHeader || !signatureHeader) {
      return new Response("Unauthorized", { status: 401 });
    }
    const now = Date.now();
    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > CONVERT_WINDOW_MS) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: Record<string, unknown>;
    try { body = JSON.parse(rawBody); }
    catch { return new Response("Invalid JSON", { status: 400 }); }

    const { action, recipient_id, value, source, link_id, external_ref, currency, occurred_at, attribution } = body as {
      action?: string;
      recipient_id?: string;
      value?: unknown;
      source?: string;
      link_id?: string;
      external_ref?: unknown;
      currency?: string;
      occurred_at?: string;
      attribution?: unknown;
    };

    if (action !== "convert") {
      return new Response("Unknown action", { status: 400 });
    }

    if (!recipient_id) {
      return new Response("recipient_id required", { status: 400 });
    }

    const signatureCheck = await verifyTalkxConvertSignature({
      rawBody,
      signature: signatureHeader,
      secret: convertSecret,
      timestamp: timestampHeader,
      externalRef: external_ref,
      env,
    });
    if (!signatureCheck) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (signatureCheck.scheme === "v1" && (typeof external_ref !== "string" || external_ref.trim() === "")) {
      return new Response("external_ref required", { status: 400 });
    }
    if (signatureCheck.scheme === "legacy") {
      console.warn(
        `[talkx-link] assinatura Talk X legada aceita temporariamente; atualizar emissor para v1 antes de ${signatureCheck.legacyAcceptUntil}`,
      );
    }
    const externalRefForRpc = typeof external_ref === "string" && external_ref.trim() !== "" ? external_ref : null;

    // X022: validação de valor antes do banco — texto/negativo/não-finito → 422.
    if (value !== undefined && value !== null) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return new Response(JSON.stringify({ error: "invalid_value" }), { status: 422, headers: { "Content-Type": "application/json" } });
      }
    }

    // Descobrir campaign_id a partir do recipient
    const { data: rec } = await supabase
      .from("talkx_recipients")
      .select("campaign_id")
      .eq("id", recipient_id)
      .maybeSingle();

    if (!rec?.campaign_id) {
      return new Response("Recipient not found", { status: 404 });
    }

    // X022: gravação só pela RPC segura (dedupe por external_ref, teto de valor,
    // IDOR de link e atribuição), nunca INSERT direto no edge.
    const { data: convResult, error: convErr } = await supabase.rpc("record_talkx_conversion", {
      p_campaign_id:  rec.campaign_id,
      p_external_ref: externalRefForRpc,
      p_value:        (typeof value === "number" ? value : null),
      p_source:       source ?? "webhook",
      p_currency:     currency ?? null,
      p_link_id:      link_id ?? null,
      p_recipient_id: recipient_id,
      p_occurred_at:  occurred_at ?? null,
      p_attribution:  attribution ?? null,
    });

    if (convErr) {
      // Sem texto do banco: erro de valor/IDOR vira 422, o resto vira 500.
      const msg = convErr.message ?? "";
      if (
        msg.includes("talkx_conversion_value_exceeds_max") ||
        msg.includes("talkx_conversion_value_negative") ||
        msg.includes("talkx_conversion_link_campaign_mismatch") ||
        msg.includes("talkx_conversion_invalid_source")
      ) {
        console.warn("[talkx-link] conversion rejected:", msg);
        return new Response(JSON.stringify({ error: "invalid_value" }), { status: 422, headers: { "Content-Type": "application/json" } });
      }
      console.warn("[talkx-link] conversion error:", msg);
      return new Response(JSON.stringify({ error: "conversion_failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const status = (convResult as { status?: string } | null)?.status;
    // X022: repetição (mesmo external_ref) devolve duplicate:true sem duplicar.
    if (status === "duplicate") {
      return new Response(
        JSON.stringify({ duplicate: true, campaign_id: rec.campaign_id }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, campaign_id: rec.campaign_id }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }

  return new Response("Method not allowed", { status: 405 });
}

async function hashIp(ip: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// X022: adiciona os UTM do link ao destino, sem sobrescrever parâmetro existente.
export function mergeUtm(targetUrl: string, linkRow: Record<string, unknown> | null | undefined): string {
  if (!linkRow) return targetUrl;
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return targetUrl;
  }
  const utm = [
    ["utm_source", linkRow.utm_source],
    ["utm_medium", linkRow.utm_medium],
    ["utm_campaign", linkRow.utm_campaign],
    ["utm_content", linkRow.utm_content],
    ["utm_term", linkRow.utm_term],
  ] as const;
  for (const [key, raw] of utm) {
    if (typeof raw !== "string" || raw === "") continue;
    // Sem sobrescrever: se o destino já tem o parâmetro, mantém o dele.
    if (parsed.searchParams.has(key)) continue;
    parsed.searchParams.set(key, raw);
  }
  return parsed.toString();
}

if (import.meta.main) {
  Deno.serve((req) => {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, serviceKey);
    return handleTalkxLink(req, {
      supabase,
      env: { get: (name) => Deno.env.get(name) },
    });
  });
}
