import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { evoFetch, extractMessageId } from '../_shared/evolution-send.ts';

const SendActionSchema = z.object({
  action: z.literal('send'),
  number: z.string().min(6, 'number is required').max(30),
  message: z.string().min(1, 'message is required').max(10000),
  connectionId: z.string().uuid().optional(),
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("public-api");

  const ip = getClientIP(req);
  const rl = checkRateLimit(`public-api:${ip}`, 60, 60_000);
  if (!rl.allowed) return errorResponse('Rate limit exceeded', 429, req);

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate API token
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return errorResponse('Missing x-api-key header', 401, req);
    }

    const { data: setting } = await supabase
      .from('global_settings')
      .select('value')
      .eq('key', 'api_token')
      .single();

    if (!setting?.value || setting.value !== apiKey) {
      log.warn('Invalid API token attempt');
      return errorResponse('Invalid API token', 403, req);
    }

    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405, req);
    }

    const raw = await req.json().catch(() => null);
    if (!raw) return errorResponse('Invalid JSON body', 400, req);

    const { action } = raw as { action?: string };
    if (action !== 'send') {
      return errorResponse('Unknown action. Supported: send', 400, req);
    }

    const parsed = SendActionSchema.safeParse(raw);
    if (!parsed.success) {
      const errors = parsed.error.flatten();
      const msg = Object.entries(errors.fieldErrors)
        .map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`)
        .join('; ');
      return errorResponse(msg || 'Validation error', 400, req);
    }

    const { number, message, connectionId } = parsed.data;
    const phone = number.replace(/\D/g, '');

    // Find connection
    let connection;
    if (connectionId) {
      const { data } = await supabase
        .from('whatsapp_connections')
        .select('*')
        .eq('id', connectionId)
        .eq('status', 'connected')
        .single();
      connection = data;
    } else {
      const { data } = await supabase
        .from('whatsapp_connections')
        .select('*')
        .eq('is_default', true)
        .eq('status', 'connected')
        .single();
      connection = data;
    }

    if (!connection) {
      return errorResponse('No active WhatsApp connection found', 404, req);
    }

    // Find or create contact
    let { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('phone', phone)
      .single();

    if (!contact) {
      const { data: newContact } = await supabase
        .from('contacts')
        .insert({ name: phone, phone, whatsapp_connection_id: connection.id })
        .select('id')
        .single();
      contact = newContact;
    }

    if (!contact) {
      return errorResponse('Failed to create contact', 500, req);
    }

    // Insert message
    const { data: msg, error: msgError } = await supabase
      .from('messages')
      .insert({
        contact_id: contact.id,
        content: message,
        sender: 'agent',
        message_type: 'text',
        status: 'sending',
        whatsapp_connection_id: connection.id,
      })
      .select()
      .single();

    if (msgError) {
      log.error('Failed to save message', { error: msgError.message });
      return errorResponse('Failed to save message', 500, req);
    }

    // Send via Evolution API
    try {
      const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
      const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');

      if (evolutionUrl && evolutionKey && connection.instance_id) {
        const sendRes = await evoFetch(
          evolutionUrl, evolutionKey,
          `/message/sendText/${connection.instance_id}`,
          { number: phone, text: message }
        );
        const sendData = await sendRes.json();

        const externalId = extractMessageId(sendData);
        if (externalId) {
          await supabase
            .from('messages')
            .update({ external_id: externalId, status: 'sent' })
            .eq('id', msg.id);
        }
      }
    } catch (sendErr) {
      log.error('Evolution API send error', { error: String(sendErr) });
      await supabase.from('messages').update({ status: 'failed' }).eq('id', msg.id);
    }

    log.done(200, { messageId: msg.id });
    return jsonResponse({ success: true, messageId: msg.id, contactId: contact.id }, 200, req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    log.error('Unhandled error', { error: msg });
    return errorResponse(msg, 500, req);
  }
});
