import { useMemo } from 'react';
import { startOfDay, endOfDay } from 'date-fns';
import { useDashboardStats, DashboardFilters, DashboardQueueBreakdown } from '../dashboard/useDashboardStats';
import { useDashboardKpi } from '../dashboard/useDashboardKpi';
import { useAgentPresenceMap } from '../crm/useAgentPresence';

// Formato do select de filas em useDashboardStats (queue_members -> profiles).
interface QueueMemberRow {
  is_active: boolean | null;
  profiles: { user_id: string; is_active: boolean | null } | null;
}
interface QueueRow {
  id: string;
  name: string;
  color: string;
  queue_members?: QueueMemberRow[] | null;
}

const getDefaultFilters = (): DashboardFilters => ({
  dateRange: { from: startOfDay(new Date()), to: endOfDay(new Date()) },
  queueId: null,
  agentId: null,
});

export const useDashboardData = (filters: DashboardFilters = getDefaultFilters()) => {
  const mergedFilters = { ...getDefaultFilters(), ...filters };
  const { agents, counts, queues, isLoading, error, refetch } = useDashboardStats(mergedFilters);
  // Fonte única de "resolvidas hoje" e "tempo médio" (E16/E17, achados A4/A5):
  // conversation_closures/conversation_sla via useDashboardKpi, nunca mais a
  // heurística local (updated_at hoje && !assigned_to contava devolução à fila
  // como resolvida) nem o slaQuery de últimos-50-all-time.
  const { data: kpi } = useDashboardKpi();
  const presence = useAgentPresenceMap();

  const stats = useMemo(() => {
    if (!agents || !counts) return null;

    // E24/E25: contagens vêm prontas da RPC dashboard_contact_counts, no
    // lugar do filter().length client-side sobre o array cru de `contacts`
    // (truncado pelo cap silencioso de 1000 linhas do PostgREST — achado
    // A11 — com 3.095+ contatos reais). Mesma semântica de antes:
    // conversation_status === 'open'/'não resolvido' já aplicada na RPC.
    const openConversations = counts.open;
    const pendingConversations = counts.pending;
    const resolvedToday = kpi?.resolvedToday ?? 0;

    const queuesStats = ((queues || []) as unknown as QueueRow[]).map(queue => {
      const members = queue.queue_members || [];
      const onlineMembers = members.filter(m => m.is_active && m.profiles?.is_active && presence[m.profiles.user_id] === 'online').length;
      // waitingCount real via breakdown por fila da RPC (achado A10 — antes hardcoded 0).
      const breakdown = counts.queues.find(q => q.queueId === queue.id);
      return {
        id: queue.id,
        name: queue.name,
        color: queue.color,
        waitingCount: breakdown?.waiting ?? 0,
        onlineAgents: onlineMembers,
        totalAgents: members.length,
      };
    });

    return {
      openConversations,
      pendingConversations,
      resolvedToday,
      totalConversations: counts.total,
      onlineAgents: agents.onlineAgents,
      totalAgents: agents.totalAgents,
      avgResponseTime: kpi?.avgResponseToday ?? null,
      queuesStats,
      recentActivity: [],
    };
  }, [agents, counts, queues, kpi, presence]);

  // breakdown por fila exposto para useQueueHealth (E24/E25) — mesma RPC já
  // carregada por useDashboardStats, sem query nova.
  const queueBreakdown: DashboardQueueBreakdown[] = counts?.queues ?? [];
  const myActiveConversations = counts?.myActive ?? 0;

  return { stats, queueBreakdown, myActiveConversations, queues, isLoading, error, refetch };
};

export const formatResponseTime = (seconds: number | null): string => {
  if (seconds === null) return 'N/A';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}min ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}min`;
};
