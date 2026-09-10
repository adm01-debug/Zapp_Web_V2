/**
 * Talk X — Humanized bulk messaging edge function
 * Simulates typing, personalized messages with {{nome}}, {{apelido}}, {{empresa}}, {{saudacao}}
 * Supports text + media (image, video, document, audio)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { evoFetch } from "../_shared/evolution-send.ts";
import { resolvePrivateBucketUrl } from "../_shared/evolution-api-proxy.ts";

function getGreeting(): string {
  const hour = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false });
  const h = parseInt(hour, 10);
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

function personalize(template, contact, customVars = []) {
  const firstName = (contact.name || '').split(' ')[0] || '';
  let result = template
    .replace(/\{\{nome\}\}/gi, firstName)
    .replace(/\{\{nome_completo\}\}/gi, contact.name || '')
    .replace(/\{\{apelido\}\}/gi, contact.nickname || firstName)
    .replace(/\{\{empresa\}\}/gi, contact.company || '')
    .replace(/\{\{saudacao\}\}/gi, getGreeting());
  for (const v of customVars) {
    result = result.split('{{' + v + '}}').join('[' + v + ']');
  }
  return result;
}
/** E49: sorteia variante A/B pelo peso. Retorna null se nao houver variantes. */
async function pickVariant(supabase: SupabaseClient, templateId: string): Promise<{ id: string; content: string; media_url: string | null; media_type: string | null } | null> {
  const { data: variants, error: varErr } = await supabase
    .from('talkx_template_variants')
    .select('id,content,media_url,media_type,weight')
    .eq('template_id', templateId);
  if (varErr) throw new Error(`variant_lookup_failed: ${varErr.message}`);
  if (!variants || variants.length === 0) return null;
  const total = variants.reduce((s: number, v: { weight: number }) => s + v.weight, 0);
  let roll = Math.random() * total;
  for (const v of variants) { roll -= v.weight; if (roll <= 0) return v; }
  return variants[variants.length - 1];
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || (response.status >= 400 && response.status < 500)) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < maxRetries) {
      const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      await sleep(backoff);
    }
  }
  throw lastError || new Error("Fetch failed after retries");
}

function getMediaEndpoint(mediaType: string): string {
  switch (mediaType) {
    case "audio": return "sendWhatsAppAudio";
    default: return "sendMedia";
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const log = new Logger("talkx-send");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL")!;
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY")!;

    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: service-role key (scheduler/server-side) OR user JWT with admin/manager role.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }
    const token = authHeader.slice(7);
    const isServiceKey = token === serviceKey;
    if (!isServiceKey) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
      }
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "supervisor"])
        .maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
      }
    }

    const body = await req.json();
    const { campaignId, action } = body;

    // E47: action test --- envia template de teste para um numero
    if (action === "test") {
      const { templateContent, mediaUrl, mediaType, phone, customVariables } = body as {
        templateContent: string;
        mediaUrl?: string | null;
        mediaType?: string | null;
        phone: string;
        customVariables?: string[];
      };
      if (!templateContent || !phone) {
        return new Response(JSON.stringify({ error: "templateContent e phone obrigatorios" }), { status: 400, headers });
      }
      // Buscar conexao WhatsApp padrao (primeira ativa)
      const { data: conn } = await supabase
        .from("whatsapp_connections").select("instance_id").eq("status", "connected").limit(1).single();
      if (!conn?.instance_id) {
        return new Response(JSON.stringify({ error: "Nenhuma conexao WhatsApp ativa" }), { status: 400, headers });
      }
      // Personalizar com dados ficticios para preview
      const dummyContact = { name: "Joao Silva", nickname: "Joao", company: "Empresa Teste" };
      const personalizedText = personalize(templateContent, dummyContact, customVariables ?? []);
      const cleanPhone = phone.replace(/\D/g, "");
      try {
        let sendRes: Response;
        if (mediaUrl && mediaType && mediaType !== "audio") {
          sendRes = await evoFetch(evolutionUrl, evolutionKey, `/message/sendMedia/${conn.instance_id}`, {
            number: cleanPhone, mediatype: mediaType, media: mediaUrl, caption: personalizedText,
          });
        } else {
          sendRes = await evoFetch(evolutionUrl, evolutionKey, `/message/sendText/${conn.instance_id}`, {
            number: cleanPhone, text: personalizedText,
          });
        }
        if (!sendRes.ok) {
          const body = await sendRes.text().catch(() => '');
          return new Response(JSON.stringify({ error: `Evolution retornou ${sendRes.status}: ${body}` }), { status: 502, headers });
        }
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro ao enviar" }), { status: 500, headers });
      }
    }

    if (!campaignId) {
      return new Response(JSON.stringify({ error: "campaignId required" }), { status: 400, headers });
    }

    // Handle pause/cancel
    if (action === "pause" || action === "cancel") {
      const newStatus = action === "pause" ? "paused" : "cancelled";
      await supabase.from("talkx_campaigns").update({ status: newStatus }).eq("id", campaignId);
      return new Response(JSON.stringify({ success: true, status: newStatus }), { headers });
    }

    // Get campaign
    const { data: campaign, error: campErr } = await supabase
      .from("talkx_campaigns").select("*").eq("id", campaignId).single();

    if (campErr || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404, headers });
    }

    // Get WhatsApp connection instance
    const { data: connection } = await supabase
      .from("whatsapp_connections").select("instance_id").eq("id", campaign.whatsapp_connection_id).single();

    if (!connection?.instance_id) {
      return new Response(JSON.stringify({ error: "WhatsApp connection not found" }), { status: 400, headers });
    }

    // Enforce send_window and business_hours_only before marking as sending.
    const nowBR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hBR = nowBR.getHours(); const mBR = nowBR.getMinutes(); const dowBR = nowBR.getDay();
    const hmBR = hBR * 60 + mBR;
    if (campaign.send_window_start && campaign.send_window_end) {
      const [ws_h, ws_m] = campaign.send_window_start.split(":").map(Number);
      const [we_h, we_m] = campaign.send_window_end.split(":").map(Number);
      const ws = ws_h * 60 + ws_m; const we = we_h * 60 + we_m;
      if (hmBR < ws || hmBR >= we) {
        return new Response(JSON.stringify({ ok: false, reason: "outside_send_window", next_window: campaign.send_window_start }), { headers });
      }
    }
    if (campaign.business_hours_only) {
      // Mon–Fri (1–5), 08:00–18:00 Brasília
      if (dowBR === 0 || dowBR === 6 || hBR < 8 || hBR >= 18) {
        return new Response(JSON.stringify({ ok: false, reason: "outside_business_hours" }), { headers });
      }
    }

    // Mark as sending
    await supabase.from("talkx_campaigns")
      .update({ status: "sending", started_at: new Date().toISOString() }).eq("id", campaignId);

    // Get pending recipients with contact info
    const { data: recipients } = await supabase
      .from("talkx_recipients")
      .select("*, contacts:contact_id(name, nickname, phone, company)")
      .eq("campaign_id", campaignId)
      .in("status", ["pending", "sending"])
      .order("created_at");

    // Get blacklisted contact IDs
    const now = new Date().toISOString();
    const { data: blacklisted } = await supabase.from("talkx_blacklist")
      .select("contact_id, phone")
      .is("removed_at", null)
      .or(`expires_at.is.null,expires_at.gt.${now}`);
    const blacklistSet = new Set((blacklisted || []).map((b: Record<string, unknown>) => b.contact_id).filter(Boolean));
    const blacklistPhones = new Set((blacklisted || []).map((b: Record<string, unknown>) => b.phone).filter(Boolean));

    // Filter out blacklisted recipients
    const eligibleRecipients = (recipients || []).filter((r: Record<string, unknown>) => {
      const recipientPhone = (r as Record<string, unknown>).phone as string | undefined;
        if (blacklistSet.has(r.contact_id) || (recipientPhone && blacklistPhones.has(recipientPhone.replace(/\D/g, '')))) {
        supabase.from("talkx_recipients")
          .update({ status: "skipped", error_message: "Contato na lista negra (opt-out)" }).eq("id", r.id);
        return false;
      }
      return true;
    });

    if (eligibleRecipients.length === 0) {
      await supabase.from("talkx_campaigns")
        .update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", campaignId);
      return new Response(JSON.stringify({ success: true, message: "No eligible recipients to send" }), { headers });
    }

    let sentCount = campaign.sent_count || 0;
    let failedCount = campaign.failed_count || 0;
    // whatsapp-media e bucket privado: a GO so baixa via signed URL (TTL 300s). Uma
    // assinatura serve varios destinatarios; reassina depois de 240s porque campanhas
    // com typingDelay por envio passam do TTL.
    let signedMedia: { url: string; at: number } | null = null;
    const mediaForSend = async () => {
      if (!signedMedia || Date.now() - signedMedia.at > 240_000) {
        signedMedia = { url: await resolvePrivateBucketUrl(supabase, campaign.media_url, undefined, supabaseUrl), at: Date.now() };
      }
      return signedMedia.url;
    };

    for (const recipient of eligibleRecipients) {
      // Check if campaign was paused/cancelled
      const { data: currentCampaign } = await supabase
        .from("talkx_campaigns").select("status").eq("id", campaignId).single();

      if (currentCampaign?.status === "paused" || currentCampaign?.status === "cancelled") break;

      const contact = recipient.contacts as Record<string, unknown>;
      if (!contact?.phone) {
        await supabase.from("talkx_recipients")
          .update({ status: "skipped", error_message: "Sem número de telefone" }).eq("id", recipient.id);
        continue;
      }

      // E49: sortear variante A/B
      const existingVid = (recipient as Record<string, unknown>).variant_id as string | null;
      let variant: { id: string; content: string; media_url: string | null; media_type: string | null; weight?: number } | null = null;
      if (existingVid) {
        const { data: vData, error: vErr } = await supabase
          .from('talkx_template_variants').select('id,content,media_url,media_type,weight')
          .eq('id', existingVid).single();
        if (!vErr && vData) variant = vData;
        // em erro: variant fica null mas existingVid é preservado no update abaixo
      } else if (campaign.template_id) {
        variant = await pickVariant(supabase, campaign.template_id);
      }
      const contentToSend = variant?.content ?? campaign.message_template;
      const effectiveMediaUrl = variant?.media_url ?? campaign.media_url ?? null;
      const effectiveMediaType = variant?.media_type ?? campaign.media_type ?? null;
      const recipientHasMedia = !!effectiveMediaUrl && !!effectiveMediaType;
      const personalizedMsg = personalize(contentToSend, contact as { name: string; nickname?: string; company?: string });
      await supabase.from("talkx_recipients")
        .update({ personalized_message: personalizedMsg, status: "sending", variant_id: variant?.id ?? existingVid ?? null }).eq("id", recipient.id);

      try {
        const phone = (contact.phone as string).replace(/\D/g, "");
        const typingDelay = randomBetween(campaign.typing_delay_min, campaign.typing_delay_max);

        try {
          await evoFetch(evolutionUrl, evolutionKey,
            `/chat/updatePresence/${connection.instance_id}`,
            { number: phone, presence: "composing" });
        } catch { /* Presence update is best-effort */ }

        await sleep(typingDelay);

        let sendResponse: Response;
        let sendResult: Record<string, unknown>;

        if (recipientHasMedia) {
          const mediaEndpoint = getMediaEndpoint(effectiveMediaType!);
          const mediaSource = (effectiveMediaUrl !== campaign.media_url)
            ? await resolvePrivateBucketUrl(supabase, effectiveMediaUrl!, undefined, supabaseUrl)
            : await mediaForSend();
          sendResponse = await evoFetch(evolutionUrl, evolutionKey,
            `/message/${mediaEndpoint}/${connection.instance_id}`,
            { number: phone, mediatype: effectiveMediaType!, media: mediaSource, caption: personalizedMsg, delay: 0 },
            fetchWithRetry
          );
          sendResult = await sendResponse.json();
        } else {
          sendResponse = await evoFetch(evolutionUrl, evolutionKey,
            `/message/sendText/${connection.instance_id}`,
            { number: phone, text: personalizedMsg, delay: 0 },
            fetchWithRetry
          );
          sendResult = await sendResponse.json();
        }

        if (sendResponse.ok && !sendResult.error) {
          sentCount++;
          await supabase.from("talkx_recipients")
            .update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", recipient.id);
        } else {
          failedCount++;
          await supabase.from("talkx_recipients")
            .update({ status: "failed", error_message: (sendResult?.message || sendResult?.error || "Erro ao enviar") as string }).eq("id", recipient.id);
        }
      } catch (err) {
        failedCount++;
        await supabase.from("talkx_recipients")
          .update({ status: "failed", error_message: err instanceof Error ? err.message : "Erro desconhecido" }).eq("id", recipient.id);
      }

      await supabase.from("talkx_campaigns")
        .update({ sent_count: sentCount, failed_count: failedCount }).eq("id", campaignId);

      const sendInterval = randomBetween(campaign.send_interval_min, campaign.send_interval_max);
      await sleep(sendInterval);
    }

    // Check final status
    const { data: finalCampaign } = await supabase
      .from("talkx_campaigns").select("status").eq("id", campaignId).single();

    if (finalCampaign?.status === "sending") {
      await supabase.from("talkx_campaigns")
        .update({ status: "completed", completed_at: new Date().toISOString(), sent_count: sentCount, failed_count: failedCount })
        .eq("id", campaignId);
    }

    log.done(200, { sent: sentCount, failed: failedCount });

    return new Response(
      JSON.stringify({
        success: true, sent: sentCount, failed: failedCount,
        total: eligibleRecipients.length,
        blacklisted: (recipients || []).length - eligibleRecipients.length,
      }),
      { headers }
    );
  } catch (err) {
    log.error("Talk X error", { error: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers }
    );
  }
});
