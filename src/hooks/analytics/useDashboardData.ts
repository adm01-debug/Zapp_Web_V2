import { useMemo } from 'react';
import { startOfDay, endOfDay } from 'date-fns';
import { useDashboardStats, DashboardFilters } from '../dashboard/useDashboardStats';
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
  const { agents, contacts, queues, isLoading, error, refetch } = useDashboardStats(mergedFilters);
  // Fonte única de "resolvidas hoje" e "tempo médio" (E16/E17, achados A4/A5):
  // conversation_closures/conversation_sla via useDashboardKpi, nunca mais a
  // heurística local (updated_at hoje && !assigned_to contava devolução à fila
  // como resolvida) nem o slaQuery de últimos-50-all-time.
  const { data: kpi } = useDashboardKpi({ queueId: mergedFilters.queueId, agentId: mergedFilters.agentId }); // E31
  const presence = useAgentPresenceMap();

  const stats = useMemo(() => {
    if (!agents || !contacts) return null;

    // conversation_status === 'open' incluído (auditoria de 24/09, achado P1):
    // antes contava qualquer contato com assigned_to, inclusive
    // resolved/archived/waiting -- "conversas abertas" mentia assim que algum
    // contato deixasse de estar 'open'.
    const openConversations = contacts.filter(c => c.assigned_to && c.conversation_status === 'open').length;
    // Mesmo gap, achado no caminho da auditoria de 24/09: sem excluir
    // resolved/archived, "pendentes" ia contar contato já resolvido mas ainda
    // sem assigned_to (ex.: devolvido à fila e fechado por outro fluxo).
    // Semantica confirmada em useInboxFilters.ts (subTab 'waiting').
    const pendingConversations = contacts.filter(c => !c.assigned_to && c.queue_id && c.conversation_status !== 'resolved' && c.conversation_status !== 'archived').length;
    const resolvedToday = kpi?.resolvedToday ?? 0;

    const queuesStats = ((queues || []) as unknown as QueueRow[]).map(queue => {
      const members = queue.queue_members || [];
      const onlineMembers = members.filter(m => m.is_active && m.profiles?.is_active && presence[m.profiles.user_id] === 'online').length;
      return {
        id: queue.id,
        name: queue.name,
        color: queue.color,
        waitingCount: 0,
        onlineAgents: onlineMembers,
        totalAgents: members.length,
      };
    });

    return {
      openConversations,
      pendingConversations,
      resolvedToday,
      totalConversations: contacts.length,
      onlineAgents: agents.onlineAgents,
      totalAgents: agents.totalAgents,
      avgResponseTime: kpi?.avgResponseToday ?? null,
      queuesStats,
      recentActivity: [],
    };
  }, [agents, contacts, queues, kpi, presence]);

  // contacts/queues crus expostos para useQueueHealth (Fase 6) — mesmos dados já
  // carregados por useDashboardStats, sem query nova.
  return { stats, contacts, queues, isLoading, error, refetch };
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
