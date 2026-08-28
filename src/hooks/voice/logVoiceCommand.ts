import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/integrations/supabase/client';

import { getLogger } from '@/lib/logger';
const log = getLogger('logVoiceCommand');

interface VoiceCommandLogParams {
  transcript: string;
  action: string;
  response: string;
  data?: Record<string, unknown>;
  durationMs?: number;
  success?: boolean;
}

export function logVoiceCommand(params: VoiceCommandLogParams) {
  // Fire-and-forget — never block UI
  (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // voice_command_logs may not be in generated types yet — use rpc or raw fetch
      const url = `${SUPABASE_URL}/rest/v1/voice_command_logs`;
      const key = SUPABASE_ANON_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || key;

      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${token}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          user_id: user.id,
          transcript: params.transcript,
          action: params.action,
          response: params.response,
          data: params.data || {},
          duration_ms: params.durationMs,
          success: params.success ?? true,
        }),
      });
    } catch (err) { log.error('Unexpected error in logVoiceCommand:', err); }
  })();
}
