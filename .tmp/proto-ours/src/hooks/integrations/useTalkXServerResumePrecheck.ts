/**
 * N-097 (X142) — pré-checagem de retomada feita pelo SERVIDOR.
 *
 * Chama a RPC `talkx_campaign_resume_precheck(p_campaign_id)`, que confere conexão
 * WhatsApp, janela de envio e destinatários pendentes suprimidos e devolve
 * `{ can_resume, blockers, ... }`. Só roda com a campanha pausada. A RPC é restrita a
 * admin/supervisor: se falhar (permissão, rede), o hook devolve `precheck = null` e a
 * tela simplesmente não mostra o resultado — retomar continua possível, o servidor
 * segue sendo a barreira.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseHelpers';

export type TalkXResumeBlocker =
  | 'connection_not_connected'
  | 'outside_send_window'
  | 'recipients_suppressed';

export interface TalkXServerResumePrecheck {
  canResume: boolean;
  blockers: string[];
  connectionStatus: string | null;
  windowOpen: boolean | null;
  suppressedPendingRecipients: number;
}

/** Texto para o operador de cada bloqueio conhecido; desconhecido cai no código. */
export const TALKX_RESUME_BLOCKER_LABEL: Record<TalkXResumeBlocker, string> = {
  connection_not_connected: 'WhatsApp desconectado',
  outside_send_window: 'Fora da janela de envio',
  recipients_suppressed: 'Há destinatários pendentes na lista de supressão',
};

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/** Valida o jsonb da RPC; qualquer forma inesperada vira `null`. */
export function parseServerResumePrecheck(raw: unknown): TalkXServerResumePrecheck | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.can_resume !== 'boolean' || !Array.isArray(row.blockers)) return null;
  return {
    canResume: row.can_resume,
    blockers: row.blockers.filter((b): b is string => typeof b === 'string'),
    connectionStatus: typeof row.connection_status === 'string' ? row.connection_status : null,
    windowOpen: typeof row.window_open === 'boolean' ? row.window_open : null,
    suppressedPendingRecipients:
      typeof row.suppressed_pending_recipients === 'number' ? row.suppressed_pending_recipients : 0,
  };
}

export function useTalkXServerResumePrecheck(
  campaign: { id: string; status?: string | null } | null,
): { precheck: TalkXServerResumePrecheck | null; isLoading: boolean } {
  const campaignId = campaign?.id ?? null;
  const enabled = !!campaignId && campaign?.status === 'paused';

  const query = useQuery({
    queryKey: ['talkx-server-resume-precheck', campaignId],
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as RpcClient).rpc(
        'talkx_campaign_resume_precheck',
        { p_campaign_id: campaignId },
      );
      if (error) throw error;
      return parseServerResumePrecheck(data);
    },
  });

  return { precheck: enabled ? (query.data ?? null) : null, isLoading: enabled && query.isLoading };
}
