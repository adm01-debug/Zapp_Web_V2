import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fromTable } from '@/lib/supabaseHelpers';
import { useAuth } from '@/hooks/auth/useAuth';

export type TalkXEventType = 'created' | 'updated' | 'scheduled' | 'started' | 'paused' | 'resumed' | 'cancelled' | 'completed' | 'note'
  // V11: tipos que o servidor e os recursos de proteção passam a gravar
  // (agendamento editado, limites, conexão caída, retomada automática,
  // contato suprimido pulado, trilha de supressão, revisão de segmentos e
  // checklist de lançamento).
  | 'scheduled_updated' | 'limits_updated' | 'connection_failed' | 'resumed_auto' | 'skipped_suppressed'
  | 'suppression_add' | 'suppression_remove' | 'suppression_update' | 'segments_reviewed' | 'checklist';

export interface TalkXCampaignEvent {
  id: string;
  /** V11: nulo em evento de entidade (supressão, segmento) — antes era NOT NULL. */
  campaign_id: string | null;
  event_type: TalkXEventType;
  message: string | null;
  actor_id: string | null;
  /** V11: alvo do evento quando não é campanha (entity_type = 'suppression' etc.). */
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  actor?: { name: string | null } | null;
}

export function useTalkXEvents(campaignId: string | null) {
  const qc = useQueryClient();
  const { profile } = useAuth();

  const query = useQuery({
    queryKey: ['talkx-events', campaignId],
    queryFn: async () => {
      const { data, error } = await fromTable('talkx_campaign_events')
        .select('*, actor:actor_id(name)')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as TalkXCampaignEvent[];
    },
    enabled: !!campaignId,
    refetchInterval: 10_000,
  });

  const logEvent = async (id: string, event_type: TalkXEventType, message?: string) => {
    try {
      await fromTable('talkx_campaign_events').insert({ campaign_id: id, event_type, message: message ?? null, actor_id: profile?.id ?? null });
      qc.invalidateQueries({ queryKey: ['talkx-events', id] });
    } catch { /* timeline é best-effort */ }
  };

  return { events: query.data ?? [], isLoading: query.isLoading, logEvent, refetch: query.refetch };
}

/** Logger sem estado de query — para usar fora do monitor (lista, wizard). */
export function useTalkXEventLogger() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return async (campaignId: string, event_type: TalkXEventType, message?: string) => {
    try {
      await fromTable('talkx_campaign_events').insert({ campaign_id: campaignId, event_type, message: message ?? null, actor_id: profile?.id ?? null });
      qc.invalidateQueries({ queryKey: ['talkx-events', campaignId] });
    } catch { /* best-effort */ }
  };
}
