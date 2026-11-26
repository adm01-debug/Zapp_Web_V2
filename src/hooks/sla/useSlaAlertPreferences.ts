import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { getLogger } from '@/lib/logger';
import {
  DEFAULT_SLA_ALERT_PREFERENCES,
  normalizeSlaAlertPreferences,
  type SlaAlertPreferences,
  type SlaAlertPreferenceRow,
} from './slaAlertPreferences';

const log = getLogger('sla-alert-preferences');

/** Chave de cache; o sufixo é o usuário (a preferência é por pessoa). */
export const SLA_ALERT_PREFERENCES_QUERY_KEY = 'sla-alert-preferences';

/** Colunas lidas: só o que o contrato de preferências usa. */
const SLA_ALERT_PREFERENCES_COLUMNS =
  'user_id, enabled, alert_first_response, alert_resolution, severity_warning, severity_breached';

export async function fetchSlaAlertPreferences(userId: string): Promise<SlaAlertPreferences> {
  const { data, error } = await supabase
    .from('sla_alert_preferences')
    .select(SLA_ALERT_PREFERENCES_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return normalizeSlaAlertPreferences(data as SlaAlertPreferenceRow | null);
}

/**
 * Preferências de alerta de SLA do usuário logado.
 *
 * Leitura sem linha devolve o default da tabela (usuário novo é avisado como sempre). A gravação é
 * upsert na própria linha — a RLS de `sla_alert_preferences` só aceita `user_id = auth.uid()`, então
 * não existe caminho para alterar a preferência de outra pessoa.
 */
export function useSlaAlertPreferences() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [SLA_ALERT_PREFERENCES_QUERY_KEY, userId],
    queryFn: () => fetchSlaAlertPreferences(userId as string),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (preferences: SlaAlertPreferences) => {
      if (!userId) throw new Error('Sessão expirada — entre novamente para salvar as preferências');
      const { error } = await supabase.from('sla_alert_preferences').upsert(
        {
          user_id: userId,
          enabled: preferences.enabled,
          alert_first_response: preferences.alertFirstResponse,
          alert_resolution: preferences.alertResolution,
          severity_warning: preferences.severityWarning,
          severity_breached: preferences.severityBreached,
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
    },
    // Otimismo no cache (a tela e o monitor de alertas leem o mesmo cache): o interruptor responde
    // na hora e, se o banco recusar, o valor anterior volta.
    onMutate: async (preferences: SlaAlertPreferences) => {
      const queryKey = [SLA_ALERT_PREFERENCES_QUERY_KEY, userId];
      await queryClient.cancelQueries({ queryKey });
      const anterior = queryClient.getQueryData<SlaAlertPreferences>(queryKey);
      queryClient.setQueryData(queryKey, preferences);
      return { anterior, queryKey };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SLA_ALERT_PREFERENCES_QUERY_KEY] });
      toast.success('Preferências de alerta salvas');
    },
    onError: (error: Error, _preferences, contexto) => {
      if (contexto?.anterior) queryClient.setQueryData(contexto.queryKey, contexto.anterior);
      log.error('falha ao salvar as preferências de alerta de SLA', { error });
      toast.error(error.message || 'Não foi possível salvar as preferências de alerta');
    },
  });

  return {
    /** Sem linha no banco (usuário novo) vale o default da tabela — nunca um objeto vazio. */
    preferences: query.data ?? { ...DEFAULT_SLA_ALERT_PREFERENCES },
    isLoading: Boolean(userId) && query.isLoading,
    isError: query.isError,
    isSaving: mutation.isPending,
    save: mutation.mutate,
    refetch: query.refetch,
  };
}
