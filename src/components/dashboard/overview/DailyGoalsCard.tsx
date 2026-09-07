import { useEffect } from 'react';
import { Target, Check } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { DashboardCard, SectionHeader, VerTodasButton } from './DashboardCard';
import { useGoalsDashboard } from '@/hooks/analytics/useGoalsDashboard';
import { GoalsConfigDialog } from '../GoalsConfigDialog';
import { cn } from '@/lib/utils';

interface DailyGoalsStats {
  totalConversations: number;
  resolvedToday: number;
  avgResponseTime: number | null;
  pendingConversations: number;
}

interface DailyGoalsCardProps {
  onSeeAll: () => void;
  stats: DailyGoalsStats;
}

/** Mesmo cálculo do ChallengesWidget (DashboardWidgetRenderer.tsx) — fallback quando não há metas configuradas. */
function buildFallbackChallenges(stats: DailyGoalsStats) {
  return [
    { label: 'Responder 10 mensagens', done: stats.totalConversations >= 10 },
    { label: 'Resolver 5 conversas', done: stats.resolvedToday >= 5 },
    { label: 'Tempo médio < 3min', done: stats.avgResponseTime !== null && stats.avgResponseTime < 180 },
    { label: 'Sem pendências às 18h', done: stats.pendingConversations === 0 },
  ];
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DailyGoalsCard({ onSeeAll, stats }: DailyGoalsCardProps) {
  const { goals, overallProgress, completedGoals, period, setPeriod, configDialogOpen, setConfigDialogOpen } = useGoalsDashboard();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (period !== 'today') setPeriod('today');
  }, [period, setPeriod]);

  const hasGoals = goals.length > 0;
  const fallback = buildFallbackChallenges(stats);
  const hasAnyRealActivity = stats.totalConversations > 0 || stats.resolvedToday > 0 || stats.pendingConversations > 0 || stats.avgResponseTime !== null;

  const items = hasGoals
    ? goals.slice(0, 4).map((g) => ({ label: g.label, done: g.current >= g.target }))
    : fallback;
  const title = hasGoals ? 'Metas do Dia' : 'Desafios do Dia';
  const done = hasGoals ? completedGoals : items.filter((i) => i.done).length;
  const total = items.length;
  const pct = hasGoals ? Math.round(overallProgress) : total ? Math.round((done / total) * 100) : 0;

  const message = pct >= 100 ? 'Metas concluídas!' : pct >= 50 ? 'Continue assim!' : 'Vamos acelerar';
  const submessage = pct >= 100 ? 'Você bateu todas as metas de hoje.' : pct >= 50 ? 'Você está no caminho certo.' : 'Dá pra acelerar o ritmo hoje.';

  const showEmptyState = !hasGoals && !hasAnyRealActivity;

  return (
    <DashboardCard testid="goals-card" className="min-h-[259px]">
      <SectionHeader icon={Target} title={title} tileSize={44} right={<VerTodasButton onClick={onSeeAll} />} />
      {showEmptyState ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 min-h-[160px]">
          <p className="text-[12px] text-muted-foreground">Nenhuma meta configurada ainda</p>
          <button
            type="button"
            onClick={() => setConfigDialogOpen(true)}
            className="h-[26px] px-2.5 rounded-lg bg-muted/40 border border-border/60 text-[11px] font-medium text-foreground-secondary hover:bg-muted/60"
          >
            Configurar metas
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[100px_1fr] gap-2.5 items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div data-testid="goals-donut" className="relative w-[100px] h-[100px]">
              <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
                <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="hsl(var(--muted) / .4)" strokeWidth="8" />
                <motion.circle
                  cx="50" cy="50" r={RADIUS} fill="none" stroke="hsl(var(--dash-green))" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  initial={{ strokeDashoffset: CIRCUMFERENCE }}
                  animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - pct / 100) }}
                  transition={reducedMotion ? { duration: 0 } : { duration: 0.6 }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-[16px] font-bold text-foreground leading-none">{done}/{total}</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">{pct}%</p>
              </div>
            </div>
            <p className="text-[12px] font-semibold text-foreground text-center">{message}</p>
            <p className="text-[11px] text-foreground-secondary text-center leading-snug">{submessage}</p>
          </div>
          <div className="space-y-1.5">
            {items.map((item, i) => (
              <div key={i} className="h-[30px] rounded-lg bg-muted/40 px-2.5 flex items-center gap-2">
                <span className={cn('w-4 h-4 rounded shrink-0 flex items-center justify-center', item.done ? 'bg-dash-green' : 'border border-border')}>
                  {item.done && <Check className="w-3 h-3 text-white" />}
                </span>
                <span className={cn('text-[11px] font-medium truncate', item.done ? 'text-foreground' : 'text-foreground-secondary')}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <GoalsConfigDialog open={configDialogOpen} onOpenChange={setConfigDialogOpen} />
    </DashboardCard>
  );
}
