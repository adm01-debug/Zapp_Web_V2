import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors } from "../_shared/validation.ts";
import {
  isRecord, normalizeEventName, toEventRecords,
  handleReactionEvent,
  type WebhookPayload,
} from "../_shared/evolution-helpers.ts";
import { parseMessageContent } from "../_shared/evolution-media.ts";
import { EvolutionWebhookEnvelopeV1Schema, EvolutionWebhookEnvelopeV2Schema, validationErrorResponse } from "../_shared/schemas.ts";
import { parseVersioned } from "../_shared/contracts.ts";
import { isGoPayload, translateGoPayload } from "../_shared/evolution-go-adapter.ts";
import {
  handleConnectionUpdate, handleSendMessage, handleMessagesUpdate, handleMessagesDelete,
  handleContactsUpsert, handlePresenceUpdate, handleChatsUpdate,
  handleLabelsEdit, handleLabelsAssociation, handleCallEvent,
  handleChatsDelete, handleApplicationStartup, handleMessagesSet,
  handleContactsSet, handleChatsSet, handleMessagesEdited,
} from "../_shared/evolution-webhook-handlers.ts";
import {
  handleIncomingMessage, handleOutgoingWhatsAppMessage,
} from "../_shared/evolution-webhook-messages.ts";
import { WebhookSecurityService, timingSafeEqual } from "../_shared/hmac-validation.ts";

// ---------------------------------------------------------------------------
// HMAC validation (D2 — security hardening)
//
// strictMode = false  → permite requests sem assinatura (rollout gradual).
//   - Requests SEM header de assinatura: aceitos (backwards-compatible).
//   - Requests COM header de assinatura INVÁLIDA: rejeitados com 401.
//
// A Evolution GO NÃO assina webhooks nem aceita headers customizados
// (webhook_producer.go envia só Content-Type; ConnectStruct não tem campo de
// secret/headers) — strictMode=true rejeitaria 100% do tráfego GO e NÃO deve
// ser ligado enquanto ela for a emissora. O fechamento real do endpoint é o
// gate por instanceToken abaixo.
//
// EVOLUTION_WEBHOOK_SECRET é o nome usado em todo o resto do projeto (docs,
// _shared/hmac-validation.ts em modo sombra, auditoria) — WEBHOOK_SECRET é
// mantido como fallback só por compatibilidade com o nome genérico do exemplo
// em hmac-validation.ts, para não silenciar a validação se só um dos dois
// estiver configurado no Supabase Dashboard → Edge Functions → Secrets.
// `||` (não `??`): uma env var configurada como string vazia precisa cair
// pro fallback também, senão o guard `!webhookSecret` abaixo trataria ''
// como "secret configurado" e nunca rejeitaria assinatura inválida.
const webhookSecret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET') || Deno.env.get('WEBHOOK_SECRET') || '';
const hmacSecurity = new WebhookSecurityService(webhookSecret, /* strictMode */ false);

// ---------------------------------------------------------------------------
// Gate por instanceToken (Evolution GO) — a única credencial que a GO entrega
// é o instanceToken presente no CORPO de todo evento (webhook_producer.go).
// EVOLUTION_WEBHOOK_ENFORCE:
//   'shadow' (default) → só loga ausência/divergência; nada é rejeitado;
//   'token'            → corpo sem instanceToken correto recebe 401.
// Flip e rollback por secret no Dashboard, sem redeploy. `||` pelo mesmo
// motivo do webhookSecret acima.
const instanceToken = Deno.env.get('EVOLUTION_INSTANCE_TOKEN') || '';
const enforceMode = Deno.env.get('EVOLUTION_WEBHOOK_ENFORCE') || 'shadow';
if (enforceMode !== 'shadow' && enforceMode !== 'token') {
  throw new Error(`EVOLUTION_WEBHOOK_ENFORCE must be "shadow" or "token", got: "${enforceMode}"`);
}
let tokenOkLogged = false;

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    // -----------------------------------------------------------------------
    // HMAC validation — MUST happen before any other body read.
    // WebhookSecurityService.validateRequest() consumes req.text() internally;
    // the parsed body is available in validation.payload (raw string).
    // Using req.json() AFTER this point would throw because Deno body streams
    // can only be consumed once.
    // -----------------------------------------------------------------------
    const validation = await hmacSecurity.validateRequest(req);
    if (!validation.valid && webhookSecret) {
      console.warn('[HMAC] Rejected request:', validation.error);
      return new Response(JSON.stringify({ error: validation.error ?? 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (validation.signatureFound) {
      console.warn('[HMAC] Signature validated:', validation.signatureValid ? 'OK' : 'INVALID');
    }

    // -----------------------------------------------------------------------
    // Parse body from the already-read text (NOT req.json() — body consumed above).
    // -----------------------------------------------------------------------
    let rawBody: unknown;
    try {
      rawBody = validation.payload ? JSON.parse(validation.payload) : null;
    } catch {
      rawBody = null;
    }
    if (rawBody === null || typeof rawBody !== 'object') {
      return validationErrorResponse([{ path: '(root)', message: 'Body must be a valid JSON object', code: 'invalid_type' }], req);
    }

    // O instanceToken é credencial viva da API GO — remover SEMPRE do body
    // antes de descer para handlers, logs ou persistência, independente do
    // resultado HMAC. Extraímos antes de deletar para uso no gate abaixo.
    const bodyRec = rawBody as Record<string, unknown>;
    const instanceTokenFromBody = typeof bodyRec.instanceToken === 'string' ? bodyRec.instanceToken : undefined;
    delete bodyRec.instanceToken; // sempre removido, mesmo com HMAC válido

    // Sem assinatura HMAC válida, aplica gate de instanceToken — mas somente
    // para payloads GO (isGoPayload). Payloads v2 legados usam HMAC ou shadow.
    if (!validation.signatureValid && isGoPayload(rawBody)) {
      const tokenOk = !!instanceToken
        && typeof instanceTokenFromBody === 'string'
        && instanceTokenFromBody.length === instanceToken.length
        && timingSafeEqual(instanceTokenFromBody, instanceToken);
      if (!tokenOk) {
        console.warn(`[WEBHOOK_AUTH_SHADOW] evolution-webhook: instanceToken ${instanceTokenFromBody === undefined ? 'ausente' : 'divergente'} (enforce=${enforceMode}, tokenConfigurado=${instanceToken !== ''})`);
        if (enforceMode === 'token') {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else if (!tokenOkLogged) {
        tokenOkLogged = true;
        console.warn('[WEBHOOK_AUTH_SHADOW] evolution-webhook: instanceToken valido (1o match desta instancia)');
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let payload: WebhookPayload = rawBody as WebhookPayload;
    if (isGoPayload(payload)) payload = translateGoPayload(payload) as unknown as WebhookPayload;
    const contract = parseVersioned(req, payload, {
      v1: EvolutionWebhookEnvelopeV1Schema,
      v2: EvolutionWebhookEnvelopeV2Schema,
    });
    if (!contract.ok) return contract.response;
    payload = contract.data as WebhookPayload;
    const event = normalizeEventName(payload.event);
    const instance = payload.instance;
    const data = payload.data ?? {};
    const baseData = isRecord(data) ? data : {};

    console.log('Evolution webhook received:', payload.event, '->', event, instance);

    if (event === 'connection.update') await handleConnectionUpdate(supabase, instance, baseData);

    if (event === 'qrcode.updated') {
      const qrCode = (baseData.qrcode as Record<string, string>)?.base64;
      if (qrCode) {
        await supabase.from('whatsapp_connections')
          .update({ qr_code: qrCode, status: 'qr_pending', updated_at: new Date().toISOString() })
          .eq('instance_id', instance);
      } else if (!isRecord(baseData.qrcode)) {
        await supabase.from('whatsapp_connections')
          .update({ qr_code: null, status: 'disconnected', updated_at: new Date().toISOString() })
          .eq('instance_id', instance);
      }
    }

    if (event === 'messages.upsert') {
      const entries = toEventRecords(data, ['messages']);
      console.log(`[MSG_UPSERT] Processing ${entries.length} entries for instance ${instance}`);
      for (const entry of entries) {
        const keySource = isRecord(entry.key) ? entry.key : isRecord(baseData.key) ? baseData.key : null;
        const externalId =
          (typeof entry.id === 'string' && entry.id) ||
          (typeof baseData.id === 'string' && baseData.id) ||
          (typeof keySource?.id === 'string' && keySource.id) ||
          null;

        if (!externalId) {
          console.log('[MSG_UPSERT] Ignored: missing message id', { instance, entryKeys: Object.keys(entry) });
          continue;
        }

        const key = {
          id: externalId,
          fromMe: Boolean(
            (typeof entry.fromMe === 'boolean' ? entry.fromMe : undefined) ??
            (typeof baseData.fromMe === 'boolean' ? baseData.fromMe : undefined) ??
            (typeof keySource?.fromMe === 'boolean' ? keySource.fromMe : undefined) ??
            false
          ),
          remoteJid:
            (typeof entry.remoteJid === 'string' ? entry.remoteJid : undefined) ??
            (typeof baseData.remoteJid === 'string' ? baseData.remoteJid : undefined) ??
            (typeof keySource?.remoteJid === 'string' ? keySource.remoteJid : undefined),
          remoteJidAlt:
            (typeof entry.remoteJidAlt === 'string' ? entry.remoteJidAlt : undefined) ??
            (typeof baseData.remoteJidAlt === 'string' ? baseData.remoteJidAlt : undefined) ??
            (typeof keySource?.remoteJidAlt === 'string' ? keySource.remoteJidAlt : undefined),
          participant:
            (typeof entry.participant === 'string' ? entry.participant : undefined) ??
            (typeof baseData.participant === 'string' ? baseData.participant : undefined) ??
            (typeof keySource?.participant === 'string' ? keySource.participant : undefined),
          participantAlt:
            (typeof entry.participantAlt === 'string' ? entry.participantAlt : undefined) ??
            (typeof baseData.participantAlt === 'string' ? baseData.participantAlt : undefined) ??
            (typeof keySource?.participantAlt === 'string' ? keySource.participantAlt : undefined),
        };

        console.log(`[MSG_UPSERT] id=${externalId} fromMe=${key.fromMe} remoteJid=${key.remoteJid} hasReaction=${!!(entry.message as Record<string,unknown>)?.reactionMessage || !!(baseData.message as Record<string,unknown>)?.reactionMessage}`);

        const msg = (entry.message || baseData.message) as Record<string, unknown> | undefined;
        if (msg?.reactionMessage) {
          console.log(`[MSG_UPSERT] Processing reaction for ${externalId}`);
          await handleReactionEvent(supabase, msg.reactionMessage as Record<string, unknown>, !!key.fromMe);
          continue;
        }

        if (!key.fromMe) {
          console.log(`[MSG_UPSERT] -> handleIncomingMessage for ${externalId}`);
          await handleIncomingMessage(supabase, instance, { ...baseData, ...entry }, key, supabaseUrl, supabaseServiceKey);
        } else {
          console.log(`[MSG_UPSERT] -> handleOutgoingWhatsAppMessage for ${externalId}`);
          await handleOutgoingWhatsAppMessage(supabase, instance, { ...baseData, ...entry }, key);
        }
      }
    }

    if (event === 'send.message') await handleSendMessage(supabase, instance, data, baseData);
    if (event === 'messages.update') await handleMessagesUpdate(supabase, instance, data, baseData);
    if (event === 'messages.delete') await handleMessagesDelete(supabase, instance, data, baseData);
    if (event === 'contacts.upsert' || event === 'contacts.update') await handleContactsUpsert(supabase, instance, data);
    if (event === 'presence.update') await handlePresenceUpdate(supabase, instance, data);
    if (event === 'chats.upsert' || event === 'chats.update') await handleChatsUpdate(supabase, instance, data);

    if (event === 'groups.upsert' || event === 'group.update') {
      const groupData = isRecord(data) ? data : {};
      const groupJid = groupData.id as string;
      const subject = groupData.subject as string;
      if (groupJid && subject) console.log(`Group update: ${groupJid} — ${subject}`);
    }

    if (event === 'group.participants.update' || event === 'group-participants.update') {
      const participantData = isRecord(data) ? data : {};
      console.log(`Group ${participantData.id} participants ${participantData.action}: ${(participantData.participants as string[])?.join(', ')}`);
    }

    if (event === 'labels.edit') await handleLabelsEdit(supabase, instance, data);
    if (event === 'labels.association') await handleLabelsAssociation(supabase, instance, data);
    if (event === 'call') await handleCallEvent(supabase, instance, data);
    if (event === 'chats.delete') await handleChatsDelete(supabase, instance, data);
    if (event === 'application.startup') await handleApplicationStartup(supabase, instance);
    if (event === 'messages.set') await handleMessagesSet(supabase, instance, data);
    if (event === 'contacts.set') await handleContactsSet(supabase, instance, data);
    if (event === 'chats.set') await handleChatsSet(supabase, instance, data);
    if (event === 'messages.edited' || event === 'messages.edit') await handleMessagesEdited(supabase, data, baseData);

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Evolution webhook error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
