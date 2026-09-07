import { MessageSquare, Mail, Clock, Users, CheckCircle2 } from 'lucide-react';
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
}

export function DashboardKpiRow({ stats, realtime, kpi }: DashboardKpiRowProps) {
  const onlinePct = stats.totalAgents > 0 ? Math.round((stats.onlineAgents / stats.totalAgents) * 100) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
      <DashboardKpiCard
        label="Conversas Abertas"
        value={String(stats.openConversations)}
        delta={null}
        tile="blue"
        icon={MessageSquare}
        bars={realtime.metricsHistory.slice(-8).map((m) => m.activeConversations)}
        barsColor="blue"
      />
      <DashboardKpiCard
        label="Não Lidas"
        value={String(realtime.unreadMessages)}
        delta={null}
        tile="red"
        icon={Mail}
        bars={null}
        barsColor="red"
      />
      <DashboardKpiCard
        label="Tempo Médio de Resposta"
        value={kpi?.avgResponseToday != null ? formatShortDuration(kpi.avgResponseToday) : '—'}
        delta={kpi?.deltaResponsePct != null ? { pct: kpi.deltaResponsePct, invert: true } : null}
        tile="green"
        icon={Clock}
        bars={kpi?.responseHourly8?.map((v) => Math.round(v)) ?? null}
        barsColor="green"
      />
      <DashboardKpiCard
        label="Atendentes Online"
        value={`${stats.onlineAgents}/${stats.totalAgents}`}
        delta={{ text: `● ${onlinePct}% online`, tone: 'success' }}
        tile="green"
        icon={Users}
        bars={null}
        barsColor="violet"
      />
      <DashboardKpiCard
        label="Resolvidas Hoje"
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
