import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { ElevenLabsWebhookV1Schema, ElevenLabsWebhookV2Schema, validationErrorResponse } from "../_shared/schemas.ts";
import { parseVersioned } from "../_shared/contracts.ts";
import { verifyElevenLabsSignature } from "../_shared/webhook-signature.ts";

Deno.serve(async (req) => {
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
    const verdict = await verifyElevenLabsSignature(
      req.headers,
      rawBodyText,
      Deno.env.get('ELEVENLABS_WEBHOOK_SECRET'),
    );
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

    const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

    // IA-013: allowlist de campos. O corpo cru do provedor nao vai mais para o
    // banco — so o necessario para auditoria, com a assinatura ja verificada.
    await supabase.from('audit_logs').insert({
      action: `elevenlabs_webhook_${eventType}`,
      entity_type: 'elevenlabs',
      entity_id: String(body.id || body.request_id || '').slice(0, 100) || null,
      details: {
        event_type: eventType,
        request_id: typeof body.request_id === 'string' ? body.request_id.slice(0, 100) : null,
        status: typeof body.status === 'string' ? body.status.slice(0, 50) : null,
        signature_verified: true,
      },
    });

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
});
