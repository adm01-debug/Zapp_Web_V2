import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/integrations/supabase/client';

import { getLogger } from '@/lib/logger';
const log = getLogger('logVoiceCommand');

/** Mesmo teto do `processTranscript`: telemetria pendurada não fica aberta para sempre. */
const LOG_TIMEOUT_MS = 15_000;

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
  void (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // voice_command_logs may not be in generated types yet — use rpc or raw fetch
      const url = `${SUPABASE_URL}/rest/v1/voice_command_logs`;
      const key = SUPABASE_ANON_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || key;

      const response = await fetch(url, {
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
        // Sem teto, um fetch pendurado ficava vivo para sempre segurando a aba e o
        // socket; 15 s é o mesmo teto usado no processamento do comando.
        signal: AbortSignal.timeout(LOG_TIMEOUT_MS),
      });

      if (!response.ok) {
        // O log é telemetria: uma resposta não-ok fica no log técnico e NÃO vira
        // exceção — nada na tela do operador depende deste envio.
        log.warn(`logVoiceCommand: resposta não-ok (${response.status})`);
      }
    } catch (err) { log.error('Unexpected error in logVoiceCommand:', err); }
  })();
}
