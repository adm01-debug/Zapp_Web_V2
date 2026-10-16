import { useCallback, useMemo, useRef } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import type { AgentStats, Achievement } from './types';

// Re-export types and utilities for external consumers
export type { AgentStats, Achievement } from './types';
export { ACHIEVEMENT_TYPES } from './types';
export { calculateLevel, xpForNextLevel, levelProgress } from './levelUtils';

/**
 * Tamanho da página da lista de conquistas. O total exibido NÃO sai daqui: sai de
 * `agent_stats.achievements_count` (fonte do servidor). Cada página é lida por
 * `range` e a próxima só é buscada quando o usuário pede ("ver mais").
 */
export const ACHIEVEMENTS_PAGE_SIZE = 20;

/**
 * Leitura da gamificação do agente: XP, nível, sequência, mensagens, resoluções
 * e conquistas. A escrita é do servidor (gatilhos SECURITY DEFINER); o cliente
 * não chama RPC de escrita — as RPCs de gamificação são só de `service_role`.
 *
 * A lista de conquistas é paginada: antes vinha com `.limit(20)` fixo e as telas
 * mostravam `achievements.length`, então um agente com 25 conquistas via "20".
 * Agora o total vem de `stats.achievements_count` e o resto da lista é carregado
 * sob demanda por `loadMore`.
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

  const achievements = useMemo(() => {
    const porId = new Map<string, Achievement>();
    // Desempate por id: uma conquista gravada entre duas páginas desloca o
    // `range` e pode voltar repetida. O Map mantém a posição da primeira cópia.
    for (const pagina of achievementsQuery.data?.pages ?? []) {
      for (const conquista of pagina) porId.set(conquista.id, conquista);
    }
    return Array.from(porId.values());
  }, [achievementsQuery.data]);

  // Total exibido: o do servidor (`agent_stats.achievements_count`), nunca o
  // tamanho da página. O `Math.max` evita mostrar menos do que já está na tela
  // se as estatísticas estiverem defasadas por alguns segundos.
  const contagemDoServidor = statsQuery.data?.achievements_count;
  const achievementsTotal = Math.max(
    typeof contagemDoServidor === 'number' ? contagemDoServidor : 0,
    achievements.length,
  );

  const { hasNextPage, fetchNextPage } = achievementsQuery;
  const hasMore = hasNextPage ?? false;
  // Guarda de corrida: `isFetchingNextPage` só vira true depois do re-render, então
  // dois cliques no mesmo tick passariam pela checagem de estado e buscariam a mesma
  // página duas vezes. O ref fecha essa janela.
  const buscandoProximaPagina = useRef(false);
  const loadMore = useCallback(() => {
    if (buscandoProximaPagina.current) return;
    if (!hasNextPage) return;
    buscandoProximaPagina.current = true;
    void fetchNextPage()
      .catch(() => undefined) // a falha já aparece em isErrorForMore/error
      .finally(() => { buscandoProximaPagina.current = false; });
  }, [hasNextPage, fetchNextPage]);

  return {
    stats: statsQuery.data,
    achievements,
    achievementsTotal,
    hasMore,
    isLoadingMore: achievementsQuery.isFetchingNextPage,
    isErrorForMore: hasMore && achievementsQuery.isError,
    loadMore,
    isLoading: profileQuery.isLoading || statsQuery.isLoading || achievementsQuery.isLoading,
    // R2-AUTH-042 (#266): quem exibe o resultado precisa distinguir "erro" de
    // "conta sem conquistas". Sem isError os dois casos chegam como lista vazia
    // e a tela mostra ausência onde houve falha de leitura.
    isError: profileQuery.isError || statsQuery.isError || achievementsQuery.isError,
    error: profileQuery.error ?? statsQuery.error ?? achievementsQuery.error,
    profileId,
  };
};
