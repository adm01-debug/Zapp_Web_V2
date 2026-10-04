import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, internalErrorResponse, jsonResponse, requireEnv, isValidUUID, Logger } from "../_shared/validation.ts";
import { ElevenLabsWebhookV1Schema, ElevenLabsWebhookV2Schema, validationErrorResponse } from "../_shared/schemas.ts";
import { parseVersioned } from "../_shared/contracts.ts";
import { verifyElevenLabsSignature, type SignatureVerdict, type VerifySignatureOptions } from "../_shared/webhook-signature.ts";

/**
 * IA-WEBHOOK-001 (P1) — replay e falha de insert no webhook assinado.
 *
 * Defeito fechado: a assinatura/timestamp já eram bloqueantes (IA-013), mas
 * cada entrega válida caía num novo INSERT em audit_logs — não havia dedupe —
 * e o {error} do insert era ignorado antes do 200, então falha de persistência
 * (inclusive a certa: id textual do provedor gravado na coluna uuid
 * `entity_id`) era respondida como sucesso.
 *
 * Regra agora:
 *   - toda entrega grava `dedupe_key` estável
 *     (elevenlabs:<tipo>:<id do evento | sha256 do corpo>), protegida pelo
 *     índice único parcial ux_audit_logs_dedupe_key;
 *   - UNIQUE 23505 => replay já registrado: responde 200 { duplicate: true }
 *     SEM reexecutar o efeito (critério IA-013 de repetição sem novo efeito);
 *   - qualquer outro erro de insert => 5xx, para o provedor retentar — nunca
 *     200 com persistência perdida;
 *   - `entity_id` (uuid) só recebe o id do evento quando ele é um UUID válido;
 *     o id bruto segue em details.request_id.
 */

export interface ElevenLabsWebhookDeps {
  /** Cliente service-role (só roda depois da assinatura válida). Injetado nos testes. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  /** Override do ELEVENLABS_WEBHOOK_SECRET (facilita o teste sem tocar no env). */
  webhookSecret?: string;
  /** Verificador de assinatura injetável; padrão: verifyElevenLabsSignature real. */
  verifySignature?: (
    headers: Headers,
    payload: string,
    secret: string | undefined,
    options?: VerifySignatureOptions,
  ) => Promise<SignatureVerdict>;
  /** Injeção de relógio repassada ao verificador (teste). */
  nowMs?: number;
}

/** sha256 hex do corpo cru — dedupe do evento que não traz id próprio. */
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function handleElevenLabsWebhook(
  req: Request,
  deps: ElevenLabsWebhookDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-webhook");

  try {
    // IA-013: assinatura BLOQUEANTE. Antes, este handler validava a assinatura
    // em modo sombra e seguia processando: o corpo cru de QUALQUER requisicao
    // anonima era gravado em audit_logs com service role.
    // Falha fechada: sem ELEVENLABS_WEBHOOK_SECRET nos Secrets da funcao a
    // requisicao e recusada (401) em vez de processada sem verificacao.
    const rawBodyText = await req.text();
    const webhookSecret = deps.webhookSecret ?? Deno.env.get('ELEVENLABS_WEBHOOK_SECRET');
    const sigOptions = deps.nowMs !== undefined ? { nowMs: deps.nowMs } : undefined;
    const verdict = deps.verifySignature
      ? await deps.verifySignature(req.headers, rawBodyText, webhookSecret, sigOptions)
      : await verifyElevenLabsSignature(req.headers, rawBodyText, webhookSecret, sigOptions);
    if (!verdict.ok) {
      log.warn(`assinatura recusada (${verdict.reason})`);
      return errorResponse('Assinatura do webhook invalida', 401, req);
    }

    let rawBody: unknown = null;
    try {
      rawBody = JSON.parse(rawBodyText);
    } catch {
      rawBody = null;
    }
    if (rawBody === null || typeof rawBody !== 'object') {
      return validationErrorResponse([{ path: '(root)', message: 'Body must be a valid JSON object', code: 'invalid_type' }], req);
    }
    const contract = parseVersioned(req, rawBody, {
      v1: ElevenLabsWebhookV1Schema,
      v2: ElevenLabsWebhookV2Schema,
    });
    if (!contract.ok) return contract.response;
    const body = contract.data as Record<string, unknown>;

    const eventType = String(body.type || body.event_type || 'unknown').slice(0, 100);
    log.info(`event=${eventType}`);

    const supabase = deps.supabase ?? createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

    // IA-WEBHOOK-001: chave idempotente da entrega. Preferência ao id do evento
    // do provedor; sem id, a impressão do corpo assinado (replay manda o mesmo
    // payload) vira a chave — o UNIQUE ux_audit_logs_dedupe_key deduplica.
    const eventIdRaw = body.id ?? body.request_id;
    const eventId = eventIdRaw === null || eventIdRaw === undefined
      ? ''
      : String(eventIdRaw).slice(0, 200);
    const dedupeKey = eventId
      ? `elevenlabs:${eventType}:${eventId}`
      : `elevenlabs:${eventType}:sha256:${await sha256Hex(rawBodyText)}`;

    // A coluna entity_id é uuid: id textual do provedor ia para ela e TODO
    // insert quebrava em silêncio (o {error} era ignorado). Só UUID entra;
    // o id bruto segue em details.request_id.
    const entityId = isValidUUID(eventId) ? eventId : null;

    // IA-013: allowlist de campos. O corpo cru do provedor nao vai mais para o
    // banco — so o necessario para auditoria, com a assinatura ja verificada.
    const { error: insertError } = await supabase.from('audit_logs').insert({
      action: `elevenlabs_webhook_${eventType}`,
      entity_type: 'elevenlabs',
      entity_id: entityId,
      dedupe_key: dedupeKey,
      details: {
        event_type: eventType,
        request_id: typeof body.request_id === 'string' ? body.request_id.slice(0, 100) : null,
        status: typeof body.status === 'string' ? body.status.slice(0, 50) : null,
        signature_verified: true,
      },
    });

    // IA-WEBHOOK-001: o retorno do insert DECIDE a resposta.
    if (insertError) {
      if (insertError.code === '23505') {
        // Replay/concorrência na UNIQUE: o evento já está registrado —
        // responde sucesso idempotente SEM reexecutar o efeito.
        log.info(`replay deduplicado (${dedupeKey})`);
        return jsonResponse({ received: true, event: eventType, duplicate: true }, 200, req);
      }
      // Persistência falhou de verdade: 5xx para o provedor retentar — nunca
      // 200 com o evento perdido.
      log.error('falha ao persistir audit_logs', { error: insertError.message });
      return internalErrorResponse(insertError, req);
    }

    switch (eventType) {
      case 'tts.completed':
        log.info('TTS completed', { requestId: body.request_id });
        break;
      case 'tts.failed':
        log.error('TTS failed', { requestId: body.request_id, error: body.error });
        break;
      case 'music.completed':
        log.info('Music completed', { requestId: body.request_id });
        break;
      case 'sfx.completed':
        log.info('SFX completed', { requestId: body.request_id });
        break;
      case 'voice_clone.completed':
        log.info('Voice clone completed', { voiceId: body.voice_id });
        break;
      case 'quota.warning':
        log.warn('Quota warning', { usage: body.usage_percent });
        break;
      default:
        log.info('Unhandled event type');
    }

    log.done(200);
    return jsonResponse({ received: true, event: eventType }, 200, req);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('Unhandled error', { error: msg });
    return errorResponse(msg, 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleElevenLabsWebhook(req));
}
