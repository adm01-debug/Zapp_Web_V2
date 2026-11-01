import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchInstancePauses,
  markPauseInvestigated,
  PAUSES_LOAD_ERROR,
  type InstancePause,
} from '@/services/instance-pauses.service';

export type { InstancePause };

export const INSTANCE_PAUSES_QUERY_KEY = ['instance-pauses'] as const;

/**
 * Histórico de pausas de instância + ação "Marcar investigada" (admin/supervisor).
 * O hook não fala com o Supabase: tudo passa por `instance-pauses.service`.
 */
export function useInstancePauses(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: INSTANCE_PAUSES_QUERY_KEY,
    queryFn: fetchInstancePauses,
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });

  /** Marca e relê a lista; lança com mensagem pt-BR se o banco recusar (o chamador exibe). */
  const markInvestigated = useCallback(
    async (pauseId: string, notes: string) => {
      const result = await markPauseInvestigated(pauseId, notes);
      await queryClient.invalidateQueries({ queryKey: INSTANCE_PAUSES_QUERY_KEY });
      return result;
    },
    [queryClient],
  );

  const { refetch } = query;
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    pauses: query.data ?? [],
    // `dataUpdatedAt` vem do cache (0 sem leitura): serve de "agora" estável para o estado
    // vencida/ativa sem chamar Date.now() durante o render.
    loadedAt: query.dataUpdatedAt,
    loading: query.isFetching && query.data === undefined,
    error: query.isError
      ? query.error instanceof Error
        ? query.error.message
        : PAUSES_LOAD_ERROR
      : null,
    refresh,
    markInvestigated,
  };
}
