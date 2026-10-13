import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '../auth/useAuth';
import { log } from '@/lib/logger';

/**
 * Chave do status do tour no cache do react-query.
 *
 * `user_settings.onboarding_completed` é a fonte da verdade (coluna adicionada na
 * migration 20261013044344). Antes a checagem inferia "já completou" da EXISTÊNCIA
 * de qualquer linha em `user_settings` — então salvar uma preferência "concluía" o
 * tour. Como o cache do react-query é compartilhado por todas as instâncias do
 * hook, gravar aqui reinicia (ou conclui) o tour na hora, sem recarregar a página.
 */
export const onboardingStatusQueryKey = (userId: string | undefined) =>
  ['user-settings', 'onboarding-completed', userId] as const;

/** Lê a coluna do usuário. Sem linha = nunca concluiu (default da coluna é false). */
async function fetchOnboardingCompleted(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('onboarding_completed')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data?.onboarding_completed === true;
}

/**
 * Grava o status do tour no banco. Concluir usa upsert (o usuário que nunca mexeu
 * em preferências não tem linha em `user_settings` e a conclusão precisa criá-la);
 * reiniciar usa update (sem linha o valor já é o default `false`, não há o que
 * gravar). Só a coluna `onboarding_completed` é tocada — nenhuma preferência do
 * usuário é sobrescrita.
 */
async function persistOnboardingCompletion(userId: string, completed: boolean) {
  try {
    const { error } = completed
      ? await supabase
          .from('user_settings')
          .upsert({ user_id: userId, onboarding_completed: true }, { onConflict: 'user_id' })
      : await supabase
          .from('user_settings')
          .update({ onboarding_completed: false })
          .eq('user_id', userId);

    if (error) log.error('Error persisting onboarding status:', error);
  } catch (error) {
    log.error('Error persisting onboarding status:', error);
  }
}

export function useOnboarding() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  // useMemo: mantém a chave estável entre renderizações (o react-query compara
  // por valor, mas a identidade estável evita recriar os callbacks abaixo).
  const queryKey = useMemo(() => onboardingStatusQueryKey(userId), [userId]);

  const query = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: () => fetchOnboardingCompleted(userId as string),
  });

  const loading = !!userId && query.isPending;

  // Sem usuário não há tour a decidir (null). Erro cai no comportamento antigo:
  // uma falha de rede não cobre a tela do usuário com o tour.
  const hasCompletedOnboarding: boolean | null = !userId
    ? null
    : query.isError
      ? true
      : query.isPending
        ? null
        : Boolean(query.data);

  const setCompleted = useCallback(
    (value: boolean) => {
      if (!userId) return;
      // setQueryData atinge TODAS as instâncias do hook — é o que faz o overlay do
      // tour reaparecer (Index) logo depois de "Reiniciar Tour" (Configurações).
      queryClient.setQueryData(queryKey, value);
    },
    [queryClient, userId, queryKey],
  );

  const completeOnboarding = useCallback(() => {
    if (!userId) return;
    setCompleted(true);
    void persistOnboardingCompletion(userId, true);
  }, [userId, setCompleted]);

  const resetOnboarding = useCallback(() => {
    if (!userId) return;
    setCompleted(false);
    void persistOnboardingCompletion(userId, false);
  }, [userId, setCompleted]);

  return {
    hasCompletedOnboarding,
    loading,
    completeOnboarding,
    resetOnboarding,
  };
}
