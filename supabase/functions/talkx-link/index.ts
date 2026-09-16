/**
 * talkx-link — Edge function de links rastreáveis (E90)
 *
 * GET  /talkx-link?s=<slug>&r=<recipient_id>  → registra clique e redireciona (302) para target_url
 * POST /talkx-link                            → {action:'convert', recipient_id, value?, source?} → registra conversão
 *
 * O worker é stateless; toda a lógica de persistência fica em RPCs seguras (SECURITY DEFINER).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, serviceKey);

  const url = new URL(req.url);
  const method = req.method.toUpperCase();

  // ── GET: clique + redirect ──────────────────────────────────────────────────
  if (method === "GET") {
    const slug      = url.searchParams.get("s");
    const recipient = url.searchParams.get("r") ?? undefined;

    if (!slug) {
      return new Response("Bad request: missing slug", { status: 400 });
    }

    // Extrair UA e IP (melhor esforço)
    const ua     = req.headers.get("user-agent") ?? undefined;
    const rawIp  = req.headers.get("cf-connecting-ip")
                ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim()
                ?? "unknown";
    // Hash trivial (não persiste IP raw)
    const ipHash = rawIp === "unknown" ? undefined : await hashIp(rawIp);

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

async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + "talkx-salt");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
