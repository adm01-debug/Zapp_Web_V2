import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { INSTANCE_PAUSES_QUERY_KEY } from '@/components/monitoring/hooks/useInstancePauses';
import {
  fetchInstancePausesWindow,
  pauseInstance,
  resumeInstance,
  type InstancePause,
} from '@/services/instance-pauses.service';

export type { InstancePause };

/**
 * C121 — pausar/retomar envios de uma instância (staff) + histórico de 7 dias para a
 * série do painel de Conexões. Chave própria porque a leitura é de uma janela maior
 * que a do painel de monitoring (`INSTANCE_PAUSES_QUERY_KEY`, últimas 50); as duas
 * compartilham o prefixo, então invalidar o prefixo relê as duas telas.
 */
export const INSTANCE_PAUSES_CONEXOES_KEY = [...INSTANCE_PAUSES_QUERY_KEY, 'conexoes'] as const;

export function useInstancePauseControls(enabled: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: INSTANCE_PAUSES_CONEXOES_KEY,
    queryFn: () => fetchInstancePausesWindow(),
    enabled,
    retry: false,
    refetchInterval: 60_000,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: INSTANCE_PAUSES_QUERY_KEY }),
    [queryClient],
  );

  const pause = useMutation({
    mutationFn: (input: { instance: string; minutes: number; reason: string }) =>
      pauseInstance(input.instance, input.minutes, input.reason),
    onSuccess: invalidate,
  });

  const resume = useMutation({
    mutationFn: (instance: string) => resumeInstance(instance),
    onSuccess: invalidate,
  });

  return { ...query, pause, resume };
}
