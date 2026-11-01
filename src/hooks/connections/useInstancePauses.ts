import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** C121 — histórico de pausas de instância + pausar/retomar (staff; RLS e RPC já negam o resto). */
export const INSTANCE_PAUSES_KEY = ['instance-pauses'] as const;
const HISTORY_DAYS = 7;
const HISTORY_PAGE = 1000;
const HISTORY_MAX_PAGES = 10;

export interface InstancePause {
  id: string;
  instance: string;
  paused_until: string;
  reason: string;
  paused_by: string | null;
  auto: boolean;
  resumed_at: string | null;
  resumed_by: string | null;
  created_at: string;
}

export function useInstancePauses(enabled: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: INSTANCE_PAUSES_KEY,
    enabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<InstancePause[]> => {
      const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
      const cols = 'id, instance, paused_until, reason, paused_by, auto, resumed_at, resumed_by, created_at';
      // Pausas ABERTAS lidas à parte (no máx. 1 por instância): nunca ficam atrás do limite do histórico.
      const open = await supabase.from('instance_pauses').select(cols).is('resumed_at', null);
      if (open.error) throw open.error;
      const byId = new Map<string, InstancePause>();
      for (const r of open.data ?? []) byId.set(r.id, r);
      // Histórico da janela paginado: a série não perde registros em silêncio.
      for (let page = 0; page < HISTORY_MAX_PAGES; page++) {
        const { data, error } = await supabase
          .from('instance_pauses')
          .select(cols)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .range(page * HISTORY_PAGE, (page + 1) * HISTORY_PAGE - 1);
        if (error) throw error;
        for (const r of data ?? []) byId.set(r.id, r);
        if ((data?.length ?? 0) < HISTORY_PAGE) break;
      }
      return [...byId.values()].sort((x, y) => y.created_at.localeCompare(x.created_at));
    },
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: INSTANCE_PAUSES_KEY }),
    [queryClient],
  );

  const pause = useMutation({
    mutationFn: async (input: { instance: string; minutes: number; reason: string }) => {
      const { error } = await supabase.rpc('pause_instance', {
        p_instance: input.instance,
        p_minutes: input.minutes,
        p_reason: input.reason,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const resume = useMutation({
    mutationFn: async (instance: string) => {
      const { error } = await supabase.rpc('resume_instance', { p_instance: instance });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { ...query, pause, resume };
}
