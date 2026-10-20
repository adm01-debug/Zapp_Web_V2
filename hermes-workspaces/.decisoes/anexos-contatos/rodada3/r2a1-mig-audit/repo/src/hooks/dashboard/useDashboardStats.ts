import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAgentPresenceMap } from '@/hooks/crm/useAgentPresence';

export interface DashboardFilters {
  dateRange?: { from: Date; to: Date };
  queueId?: string | null;
  agentId?: string | null;
}

export interface DashboardQueueBreakdown {
  queueId: string;
  waiting: number;
  inService: number;
  avgResponse: number | null;
  slaRate: number | null;
}

/** Shape devolvido pela RPC dashboard_contact_counts (E24/E25): contagens
 * globais + breakdown por fila calculados no servidor — substitui o fetch
 * de até 1000 linhas cruas de `contacts` (cap silencioso do PostgREST,
 * achado A11) e o waitingCount hardcoded 0 (achado A10). */
export interface DashboardContactCounts {
  total: number;
  open: number;
  pending: number;
  myActive: number;
  queues: DashboardQueueBreakdown[];
}

export function useDashboardStats(filters: DashboardFilters) {
  const presence = useAgentPresenceMap();

  const agentsQuery = useQuery({
    queryKey: ['dashboard-agents', filters.agentId],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('id, user_id, name, is_active, role')
        .or('role.eq.agent,role.eq.supervisor');
      if (filters.agentId) query = query.eq('id', filters.agentId);
      const { data, error } = await query;
      if (error) throw error;
      return {
        agents: data || [],
        totalAgents: data?.length || 0,
      };
    },
    staleTime: 300_000, // E28
  });

  const agentsData = useMemo(() => {
    if (!agentsQuery.data) return undefined;
    const onlineAgents = agentsQuery.data.agents.filter(a => a.is_active && presence[a.user_id] === 'online').length;
    return { ...agentsQuery.data, onlineAgents };
  }, [agentsQuery.data, presence]);

  const contactCountsQuery = useQuery({
    queryKey: ['dashboard-contact-counts', filters],
    queryFn: async () => {
      // cast temporário: types.ts gerado ainda não tem dashboard_contact_counts
      // (RPC nova, E24/E25) — sync automático traz o tipo real em breve (mesmo
      // padrão do dashboard_kpi, E23).
      const { data, error } = await (supabase as any).rpc('dashboard_contact_counts', { // eslint-disable-line @typescript-eslint/no-explicit-any -- cast temporário até sync de types
        p_since: filters.dateRange?.from ? filters.dateRange.from.toISOString() : null,
        p_until: filters.dateRange?.to ? filters.dateRange.to.toISOString() : null,
        p_queue: filters.queueId || null,
        p_agent: filters.agentId || null,
      });
      if (error) throw error;
      return data as unknown as DashboardContactCounts;
    },
    staleTime: 30_000, // E28
  });

  const queuesQuery = useQuery({
    queryKey: ['dashboard-queues'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('queues')
        .select(`id, name, color, queue_members (profile_id, is_active, profiles (id, user_id, is_active))`)
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    staleTime: 300_000, // E28
  });

  return {
    agents: agentsData,
    counts: contactCountsQuery.data,
    queues: queuesQuery.data,
    isLoading: agentsQuery.isLoading || contactCountsQuery.isLoading || queuesQuery.isLoading,
    error: agentsQuery.error || contactCountsQuery.error || queuesQuery.error,
    refetch: () => {
      agentsQuery.refetch();
      contactCountsQuery.refetch();
      queuesQuery.refetch();
    }
  };
}
