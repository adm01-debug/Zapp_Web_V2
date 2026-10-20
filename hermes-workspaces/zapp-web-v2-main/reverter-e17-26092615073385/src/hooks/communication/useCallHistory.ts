import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CallHistoryRow {
  id: string;
  contact_id: string | null;
  agent_id: string | null;
  whatsapp_connection_id: string | null;
  direction: string;
  status: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  notes: string | null;
}

const PAGE_SIZE = 20;

// "Minhas ligações": histórico paginado e agregados sempre escopados ao
// próprio agente (profileId), nunca ao universo inteiro da tabela `calls`.
export function useCallHistory(profileId: string | undefined) {
  const {
    data: callsPages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['calls-history', profileId],
    enabled: !!profileId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .eq('agent_id', profileId as string)
        .order('started_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return (data || []) as CallHistoryRow[];
    },
    getNextPageParam: (lastPage, allPages) => (lastPage.length === PAGE_SIZE ? allPages.length : undefined),
  });

  const { data: statsRows = [] } = useQuery({
    queryKey: ['calls-stats', profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calls')
        .select('direction, status, duration_seconds')
        .eq('agent_id', profileId as string);
      if (error) throw error;
      return data || [];
    },
  });

  return {
    calls: callsPages?.pages.flat() ?? [],
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    statsRows,
  };
}
