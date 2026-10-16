import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from 'sonner';

/**
 * PD-38 (paridade V3): preferencias, POR USUARIO, de como e quando avisar sobre a
 * saude da conexao de WhatsApp. A tabela `public.connection_alert_preferences`
 * (migration 20261013044440) tem uma linha por usuario e nasce com tudo LIGADO.
 *
 * Os TIPOS (alert_on_degraded / alert_on_disconnected) sao o interruptor mestre do
 * aviso: desligado, nao se avisa em canal nenhum. Os CANAIS (push_enabled =
 * notificacao do navegador, email_enabled = e-mail) escolhem por ONDE o aviso sai —
 * nao mudam o fato de ele existir. Por isso o banner de conexao caida
 * (EvolutionDisconnectBanner, canal dentro do app) consulta o TIPO
 * `alert_on_disconnected`; quem dispara o aviso no navegador ou por e-mail consulta os canais.
 */
export interface ConnectionAlertPreferences {
  push_enabled: boolean;
  email_enabled: boolean;
  alert_on_degraded: boolean;
  alert_on_disconnected: boolean;
}

/**
 * Sem linha no banco, tudo nasce LIGADO — o mesmo padrao das colunas da migration.
 * Tambem e o valor usado enquanto a leitura esta em voo, para o app nao esconder um
 * aviso real por causa de uma resposta que ainda nao chegou.
 */
export const CONNECTION_ALERT_DEFAULTS: ConnectionAlertPreferences = {
  push_enabled: true,
  email_enabled: true,
  alert_on_degraded: true,
  alert_on_disconnected: true,
};

const PREFERENCE_COLUMNS = 'push_enabled, email_enabled, alert_on_degraded, alert_on_disconnected';

/** Chave por usuario: a RLS so devolve a propria linha, mas isolar por usuario evita
 *  que a troca de sessao reaproveite o cache de quem saiu. */
export const connectionAlertPreferencesKey = (userId: string | null | undefined) =>
  ['connection-alert-preferences', userId ?? 'anon'] as const;

export type ConnectionAlertKind = 'degraded' | 'disconnected';

/** Interruptor mestre do TIPO do aviso: desligado, nao se avisa em canal nenhum. */
export function shouldNotifyConnectionAlert(
  preferences: ConnectionAlertPreferences,
  kind: ConnectionAlertKind,
): boolean {
  return kind === 'degraded' ? preferences.alert_on_degraded : preferences.alert_on_disconnected;
}

export function useConnectionAlertPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const queryKey = connectionAlertPreferencesKey(userId);

  const { data: row, isLoading } = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('connection_alert_preferences')
        .select(PREFERENCE_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const preferences: ConnectionAlertPreferences = { ...CONNECTION_ALERT_DEFAULTS, ...(row ?? {}) };

  // Upsert otimista: o interruptor do usuario muda na hora; se o banco recusar, o
  // cache volta ao valor anterior (rollback) e a falha e anunciada — nunca engolida.
  const mutation = useMutation({
    mutationFn: async (patch: Partial<ConnectionAlertPreferences>) => {
      if (!userId) throw new Error('Sem usuário autenticado para salvar a preferência');
      const { data, error } = await supabase
        .from('connection_alert_preferences')
        .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
        .select(PREFERENCE_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      // A RLS pode aceitar o upsert e nao devolver linha nenhuma (por exemplo sem
      // permissao de leitura): zero linhas NAO e sucesso.
      if (!data) throw new Error('Preferência não foi gravada');
      return data;
    },
    onMutate: async (patch) => {
      // Cancela a leitura em voo para a resposta antiga nao sobrescrever o otimista.
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, {
        ...CONNECTION_ALERT_DEFAULTS,
        ...((previous as ConnectionAlertPreferences | null) ?? {}),
        ...patch,
      });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      queryClient.setQueryData(queryKey, context?.previous ?? null);
      toast.error('Não foi possível salvar a preferência de alerta de conexão');
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    preferences,
    isLoading,
    isSaving: mutation.isPending,
    updatePreference: mutation.mutate,
    updatePreferenceAsync: mutation.mutateAsync,
    shouldNotify: (kind: ConnectionAlertKind) => shouldNotifyConnectionAlert(preferences, kind),
  };
}
