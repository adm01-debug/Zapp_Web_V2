import { useMemo } from 'react';
import { Trophy, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { DashboardKpiCard } from './overview/DashboardKpiCard';
import { ProgressBar } from './overview/DashboardCard';
import { GoalsTable } from './goals/GoalsTable';
import { GoalsRail } from './goals/GoalsRail';
import { GoalsConfigDialog } from './GoalsConfigDialog';
import { CelebrationOverlay } from '@/components/effects/Confetti';
import { useGoalsDashboard } from '@/hooks/analytics/useGoalsDashboard';
import { getGoalStatus } from './goals/goalsStatus';

interface GoalsDashboardProps {
  onNavigateTab?: (tab: string) => void;
}

export function GoalsDashboard({ onNavigateTab }: GoalsDashboardProps) {
  const {
    configDialogOpen, setConfigDialogOpen,
    showCelebration, setShowCelebration, celebrationData,
    goals, overallProgress, completedGoals,
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

  return (
    <div className="space-y-4">
      <CelebrationOverlay isActive={showCelebration} title={celebrationData.title} subtitle={celebrationData.subtitle} emoji={celebrationData.emoji} onComplete={() => setShowCelebration(false)} />

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
              <p className="text-[12px] text-muted-foreground mt-2">{activeGoalsCount} de {goals.length} metas em andamento</p>
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
        <GoalsTable goals={goals} onConfigure={() => setConfigDialogOpen(true)} />
        <GoalsRail onNavigateTab={onNavigateTab} onConfigure={() => setConfigDialogOpen(true)} />
      </div>

      <GoalsConfigDialog open={configDialogOpen} onOpenChange={setConfigDialogOpen} />
    </div>
  );
}
