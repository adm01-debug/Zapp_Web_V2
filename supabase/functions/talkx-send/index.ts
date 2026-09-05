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

function personalize(template: string, contact: { name: string; nickname?: string; company?: string }): string {
  const firstName = contact.name?.split(" ")[0] || "";
  return template
    .replace(/\{\{nome\}\}/gi, firstName)
    .replace(/\{\{nome_completo\}\}/gi, contact.name || "")
    .replace(/\{\{apelido\}\}/gi, contact.nickname || firstName)
    .replace(/\{\{empresa\}\}/gi, contact.company || "")
    .replace(/\{\{saudacao\}\}/gi, getGreeting());
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
    const { campaignId, action } = await req.json();

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
    const { data: blacklisted } = await supabase.from("talkx_blacklist").select("contact_id");
    const blacklistSet = new Set((blacklisted || []).map((b: Record<string, unknown>) => b.contact_id));

    // Filter out blacklisted recipients
    const eligibleRecipients = (recipients || []).filter((r: Record<string, unknown>) => {
      if (blacklistSet.has(r.contact_id)) {
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
    const hasMedia = !!campaign.media_url && !!campaign.media_type;
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

      const personalizedMsg = personalize(campaign.message_template, contact as { name: string; nickname?: string; company?: string });
      await supabase.from("talkx_recipients")
        .update({ personalized_message: personalizedMsg, status: "sending" }).eq("id", recipient.id);

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

        if (hasMedia) {
          const mediaEndpoint = getMediaEndpoint(campaign.media_type);
          const mediaSource = await mediaForSend();
          sendResponse = await evoFetch(evolutionUrl, evolutionKey,
            `/message/${mediaEndpoint}/${connection.instance_id}`,
            { number: phone, mediatype: campaign.media_type, media: mediaSource, caption: personalizedMsg, delay: 0 },
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
