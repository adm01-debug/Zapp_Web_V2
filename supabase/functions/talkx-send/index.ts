/**
 * Talk X — Humanized bulk messaging edge function
 * Simulates typing, personalized messages with {{nome}}, {{apelido}}, {{empresa}}, {{saudacao}}
 * Supports text + media (image, video, document, audio)
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { evoFetch, extractMessageId } from "../_shared/evolution-send.ts";
import { resolvePrivateBucketUrl } from "../_shared/evolution-api-proxy.ts";

const DEFAULT_SCHEDULE_TIMEZONE = "America/Sao_Paulo";

function getGreeting(timeZone = DEFAULT_SCHEDULE_TIMEZONE): string {
  const hour = new Date().toLocaleString("pt-BR", { timeZone, hour: "numeric", hour12: false });
  const h = parseInt(hour, 10);
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

function personalize(
  template: string,
  contact: { name?: string | null; nickname?: string | null; company?: string | null },
  customVars: string[] = [],
  timeZone = DEFAULT_SCHEDULE_TIMEZONE,
): string {
  const firstName = (contact.name || '').split(' ')[0] || '';
  let result = template
    .replace(/\{\{nome\}\}/gi, firstName)
    .replace(/\{\{nome_completo\}\}/gi, contact.name || '')
    .replace(/\{\{apelido\}\}/gi, contact.nickname || firstName)
    .replace(/\{\{empresa\}\}/gi, contact.company || '')
    .replace(/\{\{saudacao\}\}/gi, getGreeting(timeZone));
  for (const v of customVars) {
    result = result.split('{{' + v + '}}').join('[' + v + ']');
  }
  return result;
}

type ScheduleGuardCampaign = {
  schedule_timezone?: unknown;
  send_window_start?: string | null;
  send_window_end?: string | null;
  business_hours_only?: boolean | null;
};

type LocalClock = { hour: number; minute: number; weekday: number };

function localClockInTimezone(timeZone: string, now = new Date()): LocalClock | null {
  try {
    const values = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(now).map((part) => [part.type, part.value]),
    );
    const weekdayText = values.weekday;
    if (typeof weekdayText !== "string") return null;
    const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekdayText];
    const hour = Number(values.hour);
    const minute = Number(values.minute);
    return typeof weekday === "number" && Number.isInteger(hour) && Number.isInteger(minute)
      ? { weekday, hour, minute }
      : null;
  } catch {
    return null;
  }
}

function deliveryWindowStatus(campaign: ScheduleGuardCampaign, now = new Date()): { allowed: true } | { allowed: false; reason: string; next_window?: string } {
  const timeZone = typeof campaign.schedule_timezone === "string"
    ? campaign.schedule_timezone
    : DEFAULT_SCHEDULE_TIMEZONE;
  const clock = localClockInTimezone(timeZone, now);
  if (!clock) return { allowed: false, reason: "invalid_schedule_timezone" };

  const currentMinutes = clock.hour * 60 + clock.minute;
  if (campaign.send_window_start && campaign.send_window_end) {
    const [startHour, startMinute] = campaign.send_window_start.split(":").map(Number);
    const [endHour, endMinute] = campaign.send_window_end.split(":").map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    if (!Number.isInteger(start) || !Number.isInteger(end) || currentMinutes < start || currentMinutes >= end) {
      return { allowed: false, reason: "outside_send_window", next_window: campaign.send_window_start };
    }
  }
  if (campaign.business_hours_only && (clock.weekday === 0 || clock.weekday === 6 || clock.hour < 8 || clock.hour >= 18)) {
    return { allowed: false, reason: "outside_business_hours" };
  }
  return { allowed: true };
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
        if (mediaUrl && mediaType) {
          const isAudio = mediaType === "audio";
          sendRes = await evoFetch(
            evolutionUrl,
            evolutionKey,
            `/message/${isAudio ? "sendWhatsAppAudio" : "sendMedia"}/${conn.instance_id}`,
            isAudio
              ? { number: cleanPhone, audio: mediaUrl }
              : { number: cleanPhone, mediatype: mediaType, media: mediaUrl, caption: personalizedText },
          );
        } else {
          sendRes = await evoFetch(evolutionUrl, evolutionKey, `/message/sendText/${conn.instance_id}`, {
            number: cleanPhone, text: personalizedText,
          });
        }
        if (!sendRes.ok) {
          const body = await sendRes.text().catch(() => '');
          return new Response(JSON.stringify({ error: `Evolution retornou ${sendRes.status}: ${body}` }), { status: 502, headers });
        }
        const providerResult = await sendRes.json().catch(() => null);
        const providerMessageId = extractMessageId(providerResult);
        if (!providerMessageId || providerMessageId.length > 512) {
          return new Response(JSON.stringify({ error: "Evolution não confirmou um identificador de entrega" }), { status: 502, headers });
        }
        return new Response(JSON.stringify({ success: true, provider_message_id: providerMessageId }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro ao enviar" }), { status: 500, headers });
      }
    }

    if (!campaignId) {
      return new Response(JSON.stringify({ error: "campaignId required" }), { status: 400, headers });
    }

    const campaignAction = action ?? "start";

    // Pause/cancel share the same locked database transition used by start.
    // An update without this lock could resurrect a campaign cancelled by a
    // concurrent request between its read and write.
    if (campaignAction === "pause" || campaignAction === "cancel") {
      const { data, error } = await supabase.rpc("transition_talkx_campaign", {
        p_campaign_id: campaignId,
        p_action: campaignAction,
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 409, headers });
      }
      const transition = Array.isArray(data) ? data[0] : data;
      return new Response(JSON.stringify({ success: true, status: transition?.current_status }), { headers });
    }

    if (campaignAction !== "start") {
      return new Response(JSON.stringify({ error: "Invalid campaign action" }), { status: 400, headers });
    }

    // Get campaign
    const { data: initialCampaign, error: campErr } = await supabase
      .from("talkx_campaigns").select("*").eq("id", campaignId).single();

    if (campErr || !initialCampaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404, headers });
    }
    let campaign = initialCampaign;
    // Get WhatsApp connection instance
    const { data: connection } = await supabase
      .from("whatsapp_connections").select("instance_id")
      .eq("id", campaign.whatsapp_connection_id).eq("status", "connected").single();

    if (!connection?.instance_id) {
      return new Response(JSON.stringify({ error: "WhatsApp connection not found" }), { status: 400, headers });
    }

    // Enforce delivery limits in the selected IANA timezone before the locked
    // transition. An invalid legacy timezone fails closed instead of falling
    // back to Brasília and sending at an unintended local hour.
    const windowStatus = deliveryWindowStatus(campaign);
    if (!windowStatus.allowed) {
      return new Response(JSON.stringify({ ok: false, reason: windowStatus.reason, next_window: windowStatus.next_window }), { headers });
    }

    // The transition RPC locks the campaign row and revalidates the state and
    // minimum launch invariants immediately before any recipient can be claimed.
    const { error: transitionError } = await supabase.rpc("transition_talkx_campaign", {
      p_campaign_id: campaignId,
      p_action: "start",
    });
    if (transitionError) {
      return new Response(JSON.stringify({ error: transitionError.message }), { status: 409, headers });
    }

    // Get pending recipients with contact info
    const { data: recipients, error: recipientsError } = await supabase
      .from("talkx_recipients")
      .select("*, contacts:contact_id(name, nickname, phone, company)")
      .eq("campaign_id", campaignId)
      .in("status", ["pending", "sending"])
      .order("created_at");
    if (recipientsError) throw new Error(`talkx_recipients_lookup_failed: ${recipientsError.message}`);

    // Check against the source of truth for every recipient. This makes a
    // phone-only, formatted legacy opt-out equivalent to the contact phone
    // and lets us repeat the check immediately before a provider POST.
    const isRecipientSuppressed = async (contactId: string | null, phone: string | null) => {
      const { data, error } = await supabase.rpc("talkx_recipient_is_suppressed", {
        p_contact_id: contactId,
        p_phone: phone,
      });
      if (error || typeof data !== "boolean") {
        throw new Error(`talkx_suppression_check_failed: ${error?.message ?? "invalid_response"}`);
      }
      return data;
    };

    let sentCount = campaign.sent_count || 0;
    let failedCount = campaign.failed_count || 0;
    let blacklistedCount = 0;
    let outcomeUnknownCount = 0;
    let processedCount = 0; // E78: reler parametros a cada RELOAD_EVERY envios
    const RELOAD_EVERY = 20;
    // Cada invocação só pode enviar depois de reivindicar o destinatário no
    // Postgres. O lease impede que dois workers concorrentes disparem para o
    // mesmo contato; uma execução morta expira e pode ser recuperada.
    const workerId = `talkx-send:${crypto.randomUUID()}`;
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

    for (const recipient of recipients || []) {
      // Re-read the state and send limits before each claim. A single initial
      // check is not enough when a campaign crosses a local-time boundary.
      const { data: currentCampaign, error: currentCampaignError } = await supabase
        .from("talkx_campaigns")
        .select("status, send_interval_min, send_interval_max, typing_delay_min, typing_delay_max, send_window_start, send_window_end, business_hours_only, speed_profile, schedule_timezone")
        .eq("id", campaignId).single();
      if (currentCampaignError) throw new Error(`talkx_campaign_state_lookup_failed: ${currentCampaignError.message}`);
      if (currentCampaign?.status !== "sending") break;
      campaign = { ...campaign, ...currentCampaign };
      const currentWindowStatus = deliveryWindowStatus(campaign);
      if (!currentWindowStatus.allowed) {
        const { error: pauseError } = await supabase.rpc("transition_talkx_campaign", {
          p_campaign_id: campaignId,
          p_action: "pause",
        });
        if (pauseError) throw new Error(`talkx_campaign_auto_pause_failed: ${pauseError.message}`);
        break;
      }

      const { data: claimRows, error: claimError } = await supabase.rpc("claim_talkx_recipient", {
        p_campaign_id: campaignId,
        p_recipient_id: recipient.id,
        p_worker: workerId,
        p_lease_seconds: 90,
      });
      if (claimError) throw new Error(`talkx_recipient_claim_failed: ${claimError.message}`);
      const claim = Array.isArray(claimRows) ? claimRows[0] : null;
      // Outro worker já concluiu ou ainda possui o lease deste destinatário.
      if (!claim?.claim_token) continue;

      const contact = recipient.contacts as Record<string, unknown>;
      const recipientPhone = (contact?.phone as string | undefined)?.replace(/\D/g, '');
      if (await isRecipientSuppressed(recipient.contact_id as string | null, recipientPhone ?? null)) {
        const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
          p_recipient_id: recipient.id,
          p_claim_token: claim.claim_token,
          p_status: "skipped",
          p_error_message: "Contato na lista negra (opt-out)",
        });
        if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
        blacklistedCount++;
        continue;
      }
      if (!contact?.phone) {
        const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
          p_recipient_id: recipient.id,
          p_claim_token: claim.claim_token,
          p_status: "skipped",
          p_error_message: "Sem número de telefone",
        });
        if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
        continue;
      }

      // Persist the actual message selected for this recipient before a
      // provider call. A mutable template variant must never change what a
      // retry, audit export, or delayed worker would send later.
      const recipientRecord = recipient as Record<string, unknown>;
      const hasSnapshot = typeof recipientRecord.message_snapshot_at === "string"
        && typeof recipientRecord.personalized_message === "string"
        && recipientRecord.personalized_message.trim().length > 0;
      let personalizedMsg: string;
      let effectiveMediaUrl: string | null;
      let effectiveMediaType: string | null;

      if (hasSnapshot) {
        personalizedMsg = recipientRecord.personalized_message as string;
        effectiveMediaUrl = typeof recipientRecord.media_url_snapshot === "string"
          ? recipientRecord.media_url_snapshot
          : null;
        effectiveMediaType = typeof recipientRecord.media_type_snapshot === "string"
          ? recipientRecord.media_type_snapshot
          : null;
      } else {
        const existingVid = typeof recipientRecord.variant_id === "string" ? recipientRecord.variant_id : null;
        const legacyPersonalizedMessage = typeof recipientRecord.personalized_message === "string"
          && recipientRecord.personalized_message.trim().length > 0
          ? recipientRecord.personalized_message
          : null;
        let variant: { id: string; content: string; media_url: string | null; media_type: string | null; weight?: number } | null = null;
        if (existingVid) {
          const { data: vData, error: vErr } = await supabase
            .from('talkx_template_variants').select('id,content,media_url,media_type,weight')
            .eq('id', existingVid).single();
          if (vErr || !vData) {
            // A legacy worker may already have persisted the exact text. In
            // that case retain it; otherwise fail closed rather than silently
            // fall back to a changed campaign template.
            if (!legacyPersonalizedMessage) {
              throw new Error(`talkx_variant_snapshot_source_unavailable: ${vErr?.message ?? "variant_not_found"}`);
            }
          } else {
            variant = vData;
          }
        } else if (campaign.template_id) {
          variant = await pickVariant(supabase, campaign.template_id);
        }

        const contentToSend = legacyPersonalizedMessage ?? variant?.content ?? campaign.message_template;
        const candidateMediaUrl = variant?.media_url ?? campaign.media_url ?? null;
        const candidateMediaType = variant?.media_type ?? campaign.media_type ?? null;
        if ((candidateMediaUrl === null) !== (candidateMediaType === null)) {
          throw new Error("talkx_invalid_media_snapshot_source");
        }
        const calculatedMessage = legacyPersonalizedMessage ?? personalize(
          contentToSend,
          contact as { name: string; nickname?: string; company?: string },
          [],
          typeof campaign.schedule_timezone === "string" ? campaign.schedule_timezone : DEFAULT_SCHEDULE_TIMEZONE,
        );
        const { data: snapshotRows, error: snapshotError } = await supabase.rpc("persist_talkx_recipient_message_snapshot", {
          p_recipient_id: recipient.id,
          p_claim_token: claim.claim_token,
          p_personalized_message: calculatedMessage,
          p_media_url: candidateMediaUrl,
          p_media_type: candidateMediaType,
          p_variant_id: variant?.id ?? existingVid,
        });
        if (snapshotError) throw new Error(`talkx_message_snapshot_failed: ${snapshotError.message}`);
        const snapshot = Array.isArray(snapshotRows) ? snapshotRows[0] as Record<string, unknown> | undefined : undefined;
        if (!snapshot || typeof snapshot.personalized_message !== "string") {
          throw new Error("talkx_message_snapshot_invalid_response");
        }
        personalizedMsg = snapshot.personalized_message;
        effectiveMediaUrl = typeof snapshot.media_url_snapshot === "string" ? snapshot.media_url_snapshot : null;
        effectiveMediaType = typeof snapshot.media_type_snapshot === "string" ? snapshot.media_type_snapshot : null;
      }
      if ((effectiveMediaUrl === null) !== (effectiveMediaType === null)) {
        throw new Error("talkx_invalid_persisted_media_snapshot");
      }
      const recipientHasMedia = effectiveMediaUrl !== null && effectiveMediaType !== null;

      let providerPostAttempted = false;
      try {
        const phone = (contact.phone as string).replace(/\D/g, "");
        const typingDelay = randomBetween(campaign.typing_delay_min, campaign.typing_delay_max);

        try {
          await evoFetch(evolutionUrl, evolutionKey,
            `/chat/updatePresence/${connection.instance_id}`,
            { number: phone, presence: "composing" });
        } catch { /* Presence update is best-effort */ }

        await sleep(typingDelay);

        // Pause/cancel can race with the presence update or typing delay. Do
        // not begin a provider POST after the campaign has left `sending`.
        const { data: beforeSend, error: beforeSendError } = await supabase
          .from("talkx_campaigns")
          .select("status, send_window_start, send_window_end, business_hours_only, schedule_timezone")
          .eq("id", campaignId).single();
        if (beforeSendError) throw new Error(`talkx_campaign_state_lookup_failed: ${beforeSendError.message}`);
        const beforeSendWindowStatus = beforeSend ? deliveryWindowStatus(beforeSend) : { allowed: false as const, reason: "campaign_not_found" };
        if (beforeSend?.status !== "sending" || !beforeSendWindowStatus.allowed) {
          if (beforeSend?.status === "sending") {
            const { error: pauseError } = await supabase.rpc("transition_talkx_campaign", {
              p_campaign_id: campaignId,
              p_action: "pause",
            });
            if (pauseError) throw new Error(`talkx_campaign_auto_pause_failed: ${pauseError.message}`);
          }
          const { data: released, error: releaseError } = await supabase.rpc("release_talkx_recipient_claim", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
          });
          if (releaseError || released !== true) {
            throw new Error(`talkx_recipient_claim_release_failed: ${releaseError?.message ?? "claim_not_owned"}`);
          }
          break;
        }

        // A contact may opt out after this worker claimed its lease, while it
        // was waiting for the humanized typing delay. Recheck the normalized,
        // server-side predicate immediately before a provider request.
        if (await isRecipientSuppressed(recipient.contact_id as string | null, recipientPhone ?? null)) {
          const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_status: "skipped",
            p_error_message: "Contato na lista negra (opt-out)",
          });
          if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
          blacklistedCount++;
          continue;
        }

        let sendResponse: Response;
        const markProviderDispatch = async () => {
          const { error } = await supabase.rpc("mark_talkx_recipient_dispatch_started", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
          });
          if (error) throw new Error(`talkx_provider_dispatch_mark_failed: ${error.message}`);
        };

        if (recipientHasMedia) {
          const mediaEndpoint = getMediaEndpoint(effectiveMediaType!);
          const mediaSource = (effectiveMediaUrl !== campaign.media_url)
            ? await resolvePrivateBucketUrl(supabase, effectiveMediaUrl!, undefined, supabaseUrl)
            : await mediaForSend();
          await markProviderDispatch();
          providerPostAttempted = true;
          sendResponse = await evoFetch(evolutionUrl, evolutionKey,
            `/message/${mediaEndpoint}/${connection.instance_id}`,
            effectiveMediaType === "audio"
              ? { number: phone, audio: mediaSource, delay: 0 }
              : { number: phone, mediatype: effectiveMediaType!, media: mediaSource, caption: personalizedMsg, delay: 0 },
          );
        } else {
          await markProviderDispatch();
          providerPostAttempted = true;
          sendResponse = await evoFetch(evolutionUrl, evolutionKey,
            `/message/sendText/${connection.instance_id}`,
            { number: phone, text: personalizedMsg, delay: 0 }
          );
        }

        // POST retries are unsafe without a provider idempotency contract. A
        // 5xx/connection/parser ambiguity keeps the lease for reconciliation
        // instead of classifying or resending a message blindly.
        if (sendResponse.status >= 500) {
          throw new Error(`talkx_provider_outcome_unknown: HTTP ${sendResponse.status}`);
        }
        let sendResult: Record<string, unknown>;
        try {
          sendResult = await sendResponse.json();
        } catch {
          throw new Error("talkx_provider_outcome_unknown: invalid_response_body");
        }

        const providerMessageId = extractMessageId(sendResult);
        if (sendResponse.ok && !sendResult.error && providerMessageId && providerMessageId.length <= 512) {
          sentCount++;
          const { error: completionError } = await supabase.rpc("record_talkx_recipient_sent", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_external_id: providerMessageId,
          });
          if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
        } else if (sendResponse.ok && !sendResult.error) {
          throw new Error("talkx_provider_outcome_unknown: missing_provider_message_id");
        } else {
          failedCount++;
          const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_status: "failed",
            p_error_message: String(sendResult?.message || sendResult?.error || "Erro ao enviar"),
          });
          if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
        }
      } catch (err) {
        // A chamada ao provedor pode ter sido aceita quando a confirmação no
        // banco falhou. Ela nunca pode voltar automaticamente para `pending`:
        // ao expirar o lease, isso permitiria um segundo POST ao mesmo número.
        if (providerPostAttempted) {
          const reason = err instanceof Error ? err.message : "request_failed";
          const { error: quarantineError } = await supabase.rpc("complete_talkx_recipient", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_status: "outcome_unknown",
            p_error_message: `Provider outcome unknown: ${reason}`.slice(0, 1000),
          });
          if (quarantineError) {
            // Do not lie about the outcome. A failed quarantine keeps the
            // lease intact, so it remains visible instead of being retried in
            // the same invocation.
            throw new Error(`talkx_recipient_quarantine_failed: ${quarantineError.message}`);
          }
          outcomeUnknownCount++;
          processedCount++;
          const interval = randomBetween(campaign.send_interval_min, campaign.send_interval_max);
          await sleep(interval);
          continue;
        }
        failedCount++;
        const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
          p_recipient_id: recipient.id,
          p_claim_token: claim.claim_token,
          p_status: "failed",
          p_error_message: err instanceof Error ? err.message : "Erro desconhecido",
        });
        if (completionError) throw new Error(`talkx_recipient_failure_completion_failed: ${completionError.message}`);
      }

      processedCount++;
      // E78: reler parametros de campanha a cada RELOAD_EVERY envios
      if (processedCount % RELOAD_EVERY === 0) {
        const { data: fresh } = await supabase
          .from("talkx_campaigns")
          .select("send_interval_min, send_interval_max, typing_delay_min, typing_delay_max, send_window_start, send_window_end, business_hours_only, speed_profile, schedule_timezone")
          .eq("id", campaignId).single();
        if (fresh) {
          campaign = { ...campaign, ...fresh };
          // Recheck the campaign's own IANA window after configuration reload.
          // The locked transition preserves a concurrent manual pause/cancel.
          const refreshedWindowStatus = deliveryWindowStatus(campaign);
          if (!refreshedWindowStatus.allowed) {
            log.warn('Campanha pausada automaticamente: fora da janela de envio', { campaignId });
            const { error: pauseError } = await supabase.rpc("transition_talkx_campaign", {
              p_campaign_id: campaignId,
              p_action: "pause",
            });
            if (pauseError) throw new Error(`talkx_campaign_auto_pause_failed: ${pauseError.message}`);
            break;
          }
        }
      }
      const sendInterval = randomBetween(campaign.send_interval_min, campaign.send_interval_max);
      await sleep(sendInterval);
    }

    const { data: completed, error: completionError } = await supabase.rpc(
      "complete_talkx_campaign_if_drained",
      { p_campaign_id: campaignId },
    );
    if (completionError) throw new Error(`talkx_campaign_completion_failed: ${completionError.message}`);

    log.done(200, { sent: sentCount, failed: failedCount, outcomeUnknown: outcomeUnknownCount });

    return new Response(
      JSON.stringify({
        success: true, sent: sentCount, failed: failedCount,
        total: (recipients || []).length,
        blacklisted: blacklistedCount,
        outcome_unknown: outcomeUnknownCount,
        completed: completed === true,
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
