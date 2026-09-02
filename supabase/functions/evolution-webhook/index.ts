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
import { logWebhookAuthShadow, timingSafeEqual } from "../_shared/hmac-validation.ts";
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

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // [WEBHOOK_AUTH_SHADOW] Modo sombra: valida mas NUNCA bloqueia nesta etapa.
    // Le o body via clone() para nao alterar o comportamento de req.json() abaixo.
    // Objetivo: confirmar via logs de producao se a Evolution GO ja envia
    // assinatura valida antes de um PR futuro ativar enforcement (401).
    const rawBodyTextForAuthShadow = await req.clone().text();
    await logWebhookAuthShadow('evolution-webhook', req.headers, rawBodyTextForAuthShadow, Deno.env.get('EVOLUTION_WEBHOOK_SECRET'), 'x-evolution-signature');
    // A Evolution API (infra antiga wpp2/v2.3.7) documentava um header
    // `x-webhook-secret` com o secret cru (nao um HMAC do body). Mecanismo
    // nao confirmado como ativo na Evolution GO atual — ver docs/EVOLUTION_WEBHOOKS_DOCUMENTATION.md.
    // Loga em paralelo para permitir observar qual (se algum) dos dois
    // mecanismos documentados realmente chega em producao.
    const legacyWebhookSecretHeader = req.headers.get('x-webhook-secret');
    const configuredEvolutionSecret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET');
    if (legacyWebhookSecretHeader) {
      const legacyValid = !!configuredEvolutionSecret && timingSafeEqual(legacyWebhookSecretHeader, configuredEvolutionSecret);
      if (legacyValid) {
        console.warn('[WEBHOOK_AUTH_SHADOW] evolution-webhook: header x-webhook-secret (legado) valido');
      } else {
        console.warn(`[WEBHOOK_AUTH_SHADOW] evolution-webhook: header x-webhook-secret (legado) ${configuredEvolutionSecret ? 'presente mas nao confere com o secret configurado' : 'presente mas secret nao configurado no ambiente'} — modo sombra, requisicao processada mesmo assim`);
      }
    } else {
      console.warn('[WEBHOOK_AUTH_SHADOW] evolution-webhook: header x-webhook-secret (legado, infra wpp2/Evolution v2.3.7) nao enviado — mecanismo nao confirmado como ativo na Evolution GO atual, modo sombra, requisicao processada mesmo assim');
    }

    const rawBody: unknown = await req.json().catch(() => null);
    if (rawBody === null || typeof rawBody !== 'object') {
      return validationErrorResponse([{ path: '(root)', message: 'Body must be a valid JSON object', code: 'invalid_type' }], req);
    }
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
        // 'qr_pending' é o valor do CHECK de whatsapp_connections.status
        // ('pending' violava o constraint e o update inteiro era rejeitado)
        await supabase.from('whatsapp_connections')
          .update({ qr_code: qrCode, status: 'qr_pending', updated_at: new Date().toISOString() })
          .eq('instance_id', instance);
      } else if (!isRecord(baseData.qrcode)) {
        // QRTimeout (GO manda data vazio): janela de pareamento venceu —
        // limpa o QR vencido. v2 sempre traz o objeto qrcode; fica intacto.
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
