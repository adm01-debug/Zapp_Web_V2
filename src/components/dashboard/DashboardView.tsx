import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from '@/components/ui/motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp, BarChart3, Target, Clock, Brain, Award, Heart, Smile, FileText,
} from 'lucide-react';
import { AnimatedBadge, LevelProgress } from './GamificationEffects';
import { FloatingParticles } from './FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { SLAMetricsDashboard } from './SLAMetricsDashboard';
import { AIQuickAccess } from './AIQuickAccess';
import { CSATDashboard } from '@/components/csat/CSATDashboard';
import { GoalsDashboard } from './GoalsDashboard';
import { DemandPrediction } from './DemandPrediction';
import { ActivityHeatmap } from './ActivityHeatmap';
import ConversationHeatmap from './ConversationHeatmap';
import { RealtimeMetricsPanel } from './RealtimeMetricsPanel';
import { AgentPerformancePanel } from './AgentPerformancePanel';
import { SatisfactionMetrics } from './SatisfactionMetrics';
import { SentimentTrendChart } from './SentimentTrendChart';
import { ScheduledReportsManager } from './ScheduledReportsManager';
import { useDashboardData } from '@/hooks/analytics/useDashboardData';
import { useAuth } from '@/hooks/auth/useAuth';
import { useDashboardWidgets, DashboardWidget } from '@/hooks/analytics/useDashboardWidgets';
import { ProgressiveDisclosureDashboard } from './ProgressiveDisclosureDashboard';
import { DashboardFilters, DashboardFiltersState, getDefaultFilters } from './DashboardFilters';
import { ParallaxContainer } from '@/components/effects/ParallaxContainer';
import { DashboardWidgetRenderer } from './DashboardWidgetRenderer';

export function DashboardView() {
  const [filters, setFilters] = useState<DashboardFiltersState>(getDefaultFilters());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { profile } = useAuth();

  const hour = new Date().getHours();
  const greetingText = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const userName = profile?.name?.split(' ')[0] || '';
  const greeting = userName ? `${greetingText}, ${userName}! 👋` : `${greetingText}! 👋`;

  const { stats, isLoading, refetch } = useDashboardData({
    dateRange: filters.dateRange,
    queueId: filters.queueId,
    agentId: filters.agentId,
  });
  const {
    level1Widgets, level2Widgets, level3Widgets,
  } = useDashboardWidgets();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  if (isLoading || !stats) {
    return (
      <div className="space-y-6 relative bg-background w-full min-w-0">
        <AuroraBorealis />
        <FloatingParticles />
        <div className="space-y-6 relative z-10">
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-64 lg:col-span-2" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  const renderWidget = (widget: DashboardWidget) => (
    <DashboardWidgetRenderer widget={widget} stats={stats} />
  );

  return (
    <div className="space-y-6 relative bg-background w-full min-w-0">
      <AuroraBorealis />
      <FloatingParticles />

      <ParallaxContainer speed={0.3} direction="up" className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -left-24 w-64 h-64 bg-primary/8 rounded-full blur-3xl" />
      </ParallaxContainer>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.6, delay: 0.2, type: 'spring', stiffness: 200 }}
              className="w-12 h-12 rounded-xl flex items-center justify-center relative overflow-hidden glow-gradient-pulse"
              style={{ background: 'var(--gradient-primary)' }}
              whileHover={{ scale: 1.05, rotate: 5 }}
            >
              <TrendingUp className="w-6 h-6 text-primary-foreground relative z-10" />
            </motion.div>
            <div>
              <motion.h1 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground neon-underline">
                {greeting}
              </motion.h1>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.4 }} className="text-muted-foreground text-sm">
                Visão geral do atendimento em tempo real
              </motion.p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AnimatedBadge value="1.250" label="XP" variant="xp" size="md" />
            <AnimatedBadge value="89" variant="coins" size="md" />
            <AnimatedBadge value="7" variant="streak" size="md" />
          </div>
        </div>
        <div className="mt-4">
          <LevelProgress currentXP={1250} requiredXP={2000} level={12} />
        </div>
      </motion.div>

      <div className="relative z-10 border-t border-border/20" />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }} className="relative z-10">
        <DashboardFilters filters={filters} onFiltersChange={setFilters} onRefresh={handleRefresh} isRefreshing={isRefreshing} />
      </motion.div>

      <Tabs defaultValue="overview" className="relative z-10">
        <TabsList className="mb-4 bg-muted/50 border border-border/30 flex-wrap">
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

        <TabsContent value="overview" className="space-y-6">
          <RealtimeMetricsPanel />
          <ProgressiveDisclosureDashboard
            level1Widgets={level1Widgets}
            level2Widgets={level2Widgets}
            level3Widgets={level3Widgets}
            renderWidget={renderWidget}
          />
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
  );
}
