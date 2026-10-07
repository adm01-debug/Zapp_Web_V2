import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { getCorsHeaders, jsonResponse, errorResponse, Logger, requireEnv } from "../_shared/validation.ts";
import { verifyMetaWebhookSignature } from "../_shared/hmac-validation.ts";
import { shouldUpdateStatus } from "../_shared/evolution-helpers.ts";

const WhatsAppStatusSchema = z.object({
  id: z.string().max(500),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  timestamp: z.string(),
  recipient_id: z.string().optional(),
  errors: z.array(z.object({ code: z.number(), title: z.string() })).optional(),
});

const WhatsAppWebhookSchema = z.object({
  object: z.string(),
  entry: z.array(z.object({
    id: z.string(),
    changes: z.array(z.object({
      value: z.object({
        messaging_product: z.string().optional(),
        metadata: z.object({
          display_phone_number: z.string(),
          phone_number_id: z.string(),
        }).optional(),
        statuses: z.array(WhatsAppStatusSchema).optional(),
        // `profile.name` NÃO é obrigatório no payload da Meta: sem ele o
        // schema derrubava o lote inteiro para "Invalid payload format"
        // (200 + warning) e a mensagem nunca era persistida. Sem nome, o
        // push_name vira null e o RPC cai no telefone.
        contacts: z.array(z.object({
          profile: z.object({ name: z.string().optional() }).optional(),
        })).optional(),
        messages: z.array(z.object({
          id: z.string(),
          from: z.string(),
          timestamp: z.string(),
          type: z.string(),
          text: z.object({ body: z.string() }).optional(),
        })).optional(),
      }),
      field: z.string(),
    })),
  })),
});

// Valores aceitos pela CHECK messages_message_type_check (migration
// 20260318130516). Qualquer `type` da Meta fora desta lista cai em 'text'.
const META_MESSAGE_TYPES = new Set([
  'text', 'image', 'audio', 'video', 'document', 'sticker',
  'location', 'contact', 'poll', 'button', 'list', 'reaction',
  'vcard', 'ptt', 'link', 'template', 'interactive', 'order',
  'product', 'catalog',
]);

// timestamp da Meta pode nao ser numerico: sem o guard, new Date(NaN) derrubava
// o handler inteiro com 500 e perdia TODOS os eventos do lote.
function timestampToIso(raw: string): string {
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

export async function handleWhatsappWebhook(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const log = new Logger("whatsapp-webhook");

  // Handle webhook verification (GET request from WhatsApp)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
    if (!verifyToken) {
      log.warn("WHATSAPP_VERIFY_TOKEN not configured");
      return new Response('Forbidden', { status: 403, headers: getCorsHeaders(req) });
    }

    if (mode === 'subscribe' && token === verifyToken) {
      log.info("Webhook verified successfully");
      return new Response(challenge, {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'text/plain' }
      });
    }

    log.warn("Webhook verification failed");
    return new Response('Forbidden', { status: 403, headers: getCorsHeaders(req) });
  }

  // Handle webhook events (POST request)
  if (req.method === 'POST') {
    try {
      // R2-API-021: HMAC BLOQUEANTE antes de qualquer efeito. O HMAC cobre os
      // bytes crus do corpo, então req.text() vem primeiro e o JSON sai dele —
      // nada de banco/provedor antes do veredito. Sem WHATSAPP_APP_SECRET
      // configurado a requisição é recusada (falha fechada).
      const rawBodyText = await req.text();
      const verdict = await verifyMetaWebhookSignature(
        req.headers,
        rawBodyText,
        Deno.env.get('WHATSAPP_APP_SECRET'),
      );
      if (!verdict.ok) {
        log.warn(`assinatura do webhook recusada (${verdict.reason})`);
        return errorResponse('Unauthorized', 401, req);
      }

      const supabaseUrl = requireEnv('SUPABASE_URL');
      const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const rawPayload = JSON.parse(rawBodyText);
      const parsed = WhatsAppWebhookSchema.safeParse(rawPayload);

      if (!parsed.success) {
        log.warn("Invalid webhook payload", { errors: parsed.error.message });
        // Return 200 to acknowledge and prevent retries
        return jsonResponse({ success: true, warning: "Invalid payload format" }, 200, req);
      }

      const payload = parsed.data;
      log.info("Received webhook", { entries: payload.entry.length });

      let ingested = 0;
      let statusesApplied = 0;
      let unattributed = false;

      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          const value = change.value;
          const hasInbound = (value.messages?.length ?? 0) > 0;
          const hasStatuses = (value.statuses?.length ?? 0) > 0;
          if (!hasInbound && !hasStatuses) continue;

          // D2/D3: a conta se resolve pelo metadata.phone_number_id do
          // envelope, casado com channel_connections.external_account_id
          // (channel_type='whatsapp'); o vinculo usado e
          // channel_connections.whatsapp_connection_id. Sem phone_number_id,
          // sem linha ou com vinculo nulo o evento NAO pode ser atribuido —
          // nada e escrito e a resposta do POST nao e 200.
          const phoneNumberId = value.metadata?.phone_number_id;
          let connectionId: string | null = null;
          if (phoneNumberId) {
            const { data: connections, error: connError } = await supabase
              .from('channel_connections')
              .select('whatsapp_connection_id')
              .eq('channel_type', 'whatsapp')
              .eq('external_account_id', phoneNumberId)
              .order('created_at', { ascending: false })
              .limit(1);
            if (connError) {
              log.error("channel_connections lookup failed", { phoneNumberId, error: connError.message });
              throw new Error(`channel_connections lookup failed: ${connError.message}`);
            }
            connectionId = connections?.[0]?.whatsapp_connection_id ?? null;
          }
          if (!connectionId) {
            unattributed = true;
            log.warn("Webhook event has no account attribution; nothing persisted", {
              phoneNumberId: phoneNumberId ?? null,
            });
            continue;
          }

          // Handle status updates — escopo de conexao + guarda monotonica
          // (um `sent` tardio nao pode rebaixar um `read`).
          if (value.statuses) {
            for (const status of value.statuses) {
              const { data: targets, error: lookupError } = await supabase
                .from('messages')
                .select('id, status')
                .eq('external_id', status.id)
                .eq('whatsapp_connection_id', connectionId)
                .eq('sender', 'agent')
                .order('created_at', { ascending: false })
                .limit(1);
              if (lookupError) {
                log.error("Error fetching message for status update", { messageId: status.id, error: lookupError.message });
                throw new Error(`messages lookup failed: ${lookupError.message}`);
              }

              const target = targets?.[0];
              if (!target) {
                log.info("Status update with no matching outbound message", { messageId: status.id, status: status.status });
                continue;
              }
              if (!shouldUpdateStatus(target.status, status.status)) {
                log.info("Ignoring stale status update", { messageId: status.id, current: target.status, incoming: status.status });
                continue;
              }

              const { error: updateError } = await supabase
                .from('messages')
                .update({
                  status: status.status,
                  status_updated_at: timestampToIso(status.timestamp),
                })
                .eq('id', target.id);
              if (updateError) {
                log.error("Error updating message status", { messageId: status.id, error: updateError.message });
                throw new Error(`messages update failed: ${updateError.message}`);
              }
              statusesApplied++;
            }
          }

          // Handle incoming messages — ingestao duravel via RPC canonica
          // (find-or-create de contato + upsert idempotente em UMA transacao).
          if (value.messages) {
            for (const message of value.messages) {
              // `from` sem nenhum digito geraria contato com telefone vazio:
              // nao chama o RPC e trata o evento como nao atribuido (D3).
              const phone = message.from.replace(/\D/g, '');
              if (!phone) {
                unattributed = true;
                log.warn("Inbound message sem telefone discavel; evento nao atribuido", {
                  externalId: message.id,
                  phoneNumberId: phoneNumberId ?? null,
                });
                continue;
              }
              // body presente mas vazio/so espacos nao e nullish: cai no mesmo
              // placeholder da coluna NOT NULL.
              const body = message.text?.body;
              const { error: rpcError } = await supabase.rpc('ingest_inbound_message', {
                p_connection_id: connectionId,
                p_phone: phone,
                p_push_name: value.contacts?.[0]?.profile?.name ?? null,
                p_content: body && body.trim() !== '' ? body : `[mensagem ${message.type}]`,
                p_message_type: META_MESSAGE_TYPES.has(message.type) ? message.type : 'text',
                p_media_url: null,
                p_external_id: message.id,
                p_created_at: timestampToIso(message.timestamp),
              });
              if (rpcError) {
                log.error("ingest_inbound_message failed", { externalId: message.id, error: rpcError.message });
                throw new Error(`ingest_inbound_message failed: ${rpcError.message}`);
              }
              ingested++;
            }
          }
        }
      }

      if (unattributed) {
        log.done(400);
        return errorResponse('Unknown WhatsApp account', 400, req);
      }

      log.done(200);
      return jsonResponse({ success: true, ingested, statuses: statusesApplied }, 200, req);
    } catch (error) {
      log.error("Webhook processing error", { error: error instanceof Error ? error.message : String(error) });
      log.done(500);
      return errorResponse("Internal server error", 500, req);
    }
  }

  return new Response('Method not allowed', { status: 405, headers: getCorsHeaders(req) });
}

if (import.meta.main) {
  serve(handleWhatsappWebhook);
}
