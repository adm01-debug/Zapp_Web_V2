import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp, BarChart3, Target, Clock, Brain, Award, Heart, Smile, FileText,
} from 'lucide-react';
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
import { DashboardFilters, DashboardFiltersState, getDefaultFilters } from './DashboardFilters';
import { OverviewSkeleton } from './overview/OverviewSkeleton';

const OVERVIEW_TAB = 'overview';

export function DashboardView() {
  const [tab, setTab] = useState(OVERVIEW_TAB);
  const [filters, setFilters] = useState<DashboardFiltersState>(getDefaultFilters());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { stats, isLoading, refetch } = useDashboardData({
    dateRange: filters.dateRange,
    queueId: filters.queueId,
    agentId: filters.agentId,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  if (isLoading || !stats) {
    return <OverviewSkeleton />;
  }

  return (
    <div className="w-full min-w-0">
      {/* Faixa do topo (sino + usuário) — componente real chega na Fase 2.
          Sem gap explícito para o header abaixo: a referência mede a faixa
          e o header card como adjacentes (ritmo vertical medido no CP1). */}
      <div data-testid="dash-topbar" className="min-h-7" />

      <div className="space-y-2.5">
        {/* Header card (tile + título + filtros) — layout definitivo chega na Fase 2;
            filtros já funcionais para não regredir período/fila/agente/refresh. */}
        <div data-testid="dash-header" className="min-h-[70px] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-foreground">Dashboard</h1>
            <p className="text-[13px] text-foreground-secondary mt-1">Visão geral do atendimento em tempo real</p>
          </div>
          <DashboardFilters filters={filters} onFiltersChange={setFilters} onRefresh={handleRefresh} isRefreshing={isRefreshing} />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="dash-tabs" className="mb-0 bg-muted/50 border border-border/30 flex-wrap">
          <TabsTrigger value="overview" className="flex items-center gap-2"><TrendingUp className="w-4 h-4" />Visão Geral</TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2"><BarChart3 className="w-4 h-4" />Analytics</TabsTrigger>
          <TabsTrigger value="goals" className="flex items-center gap-2"><Target className="w-4 h-4" />Metas</TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-2"><Brain className="w-4 h-4" />Inteligência Artificial</TabsTrigger>
          <TabsTrigger value="sla" className="flex items-center gap-2"><Clock className="w-4 h-4" />Métricas SLA</TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-2"><Award className="w-4 h-4" />Equipe</TabsTrigger>
          <TabsTrigger value="satisfaction" className="flex items-center gap-2"><Heart className="w-4 h-4" />Satisfação</TabsTrigger>
          <TabsTrigger value="sentiment" className="flex items-center gap-2"><Smile className="w-4 h-4" />Sentimento</TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-2"><FileText className="w-4 h-4" />Relatórios</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-2.5 mt-2.5">
          {/* Shell da Visão Geral — placeholders com altura-alvo para o CP1 medir o ritmo vertical.
              Conteúdo real chega nas Fases 4-9. RealtimeMetricsPanel e ProgressiveDisclosureDashboard
              deixam de renderizar aqui (widgets level 3 + desafios voltam na Fase 9). */}
          <div data-testid="dash-banner" className="min-h-[73px]" />
          <div data-testid="dash-kpis" className="min-h-[95px]" />
          <div data-testid="dash-row2" className="min-h-[259px]" />
          <div data-testid="dash-row3" className="min-h-[220px]" />
          <div data-testid="dash-row4" className="min-h-[173px]" />
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
