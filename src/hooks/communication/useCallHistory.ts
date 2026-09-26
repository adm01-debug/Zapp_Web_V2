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
  contact: { name: string | null; phone: string | null } | null;
}

export type CallResultFilter =
  | 'ended_answered' | 'ended_missed' | 'missed' | 'busy' | 'failed' | 'ringing' | 'answered';

export interface CallHistoryFilters {
  direction?: 'inbound' | 'outbound';
  channel?: 'voip' | 'whatsapp';
  result?: CallResultFilter;
  search?: string;
}

const PAGE_SIZE = 20;

async function findContactIdsByNameOrPhone(term: string): Promise<string[] | null> {
  const trimmed = term.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  const orFilter = digits.length >= 4
    ? `name.ilike.%${trimmed}%,phone.ilike.%${digits}%`
    : `name.ilike.%${trimmed}%`;
  const { data, error } = await supabase.from('contacts').select('id').or(orFilter).limit(200);
  if (error) return [];
  return (data || []).map(c => c.id);
}

// "Minhas ligações": histórico paginado e agregados sempre escopados ao
// próprio agente (profileId), nunca ao universo inteiro da tabela `calls`.
export function useCallHistory(profileId: string | undefined, filters: CallHistoryFilters = {}) {
  const filterKey = JSON.stringify(filters);

  const {
    data: callsPages,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['calls-history', profileId, filterKey],
    enabled: !!profileId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const matchingContactIds = filters.search ? await findContactIdsByNameOrPhone(filters.search) : null;
      if (filters.search && matchingContactIds && matchingContactIds.length === 0) return [];

      let query = supabase
        .from('calls')
        .select('*, contact:contacts(name, phone)')
        .eq('agent_id', profileId as string);
      if (filters.direction) query = query.eq('direction', filters.direction);
      if (filters.channel === 'voip') query = query.is('whatsapp_connection_id', null);
      if (filters.channel === 'whatsapp') query = query.not('whatsapp_connection_id', 'is', null);
      if (filters.result === 'ended_answered') query = query.eq('status', 'ended').not('answered_at', 'is', null);
      else if (filters.result === 'ended_missed') query = query.eq('status', 'ended').is('answered_at', null);
      else if (filters.result) query = query.eq('status', filters.result);
      if (matchingContactIds) query = query.in('contact_id', matchingContactIds);

      const { data, error } = await query
        .order('started_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return (data || []) as unknown as CallHistoryRow[];
    },
    getNextPageParam: (lastPage, allPages) => (lastPage.length === PAGE_SIZE ? allPages.length : undefined),
  });

  const { data: statsRows = [] } = useQuery({
    queryKey: ['calls-stats', profileId, filterKey],
    enabled: !!profileId,
    queryFn: async () => {
      const matchingContactIds = filters.search ? await findContactIdsByNameOrPhone(filters.search) : null;
      if (filters.search && matchingContactIds && matchingContactIds.length === 0) return [];

      let query = supabase
        .from('calls')
        .select('direction, status, duration_seconds')
        .eq('agent_id', profileId as string);
      if (filters.direction) query = query.eq('direction', filters.direction);
      if (filters.channel === 'voip') query = query.is('whatsapp_connection_id', null);
      if (filters.channel === 'whatsapp') query = query.not('whatsapp_connection_id', 'is', null);
      if (filters.result === 'ended_answered') query = query.eq('status', 'ended').not('answered_at', 'is', null);
      else if (filters.result === 'ended_missed') query = query.eq('status', 'ended').is('answered_at', null);
      else if (filters.result) query = query.eq('status', filters.result);
      if (matchingContactIds) query = query.in('contact_id', matchingContactIds);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  return {
    calls: callsPages?.pages.flat() ?? [],
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    statsRows,
  };
}
