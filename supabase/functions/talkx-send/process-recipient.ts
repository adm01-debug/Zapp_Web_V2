/**
 * talkx-send/process-recipient.ts — corpo por-destinatário (X011).
 *
 * Extraído de `index.ts` SEM mudança de comportamento: reivindica o
 * destinatário sob lease, revalida supressão/conexão/janela, monta (e persiste)
 * a mensagem, dispara ao provedor e conclui o destinatário. O chamador continua
 * dono do laço (SELECT no `start`, passada + orçamento no `continue`), dos
 * contadores, do ritmo entre destinatários e do lease de campanha.
 *
 * O `kind` do `ProcessResult` traduz EXATAMENTE os `continue`/`break` e os
 * incrementos de contador do laço antigo: quem chama replica os contadores e
 * decide se roda a cauda (RELOAD_EVERY + `sleep(interval)`) ou encerra o laço.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { evoFetch, extractMessageId } from "../_shared/evolution-send.ts";
import { DEFAULT_SCHEDULE_TIMEZONE, deliveryWindowStatus } from "../_shared/talkx-window.ts";
import { pauseReasonForWindow } from "../_shared/talkx-resume-policy.ts";
import { resolvePrivateBucketUrl } from "../_shared/evolution-api-proxy.ts";
import { liveTalkXInstanceId } from "../_shared/talkx-delivery-connection.ts";
import { secureRandomFloat } from "../_shared/secure-random.ts";
import {
  getMediaEndpoint,
  personalize,
  randomBetween,
  sleep,
} from "../_shared/messaging/index.ts";
import type { Logger } from "../_shared/validation.ts";

/** E49: sorteia variante A/B pelo peso. Retorna null se nao houver variantes. */
export async function pickVariant(supabase: SupabaseClient, templateId: string): Promise<{ id: string; content: string; media_url: string | null; media_type: string | null } | null> {
  const { data: variants, error: varErr } = await supabase
    .from('talkx_template_variants')
    .select('id,content,media_url,media_type,weight')
    .eq('template_id', templateId);
  if (varErr) throw new Error(`variant_lookup_failed: ${varErr.message}`);
  if (!variants || variants.length === 0) return null;
  const total = variants.reduce((s: number, v: { weight: number }) => s + v.weight, 0);
  let roll = secureRandomFloat() * total;
  for (const v of variants) { roll -= v.weight; if (roll <= 0) return v; }
  return variants[variants.length - 1];
}

export interface ProcessRecipientContact {
  name?: string | null;
  nickname?: string | null;
  company?: string | null;
  phone?: string | null;
}

/**
 * Linha normalizada do destinatário. Cobre tanto o `select("*, contacts:...")`
 * do `start` quanto as colunas devolvidas por `talkx_next_recipients` (que não
 * traz os campos de snapshot; nesse caso a mensagem é remontada a partir do
 * `personalized_message`/template + mídia da campanha, como no caminho legado).
 */
export interface ProcessRecipientRow {
  id: string;
  contact_id: string | null;
  status?: string | null;
  attempt_count?: number | null;
  personalized_message?: string | null;
  message_snapshot_at?: string | null;
  media_url_snapshot?: string | null;
  media_type_snapshot?: string | null;
  variant_id?: string | null;
  contacts?: ProcessRecipientContact | null;
}

export interface ProcessRecipientDeps {
  supabase: SupabaseClient;
  campaignId: string;
  campaign: Record<string, unknown>;
  businessHours: { start?: string; end?: string; days?: number[] } | null;
  initialInstanceId: string;
  evolutionUrl: string;
  evolutionKey: string;
  supabaseUrl: string;
  workerId: string;
  trackingUrlFor: (recipientId: string) => string | undefined;
  customFieldsByContact: Map<string, Record<string, string>>;
  log: Logger;
  correlationId: string;
  isRecipientSuppressed: (contactId: string | null, phone: string | null) => Promise<boolean>;
  mediaForSend: () => Promise<string>;
}

export type ProcessResult =
  | { kind: "no_claim" }
  | { kind: "skipped_blacklisted" }
  | { kind: "skipped_no_phone" }
  | { kind: "message_failed" }
  | { kind: "sent" }
  | { kind: "failed" }
  | { kind: "outcome_unknown" }
  | { kind: "rescheduled"; deadLettered: boolean }
  | { kind: "stopped" };

export async function processRecipient(
  deps: ProcessRecipientDeps,
  recipient: ProcessRecipientRow,
): Promise<ProcessResult> {
  const {
    supabase, campaignId, businessHours, initialInstanceId,
    evolutionUrl, evolutionKey, supabaseUrl, workerId,
    trackingUrlFor, customFieldsByContact, log, correlationId,
    isRecipientSuppressed, mediaForSend,
  } = deps;
  // Campanha da passada (o chamador já revalidou estado/janela/cota antes).
  const campaign = deps.campaign;

  const { data: claimRows, error: claimError } = await supabase.rpc("claim_talkx_recipient", {
    p_campaign_id: campaignId,
    p_recipient_id: recipient.id,
    p_worker: workerId,
    p_lease_seconds: 90,
  });
  if (claimError) throw new Error(`talkx_recipient_claim_failed: ${claimError.message}`);
  const claim = Array.isArray(claimRows) ? claimRows[0] : null;
  // Outro worker já concluiu ou ainda possui o lease deste destinatário.
  if (!claim?.claim_token) return { kind: "no_claim" };

  const contact = (recipient.contacts ?? null) as Record<string, unknown> | null;
  const recipientPhone = (contact?.phone as string | undefined)?.replace(/\D/g, '');
  if (await isRecipientSuppressed(recipient.contact_id, recipientPhone ?? null)) {
    const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
      p_recipient_id: recipient.id,
      p_claim_token: claim.claim_token,
      p_status: "skipped",
      p_error_message: "Contato na lista negra (opt-out)",
    });
    if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
    return { kind: "skipped_blacklisted" };
  }
  if (!contact?.phone) {
    const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
      p_recipient_id: recipient.id,
      p_claim_token: claim.claim_token,
      p_status: "skipped",
      p_error_message: "Sem número de telefone",
    });
    if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
    return { kind: "skipped_no_phone" };
  }

  // Persist the actual message selected for this recipient before a
  // provider call. A mutable template variant must never change what a
  // retry, audit export, or delayed worker would send later.
  const hasSnapshot = typeof recipient.message_snapshot_at === "string"
    && typeof recipient.personalized_message === "string"
    && recipient.personalized_message.trim().length > 0;
  let personalizedMsg: string;
  let effectiveMediaUrl: string | null;
  let effectiveMediaType: string | null;

  if (hasSnapshot) {
    personalizedMsg = recipient.personalized_message as string;
    effectiveMediaUrl = typeof recipient.media_url_snapshot === "string"
      ? recipient.media_url_snapshot
      : null;
    effectiveMediaType = typeof recipient.media_type_snapshot === "string"
      ? recipient.media_type_snapshot
      : null;
  } else {
    const existingVid = typeof recipient.variant_id === "string" ? recipient.variant_id : null;
    const legacyPersonalizedMessage = typeof recipient.personalized_message === "string"
      && recipient.personalized_message.trim().length > 0
      ? recipient.personalized_message
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
      variant = await pickVariant(supabase, campaign.template_id as string);
    }

    const contentToSend = legacyPersonalizedMessage ?? variant?.content ?? campaign.message_template;
    const candidateMediaUrl = variant?.media_url ?? campaign.media_url ?? null;
    const candidateMediaType = variant?.media_type ?? campaign.media_type ?? null;
    if ((candidateMediaUrl === null) !== (candidateMediaType === null)) {
      throw new Error("talkx_invalid_media_snapshot_source");
    }
    let calculatedMessage: string;
    const customValues = customFieldsByContact.get(recipient.contact_id as string) ?? {};
    try {
      calculatedMessage = legacyPersonalizedMessage ?? personalize(
        contentToSend as string,
        contact as { name: string; nickname?: string; company?: string },
        customValues,
        typeof campaign.schedule_timezone === "string" ? campaign.schedule_timezone : DEFAULT_SCHEDULE_TIMEZONE,
        trackingUrlFor(recipient.id as string),
      );
    } catch (e) {
      // Placeholder desconhecido no roteiro: falha permanente deste destinatário (não do
      // provedor, nenhum POST foi feito). Não pode derrubar o lote inteiro nem deixar
      // "{{...}}" vazar para a mensagem real dos demais destinatários já processados.
      const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
        p_recipient_id: recipient.id,
        p_claim_token: claim.claim_token,
        p_status: "failed",
        p_error_message: e instanceof Error ? e.message : "Erro ao montar mensagem",
      });
      if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
      return { kind: "message_failed" };
    }
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
  // Precisa viver fora do try: o catch chama clearTimeout(sendTimeout) para
  // qualquer erro dentro do try, inclusive os lançados antes da linha que
  // cria o timeout — declarado como `const` dentro do try, essa variável
  // não existia no escopo do catch (ReferenceError em runtime a cada erro
  // pré-dispatch, mascarando o erro original em vez de acionar o backoff).
  let sendTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const phone = (contact.phone as string).replace(/\D/g, "");
    const typingDelay = randomBetween(campaign.typing_delay_min as number, campaign.typing_delay_max as number);

    try {
      await evoFetch(evolutionUrl, evolutionKey,
        `/chat/updatePresence/${initialInstanceId}`,
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
    const beforeSendWindowStatus = beforeSend ? deliveryWindowStatus(beforeSend, undefined, businessHours) : { allowed: false as const, reason: "campaign_not_found" };
    const { data: beforeSendConnection, error: beforeSendConnectionError } = await supabase
      .from("whatsapp_connections")
      .select("status, instance_id")
      .eq("id", campaign.whatsapp_connection_id)
      .maybeSingle();
    if (beforeSendConnectionError) throw new Error(`talkx_connection_state_lookup_failed: ${beforeSendConnectionError.message}`);
    const beforeSendInstanceId = liveTalkXInstanceId(beforeSendConnection);
    if (beforeSend?.status !== "sending" || !beforeSendWindowStatus.allowed || !beforeSendInstanceId) {
      if (beforeSend?.status === "sending") {
        // V03: mesmo cuidado do mid-loop — o motivo gravado diz se a pausa
        // foi da janela ou da conexão (era nulo nos dois casos).
        const autoPauseReason = !beforeSendWindowStatus.allowed
          ? pauseReasonForWindow(beforeSendWindowStatus)
          : "connection_lost";
        const { error: pauseError } = await supabase.rpc("transition_talkx_campaign", {
          p_campaign_id: campaignId,
          p_action: "pause",
          p_pause_reason: autoPauseReason,
        });
        if (pauseError) throw new Error(`talkx_campaign_auto_pause_failed: ${pauseError.message}`);
        if (autoPauseReason === "connection_lost") {
          try {
            await supabase.from("talkx_campaign_events").insert({
              campaign_id: campaignId,
              event_type: "connection_failed",
              message: "Falha de conexão",
            });
          } catch { /* evento de timeline e best-effort */ }
        }
      }
      if (!beforeSendInstanceId) {
        log.warn("Campanha pausada: conexão WhatsApp indisponível antes do envio", { correlationId, campaignId });
      }
      const { data: released, error: releaseError } = await supabase.rpc("release_talkx_recipient_claim", {
        p_recipient_id: recipient.id,
        p_claim_token: claim.claim_token,
      });
      if (releaseError || released !== true) {
        throw new Error(`talkx_recipient_claim_release_failed: ${releaseError?.message ?? "claim_not_owned"}`);
      }
      return { kind: "stopped" };
    }

    // A contact may opt out after this worker claimed its lease, while it
    // was waiting for the humanized typing delay. Recheck the normalized,
    // server-side predicate immediately before a provider request.
    if (await isRecipientSuppressed(recipient.contact_id, recipientPhone ?? null)) {
      const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
        p_recipient_id: recipient.id,
        p_claim_token: claim.claim_token,
        p_status: "skipped",
        p_error_message: "Contato na lista negra (opt-out)",
      });
      if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
      return { kind: "skipped_blacklisted" };
    }

    let sendResponse: Response;
    const markProviderDispatch = async () => {
      const { error } = await supabase.rpc("mark_talkx_recipient_dispatch_started", {
        p_recipient_id: recipient.id,
        p_claim_token: claim.claim_token,
      });
      if (error) throw new Error(`talkx_provider_dispatch_mark_failed: ${error.message}`);
    };

    // E91: timeout de segurança por envio
    const abortCtrl = new AbortController();
    sendTimeout = setTimeout(() => abortCtrl.abort(), 20_000);

    if (recipientHasMedia) {
      const mediaEndpoint = getMediaEndpoint(effectiveMediaType!);
      const mediaSource = (effectiveMediaUrl !== campaign.media_url)
        ? await resolvePrivateBucketUrl(supabase, effectiveMediaUrl!, undefined, supabaseUrl)
        : await mediaForSend();
      await markProviderDispatch();
      providerPostAttempted = true;
      sendResponse = await evoFetch(evolutionUrl, evolutionKey,
        `/message/${mediaEndpoint}/${beforeSendInstanceId}`,
        effectiveMediaType === "audio"
          ? { number: phone, audio: mediaSource, delay: 0 }
          : { number: phone, mediatype: effectiveMediaType!, media: mediaSource, caption: personalizedMsg, delay: 0 },
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
      const { error: completionError } = await supabase.rpc("record_talkx_recipient_sent", {
        p_recipient_id: recipient.id,
        p_claim_token: claim.claim_token,
        p_external_id: providerMessageId,
      });
      if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
      return { kind: "sent" };
    } else if (sendResponse.ok && !sendResult.error) {
      throw new Error("talkx_provider_outcome_unknown: missing_provider_message_id");
    } else {
      const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
        p_recipient_id: recipient.id,
        p_claim_token: claim.claim_token,
        p_status: "failed",
        p_error_message: String(sendResult?.message || sendResult?.error || "Erro ao enviar"),
      });
      if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
      return { kind: "failed" };
    }
  } catch (err) {
    clearTimeout(sendTimeout);
    // E91: erro antes do POST ao provedor — pode reagendar com backoff
    if (!providerPostAttempted) {
      const backoffMs = [30_000, 120_000, 600_000];
      const attemptSoFar = typeof recipient.attempt_count === 'number'
        ? recipient.attempt_count
        : 0;
      const delayMs = backoffMs[Math.min(attemptSoFar, backoffMs.length - 1)];
      const retryAfter = new Date(Date.now() + delayMs).toISOString();
      const reason = err instanceof Error ? err.message : "pre_dispatch_error";
      const { data: schedResult } = await supabase.rpc("reschedule_talkx_recipient", {
        p_recipient_id: recipient.id,
        p_claim_token: claim.claim_token,
        p_retry_after: retryAfter,
        p_error_message: reason.slice(0, 500),
      });
      const deadLettered = schedResult?.action === 'dead_lettered';
      const interval = randomBetween(campaign.send_interval_min as number, campaign.send_interval_max as number);
      await sleep(interval);
      return { kind: "rescheduled", deadLettered };
    }
    // A chamada ao provedor pode ter sido aceita quando a confirmação no
    // banco falhou. Ela nunca pode voltar automaticamente para `pending`:
    // ao expirar o lease, isso permitiria um segundo POST ao mesmo número.
    if (providerPostAttempted) {
      const reason = err instanceof Error ? err.message : "request_failed";
      const attemptSoFar = typeof recipient.attempt_count === 'number'
        ? recipient.attempt_count
        : 0;
      log.warn("Destinatário em quarentena (outcome_unknown)", { correlationId, campaignId, recipient_id: recipient.id, attempt: attemptSoFar });
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
      const interval = randomBetween(campaign.send_interval_min as number, campaign.send_interval_max as number);
      await sleep(interval);
      return { kind: "outcome_unknown" };
    }
    const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
      p_recipient_id: recipient.id,
      p_claim_token: claim.claim_token,
      p_status: "failed",
      p_error_message: err instanceof Error ? err.message : "Erro desconhecido",
    });
    if (completionError) throw new Error(`talkx_recipient_failure_completion_failed: ${completionError.message}`);
    return { kind: "failed" };
  }
}
