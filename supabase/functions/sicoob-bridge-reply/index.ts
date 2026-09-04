import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { SicoobBridgeReplySchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("sicoob-bridge-reply");

  try {
    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const sicoobGiftsUrl = Deno.env.get('SICOOB_GIFTS_URL');
    const sicoobGiftsBridgeSecret = Deno.env.get('SICOOB_GIFTS_BRIDGE_SECRET');

    if (!sicoobGiftsUrl || !sicoobGiftsBridgeSecret) {
      throw new Error('SICOOB_GIFTS_URL or SICOOB_GIFTS_BRIDGE_SECRET not configured');
    }

    const parsed = parseBody(SicoobBridgeReplySchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { contact_id, content, message_id, agent_id, created_at } = parsed.data;

    // Get the contact to verify it's a sicoob_gifts contact
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, name, contact_type, channel_type')
      .eq('id', contact_id)
      .single();

    if (!contact || contact.contact_type !== 'sicoob_gifts') {
      return errorResponse('Contact is not a Sicoob Gifts contact', 400, req);
    }

    // Get the mapping to find Sicoob IDs
    const { data: mapping } = await supabase
      .from('sicoob_contact_mapping')
      .select('sicoob_user_id, sicoob_vendedor_id, sicoob_singular_id')
      .eq('contact_id', contact_id)
      .single();

    if (!mapping) {
      return errorResponse('No Sicoob mapping found for this contact', 404, req);
    }

    // Get agent name
    let agentName = 'Vendedor';
    if (agent_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', agent_id)
        .single();
      if (profile?.name) agentName = profile.name;
    }

    // Forward to Sicoob Gifts
    const sicoobPayload = {
      action: 'agent_reply',
      contact_id, content, message_id, agent_id,
      agent_name: agentName,
      sicoob_user_id: mapping.sicoob_user_id,
      sicoob_vendedor_id: mapping.sicoob_vendedor_id,
      sicoob_singular_id: mapping.sicoob_singular_id,
      created_at: created_at || new Date().toISOString(),
    };

    log.info("Forwarding reply to Sicoob Gifts");

    const response = await fetch(`${sicoobGiftsUrl}/functions/v1/chat-bridge`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sicoobGiftsBridgeSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sicoobPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error("Sicoob Gifts bridge error", { status: response.status, error: errorText });
      return errorResponse(`Sicoob Gifts returned ${response.status}: ${errorText}`, 502, req);
    }

    const result = await response.json();
    log.done(200);
    return jsonResponse({ success: true, sicoob_response: result }, 200, req);

  } catch (error) {
    log.error("Error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500, req);
  }
});
