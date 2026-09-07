import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  TrendingUp, BarChart3, Target, Clock, Brain, Award, Heart, Smile, FileText,
} from 'lucide-react';
import { DashboardTabs, DashboardTabDef } from './overview/DashboardTabs';
import { SLAMetricsDashboard } from './SLAMetricsDashboard';
import { AIQuickAccess } from './AIQuickAccess';
import { CSATDashboard } from '@/components/csat/CSATDashboard';
import { GoalsDashboard } from './GoalsDashboard';
import { DemandPrediction } from './DemandPrediction';
import { ActivityHeatmap } from './ActivityHeatmap';
import ConversationHeatmap from './ConversationHeatmap';
import { AgentPerformancePanel } from './AgentPerformancePanel';
import { SatisfactionMetrics } from './SatisfactionMetrics';
import { SentimentTrendChart } from './SentimentTrendChart';
import { ScheduledReportsManager } from './ScheduledReportsManager';
import { useDashboardData } from '@/hooks/analytics/useDashboardData';
import { useRealtimeDashboard } from '@/hooks/analytics/useRealtimeDashboard';
import { useDashboardKpi } from '@/hooks/dashboard/useDashboardKpi';
import { useQueueHealth } from '@/hooks/dashboard/useQueueHealth';
import { useRecentConversationEvents } from '@/hooks/dashboard/useRecentConversationEvents';
import { useLeaderboard } from '@/hooks/gamification/useLeaderboard';
import { useSLAMetrics } from '@/hooks/sla/useSLAMetrics';
import { DashboardFilters, DashboardFiltersState, getDefaultFilters } from './DashboardFilters';
import { OverviewSkeleton } from './overview/OverviewSkeleton';
import { GreetingBanner } from './overview/GreetingBanner';
import { DashboardTopBar } from './overview/DashboardTopBar';
import { DashboardHeader } from './overview/DashboardHeader';
import { DashboardKpiRow } from './overview/DashboardKpiRow';
import { VolumeChart } from './overview/VolumeChart';
import { NowPanel } from './overview/NowPanel';
import { DailyGoalsCard } from './overview/DailyGoalsCard';
import { QueueHealthTable } from './overview/QueueHealthTable';
import { RecentActivityCard } from './overview/RecentActivityCard';
import { TeamHighlightCard } from './overview/TeamHighlightCard';
import { AIToolsCard } from './overview/AIToolsCard';
import { CsatCard } from './overview/CsatCard';
import { SentimentTrendCard } from './overview/SentimentTrendCard';

const OVERVIEW_TAB = 'overview';

const DASHBOARD_TABS: DashboardTabDef[] = [
  { value: 'overview', label: 'Visão Geral', icon: TrendingUp },
  { value: 'analytics', label: 'Analytics', icon: BarChart3 },
  { value: 'goals', label: 'Metas', icon: Target },
  { value: 'ai', label: 'Inteligência Artificial', icon: Brain },
  { value: 'sla', label: 'Métricas SLA', icon: Clock },
  { value: 'team', label: 'Equipe', icon: Award },
  { value: 'satisfaction', label: 'Satisfação', icon: Heart },
  { value: 'sentiment', label: 'Sentimento', icon: Smile },
  { value: 'reports', label: 'Relatórios', icon: FileText },
];

export function DashboardView() {
  const [tab, setTab] = useState(OVERVIEW_TAB);
  const [filters, setFilters] = useState<DashboardFiltersState>(getDefaultFilters());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [csatPeriod, setCsatPeriod] = useState<'today' | 'week' | 'month'>('month');

  const { stats, contacts, queues, isLoading, refetch } = useDashboardData({
    dateRange: filters.dateRange,
    queueId: filters.queueId,
    agentId: filters.agentId,
  });
  // Instância única de useRealtimeDashboard (antecipada da Fase 5/etapa 46: o
  // sino da faixa do topo já precisa de unreadMessages real na Fase 2). KPIs
  // e "Agora" (Fase 5-6) reaproveitam este mesmo `realtime`, nunca uma 2ª sub.
  const realtime = useRealtimeDashboard();
  const { data: kpi } = useDashboardKpi();
  const { rows: queueHealthRows, busiestQueue } = useQueueHealth(contacts, queues);
  const { data: recentEvents } = useRecentConversationEvents(4);
  const { agents: leaderboardAgents, timeRange, setTimeRange } = useLeaderboard();
  // Instância única de useSLAMetrics('today') — só Equipe em Destaque consome
  // (etapa 68); "Agora" usa slaBreachedToday de useDashboardKpi (fallback já
  // documentado no ledger, useApplicableSLA/useSLACalculation são por-contato).
  const { data: slaMetrics } = useSLAMetrics('today');
  const slaRateByAgent = new Map((slaMetrics?.byAgent ?? []).map((a) => [a.agentId, a.overallRate]));
  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    // Chaves das hooks da Fase 5-7 (ainda não existem antes delas — invalidateQueries
    // é um no-op seguro para queryKey sem cache correspondente).
    queryClient.invalidateQueries({ queryKey: ['dashboard-kpi'] });
    queryClient.invalidateQueries({ queryKey: ['queue-health'] });
    queryClient.invalidateQueries({ queryKey: ['recent-conversation-events'] });
    queryClient.invalidateQueries({ queryKey: ['today-hourly-volume'] });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  if (isLoading || !stats) {
    return <OverviewSkeleton />;
  }

  return (
    <div className="w-full min-w-0">
      {/* Sem gap explícito para o header abaixo: a referência mede a faixa
          do topo e o header card como adjacentes (ritmo vertical do CP1). */}
      <div data-testid="dash-topbar">
        <DashboardTopBar unreadMessages={realtime.unreadMessages} />
      </div>

      <div className="space-y-2.5">
        <DashboardHeader
          filters={(
            <DashboardFilters filters={filters} onFiltersChange={setFilters} onRefresh={handleRefresh} isRefreshing={isRefreshing} />
          )}
        />

        <Tabs value={tab} onValueChange={setTab}>
          <DashboardTabs tabs={DASHBOARD_TABS} activeTab={tab} />

        <TabsContent value="overview" className="space-y-2.5 mt-2.5">
          {/* Shell da Visão Geral — placeholders com altura-alvo para o CP1 medir o ritmo vertical.
              Conteúdo real chega nas Fases 5-9. RealtimeMetricsPanel e ProgressiveDisclosureDashboard
              deixam de renderizar aqui (widgets level 3 + desafios voltam na Fase 9). */}
          <div data-testid="dash-banner">
            <GreetingBanner />
          </div>
          <div data-testid="dash-kpis">
            <DashboardKpiRow stats={stats} realtime={realtime} kpi={kpi} />
          </div>
          <div data-testid="dash-row2" className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1.9fr_1fr_1fr] gap-2.5">
            <VolumeChart />
            <NowPanel
              realtime={realtime}
              pendingConversations={stats.pendingConversations}
              slaBreachedToday={kpi?.slaBreachedToday}
              busiestQueue={busiestQueue}
            />
            <DailyGoalsCard
              onSeeAll={() => setTab('goals')}
              stats={{
                totalConversations: stats.totalConversations,
                resolvedToday: kpi?.resolvedToday ?? stats.resolvedToday,
                avgResponseTime: stats.avgResponseTime,
                pendingConversations: stats.pendingConversations,
              }}
            />
          </div>
          <div data-testid="dash-row3" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[4fr_3fr_3fr] gap-2.5">
            <QueueHealthTable rows={queueHealthRows} isConnected={realtime.isConnected} onSeeAll={() => setTab('sla')} />
            <RecentActivityCard items={recentEvents?.items ?? []} />
            <TeamHighlightCard
              agents={leaderboardAgents}
              timeRange={timeRange}
              onTimeRangeChange={setTimeRange}
              slaRateByAgent={slaRateByAgent}
            />
          </div>
          <div data-testid="dash-row4" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[4fr_3fr_3fr] gap-2.5">
            <AIToolsCard onSeeAll={() => setTab('ai')} />
            <CsatCard period={csatPeriod} onPeriodChange={setCsatPeriod} />
            <SentimentTrendCard />
          </div>
          <div data-testid="dash-gamification" className="min-h-[40px]" />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <DemandPrediction />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ConversationHeatmap />
            <ActivityHeatmap />
          </div>
        </TabsContent>

        <TabsContent value="goals" className="space-y-6"><GoalsDashboard /></TabsContent>
        <TabsContent value="ai" className="space-y-6"><AIQuickAccess /><CSATDashboard /></TabsContent>
        <TabsContent value="sla"><SLAMetricsDashboard /></TabsContent>
        <TabsContent value="team" className="space-y-6"><AgentPerformancePanel /></TabsContent>
        <TabsContent value="satisfaction" className="space-y-6"><SatisfactionMetrics /></TabsContent>
        <TabsContent value="sentiment" className="space-y-6"><SentimentTrendChart /></TabsContent>
        <TabsContent value="reports" className="space-y-6"><ScheduledReportsManager /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
