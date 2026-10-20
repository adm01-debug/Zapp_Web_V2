import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, handleCors, checkRateLimit, getClientIP } from "../_shared/validation.ts";
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
import type { EvolutionDbClient } from "../_shared/evolution-types.ts";

// ---------------------------------------------------------------------------
// Gate de autenticidade (R2-API-021 — fail-closed por padrão)
//
// Caminho 1 — HMAC: EVOLUTION_WEBHOOK_SECRET (fallback WEBHOOK_SECRET, mesmo
// motivo do `||` documentado antes). Assinatura PRESENTE porém inválida — ou
// presente sem secret para conferi-la — é sempre 401; assinatura válida
// dispensa o token do corpo. strictMode segue false porque a Evolution GO NÃO
// assina webhooks nem aceita headers customizados (webhook_producer.go envia
// só Content-Type) — strictMode=true rejeitaria 100% do tráfego GO.
//
// Caminho 2 — instanceToken no corpo (compatibilidade GO): a única credencial
// que a GO entrega é o instanceToken de todo evento. O token apresentado é
// comparado primeiro com o legado global EVOLUTION_INSTANCE_TOKEN (sem banco)
// e depois com a credencial POR INSTÂNCIA via get_instance_token (Vault,
// read-only, cache de 5 min — E30 do plano multi-conexão). Token ausente →
// 401 sem nenhum acesso ao banco; divergente ou instância sem credencial →
// 401 depois de no máximo a leitura da credencial — nenhum efeito (handler,
// escrita ou fetch de provedor) acontece no caminho negativo.
//
// EVOLUTION_WEBHOOK_ENFORCE: 'token' (padrão) rejeita; 'shadow' só loga —
// rollback explícito de operação via secret no Dashboard, não o default.
// ---------------------------------------------------------------------------

type EnforceMode = 'shadow' | 'token';

function evolutionEnforceMode(): EnforceMode {
  const mode = Deno.env.get('EVOLUTION_WEBHOOK_ENFORCE') || 'token';
  if (mode !== 'shadow' && mode !== 'token') {
    throw new Error(`EVOLUTION_WEBHOOK_ENFORCE invalido: ${mode} (use 'shadow' ou 'token')`);
  }
  return mode;
}

// Client com cache por isolate (as URLs não mudam por request); a resolução de
// credencial e os handlers dividem a mesma instância.
let cachedDb: { url: string; client: SupabaseClient } | null = null;

function getDb(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configuradas');
  if (!cachedDb || cachedDb.url !== url) {
    cachedDb = { url, client: createClient(url, key) };
  }
  return cachedDb.client;
}

const INSTANCE_TOKEN_CACHE_TTL_MS = 5 * 60_000;
const instanceTokenCache = new Map<string, { token: string; expiresAt: number }>();

// Credencial por instância (Vault via get_instance_token). RPC read-only — é a
// resolução da credencial, não um efeito. Falha de resolução vale como "sem
// credencial" (fail-closed); só positivos entram no cache para não atrasar a
// ativação de instância criada depois.
async function resolveInstanceToken(instanceName: string): Promise<string | null> {
  const cached = instanceTokenCache.get(instanceName);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  try {
    const { data, error } = await getDb().rpc('get_instance_token', { p_instance_id: instanceName });
    const token = !error && typeof data === 'string' && data ? data : null;
    if (token) {
      instanceTokenCache.set(instanceName, { token, expiresAt: Date.now() + INSTANCE_TOKEN_CACHE_TTL_MS });
    }
    return token;
  } catch {
    return null;
  }
}

export async function handleEvolutionWebhook(req: Request): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  // C9: rate-limit per IP before body is read (200 req/min covers GO burst traffic)
  const ip = getClientIP(req);
  const rl = checkRateLimit(`evowh:${ip}`, 200, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const enforceMode = evolutionEnforceMode();

    // -----------------------------------------------------------------------
    // HMAC validation — MUST happen before any other body read.
    // WebhookSecurityService.validateRequest() consumes req.text() internally;
    // the parsed body is available in validation.payload (raw string).
    // Using req.json() AFTER this point would throw because Deno body streams
    // can only be consumed once.
    // -----------------------------------------------------------------------
    // `||` (não `??`): uma env var configurada como string vazia precisa cair
    // pro fallback também, senão '' seria tratado como "secret configurado".
    const webhookSecret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET') || Deno.env.get('WEBHOOK_SECRET') || '';
    const hmacSecurity = new WebhookSecurityService(webhookSecret, /* strictMode */ false);
    const validation = await hmacSecurity.validateRequest(req);

    // R2-API-021: assinatura PRESENTE porém inválida é sempre 401 — inclusive
    // sem secret configurado para conferi-la (fail-closed). A ausência de
    // assinatura NÃO é rejeitada aqui porque a Evolution GO não assina; ela cai
    // no gate por instanceToken logo abaixo.
    if (validation.signatureFound && !validation.signatureValid) {
      console.warn('[HMAC] Rejected request:', validation.error);
      return new Response(JSON.stringify({ error: validation.error ?? 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    // Sem assinatura HMAC válida (a GO nunca envia uma), a credencial é o
    // instanceToken do corpo — global por env ou resolvido por instância.
    if (!validation.signatureValid) {
      const bodyRec = rawBody as Record<string, unknown>;
      const presented = typeof bodyRec.instanceToken === 'string' ? bodyRec.instanceToken : '';
      // C11: v2-shaped payloads trazem 'instance' (sem 'instanceName'); o gate
      // roda sobre o corpo cru antes de isGoPayload/translate, para as duas
      // formas.
      const instanceName =
        (typeof bodyRec.instanceName === 'string' && bodyRec.instanceName) ||
        (typeof bodyRec.instance === 'string' && bodyRec.instance) || '';

      const envToken = Deno.env.get('EVOLUTION_INSTANCE_TOKEN') || '';
      let tokenOk = false;
      if (presented && envToken && timingSafeEqual(presented, envToken)) {
        tokenOk = true;
      } else if (presented && instanceName) {
        // Token presente mas diferente do global: resolve a credencial da
        // instância (RPC read-only). Token AUSENTE nem chega aqui — rejeitado
        // sem tocar o banco.
        const expected = await resolveInstanceToken(instanceName);
        tokenOk = expected !== null && timingSafeEqual(presented, expected);
      }

      if (!tokenOk) {
        const motivo = !presented ? 'ausente' : instanceName ? 'divergente' : 'instancia-ausente';
        console.warn(`[WEBHOOK_AUTH] evolution-webhook: instanceToken ${motivo} (enforce=${enforceMode}, shape=${typeof bodyRec.instanceName === 'string' ? 'go' : 'v2'})`);
        if (enforceMode === 'token') {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // O token é credencial viva da API GO — não deixá-lo descer para handlers,
    // logs ou persistência. Fora do gate: vale também quando o HMAC e valido.
    delete (rawBody as Record<string, unknown>).instanceToken;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    // Cast unico (ver evolution-types.ts): comparar o client real com EvolutionDbClient
    // a cada chamada de handler estoura o TS2589 do Deno. Uma vez so, aqui, sai barato.
    const supabase = getDb();
    const db = supabase as unknown as EvolutionDbClient;

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

    if (event === 'connection.update') await handleConnectionUpdate(db, instance, baseData);

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

        console.warn(`[MSG_UPSERT] id=${externalId} fromMe=${key.fromMe} remoteJid=${key.remoteJid ? key.remoteJid.substring(0, 6) + '...' : 'null'} hasReaction=${!!(entry.message as Record<string,unknown>)?.reactionMessage || !!(baseData.message as Record<string,unknown>)?.reactionMessage}`);

        const msg = (entry.message || baseData.message) as Record<string, unknown> | undefined;
        if (msg?.reactionMessage) {
          console.log(`[MSG_UPSERT] Processing reaction for ${externalId}`);
          await handleReactionEvent(db, instance, msg.reactionMessage as Record<string, unknown>, !!key.fromMe);
          continue;
        }

        if (!key.fromMe) {
          console.log(`[MSG_UPSERT] -> handleIncomingMessage for ${externalId}`);
          await handleIncomingMessage(db, instance, { ...baseData, ...entry }, key, supabaseUrl, supabaseServiceKey);
        } else {
          console.log(`[MSG_UPSERT] -> handleOutgoingWhatsAppMessage for ${externalId}`);
          await handleOutgoingWhatsAppMessage(db, instance, { ...baseData, ...entry }, key);
        }
      }
    }

    if (event === 'send.message') await handleSendMessage(db, instance, data, baseData);
    if (event === 'messages.update') await handleMessagesUpdate(db, instance, data, baseData);
    if (event === 'messages.delete') await handleMessagesDelete(db, instance, data, baseData);
    if (event === 'contacts.upsert' || event === 'contacts.update') await handleContactsUpsert(db, instance, data);
    if (event === 'presence.update') await handlePresenceUpdate(db, instance, data);
    if (event === 'chats.upsert' || event === 'chats.update') await handleChatsUpdate(db, instance, data);

    if (event === 'groups.upsert' || event === 'group.update') {
      const groupData = isRecord(data) ? data : {};
      const groupJid = groupData.id as string;
      const subject = groupData.subject as string;
      if (groupJid && subject) console.warn(`Group update: ${groupJid.substring(0, 6)}... — ${subject.substring(0, 30)}`);
    }

    if (event === 'group.participants.update' || event === 'group-participants.update') {
      const participantData = isRecord(data) ? data : {};
      console.warn(`Group ${participantData.id ? String(participantData.id).substring(0, 6) + '...' : ''} participants ${participantData.action}: ${(participantData.participants as string[])?.length ?? 0} members`);
    }

    if (event === 'labels.edit') await handleLabelsEdit(db, instance, data);
    if (event === 'labels.association') await handleLabelsAssociation(db, instance, data);
    if (event === 'call') await handleCallEvent(db, instance, data);
    if (event === 'chats.delete') await handleChatsDelete(db, instance, data);
    if (event === 'application.startup') await handleApplicationStartup(db, instance);
    if (event === 'messages.set') await handleMessagesSet(db, instance, data);
    if (event === 'contacts.set') await handleContactsSet(db, instance, data);
    if (event === 'chats.set') await handleChatsSet(db, instance, data);
    if (event === 'messages.edited' || event === 'messages.edit') await handleMessagesEdited(db, instance, data, baseData);

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
}

if (import.meta.main) {
  serve(handleEvolutionWebhook);
}
