import { useCallback, useMemo, useRef } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import type { AgentStats, Achievement } from './types';

// Re-export types and utilities for external consumers
export type { AgentStats, Achievement, MiniGameXpCreditResult } from './types';
export { ACHIEVEMENT_TYPES } from './types';
export { calculateLevel, xpForNextLevel, levelProgress } from './levelUtils';

/**
 * Leitura da gamificação do agente: XP, nível, sequência, mensagens, resoluções
 * e conquistas. A escrita é do servidor (gatilhos SECURITY DEFINER); o cliente
 * não chama RPC de escrita — as RPCs de gamificação são só de `service_role`.
 */
export const useAgentGamification = () => {
  const { user } = useAuth();

  const profileQuery = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const profileId = profileQuery.data?.id;

  const statsQuery = useQuery({
    queryKey: ['agent-stats', profileId],
    queryFn: async () => {
      if (!profileId) return null;
      const { data, error } = await supabase
        .from('agent_stats')
        .select('*')
        .eq('profile_id', profileId)
        .maybeSingle();
      if (error) throw error;
      return data as AgentStats | null;
    },
    enabled: !!profileId,
    refetchInterval: 30000,
  });

  const achievementsQuery = useInfiniteQuery({
    queryKey: ['agent-achievements', profileId],
    enabled: !!profileId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!profileId) return [];
      const from = pageParam;
      const { data, error } = await supabase
        .from('agent_achievements')
        .select('*')
        .eq('profile_id', profileId)
        // Ordem determinística: `earned_at` com `id` como desempate. Sem o
        // desempate, conquistas gravadas no mesmo instante poderiam trocar de
        // posição entre páginas e o `range` repetiria ou pularia linha.
        .order('earned_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + ACHIEVEMENTS_PAGE_SIZE - 1);
      if (error) throw error;
      return (data || []) as Achievement[];
    },
    getNextPageParam: (lastPage, allPages) => {
      // Página incompleta = fim da lista.
      if (lastPage.length < ACHIEVEMENTS_PAGE_SIZE) return undefined;
      const carregadas = allPages.reduce((soma, pagina) => soma + pagina.length, 0);
      const total = statsQuery.data?.achievements_count;
      // Se já carregamos o que `stats.achievements_count` diz que existe, não há
      // próxima página — evita um request vazio a cada leitura.
      if (typeof total === 'number' && carregadas >= total) return undefined;
      return carregadas;
    },
  });

  return {
    stats: statsQuery.data,
    achievements: achievementsQuery.data || [],
    isLoading: profileQuery.isLoading || statsQuery.isLoading || achievementsQuery.isLoading,
    // R2-AUTH-042 (#266): quem exibe o resultado precisa distinguir "erro" de
    // "conta sem conquistas". Sem isError os dois casos chegam como lista vazia
    // e a tela mostra ausência onde houve falha de leitura.
    isError: profileQuery.isError || statsQuery.isError || achievementsQuery.isError,
    error: profileQuery.error ?? statsQuery.error ?? achievementsQuery.error,
    profileId,
  };
};
