import { MessageSquare, Mail, Clock, Users, CheckCircle2, UserCheck, Info } from 'lucide-react';
import { DashboardKpiCard } from './DashboardKpiCard';
import { formatShortDuration } from './formatShortDuration';
import type { RealtimeDashboardState } from '@/hooks/analytics/useRealtimeDashboard';
import type { useDashboardKpi } from '@/hooks/dashboard/useDashboardKpi';

interface DashboardStats {
  openConversations: number;
  pendingConversations: number;
  onlineAgents: number;
  totalAgents: number;
}

interface DashboardKpiRowProps {
  stats: DashboardStats;
  realtime: RealtimeDashboardState;
  kpi: ReturnType<typeof useDashboardKpi>['data'];
  /** Staff (admin/supervisor) vê a régua global; agente vê fila/pessoal (matriz de escopo E03). */
  isStaff?: boolean;
  /** Só usado quando !isStaff — conversas com assigned_to = eu, calculado no DashboardView. */
  myActiveConversations?: number;
}

export function DashboardKpiRow({ stats, realtime, kpi, isStaff = true, myActiveConversations = 0 }: DashboardKpiRowProps) {
  const onlinePct = stats.totalAgents > 0 ? Math.round((stats.onlineAgents / stats.totalAgents) * 100) : 0;
  const responseTooltip = kpi?.p90ResponseToday != null
    ? <span title={`p90 hoje: ${formatShortDuration(kpi.p90ResponseToday)} (9 em cada 10 atendimentos responderam mais rápido que isso)`}><Info className="w-3 h-3 text-muted-foreground" /></span>
    : undefined;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
      <DashboardKpiCard
        index={0}
        label={isStaff ? 'Conversas Abertas' : 'Fila: Conversas Abertas'}
        value={String(stats.openConversations)}
        delta={null}
        tile="blue"
        icon={MessageSquare}
        bars={realtime.metricsHistory.slice(-8).map((m) => m.activeConversations)}
        barsColor="blue"
      />
      <DashboardKpiCard
        index={1}
        label={isStaff ? 'Não Lidas' : 'Fila: Não Lidas'}
        value={String(realtime.unreadMessages)}
        delta={null}
        tile="red"
        icon={Mail}
        bars={null}
        barsColor="red"
      />
      <DashboardKpiCard
        index={2}
        label={isStaff ? 'Tempo Médio de Resposta' : 'Meu Tempo Médio de Resposta'}
        labelAdornment={responseTooltip}
        value={kpi?.avgResponseToday != null ? formatShortDuration(kpi.avgResponseToday) : '—'}
        delta={kpi?.deltaResponsePct != null ? { pct: kpi.deltaResponsePct, invert: true } : null}
        tile="green"
        icon={Clock}
        bars={kpi?.responseHourly8?.map((v) => Math.round(v)) ?? null}
        barsColor="green"
      />
      {isStaff ? (
        <DashboardKpiCard
          index={3}
          label="Atendentes Online"
          value={stats.totalAgents > 0 ? `${stats.onlineAgents}/${stats.totalAgents}` : '—'}
          delta={stats.totalAgents > 0 ? { text: `● ${onlinePct}% online`, tone: 'success' } : { text: 'Sem dados', tone: 'muted' }}
          tile="green"
          icon={Users}
          bars={null}
          barsColor="violet"
        />
      ) : (
        <DashboardKpiCard
          index={3}
          label="Minhas Conversas Ativas"
          value={String(myActiveConversations)}
          delta={null}
          tile="violet"
          icon={UserCheck}
          bars={null}
          barsColor="violet"
        />
      )}
      <DashboardKpiCard
        index={4}
        label={isStaff ? 'Resolvidas Hoje' : 'Minhas Resolvidas Hoje'}
        value={String(kpi?.resolvedToday ?? 0)}
        delta={kpi?.deltaResolvedPct != null ? { pct: kpi.deltaResolvedPct } : null}
        tile="green"
        icon={CheckCircle2}
        bars={kpi?.resolvedHourly8 ?? null}
        barsColor="green"
      />
    </div>
  );
}
