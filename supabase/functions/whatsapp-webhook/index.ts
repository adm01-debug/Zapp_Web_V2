import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { getCorsHeaders, jsonResponse, errorResponse, Logger, requireEnv } from "../_shared/validation.ts";
import { verifyMetaWebhookSignature } from "../_shared/hmac-validation.ts";

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

      // Process status updates
      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          const value = change.value;

          // Handle status updates
          if (value.statuses) {
            for (const status of value.statuses) {
              log.info("Processing status update", { messageId: status.id, status: status.status });

              const { error } = await supabase
                .from('messages')
                .update({
                  status: status.status,
                  status_updated_at: new Date(Number.parseInt(status.timestamp) * 1000).toISOString(),
                })
                .eq('external_id', status.id);

              if (error) {
                log.error("Error updating message status", { messageId: status.id, error: error.message });
              }
            }
          }

          // Handle incoming messages
          if (value.messages) {
            for (const message of value.messages) {
              log.info("Received message", { from: message.from, type: message.type });
            }
          }
        }
      }

      log.done(200);
      return jsonResponse({ success: true }, 200, req);
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
