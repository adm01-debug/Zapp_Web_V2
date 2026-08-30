import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { SicoobBridgeNewMessageSchema, SicoobBridgeMarkReadSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("sicoob-bridge");

  try {
    const bridgeSecret = requireEnv('SICOOB_BRIDGE_SECRET');
    const authHeader = req.headers.get('Authorization');

    if (authHeader !== `Bearer ${bridgeSecret}`) {
      return errorResponse('Unauthorized', 401, req);
    }

    const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
    const body = await req.json();
    const { action } = body;

    if (action === 'new_message') {
      const parsed = parseBody(SicoobBridgeNewMessageSchema, body);
      if (!parsed.success) return validationErrorResponse(parsed, req);

      const { message_id, sender_name, sender_email, sender_phone, singular_name, singular_id, content, vendedor_user_id, created_at } = parsed.data;

      // Check idempotency
      const { data: existingMsg } = await supabase.from('messages').select('id').eq('external_id', message_id).maybeSingle();
      if (existingMsg) {
        return jsonResponse({ success: true, message: 'Message already exists', message_id: existingMsg.id }, 200, req);
      }

      // Check existing mapping
      const { data: existingMapping } = await supabase
        .from('sicoob_contact_mapping')
        .select('contact_id, zappweb_agent_id')
        .eq('sicoob_user_id', parsed.data.sender_id || message_id)
        .eq('sicoob_singular_id', singular_id)
        .maybeSingle();

      let contactId: string;
      let agentId: string | null = null;

      if (existingMapping) {
        contactId = existingMapping.contact_id;
        agentId = existingMapping.zappweb_agent_id;
        await supabase.from('contacts').update({ name: sender_name, company: singular_name, updated_at: new Date().toISOString() }).eq('id', contactId);
      } else {
        const { data: vendedorProfile } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
        agentId = vendedorProfile?.id || null;

        const phone = sender_phone || `sicoob-${singular_id}-${Date.now()}`;
        const { data: newContact, error: contactError } = await supabase.from('contacts').insert({
          name: sender_name, phone, email: sender_email || null, company: singular_name,
          contact_type: 'sicoob_gifts', channel_type: 'internal_chat', assigned_to: agentId,
          tags: ['sicoob-gifts'], notes: `Cooperado da singular: ${singular_name} (${singular_id})`,
        }).select('id').single();

        if (contactError) throw new Error(`Failed to create contact: ${contactError.message}`);
        contactId = newContact.id;

        await supabase.from('sicoob_contact_mapping').insert({
          contact_id: contactId, sicoob_user_id: parsed.data.sender_id || `sender-${message_id}`,
          sicoob_vendedor_id: vendedor_user_id, sicoob_singular_id: singular_id, zappweb_agent_id: agentId,
        });
      }

      const { data: newMessage, error: msgError } = await supabase.from('messages').insert({
        contact_id: contactId, content, sender: 'contact', message_type: 'text',
        external_id: message_id, channel_type: 'internal_chat', is_read: false,
        status: 'delivered', created_at: created_at || new Date().toISOString(),
      }).select('id').single();

      if (msgError) throw new Error(`Failed to create message: ${msgError.message}`);

      await supabase.from('contacts').update({ updated_at: new Date().toISOString() }).eq('id', contactId);

      log.done(200, { contactId, messageId: newMessage.id });
      return jsonResponse({ success: true, contact_id: contactId, message_id: newMessage.id }, 200, req);

    } else if (action === 'mark_read') {
      const parsed = parseBody(SicoobBridgeMarkReadSchema, body);
      if (!parsed.success) return validationErrorResponse(parsed, req);

      const { external_ids } = parsed.data;
      const { error } = await supabase.from('messages').update({ is_read: true }).in('external_id', external_ids);
      if (error) throw new Error(`Failed to mark messages as read: ${error.message}`);

      log.done(200, { count: external_ids.length });
      return jsonResponse({ success: true, updated: external_ids.length }, 200, req);

    } else {
      return errorResponse(`Unknown action: ${action}. Supported: new_message, mark_read`, 400, req);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error("Unhandled error", { error: msg });
    return errorResponse(msg, 500, req);
  }
});
