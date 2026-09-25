import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay } from 'date-fns';
import { useAgentPresenceMap } from '@/hooks/crm/useAgentPresence';

export interface DashboardFilters {
  dateRange?: { from: Date; to: Date };
  queueId?: string | null;
  agentId?: string | null;
}

export function useDashboardStats(filters: DashboardFilters) {
  const todayStart = startOfDay(new Date()).toISOString();
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
    // Lista de atendentes ativos muda pouco (E28) — presença (online/offline)
    // já é tempo real via useAgentPresenceMap, fora deste cache.
    staleTime: 300_000,
  });

  // "Online" = conta ativa E conectada agora com status Online (presença real do Realtime).
  // Fica fora do queryFn: presença muda em tempo real e não pode ficar presa no cache da query.
  const agentsData = useMemo(() => {
    if (!agentsQuery.data) return undefined;
    const onlineAgents = agentsQuery.data.agents.filter(a => a.is_active && presence[a.user_id] === 'online').length;
    return { ...agentsQuery.data, onlineAgents };
  }, [agentsQuery.data, presence]);

  const contactsQuery = useQuery({
    queryKey: ['dashboard-contacts', filters],
    queryFn: async () => {
      let query = supabase
        .from('contacts')
        // conversation_status incluído (auditoria de 24/09, achado P1): sem ele
        // o KPI "conversas abertas" contava qualquer contato com assigned_to,
        // inclusive resolved/archived/waiting -- mascarado hoje só porque
        // 100% dos contatos em produção ainda estão 'open'.
        .select('id, name, phone, avatar_url, queue_id, assigned_to, conversation_status, created_at, updated_at')
        .order('updated_at', { ascending: false });
      if (filters.queueId) query = query.eq('queue_id', filters.queueId);
      if (filters.agentId) query = query.eq('assigned_to', filters.agentId);
      if (filters.dateRange?.from) query = query.gte('updated_at', filters.dateRange.from.toISOString());
      if (filters.dateRange?.to) query = query.lte('updated_at', filters.dateRange.to.toISOString());
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    // Contatos mudam de status/atribuição com frequência — janela curta (E28).
    staleTime: 30_000,
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
    // Composição de filas (quais existem, quem é membro) muda raramente (E28).
    staleTime: 300_000,
  });

  // slaQuery (últimos 50 all-time, sem filtro de data) foi removida (E17): era uma
  // 2ª régua de "tempo médio" divergente da de useDashboardKpi (hoje/mediana) --
  // achado A5. useDashboardData agora lê o tempo médio só de useDashboardKpi.

  return {
    agents: agentsData,
    contacts: contactsQuery.data,
    queues: queuesQuery.data,
    isLoading: agentsQuery.isLoading || contactsQuery.isLoading || queuesQuery.isLoading,
    error: agentsQuery.error || contactsQuery.error || queuesQuery.error,
    refetch: () => {
      agentsQuery.refetch();
      contactsQuery.refetch();
      queuesQuery.refetch();
    }
  };
}
