/**
 * talkx-link — Edge function de links rastreáveis (E90)
 *
 * GET  /talkx-link?s=<slug>&r=<recipient_id>  → registra clique e redireciona (302) para target_url
 * POST /talkx-link                            → {action:'convert', recipient_id, value?, source?} → registra conversão
 *
 * O worker é stateless; toda a lógica de persistência fica em RPCs seguras (SECURITY DEFINER).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors, getClientIP, enforceRateLimit } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, serviceKey);
  // Endpoint público e sem sessão: nada além do IP identifica o chamador, e
  // TALKX_LINK_IP_SALT pode não estar provisionado ainda. A service role key
  // já é um secret por-projeto presente neste isolate e nunca aparece no
  // código público, então serve como fallback seguro ao literal fixo anterior.
  const ipSalt = Deno.env.get("TALKX_LINK_IP_SALT") ?? serviceKey;

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
      // Redireciona para fallback em vez de retornar 404
      return Response.redirect(supabaseUrl, 302);
    }

    const targetUrl = data?.target_url as string;
    if (!targetUrl) return new Response("Link não encontrado", { status: 404 });

    return Response.redirect(targetUrl, 302);
  }

  // ── POST: registrar conversão ───────────────────────────────────────────────
  if (method === "POST") {
    // Mesmo limite do GET: webhook/pixel de conversão também é chamado sem
    // sessão, direto do site de destino do link.
    const rate = await enforceRateLimit(`talkx-link:convert:${clientIp}`, 60, 60_000);
    if (!rate.allowed) {
      return new Response("Too many requests", { status: 429 });
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return new Response("Invalid JSON", { status: 400 }); }

    const { action, recipient_id, value, source, link_id } = body as {
      action?: string;
      recipient_id?: string;
      value?: number;
      source?: string;
      link_id?: string;
    };

    if (action !== "convert") {
      return new Response("Unknown action", { status: 400 });
    }

    if (!recipient_id) {
      return new Response("recipient_id required", { status: 400 });
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

    // IDOR: um link_id arbitrário não pode ser atribuído a um recipient de
    // outra campanha — inflaria conversão/receita de uma campanha com
    // cliques de outra.
    if (link_id) {
      const { data: linkRow } = await supabase
        .from("talkx_links")
        .select("campaign_id")
        .eq("id", link_id)
        .maybeSingle();
      if (!linkRow || linkRow.campaign_id !== rec.campaign_id) {
        return new Response("link_id does not belong to recipient's campaign", { status: 400 });
      }
    }

    const { error: convErr } = await supabase
      .from("talkx_conversions")
      .insert({
        campaign_id:  rec.campaign_id,
        recipient_id,
        link_id:      link_id ?? null,
        value:        value ?? null,
        source:       source ?? "webhook",
      });

    if (convErr) {
      console.warn("[talkx-link] conversion error:", convErr.message);
      return new Response(JSON.stringify({ error: convErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    return new Response(
      JSON.stringify({ success: true, campaign_id: rec.campaign_id }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }

  return new Response("Method not allowed", { status: 405 });
});

async function hashIp(ip: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
