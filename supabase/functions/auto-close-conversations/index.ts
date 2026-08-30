import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';
import { getCorsHeaders, handleCors, jsonResponse, errorResponse, Logger } from '../_shared/validation.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const log = new Logger('auto-close-conversations');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auto-close config
    const { data: config, error: configError } = await supabase
      .from('auto_close_config')
      .select('*')
      .eq('is_enabled', true)
      .maybeSingle();

    if (configError) {
      log.error('Error fetching config', { error: configError.message });
      return errorResponse('Failed to fetch config', 500, req);
    }

    if (!config) {
      return jsonResponse({ message: 'Auto-close is disabled', closed: 0 }, 200, req);
    }

    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - config.inactivity_hours);

    const { data: staleContacts, error: staleError } = await supabase
      .from('contacts')
      .select('id, name, phone, assigned_to')
      .lt('updated_at', cutoffDate.toISOString())
      .not('assigned_to', 'is', null);

    if (staleError) {
      log.error('Error finding stale contacts', { error: staleError.message });
      return errorResponse('Failed to query stale contacts', 500, req);
    }

    if (!staleContacts || staleContacts.length === 0) {
      return jsonResponse({ message: 'No stale conversations found', closed: 0 }, 200, req);
    }

    let closedCount = 0;

    for (const contact of staleContacts) {
      if (config.close_message) {
        await supabase.from('messages').insert({
          contact_id: contact.id,
          content: config.close_message,
          sender: 'system',
          type: 'text',
        });
      }

      await supabase.from('conversation_closures').insert({
        contact_id: contact.id,
        close_reason: 'inactivity',
        outcome: 'auto_closed',
        notes: `Auto-closed after ${config.inactivity_hours}h of inactivity`,
      });

      await supabase
        .from('contacts')
        .update({ assigned_to: null })
        .eq('id', contact.id);

      closedCount++;
    }

    log.info(`Auto-closed ${closedCount} conversations`);
    log.done(200, { closed: closedCount });

    return jsonResponse({
      message: `Auto-closed ${closedCount} conversations`,
      closed: closedCount,
    }, 200, req);
  } catch (error) {
    log.error('Unexpected error', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Internal server error', 500, req);
  }
});
