import { useMemo, useState } from 'react';
import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
import { Target } from 'lucide-react';
import { DashboardCard, SectionHeader } from '../overview/DashboardCard';
import type { Goal } from '@/hooks/analytics/useGoalsDashboard';
import { getGoalStatus, getPriorityLabel, getGoalTileClass, GOAL_STATUS_BADGE_CLASS } from './goalsStatus';

type SubTab = 'active' | 'completed' | 'all';

interface GoalsTableProps {
  goals: Goal[];
  onConfigure: () => void;
}

export function GoalsTable({ goals, onConfigure }: GoalsTableProps) {
  const [subTab, setSubTab] = useState<SubTab>('active');
  const reducedMotion = useReducedMotion();

  const rows = useMemo(() => goals.map((g) => {
    const percentage = g.target > 0 ? Math.min(Math.round((g.current / g.target) * 100), 100) : 0;
    return { goal: g, percentage, status: getGoalStatus(percentage), completed: g.current >= g.target };
  }), [goals]);

  const activeCount = rows.filter((r) => !r.completed).length;
  const completedCount = rows.filter((r) => r.completed).length;

  const visibleRows = subTab === 'active' ? rows.filter((r) => !r.completed)
    : subTab === 'completed' ? rows.filter((r) => r.completed)
    : rows;

  const tabs: { value: SubTab; label: string; count: number }[] = [
    { value: 'active', label: 'Ativas', count: activeCount },
    { value: 'completed', label: 'Concluídas', count: completedCount },
    { value: 'all', label: 'Todas', count: rows.length },
  ];

  return (
    <DashboardCard testid="goals-table-card">
      <SectionHeader
        icon={Target}
        title="Metas do dia"
        subtitle="Acompanhe o progresso das suas metas ativas"
        tileSize={44}
        right={(
          <LayoutGroup id="goals-subtabs">
            <div className="h-8 rounded-lg bg-muted/40 border border-border/50 p-0.5 flex items-center gap-0.5 shrink-0">
              {tabs.map((t) => {
                const isActive = subTab === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setSubTab(t.value)}
                    className="relative isolate h-7 px-2.5 rounded-md text-[12px] font-medium text-foreground-secondary data-[state=active]:text-white data-[state=active]:font-semibold transition-colors"
                    data-state={isActive ? 'active' : 'inactive'}
                  >
                    {isActive && (
                      <motion.span
                        layoutId={reducedMotion ? undefined : 'goals-subtab-pill'}
                        className="absolute inset-0 rounded-md bg-primary -z-10"
                        transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                    {t.label} ({t.count})
                  </button>
                );
              })}
            </div>
          </LayoutGroup>
        )}
      />

      {rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-10 text-center">
          <Target className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-[13px] font-medium text-foreground">Nenhuma meta ativa</p>
          <button
            type="button"
            onClick={onConfigure}
            className="h-[26px] px-2.5 rounded-lg bg-muted/40 border border-border/60 text-[11px] font-medium text-foreground-secondary hover:bg-muted/60"
          >
            Configurar metas
          </button>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1 py-10 text-center">
          <p className="text-[12px] text-muted-foreground">Nenhuma meta nesta categoria</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-auto w-full text-[13px]">
            <thead>
              <tr className="text-left">
                <th className="pb-2 text-[12px] font-semibold text-muted-foreground">Meta</th>
                <th className="pb-2 text-[12px] font-semibold text-muted-foreground">Tipo</th>
                <th className="pb-2 text-[12px] font-semibold text-muted-foreground">Progresso</th>
                <th className="pb-2 text-[12px] font-semibold text-muted-foreground">Atual / Meta</th>
                <th className="pb-2 text-[12px] font-semibold text-muted-foreground">Restante</th>
                <th className="pb-2 text-[12px] font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ goal, percentage, status, completed }) => {
                const Icon = goal.icon;
                const remaining = Math.max(goal.target - goal.current, 0);
                return (
                  <tr key={goal.id} className="h-12 border-t border-border/60">
                    <td className="pr-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-[34px] h-[34px] rounded-[10px] flex items-center justify-center shrink-0 ${getGoalTileClass(goal.id)}`}>
                          <Icon className="w-4 h-4 text-white/90" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-foreground truncate">{goal.label}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{goal.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="pr-2">
                      <span className="h-[22px] px-2 rounded-md text-[11px] font-medium bg-muted/50 text-foreground-secondary border border-border/60 inline-flex items-center">
                        {getPriorityLabel(goal.priority)}
                      </span>
                    </td>
                    <td className="pr-2">
                      <div className="flex items-center gap-2">
                        <div className="w-[130px] h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
                          <div className={`h-full rounded-full ${status.tone === 'success' ? 'bg-success' : status.tone === 'primary' ? 'bg-primary' : status.tone === 'warning' ? 'bg-warning' : 'bg-destructive'}`} style={{ width: `${percentage}%` }} />
                        </div>
                        <span className="text-[12px] font-medium text-foreground tabular-nums">{percentage}%</span>
                      </div>
                    </td>
                    <td className="pr-2 text-foreground-secondary tabular-nums">
                      {goal.current.toLocaleString('pt-BR')} / {goal.target.toLocaleString('pt-BR')} {goal.unit}
                    </td>
                    <td className="pr-2 text-foreground-secondary tabular-nums">
                      {completed ? '—' : `${remaining.toLocaleString('pt-BR')} ${goal.unit}`}
                    </td>
                    <td>
                      <span className={`h-[22px] px-2 rounded-md text-[11px] font-semibold border inline-flex items-center ${GOAL_STATUS_BADGE_CLASS[status.tone]}`}>
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardCard>
  );
}
