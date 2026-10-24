import { useMemo } from 'react';
import { Trophy, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DashboardKpiCard } from './overview/DashboardKpiCard';
import { ProgressBar } from './overview/DashboardCard';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Skeleton } from '@/components/ui/skeleton';
import { GoalsTable } from './goals/GoalsTable';
import { GoalsRail } from './goals/GoalsRail';
import { GoalsConfigDialog } from './GoalsConfigDialog';
import { CelebrationOverlay } from '@/components/effects/Confetti';
import { useGoalsDashboard, PERIOD_OPTIONS } from '@/hooks/analytics/useGoalsDashboard';
import { getGoalStatus } from './goals/goalsStatus';

interface GoalsDashboardProps {
  onNavigateTab?: (tab: string) => void;
}

const PERIOD_TITLE: Record<string, string> = {
  today: 'Metas do dia',
  week: 'Metas da semana',
  month: 'Metas do mês',
};

/** Faixa de datas do período selecionado, em pt-BR. */
function formatPeriodRange(period: string, from: Date, to: Date): string {
  switch (period) {
    case 'today': return format(from, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    case 'week': return `${format(from, 'dd MMM', { locale: ptBR })} – ${format(to, 'dd MMM', { locale: ptBR })}`;
    case 'month': return format(from, "MMMM 'de' yyyy", { locale: ptBR });
    default: return '';
  }
}

function GoalsLoadingSkeleton() {
  return (
    <div role="status" aria-label="Carregando metas" className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
            <Skeleton aria-hidden="true" className="h-4 w-24" />
            <Skeleton aria-hidden="true" className="h-7 w-16" />
            <Skeleton aria-hidden="true" className="h-2.5 w-full" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
        <Skeleton aria-hidden="true" className="h-5 w-40" />
        {[0, 1, 2].map((i) => (
          <Skeleton aria-hidden="true" key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export function GoalsDashboard({ onNavigateTab }: GoalsDashboardProps) {
  const {
    period, setPeriod, isLoading,
    configDialogOpen, setConfigDialogOpen,
    showCelebration, setShowCelebration, celebrationData,
    goals, overallProgress, completedGoals, dateRange,
  } = useGoalsDashboard();

  const { atRiskCount, inProgressCount, riskBars, progressBars, doneBars } = useMemo(() => {
    let atRisk = 0;
    let inProgress = 0;
    const risk: number[] = [];
    const prog: number[] = [];
    const done: number[] = [];
    for (const g of goals) {
      const percentage = g.target > 0 ? (g.current / g.target) * 100 : 0;
      if (g.current >= g.target) { done.push(percentage); continue; }
      const status = getGoalStatus(percentage);
      if (status.tone === 'destructive') { atRisk += 1; risk.push(percentage); }
      else { inProgress += 1; prog.push(percentage); }
    }
    // Mini-barras = % de progresso real de cada meta do grupo (sem série inventada).
    return {
      atRiskCount: atRisk, inProgressCount: inProgress,
      riskBars: risk.length ? risk : null, progressBars: prog.length ? prog : null, doneBars: done.length ? done : null,
    };
  }, [goals]);

  const activeGoalsCount = goals.length - completedGoals;
  const rangeLabel = formatPeriodRange(period, dateRange.from, dateRange.to);
  const tableTitle = PERIOD_TITLE[period] ?? PERIOD_TITLE.today;

  return (
    <div className="space-y-4">
      <CelebrationOverlay isActive={showCelebration} title={celebrationData.title} subtitle={celebrationData.subtitle} emoji={celebrationData.emoji} onComplete={() => setShowCelebration(false)} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] font-medium text-muted-foreground tabular-nums">{rangeLabel}</p>
        <ToggleGroup
          type="single"
          value={period}
          onValueChange={(value) => { if (value) setPeriod(value); }}
          aria-label="Período das metas"
          className="h-10 shrink-0 self-start sm:self-auto rounded-lg bg-muted/40 border border-border/50 p-1"
        >
          {PERIOD_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              className="h-8 px-3.5 rounded-md text-[13px] font-medium text-foreground-secondary data-[state=on]:bg-primary data-[state=on]:text-white data-[state=on]:font-semibold"
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {isLoading ? (
        <GoalsLoadingSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <DashboardKpiCard
              index={0} size="hero" chart="none"
              label="Progresso Geral"
              value={`${overallProgress}%`}
              delta={null}
              tile="blue" icon={Trophy} bars={null} barsColor="blue"
              footer={(
                <div className="mt-1">
                  <ProgressBar value={overallProgress} tone="info" height={6} />
                  <p className="text-xs text-muted-foreground mt-2">{activeGoalsCount} de {goals.length} metas em andamento</p>
                </div>
              )}
            />
            <DashboardKpiCard
              index={1} size="hero"
              label="Metas Concluídas"
              value={String(completedGoals)}
              delta={{ text: `de ${goals.length} metas`, tone: 'muted' }}
              tile="green" icon={CheckCircle2} bars={doneBars} barsColor="green"
            />
            <DashboardKpiCard
              index={2} size="hero"
              label="Em Andamento"
              value={String(inProgressCount)}
              delta={{ text: 'metas ativas', tone: 'muted' }}
              tile="blue" icon={Clock} bars={progressBars} barsColor="blue"
            />
            <DashboardKpiCard
              index={3} size="hero"
              label="Em Risco"
              value={String(atRiskCount)}
              delta={{ text: 'precisa de atenção', tone: 'muted' }}
              tile="red" icon={AlertTriangle} bars={riskBars} barsColor="red"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
            <GoalsTable goals={goals} title={tableTitle} onConfigure={() => setConfigDialogOpen(true)} />
            <GoalsRail onNavigateTab={onNavigateTab} onConfigure={() => setConfigDialogOpen(true)} />
          </div>
        </>
      )}

      <GoalsConfigDialog open={configDialogOpen} onOpenChange={setConfigDialogOpen} />
    </div>
  );
}
