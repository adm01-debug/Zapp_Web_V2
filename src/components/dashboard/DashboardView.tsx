import { useState, type ReactNode } from 'react';
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
import { DailyMetricsKpis } from './overview/DailyMetricsKpis';
import { VolumeChart } from './overview/VolumeChart';
import { NowPanel } from './overview/NowPanel';
import { DailyGoalsCard } from './overview/DailyGoalsCard';
import { QueueHealthTable } from './overview/QueueHealthTable';
import { SystemHealthCard } from './overview/SystemHealthCard';
import { RecentActivityCard } from './overview/RecentActivityCard';
import { TeamHighlightCard } from './overview/TeamHighlightCard';
import { AIToolsCard } from './overview/AIToolsCard';
import { CsatCard } from './overview/CsatCard';
import { SentimentTrendCard } from './overview/SentimentTrendCard';
import { GamificationSection } from './overview/GamificationSection';
import { WidgetConfigSheet } from './WidgetConfigSheet';
import { useDashboardWidgets } from '@/hooks/analytics/useDashboardWidgets';
import { useUserRole } from '@/hooks/system/useUserRole';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';

const OVERVIEW_TAB = 'overview';

/**
 * Agrupa os cards da Visão Geral em zonas rotuladas, no lugar de uma grade
 * plana de ~12 blocos de peso visual idêntico: nada dizia quais números olhar
 * primeiro. Cada zona tem um título curto e um separador sutil; a primeira não
 * leva separador (é o topo da aba).
 */
function DashboardZone({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      data-testid={`dash-zone-${id}`}
      aria-labelledby={`dash-zone-${id}-title`}
      className="space-y-2.5 pt-4 mt-2 border-t border-border first:border-t-0 first:pt-0 first:mt-0"
    >
      <h3
        id={`dash-zone-${id}-title`}
        className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {title}
      </h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

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

  const kpiPeriodDates = (() => {
    const now = new Date();
    if (!filters.period || filters.period === 'today') return {};
    if (filters.period === 'week') { const from = new Date(now); from.setDate(from.getDate() - 7); return { from, until: now }; }
    if (filters.period === 'month') { const from = new Date(now); from.setDate(from.getDate() - 30); return { from, until: now }; }
    return {};
  })();

  const { stats, queueBreakdown, myActiveConversations, queues, isLoading, error, refetch } = useDashboardData({
    dateRange: filters.dateRange,
    queueId: filters.queueId,
    agentId: filters.agentId,
  });
  // Instância única de useRealtimeDashboard (antecipada da Fase 5/etapa 46: o
  // sino da faixa do topo já precisa de unreadMessages real na Fase 2). KPIs
  // e "Agora" (Fase 5-6) reaproveitam este mesmo `realtime`, nunca uma 2ª sub.
  const realtime = useRealtimeDashboard({ queueId: filters.queueId, agentId: filters.agentId });
  // E31: fila/agente do filtro do topo propagados para a RPC dashboard_kpi —
  // antes o dropdown era cosmético para este card (achado A9). Para não-staff,
  // a RPC trava p_agent = auth.uid() no servidor (E33), independente do que
  // filters.agentId trouxer.
  const { data: kpi, isPending } = useDashboardKpi({ queueId: filters.queueId, agentId: filters.agentId, ...kpiPeriodDates });
  const { rows: queueHealthRows, busiestQueue } = useQueueHealth(queueBreakdown, queues);
  const { data: recentEvents } = useRecentConversationEvents(4);
  const { agents: leaderboardAgents, timeRange, setTimeRange } = useLeaderboard();
  // Instância única de useSLAMetrics('today') — só Equipe em Destaque consome
  // (etapa 68); "Agora" usa slaBreachedToday de useDashboardKpi (fallback já
  // documentado no ledger, useApplicableSLA/useSLACalculation são por-contato).
  const { data: slaMetrics } = useSLAMetrics('today');
  const slaRateByAgent = new Map((slaMetrics?.byAgent ?? []).map((a) => [a.agentId, a.overallRate]));
  const queryClient = useQueryClient();
  // Instância ÚNICA da personalização da Visão Geral: o painel "Personalizar"
  // e a seção de Gamificação leem/escrevem o MESMO estado. Duas instâncias
  // separadas fariam o toggle do painel não surtir efeito até recarregar.
  const widgetConfig = useDashboardWidgets();

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
          filters={tab === OVERVIEW_TAB ? (
            <DashboardFilters filters={filters} onFiltersChange={setFilters} onRefresh={handleRefresh} isRefreshing={isRefreshing} showTeamFilters={isStaff} />
          ) : null}
        />

        <Tabs data-testid="dash-tabs" value={tab} onValueChange={setTab}>
          <DashboardTabs tabs={visibleTabs} activeTab={tab} />

        <TabsContent value="overview" className="space-y-2.5 mt-2.5">
          {/* Shell da Visão Geral — placeholders com altura-alvo para o CP1 medir o ritmo vertical.
              Conteúdo real chega nas Fases 5-9. RealtimeMetricsPanel e ProgressiveDisclosureDashboard
              deixam de renderizar aqui (widgets level 3 + desafios voltam na Fase 9). */}
          <div data-testid="dash-banner">
            <SectionErrorBoundary sectionName="Saudação">
              <GreetingBanner personal={!isStaff} />
            </SectionErrorBoundary>
          </div>
          {/* Personalização da Visão Geral: monta o WidgetConfigSheet (antes
              existia o componente, mas nada o abria). Fica no topo da aba,
              disponível para staff e agente — o layout persiste por navegador. */}
          <div className="flex justify-end" data-testid="dash-personalizar">
            <SectionErrorBoundary sectionName="Personalizar widgets">
              <WidgetConfigSheet
                widgets={widgetConfig.widgets}
                isEditMode={widgetConfig.isEditMode}
                setIsEditMode={widgetConfig.setIsEditMode}
                onToggleVisibility={widgetConfig.toggleWidgetVisibility}
                onUpdateSize={widgetConfig.updateWidgetSize}
                onReorder={widgetConfig.reorderWidgets}
                onReset={widgetConfig.resetToDefaults}
              />
            </SectionErrorBoundary>
          </div>
          <DashboardZone id="numeros" title={filters.period && filters.period !== 'today' ? 'Números do período' : 'Números de hoje'}>
          <div data-testid="dash-kpis">
            {/* E34 (corrigido em auditoria 25/09/2026, achado Agente 3): Resolvidas
                Hoje / Tempo de Resposta / SLA vêm de dashboard_kpi (v_today/v_yesterday
                fixos no servidor) — o período do filtro acima não afeta esses cards.
                Isso NÃO se estende ao gráfico de volume (só recebe fila/agente, nunca
                recebeu período) nem ao card "Conversas Abertas" (vem de
                dashboard_contact_counts, que respeita p_since/p_until) — o texto antigo
                afirmava os dois incorretamente. Antes isso acontecia em silêncio
                (achado E34); agora avisa, só sobre o que de fato é fixo. */}
            <SectionErrorBoundary sectionName="Indicadores">
            <DashboardKpiRow stats={stats} realtime={realtime} kpi={kpi} isStaff={isStaff} myActiveConversations={myActiveConversations} isLoading={isPending} />
            </SectionErrorBoundary>
          </div>
          </DashboardZone>
          {isStaff && (
            <DashboardZone id="evolucao" title="Últimos 7 dias">
              <SectionErrorBoundary sectionName="KPIs dos últimos 7 dias">
                <DailyMetricsKpis />
              </SectionErrorBoundary>
            </DashboardZone>
          )}
          <DashboardZone id="operacao" title="Operação em tempo real">
          <div data-testid="dash-row2" className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1.9fr_1fr_1fr] gap-2.5">
            <SectionErrorBoundary sectionName="Gráfico de volume">
              <VolumeChart queueId={filters.queueId} agentId={filters.agentId} />
            </SectionErrorBoundary>
            <SectionErrorBoundary sectionName="Agora">
              <NowPanel
                realtime={realtime}
                pendingConversations={stats.pendingConversations}
                slaBreachedToday={kpi?.slaBreachedToday}
                busiestQueue={isStaff ? busiestQueue : null}
              />
            </SectionErrorBoundary>
            <SectionErrorBoundary sectionName="Metas diárias">
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
            </SectionErrorBoundary>
          </div>
          <div data-testid="dash-row3" className={isStaff ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[4fr_3fr_3fr] gap-2.5' : 'grid grid-cols-1 gap-2.5'}>
            {isStaff && (
              <SectionErrorBoundary sectionName="Saúde das filas">
                <QueueHealthTable rows={queueHealthRows} isConnected={realtime.isConnected} onSeeAll={() => goToTab('sla')} />
              </SectionErrorBoundary>
            )}
            <SectionErrorBoundary sectionName="Atividade recente">
              <RecentActivityCard items={recentEvents?.items ?? []} />
            </SectionErrorBoundary>
            {isStaff && (
              <SectionErrorBoundary sectionName="Equipe em destaque">
                <TeamHighlightCard
                  agents={leaderboardAgents}
                  timeRange={timeRange}
                  onTimeRangeChange={setTimeRange}
                  slaRateByAgent={slaRateByAgent}
                />
              </SectionErrorBoundary>
            )}
          </div>
          {isStaff && (
            <div data-testid="dash-row-saude" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[4fr_3fr_3fr] gap-2.5">
              <SystemHealthCard />
            </div>
          )}
          </DashboardZone>
          <DashboardZone id="engajamento" title="Engajamento e IA">
          <div data-testid="dash-row4" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[4fr_3fr_3fr] gap-2.5">
            <SectionErrorBoundary sectionName="Ferramentas de IA">
              <AIToolsCard onSeeAll={() => goToTab('ai')} />
            </SectionErrorBoundary>
            <SectionErrorBoundary sectionName="CSAT">
              <CsatCard period={csatPeriod} onPeriodChange={setCsatPeriod} />
            </SectionErrorBoundary>
            <SectionErrorBoundary sectionName="Tendência de sentimento">
              <SentimentTrendCard />
            </SectionErrorBoundary>
          </div>
          <div data-testid="dash-gamification">
            <SectionErrorBoundary sectionName="Gamificação">
              <GamificationSection stats={stats} isStaff={isStaff} visibleWidgets={widgetConfig.visibleWidgets} />
            </SectionErrorBoundary>
          </div>
          </DashboardZone>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-2.5">
          <SectionErrorBoundary sectionName="Previsão de demanda">
            <DemandPrediction />
          </SectionErrorBoundary>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionErrorBoundary sectionName="Mapa de calor de conversas">
              <ConversationHeatmap />
            </SectionErrorBoundary>
            <SectionErrorBoundary sectionName="Mapa de atividade">
              <ActivityHeatmap />
            </SectionErrorBoundary>
          </div>
        </TabsContent>

        <TabsContent value="goals" className="space-y-2.5">
          <SectionErrorBoundary sectionName="Metas">
            <GoalsDashboard onNavigateTab={goToTab} />
          </SectionErrorBoundary>
        </TabsContent>
        <TabsContent value="ai" className="space-y-2.5">
          <SectionErrorBoundary sectionName="Acesso rápido IA">
            <AIQuickAccess onNavigateTab={goToTab} />
          </SectionErrorBoundary>
        </TabsContent>
        <TabsContent value="sla">
          <SectionErrorBoundary sectionName="Métricas de SLA">
            <SLAMetricsDashboard />
          </SectionErrorBoundary>
        </TabsContent>
        <TabsContent value="team" className="space-y-2.5">
          <SectionErrorBoundary sectionName="Desempenho dos atendentes">
            <AgentPerformancePanel onNavigateTab={goToTab} />
          </SectionErrorBoundary>
        </TabsContent>
        <TabsContent value="satisfaction" className="space-y-2.5">
          <SectionErrorBoundary sectionName="Satisfação">
            <SatisfactionMetrics />
          </SectionErrorBoundary>
          <SectionErrorBoundary sectionName="Painel CSAT">
            <CSATDashboard />
          </SectionErrorBoundary>
        </TabsContent>
        <TabsContent value="sentiment" className="space-y-2.5">
          <SectionErrorBoundary sectionName="Análise de sentimento">
            <SentimentTrendChart onNavigateTab={goToTab} />
          </SectionErrorBoundary>
        </TabsContent>
        <TabsContent value="reports" className="space-y-2.5">
          <SectionErrorBoundary sectionName="Relatórios agendados">
            <ScheduledReportsManager />
          </SectionErrorBoundary>
        </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
