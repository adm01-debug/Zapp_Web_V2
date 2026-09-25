import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  TrendingUp, BarChart3, Target, Clock, Brain, Award, Heart, Smile, FileText, AlertTriangle,
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
import { DashboardFilters } from './DashboardFilters';
import { useDashboardUrlFilters } from '@/hooks/dashboard/useDashboardUrlFilters';
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
import { GamificationSection } from './overview/GamificationSection';
import { useUserRole } from '@/hooks/system/useUserRole';

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

// Agent/special_agent veem so as abas pessoais — RLS ja escopa os dados dele,
// mas Analytics/Equipe/Sentimento/Relatorios sao paineis de gestao da operacao inteira.
const AGENT_TAB_VALUES = new Set(['overview', 'goals', 'satisfaction']);

export function DashboardView() {
  const { isAdmin, isSupervisor } = useUserRole();
  const isStaff = isAdmin || isSupervisor;
  const visibleTabs = isStaff ? DASHBOARD_TABS : DASHBOARD_TABS.filter(t => AGENT_TAB_VALUES.has(t.value));
  const [tab, setTab] = useState(OVERVIEW_TAB);
  const [filters, setFilters] = useDashboardUrlFilters();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [csatPeriod, setCsatPeriod] = useState<'today' | 'week' | 'month'>('month');

  const { stats, queueBreakdown, myActiveConversations, queues, isLoading, error, refetch } = useDashboardData({
    dateRange: filters.dateRange,
    queueId: filters.queueId,
    agentId: filters.agentId,
  });
  // Instância única de useRealtimeDashboard (antecipada da Fase 5/etapa 46: o
  // sino da faixa do topo já precisa de unreadMessages real na Fase 2). KPIs
  // e "Agora" (Fase 5-6) reaproveitam este mesmo `realtime`, nunca uma 2ª sub.
  const realtime = useRealtimeDashboard();
  // E31: fila/agente do filtro do topo propagados para a RPC dashboard_kpi —
  // antes o dropdown era cosmético para este card (achado A9). Para não-staff,
  // a RPC trava p_agent = auth.uid() no servidor (E33), independente do que
  // filters.agentId trouxer.
  const { data: kpi } = useDashboardKpi({ queueId: filters.queueId, agentId: filters.agentId });
  const { rows: queueHealthRows, busiestQueue } = useQueueHealth(queueBreakdown, queues);
  const { data: recentEvents } = useRecentConversationEvents(4);
  const { agents: leaderboardAgents, timeRange, setTimeRange } = useLeaderboard();
  // Instância única de useSLAMetrics('today') — só Equipe em Destaque consome
  // (etapa 68); "Agora" usa slaBreachedToday de useDashboardKpi (fallback já
  // documentado no ledger, useApplicableSLA/useSLACalculation são por-contato).
  const { data: slaMetrics } = useSLAMetrics('today');
  const slaRateByAgent = new Map((slaMetrics?.byAgent ?? []).map((a) => [a.agentId, a.overallRate]));
  const queryClient = useQueryClient();

  // Agente só pode navegar para as próprias abas — bloqueia o vazamento por
  // clique nos cards (Ferramentas de IA → Sentimento → Relatórios etc.), já
  // que a barra de abas em si já filtra, mas os cards chamam onNavigateTab direto.
  const goToTab = (v: string) => {
    if (!isStaff && !AGENT_TAB_VALUES.has(v)) return;
    setTab(v);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    // Chaves das hooks da Fase 5-7 (ainda não existem antes delas — invalidateQueries
    // é um no-op seguro para queryKey sem cache correspondente).
    queryClient.invalidateQueries({ queryKey: ['dashboard-kpi'] });
    queryClient.invalidateQueries({ queryKey: ['recent-conversation-events'] });
    queryClient.invalidateQueries({ queryKey: ['today-hourly-volume'] });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  if (isLoading || !stats) {
    // Antes: uma query falhando (rede/RLS) deixava `stats` sempre null e o
    // dashboard preso no skeleton para sempre, sem qualquer aviso (auditoria
    // de 24/09, achado P1 — "KPIs honestos" não podia esconder a própria falha).
    if (error && !isLoading) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center" data-testid="dash-error">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground max-w-sm">
            Não foi possível carregar os dados do dashboard agora.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      );
    }
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
            <DashboardFilters filters={filters} onFiltersChange={setFilters} onRefresh={handleRefresh} isRefreshing={isRefreshing} showTeamFilters={isStaff} />
          )}
        />

        <Tabs value={tab} onValueChange={setTab}>
          <DashboardTabs tabs={visibleTabs} activeTab={tab} />

        <TabsContent value="overview" className="space-y-2.5 mt-2.5">
          {/* Shell da Visão Geral — placeholders com altura-alvo para o CP1 medir o ritmo vertical.
              Conteúdo real chega nas Fases 5-9. RealtimeMetricsPanel e ProgressiveDisclosureDashboard
              deixam de renderizar aqui (widgets level 3 + desafios voltam na Fase 9). */}
          <div data-testid="dash-banner">
            <GreetingBanner personal={!isStaff} />
          </div>
          <div data-testid="dash-kpis">
            {/* E34: KPIs (Resolvidas Hoje, Tempo de Resposta etc.) são sempre do dia
                atual por design da RPC dashboard_kpi (v_today/v_yesterday fixos no
                servidor) — mudar o período no filtro do topo não os afeta, só a lista
                de contatos e o gráfico de volume. Antes isso acontecia em silêncio
                (achado E34); agora avisa. */}
            {filters.period !== 'today' && (
              <p className="text-2xs text-muted-foreground mb-1.5" data-testid="dash-kpis-period-notice">
                Estes indicadores são sempre do dia atual — o período selecionado no filtro acima afeta a lista de contatos e o gráfico de volume, não estes cards.
              </p>
            )}
            <DashboardKpiRow stats={stats} realtime={realtime} kpi={kpi} isStaff={isStaff} myActiveConversations={myActiveConversations} />
          </div>
          <div data-testid="dash-row2" className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1.9fr_1fr_1fr] gap-2.5">
            <VolumeChart queueId={filters.queueId} agentId={filters.agentId} />
            <NowPanel
              realtime={realtime}
              pendingConversations={stats.pendingConversations}
              slaBreachedToday={kpi?.slaBreachedToday}
              busiestQueue={isStaff ? busiestQueue : null}
            />
            <DailyGoalsCard
              onSeeAll={() => goToTab('goals')}
              stats={{
                totalConversations: stats.totalConversations,
                // stats.resolvedToday/avgResponseTime já vêm de useDashboardKpi
                // (fonte única, ver useDashboardData) — sem fallback duplicado.
                resolvedToday: stats.resolvedToday,
                avgResponseTime: stats.avgResponseTime,
                pendingConversations: stats.pendingConversations,
              }}
            />
          </div>
          <div data-testid="dash-row3" className={isStaff ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[4fr_3fr_3fr] gap-2.5' : 'grid grid-cols-1 gap-2.5'}>
            {isStaff && (
              <QueueHealthTable rows={queueHealthRows} isConnected={realtime.isConnected} onSeeAll={() => goToTab('sla')} />
            )}
            <RecentActivityCard items={recentEvents?.items ?? []} />
            {isStaff && (
              <TeamHighlightCard
                agents={leaderboardAgents}
                timeRange={timeRange}
                onTimeRangeChange={setTimeRange}
                slaRateByAgent={slaRateByAgent}
              />
            )}
          </div>
          <div data-testid="dash-row4" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[4fr_3fr_3fr] gap-2.5">
            <AIToolsCard onSeeAll={() => goToTab('ai')} />
            <CsatCard period={csatPeriod} onPeriodChange={setCsatPeriod} />
            <SentimentTrendCard />
          </div>
          <div data-testid="dash-gamification">
            <GamificationSection stats={stats} isStaff={isStaff} />
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-2.5">
          <DemandPrediction />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ConversationHeatmap />
            <ActivityHeatmap />
          </div>
        </TabsContent>

        <TabsContent value="goals" className="space-y-2.5"><GoalsDashboard onNavigateTab={goToTab} /></TabsContent>
        <TabsContent value="ai" className="space-y-2.5"><AIQuickAccess onNavigateTab={goToTab} /></TabsContent>
        <TabsContent value="sla"><SLAMetricsDashboard /></TabsContent>
        <TabsContent value="team" className="space-y-2.5"><AgentPerformancePanel onNavigateTab={goToTab} /></TabsContent>
        <TabsContent value="satisfaction" className="space-y-2.5"><SatisfactionMetrics /><CSATDashboard /></TabsContent>
        <TabsContent value="sentiment" className="space-y-2.5"><SentimentTrendChart onNavigateTab={goToTab} /></TabsContent>
        <TabsContent value="reports" className="space-y-2.5"><ScheduledReportsManager /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
