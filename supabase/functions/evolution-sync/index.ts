import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors } from "../_shared/validation.ts";
import {
  syncContacts, syncMessages, syncAllMessages,
  setupWebhook, cleanupMock, fullSync,
} from "../_shared/evolution-sync-actions.ts";

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);

  const evolutionApiUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!evolutionApiUrl || !evolutionApiKey) {
    return new Response(JSON.stringify({ error: 'Evolution API not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'sync-contacts';
    const instanceName = body.instanceName || Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'PRINCIPAL';
    const page = body.page || 1;
    const offset = body.offset || 100;

    if (action === 'sync-contacts') {
      return await syncContacts(supabase, evolutionApiUrl, evolutionApiKey, instanceName, corsHeaders, page, offset);
    }

    if (action === 'sync-messages') {
      return await syncMessages(supabase, evolutionApiUrl, evolutionApiKey, instanceName, body.contactPhone, corsHeaders);
    }

    if (action === 'setup-webhook') {
      return await setupWebhook(evolutionApiUrl, evolutionApiKey, instanceName, supabaseUrl, body.webhookUrl, corsHeaders);
    }

    if (action === 'cleanup-mock') {
      return await cleanupMock(supabase, corsHeaders);
    }

    if (action === 'full-sync') {
      return await fullSync(supabase, evolutionApiUrl, evolutionApiKey, instanceName, supabaseUrl, corsHeaders);
    }

    if (action === 'sync-all-messages') {
      return await syncAllMessages(supabase, evolutionApiUrl, evolutionApiKey, instanceName, body.messagesPerContact || 200, corsHeaders);
    }

    return new Response(JSON.stringify({ error: 'Unknown action', validActions: ['sync-contacts', 'sync-messages', 'sync-all-messages', 'setup-webhook', 'cleanup-mock', 'full-sync'] }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[Sync] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
