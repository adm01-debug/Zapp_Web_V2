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
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { evoFetch, extractMessageId } from "../_shared/evolution-send.ts";
import { DEFAULT_SCHEDULE_TIMEZONE, deliveryWindowStatus } from "../_shared/talkx-window.ts";
import { pauseReasonForWindow } from "../_shared/talkx-resume-policy.ts";
import { resolvePrivateBucketUrl } from "../_shared/evolution-api-proxy.ts";
import { liveTalkXInstanceId } from "../_shared/talkx-delivery-connection.ts";
import {
  backoffDelayForAttempts,
  getMediaEndpoint,
  personalize,
  randomBetween,
  sleep,
} from "../_shared/messaging/index.ts";
import type { Logger } from "../_shared/validation.ts";
import {
  EFFECT_TALKX_RECIPIENT_SEND,
  enqueueEffectReconcile,
} from "../_shared/effect-reconcile.ts";

/**
 * FNV-1a de 32 bits — hash ESTÁVEL do id do destinatário (X020). Substitui o
 * `secureRandomFloat()` do sorteio A/B: o mesmo destinatário cai SEMPRE na
 * mesma variante (retry, auditoria e export herdam a decisão), e a proporção
 * entre variantes continua sendo a dos pesos. Sem `Math.random`/`secureRandom`
 * — o sorteio deixa de ser não-determinístico e passa a ter teste de estabilidade.
 */
function stableVariantHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * E49 + X020: escolhe a variante A/B por HASH ESTÁVEL do destinatário, pelo
 * peso. Retorna null se não houver variantes.
 */
export async function pickVariant(
  supabase: SupabaseClient,
  templateId: string,
  recipientId: string,
): Promise<{ id: string; content: string; media_url: string | null; media_type: string | null } | null> {
  const { data: variants, error: varErr } = await supabase
    .from('talkx_template_variants')
    .select('id,content,media_url,media_type,weight')
    .eq('template_id', templateId);
  if (varErr) throw new Error(`variant_lookup_failed: ${varErr.message}`);
  if (!variants || variants.length === 0) return null;
  // #483: a consulta não tem ORDER BY, então a ORDEM devolvida pelo Postgres é
  // indefinida (muda com o plano e com o reposicionamento físico da tupla após
  // um UPDATE). O acumulado de pesos abaixo é sensível a essa ordem: sem
  // normalizar, o MESMO destinatário cairia em variantes diferentes conforme a
  // ordem devolvida. Ordenamos por `id` (único) antes de acumular, para que a
  // decisão A/B dependa só do hash do destinatário.
  const ordered = [...variants].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const total = ordered.reduce((s: number, v: { weight: number }) => s + v.weight, 0);
  if (!(total > 0)) return ordered[ordered.length - 1];
  // Hash do id (não random): determinístico e sem viés de ordem das variantes.
  const roll = stableVariantHash(recipientId) % total;
  let acc = 0;
  for (const v of ordered) {
    acc += v.weight;
    if (roll < acc) return v;
  }
  return ordered[ordered.length - 1];
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
  instanceToken: string | null;
  evolutionUrl: string;
  evolutionKey: string;
  supabaseUrl: string;
  workerId: string;
  trackingUrlFor: (recipientId: string) => string | undefined;
  linksByLabelFor: (recipientId: string) => Record<string, string>;
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
  | { kind: "skipped_missing_variable" }
  | { kind: "message_failed"; errorCode?: string }
  | { kind: "sent" }
  | { kind: "failed"; httpStatus?: number; errorCode?: string }
  | { kind: "outcome_unknown"; errorCode?: string }
  | { kind: "rescheduled"; deadLettered: boolean; errorCode?: string }
  | { kind: "stopped" };

/**
 * IA-047: enfileira a RECONCILIAÇÃO (somente-leitura, sem reenvio) de um
 * destinatário que ficou em `outcome_unknown`. A chave estável
 * `reconcile:talkx.recipient.send:<id>` colide no UNIQUE de `ai_jobs`, então
 * repetir o enqueue devolve o MESMO job. Best-effort: a linha de origem JÁ está
 * em quarentena durável, então uma falha aqui não pode derrubar o lote — só é
 * logada; a linha segue visível para ação humana.
 */
async function enqueueRecipientReconciliation(
  supabase: SupabaseClient,
  recipient: ProcessRecipientRow,
  externalId: string | null,
  log: Logger,
  correlationId: string,
  campaignId: string,
): Promise<void> {
  try {
    await enqueueEffectReconcile({
      supabase,
      effect: EFFECT_TALKX_RECIPIENT_SEND,
      sourceTable: "talkx_recipients",
      sourceId: recipient.id,
      externalId,
      attemptFrom: typeof recipient.attempt_count === "number" ? recipient.attempt_count : 0,
    });
  } catch (err) {
    log.warn("TalkX: falha ao enfileirar reconciliacao (linha segue em outcome_unknown)", {
      correlationId,
      campaignId,
      recipient_id: recipient.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function processRecipient(
  deps: ProcessRecipientDeps,
  recipient: ProcessRecipientRow,
): Promise<ProcessResult> {
  const {
    supabase, campaignId, businessHours, initialInstanceId, instanceToken,
    evolutionUrl, evolutionKey, supabaseUrl, workerId,
    trackingUrlFor, linksByLabelFor, customFieldsByContact, log, correlationId,
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
      // X020 — PRECEDÊNCIA A/B: se o texto próprio da campanha difere do
      // conteúdo do template, vale o texto da campanha e NENHUMA variante é
      // sorteada. Só com o texto igual (ou vazio) a variante decide.
      const { data: templateRow, error: templateError } = await supabase
        .from('talkx_templates').select('content').eq('id', campaign.template_id).maybeSingle();
      if (templateError) throw new Error(`talkx_template_lookup_failed: ${templateError.message}`);
      const templateContent = (templateRow as { content?: unknown } | null)?.content;
      const campaignTemplateText = typeof campaign.message_template === "string" ? campaign.message_template : "";
      const campaignOverridesTemplate = campaignTemplateText.trim().length > 0
        && campaignTemplateText !== templateContent;
      if (!campaignOverridesTemplate) {
        variant = await pickVariant(supabase, campaign.template_id as string, recipient.id as string);
      }
    }

    const contentToSend = legacyPersonalizedMessage ?? variant?.content ?? campaign.message_template;
    const candidateMediaUrl = variant?.media_url ?? campaign.media_url ?? null;
    const candidateMediaType = variant?.media_type ?? campaign.media_type ?? null;
    if ((candidateMediaUrl === null) !== (candidateMediaType === null)) {
      throw new Error("talkx_invalid_media_snapshot_source");
    }
    let calculatedMessage: string;
    let recipientMissing: string[] = [];
    let recipientUnknown: string[] = [];
    const customValues = customFieldsByContact.get(recipient.contact_id as string) ?? {};
    try {
      if (legacyPersonalizedMessage) {
        calculatedMessage = legacyPersonalizedMessage;
      } else {
        const personalized = personalize(
          contentToSend as string,
          contact as { name?: string; nickname?: string; company?: string; phone?: string; vendedor?: string },
          customValues,
          typeof campaign.schedule_timezone === "string" ? campaign.schedule_timezone : DEFAULT_SCHEDULE_TIMEZONE,
          trackingUrlFor(recipient.id as string),
          linksByLabelFor(recipient.id as string),
        );
        calculatedMessage = personalized.text;
        recipientMissing = personalized.missing;
        recipientUnknown = personalized.unknown;
      }
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
      return { kind: "message_failed", errorCode: "message_render_failed" };
    }
    // X020 — POLÍTICA DE ERRO: variável conhecida SEM valor e sem padrão
    // (ou nome desconhecido para este contato) NÃO vira "[variavel]" enviado.
    // O destinatário é marcado `skipped` com `missing_variable:<nome>` e NENHUM
    // POST sai ao provedor — o texto errado nunca chega ao cliente.
    const firstUnresolved = recipientMissing[0] ?? recipientUnknown[0] ?? null;
    if (firstUnresolved) {
      const prefix = recipientMissing.length > 0 ? "missing_variable" : "unknown_variable";
      const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
        p_recipient_id: recipient.id,
        p_claim_token: claim.claim_token,
        p_status: "skipped",
        p_error_message: `${prefix}:${firstUnresolved}`,
      });
      if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
      return { kind: "skipped_missing_variable" };
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
  // IA-047: id do provedor quando ELE respondeu mas a CONFIRMAÇÃO no banco
  // falhou. Vive fora do try para que o catch (quarentena) possa enfileirar a
  // reconciliação com o id conhecido. Fica `null` quando nem chegamos a recebê-lo.
  let providerMessageId: string | null = null;
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
        { number: phone, presence: "composing" },
        undefined, undefined, undefined, instanceToken ?? undefined);
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
          // X025: 1 evento com o status lido da conexão (antes a mensagem era
          // fixa e não dizia em que estado a conexão estava).
          const readStatus = typeof beforeSendConnection?.status === "string"
            ? beforeSendConnection.status
            : "unknown";
          try {
            await supabase.from("talkx_campaign_events").insert({
              campaign_id: campaignId,
              event_type: "connection_failed",
              message: `Falha de conexão (status: ${readStatus})`,
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
        undefined, undefined, abortCtrl.signal, instanceToken ?? undefined,
      );
    } else {
      await markProviderDispatch();
      providerPostAttempted = true;
      sendResponse = await evoFetch(evolutionUrl, evolutionKey,
        `/message/sendText/${beforeSendInstanceId}`,
        { number: phone, text: personalizedMsg, delay: 0 },
        undefined, undefined, abortCtrl.signal, instanceToken ?? undefined,
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

    const foundProviderMessageId = extractMessageId(sendResult);
    providerMessageId = foundProviderMessageId ?? null;
    if (sendResponse.ok && !sendResult.error && foundProviderMessageId && foundProviderMessageId.length <= 512) {
      const { error: completionError } = await supabase.rpc("record_talkx_recipient_sent", {
        p_recipient_id: recipient.id,
        p_claim_token: claim.claim_token,
        p_external_id: foundProviderMessageId,
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
      return { kind: "failed", httpStatus: sendResponse.status, errorCode: "provider_error" };
    }
  } catch (err) {
    clearTimeout(sendTimeout);
    // E91: erro antes do POST ao provedor — pode reagendar com backoff
    if (!providerPostAttempted) {
      // SL-054: o backoff do DLQ é o COMPARTILHADO (kernel): a conta e a tabela
      // (30 s / 2 min / 10 min) saem do MESMO lugar que o multiplix-send usa.
      // Antes esta edge mantinha a própria cópia da tabela — corrigir a política
      // num motor deixava o outro para trás em silêncio (mesmo caso que originou
      // o `_shared/messaging/timing.ts`).
      const attemptSoFar = typeof recipient.attempt_count === 'number'
        ? recipient.attempt_count
        : 0;
      const delayMs = backoffDelayForAttempts(attemptSoFar);
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
      return { kind: "rescheduled", deadLettered, errorCode: "pre_dispatch_error" };
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
      // IA-047: a linha está em quarentena DURÁVEL. Enfileira a RECONCILIAÇÃO
      // (somente-leitura, idempotente, SEM reenvio) para um varredor tentar
      // confirmar depois. Best-effort: se falhar, só loga — a linha continua em
      // `outcome_unknown` e visível para ação humana.
      await enqueueRecipientReconciliation(supabase, recipient, providerMessageId, log, correlationId, campaignId);
      const interval = randomBetween(campaign.send_interval_min as number, campaign.send_interval_max as number);
      await sleep(interval);
      return { kind: "outcome_unknown", errorCode: "provider_outcome_unknown" };
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
