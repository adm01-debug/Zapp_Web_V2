import { useMemo, useState } from 'react';
import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
import { Target, MoreHorizontal } from 'lucide-react';
import { DashboardCard, SectionHeader, Pill } from '../overview/DashboardCard';
import type { Goal } from '@/hooks/analytics/useGoalsDashboard';
import { getGoalStatus, getPriorityLabel } from './goalsStatus';

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
    <DashboardCard testid="goals-table-card" variant="comfortable">
      <SectionHeader
        icon={Target}
        title="Metas do dia"
        subtitle="Acompanhe o progresso das suas metas ativas."
        tileSize={44}
        size="lg"
        right={(
          <LayoutGroup id="goals-subtabs">
            <div className="h-10 rounded-lg bg-muted/40 border border-border/50 p-1 flex items-center gap-1 shrink-0">
              {tabs.map((t) => {
                const isActive = subTab === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setSubTab(t.value)}
                    className="relative isolate h-8 px-3.5 rounded-md text-[13px] font-medium text-foreground-secondary data-[state=active]:text-white data-[state=active]:font-semibold transition-colors"
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
                <th className="pb-3 text-[12px] font-semibold text-muted-foreground">Meta</th>
                <th className="pb-3 text-[12px] font-semibold text-muted-foreground">Tipo</th>
                <th className="pb-3 text-[12px] font-semibold text-muted-foreground">Progresso</th>
                <th className="pb-3 text-[12px] font-semibold text-muted-foreground">Atual / Meta</th>
                <th className="pb-3 text-[12px] font-semibold text-muted-foreground">Restante</th>
                <th className="pb-3 text-[12px] font-semibold text-muted-foreground">Status</th>
                <th className="pb-3 text-[12px] font-semibold text-muted-foreground text-right pr-1">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ goal, percentage, status, completed }) => {
                const Icon = goal.icon;
                const remaining = Math.max(goal.target - goal.current, 0);
                return (
                  <tr key={goal.id} className="h-14 border-t border-border/50">
                    <td className="pr-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-[10px] bg-primary/15 flex items-center justify-center shrink-0">
                          <Icon className="w-[18px] h-[18px] text-primary-glow" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-foreground truncate">{goal.label}</p>
                          <p className="text-[12px] text-muted-foreground truncate">{goal.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="pr-2">
                      <Pill label={getPriorityLabel(goal.priority)} tone="muted" />
                    </td>
                    <td className="pr-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-[120px] h-1.5 rounded-full bg-muted/50 overflow-hidden shrink-0">
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
                      <Pill label={status.label} tone={status.tone === 'success' ? 'success' : status.tone === 'primary' ? 'info' : status.tone === 'warning' ? 'warning' : 'danger'} />
                    </td>
                    <td className="text-right">
                      <button type="button" onClick={onConfigure} title="Configurar meta" className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
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
