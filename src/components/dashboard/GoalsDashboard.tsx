import { useMemo } from 'react';
import { Trophy, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { DashboardKpiCard } from './overview/DashboardKpiCard';
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

  const { atRiskCount, inProgressCount } = useMemo(() => {
    let atRisk = 0;
    let inProgress = 0;
    for (const g of goals) {
      if (g.current >= g.target) continue;
      const percentage = g.target > 0 ? (g.current / g.target) * 100 : 0;
      const status = getGoalStatus(percentage);
      if (status.tone === 'destructive') atRisk += 1;
      else inProgress += 1;
    }
    return { atRiskCount: atRisk, inProgressCount: inProgress };
  }, [goals]);

  const activeGoalsCount = goals.length - completedGoals;

  return (
    <div className="space-y-2.5">
      <CelebrationOverlay isActive={showCelebration} title={celebrationData.title} subtitle={celebrationData.subtitle} emoji={celebrationData.emoji} onComplete={() => setShowCelebration(false)} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
        <DashboardKpiCard
          index={0}
          label="Progresso Geral"
          value={`${overallProgress}%`}
          delta={null}
          tile="amber"
          icon={Trophy}
          bars={null}
          barsColor="amber"
          size="tall"
          footer={(
            <div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${overallProgress}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{activeGoalsCount} de {goals.length} metas em andamento</p>
            </div>
          )}
        />
        <DashboardKpiCard
          index={1}
          label="Metas Concluídas"
          value={String(completedGoals)}
          delta={{ text: `de ${goals.length} metas`, tone: 'muted' }}
          tile="green"
          icon={CheckCircle2}
          bars={null}
          barsColor="green"
        />
        <DashboardKpiCard
          index={2}
          label="Em Andamento"
          value={String(inProgressCount)}
          delta={{ text: 'metas ativas', tone: 'muted' }}
          tile="blue"
          icon={Clock}
          bars={null}
          barsColor="blue"
        />
        <DashboardKpiCard
          index={3}
          label="Em Risco"
          value={String(atRiskCount)}
          delta={{ text: 'precisa de atenção', tone: 'muted' }}
          tile="red"
          icon={AlertTriangle}
          bars={null}
          barsColor="red"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-2.5">
        <GoalsTable goals={goals} onConfigure={() => setConfigDialogOpen(true)} />
        <GoalsRail onNavigateTab={onNavigateTab} onConfigure={() => setConfigDialogOpen(true)} />
      </div>

      <GoalsConfigDialog open={configDialogOpen} onOpenChange={setConfigDialogOpen} />
    </div>
  );
}
