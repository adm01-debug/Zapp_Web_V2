/**
 * Multiplix — motor de envio (claim/lease/backoff)
 * Mesmo padrao de talkx-send (claim_talkx_recipient/complete_talkx_recipient/
 * reschedule_talkx_recipient/complete_talkx_campaign_if_drained), adaptado
 * para multiplix_dispatches/multiplix_recipients. Sem variantes A/B, sem
 * lista de supressao (nao existe para Multiplix ainda) e sem link de
 * rastreamento {{link}} — fora de escopo desta etapa.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { evoFetch, extractMessageId } from "../_shared/evolution-send.ts";
import { DEFAULT_SCHEDULE_TIMEZONE, deliveryWindowStatus } from "../_shared/talkx-window.ts";
import { resolvePrivateBucketUrl } from "../_shared/evolution-api-proxy.ts";
import { liveTalkXInstanceId } from "../_shared/talkx-delivery-connection.ts";

function getGreeting(timeZone = DEFAULT_SCHEDULE_TIMEZONE): string {
  const hour = new Date().toLocaleString("pt-BR", { timeZone, hour: "numeric", hour12: false });
  const h = parseInt(hour, 10);
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

export function personalizeMultiplix(template: string, company: { name?: string | null }, timeZone = DEFAULT_SCHEDULE_TIMEZONE): string {
  let result = template.replace(/\{\{saudacao\}\}/gi, getGreeting(timeZone));
  result = result.replace(/\{\{empresa\}\}/gi, company.name || '');
  // Um placeholder fora de {{empresa}}/{{saudacao}} chegaria intacto na mensagem real
  // do WhatsApp sem erro nem aviso — falha explicita evita esse vazamento (mesmo
  // principio de talkx-send/personalize).
  const unknownPlaceholder = result.match(/\{\{[^}]+\}\}/);
  if (unknownPlaceholder) {
    throw new Error(`unknown_placeholder: ${unknownPlaceholder[0]}`);
  }
  return result;
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

export async function handleMultiplixSend(req: Request): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const log = new Logger("multiplix-send");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL")!;
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY")!;

    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: service-role key (scheduler) OU JWT de usuario admin/supervisor —
    // mesmo modelo de talkx-send (bulk messaging e gated para staff).
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
    const { dispatchId, action } = body;
    if (!dispatchId) {
      return new Response(JSON.stringify({ error: "dispatchId required" }), { status: 400, headers });
    }

    const dispatchAction = action ?? "start";

    // Pause/cancel compartilham a mesma transicao travada usada por start —
    // sem isso um update sem lock poderia ressuscitar um dispatch cancelado
    // por uma requisicao concorrente entre leitura e escrita.
    if (dispatchAction === "pause" || dispatchAction === "cancel") {
      const { data, error } = await supabase.rpc("transition_multiplix_dispatch", {
        p_dispatch_id: dispatchId,
        p_action: dispatchAction,
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 409, headers });
      }
      const transition = Array.isArray(data) ? data[0] : data;
      return new Response(JSON.stringify({ success: true, status: transition?.current_status }), { headers });
    }

    if (dispatchAction !== "start") {
      return new Response(JSON.stringify({ error: "Invalid dispatch action" }), { status: 400, headers });
    }

    const { data: initialDispatch, error: dispatchErr } = await supabase
      .from("multiplix_dispatches").select("*").eq("id", dispatchId).single();
    if (dispatchErr || !initialDispatch) {
      return new Response(JSON.stringify({ error: "Dispatch not found" }), { status: 404, headers });
    }
    let dispatch = initialDispatch;

    // Conexao WhatsApp: usa a escolhida no dispatch; sem uma, cai na primeira
    // conexao conectada (composer ainda nao oferece selecao de conexao).
    const connectionQuery = dispatch.whatsapp_connection_id
      ? supabase.from("whatsapp_connections").select("status, instance_id").eq("id", dispatch.whatsapp_connection_id).eq("status", "connected").maybeSingle()
      : supabase.from("whatsapp_connections").select("status, instance_id").eq("status", "connected").limit(1).maybeSingle();
    const { data: connection } = await connectionQuery;
    const initialInstanceId = liveTalkXInstanceId(connection);
    if (!initialInstanceId) {
      try {
        await supabase.rpc("transition_multiplix_dispatch", {
          p_dispatch_id: dispatchId,
          p_action: "pause",
          p_pause_reason: "connection_lost",
        });
      } catch { /* ja pausado ou outro estado — ignora */ }
      return new Response(JSON.stringify({ error: "WhatsApp connection lost: dispatch paused" }), { status: 409, headers });
    }

    const windowStatus = deliveryWindowStatus(dispatch);
    if (!windowStatus.allowed) {
      return new Response(JSON.stringify({ ok: false, reason: windowStatus.reason, next_window: windowStatus.next_window }), { headers });
    }

    const { error: transitionError } = await supabase.rpc("transition_multiplix_dispatch", {
      p_dispatch_id: dispatchId,
      p_action: "start",
    });
    if (transitionError) {
      return new Response(JSON.stringify({ error: transitionError.message }), { status: 409, headers });
    }

    const { data: recipients, error: recipientsError } = await supabase
      .from("multiplix_recipients")
      .select("*")
      .eq("dispatch_id", dispatchId)
      .in("status", ["pending", "sending"])
      .or("retry_after.is.null,retry_after.lte." + new Date().toISOString())
      .order("created_at");
    if (recipientsError) throw new Error(`multiplix_recipients_lookup_failed: ${recipientsError.message}`);

    let sentCount = dispatch.sent_count || 0;
    let failedCount = dispatch.failed_count || 0;
    let skippedCount = 0;
    let outcomeUnknownCount = 0;
    let processedCount = 0;
    const RELOAD_EVERY = 20;
    const workerId = `multiplix-send:${crypto.randomUUID()}`;
    let signedMedia: { sourceUrl: string; signedUrl: string; at: number } | null = null;
    const mediaForSend = async (mediaUrl: string) => {
      if (!signedMedia || signedMedia.sourceUrl !== mediaUrl || Date.now() - signedMedia.at > 240_000) {
        signedMedia = { sourceUrl: mediaUrl, signedUrl: await resolvePrivateBucketUrl(supabase, mediaUrl, undefined, supabaseUrl), at: Date.now() };
      }
      return signedMedia.signedUrl;
    };

    for (const recipient of recipients || []) {
      const { data: currentDispatch, error: currentDispatchError } = await supabase
        .from("multiplix_dispatches")
        .select("status, send_interval_min, send_interval_max, typing_delay_min, typing_delay_max, send_window_start, send_window_end, business_hours_only, speed_profile, schedule_timezone, message_template, media_url, media_type")
        .eq("id", dispatchId).single();
      if (currentDispatchError) throw new Error(`multiplix_dispatch_state_lookup_failed: ${currentDispatchError.message}`);
      if (currentDispatch?.status !== "sending") break;
      dispatch = { ...dispatch, ...currentDispatch };
      const currentWindowStatus = deliveryWindowStatus(dispatch);
      if (!currentWindowStatus.allowed) {
        const { error: pauseError } = await supabase.rpc("transition_multiplix_dispatch", { p_dispatch_id: dispatchId, p_action: "pause" });
        if (pauseError) throw new Error(`multiplix_dispatch_auto_pause_failed: ${pauseError.message}`);
        break;
      }

      const { data: claimRows, error: claimError } = await supabase.rpc("claim_multiplix_recipient", {
        p_dispatch_id: dispatchId,
        p_recipient_id: recipient.id,
        p_worker: workerId,
        p_lease_seconds: 90,
      });
      if (claimError) throw new Error(`multiplix_recipient_claim_failed: ${claimError.message}`);
      const claim = Array.isArray(claimRows) ? claimRows[0] : null;
      if (!claim?.claim_token) continue;

      if (!recipient.destino_e164) {
        const { error: completionError } = await supabase.rpc("complete_multiplix_recipient", {
          p_recipient_id: recipient.id,
          p_claim_token: claim.claim_token,
          p_status: "skipped",
          p_error_message: "Sem destino de WhatsApp",
        });
        if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
        skippedCount++;
        processedCount++;
        continue;
      }

      let personalizedMsg: string = recipient.personalized_message;
      if (!personalizedMsg) {
        let calculatedMessage: string;
        try {
          calculatedMessage = personalizeMultiplix(
            dispatch.message_template,
            { name: recipient.company_name_snapshot },
            typeof dispatch.schedule_timezone === "string" ? dispatch.schedule_timezone : DEFAULT_SCHEDULE_TIMEZONE,
          );
        } catch (e) {
          const { error: completionError } = await supabase.rpc("complete_multiplix_recipient", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_status: "failed",
            p_error_message: e instanceof Error ? e.message : "Erro ao montar mensagem",
          });
          if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
          failedCount++;
          processedCount++;
          continue;
        }
        const { data: snapshotMessage, error: snapshotError } = await supabase.rpc("persist_multiplix_recipient_message_snapshot", {
          p_recipient_id: recipient.id,
          p_claim_token: claim.claim_token,
          p_personalized_message: calculatedMessage,
        });
        if (snapshotError) throw new Error(`multiplix_message_snapshot_failed: ${snapshotError.message}`);
        personalizedMsg = snapshotMessage as string;
      }

      const recipientHasMedia = typeof dispatch.media_url === "string" && typeof dispatch.media_type === "string";

      let providerPostAttempted = false;
      let sendTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const phone = recipient.destino_e164.replace(/\D/g, "");
        const typingDelay = randomBetween(dispatch.typing_delay_min, dispatch.typing_delay_max);

        try {
          await evoFetch(evolutionUrl, evolutionKey, `/chat/updatePresence/${initialInstanceId}`, { number: phone, presence: "composing" });
        } catch { /* Presence e best-effort */ }

        await sleep(typingDelay);

        const { data: beforeSend, error: beforeSendError } = await supabase
          .from("multiplix_dispatches")
          .select("status, send_window_start, send_window_end, business_hours_only, schedule_timezone, whatsapp_connection_id")
          .eq("id", dispatchId).single();
        if (beforeSendError) throw new Error(`multiplix_dispatch_state_lookup_failed: ${beforeSendError.message}`);
        const beforeSendWindowStatus = beforeSend ? deliveryWindowStatus(beforeSend) : { allowed: false as const, reason: "dispatch_not_found" };
        const beforeSendConnectionQuery = beforeSend?.whatsapp_connection_id
          ? supabase.from("whatsapp_connections").select("status, instance_id").eq("id", beforeSend.whatsapp_connection_id).maybeSingle()
          : supabase.from("whatsapp_connections").select("status, instance_id").eq("status", "connected").limit(1).maybeSingle();
        const { data: beforeSendConnection, error: beforeSendConnectionError } = await beforeSendConnectionQuery;
        if (beforeSendConnectionError) throw new Error(`multiplix_connection_state_lookup_failed: ${beforeSendConnectionError.message}`);
        const beforeSendInstanceId = liveTalkXInstanceId(beforeSendConnection);
        if (beforeSend?.status !== "sending" || !beforeSendWindowStatus.allowed || !beforeSendInstanceId) {
          if (beforeSend?.status === "sending") {
            const { error: pauseError } = await supabase.rpc("transition_multiplix_dispatch", { p_dispatch_id: dispatchId, p_action: "pause" });
            if (pauseError) throw new Error(`multiplix_dispatch_auto_pause_failed: ${pauseError.message}`);
          }
          const { data: released, error: releaseError } = await supabase.rpc("release_multiplix_recipient_claim", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
          });
          if (releaseError || released !== true) {
            throw new Error(`multiplix_recipient_claim_release_failed: ${releaseError?.message ?? "claim_not_owned"}`);
          }
          break;
        }

        let sendResponse: Response;
        const markProviderDispatch = async () => {
          const { error } = await supabase.rpc("mark_multiplix_recipient_dispatch_started", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
          });
          if (error) throw new Error(`multiplix_provider_dispatch_mark_failed: ${error.message}`);
        };

        const abortCtrl = new AbortController();
        sendTimeout = setTimeout(() => abortCtrl.abort(), 20_000);

        if (recipientHasMedia) {
          const mediaEndpoint = getMediaEndpoint(dispatch.media_type);
          const mediaSource = await mediaForSend(dispatch.media_url);
          await markProviderDispatch();
          providerPostAttempted = true;
          sendResponse = await evoFetch(evolutionUrl, evolutionKey,
            `/message/${mediaEndpoint}/${beforeSendInstanceId}`,
            dispatch.media_type === "audio"
              ? { number: phone, audio: mediaSource, delay: 0 }
              : { number: phone, mediatype: dispatch.media_type, media: mediaSource, caption: personalizedMsg, delay: 0 },
            undefined, undefined, abortCtrl.signal,
          );
        } else {
          await markProviderDispatch();
          providerPostAttempted = true;
          sendResponse = await evoFetch(evolutionUrl, evolutionKey,
            `/message/sendText/${beforeSendInstanceId}`,
            { number: phone, text: personalizedMsg, delay: 0 },
            undefined, undefined, abortCtrl.signal,
          );
        }
        clearTimeout(sendTimeout);

        if (sendResponse.status >= 500) {
          throw new Error(`multiplix_provider_outcome_unknown: HTTP ${sendResponse.status}`);
        }
        let sendResult: Record<string, unknown>;
        try {
          sendResult = await sendResponse.json();
        } catch {
          throw new Error("multiplix_provider_outcome_unknown: invalid_response_body");
        }

        const providerMessageId = extractMessageId(sendResult);
        if (sendResponse.ok && !sendResult.error && providerMessageId && providerMessageId.length <= 512) {
          sentCount++;
          const { error: completionError } = await supabase.rpc("record_multiplix_recipient_sent", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_external_id: providerMessageId,
          });
          if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
        } else if (sendResponse.ok && !sendResult.error) {
          throw new Error("multiplix_provider_outcome_unknown: missing_provider_message_id");
        } else {
          failedCount++;
          const { error: completionError } = await supabase.rpc("complete_multiplix_recipient", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_status: "failed",
            p_error_message: String(sendResult?.message || sendResult?.error || "Erro ao enviar"),
          });
          if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
        }
      } catch (err) {
        clearTimeout(sendTimeout);
        if (!providerPostAttempted) {
          const backoffMs = [30_000, 120_000, 600_000];
          const attemptSoFar = typeof recipient.attempt_count === "number" ? recipient.attempt_count : 0;
          const delayMs = backoffMs[Math.min(attemptSoFar, backoffMs.length - 1)];
          const retryAfter = new Date(Date.now() + delayMs).toISOString();
          const reason = err instanceof Error ? err.message : "pre_dispatch_error";
          const { data: schedResult } = await supabase.rpc("reschedule_multiplix_recipient", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_retry_after: retryAfter,
            p_error_message: reason.slice(0, 500),
          });
          if (schedResult?.action === "dead_lettered") failedCount++;
          processedCount++;
          const interval = randomBetween(dispatch.send_interval_min, dispatch.send_interval_max);
          await sleep(interval);
          continue;
        }
        const reason = err instanceof Error ? err.message : "request_failed";
        const { error: quarantineError } = await supabase.rpc("complete_multiplix_recipient", {
          p_recipient_id: recipient.id,
          p_claim_token: claim.claim_token,
          p_status: "outcome_unknown",
          p_error_message: `Provider outcome unknown: ${reason}`.slice(0, 1000),
        });
        if (quarantineError) {
          throw new Error(`multiplix_recipient_quarantine_failed: ${quarantineError.message}`);
        }
        outcomeUnknownCount++;
        processedCount++;
        const interval = randomBetween(dispatch.send_interval_min, dispatch.send_interval_max);
        await sleep(interval);
        continue;
      }

      processedCount++;
      if (processedCount % RELOAD_EVERY === 0) {
        const { data: fresh } = await supabase
          .from("multiplix_dispatches")
          .select("send_interval_min, send_interval_max, typing_delay_min, typing_delay_max, send_window_start, send_window_end, business_hours_only, speed_profile, schedule_timezone")
          .eq("id", dispatchId).single();
        if (fresh) {
          dispatch = { ...dispatch, ...fresh };
          const refreshedWindowStatus = deliveryWindowStatus(dispatch);
          if (!refreshedWindowStatus.allowed) {
            log.warn("Dispatch pausado automaticamente: fora da janela de envio", { dispatchId });
            const { error: pauseError } = await supabase.rpc("transition_multiplix_dispatch", { p_dispatch_id: dispatchId, p_action: "pause" });
            if (pauseError) throw new Error(`multiplix_dispatch_auto_pause_failed: ${pauseError.message}`);
            break;
          }
        }
      }
      const sendInterval = randomBetween(dispatch.send_interval_min, dispatch.send_interval_max);
      await sleep(sendInterval);
    }

    const { data: completed, error: completionError } = await supabase.rpc(
      "complete_multiplix_dispatch_if_drained", { p_dispatch_id: dispatchId },
    );
    if (completionError) throw new Error(`multiplix_dispatch_completion_failed: ${completionError.message}`);

    log.done(200, { sent: sentCount, failed: failedCount, outcomeUnknown: outcomeUnknownCount });

    return new Response(
      JSON.stringify({
        success: true, sent: sentCount, failed: failedCount,
        total: (recipients || []).length,
        skipped: skippedCount,
        outcome_unknown: outcomeUnknownCount,
        completed: completed === true,
      }),
      { headers },
    );
  } catch (err) {
    log.error("Multiplix send error", { error: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers },
    );
  }
}

if (import.meta.main) {
  Deno.serve(handleMultiplixSend);
}
