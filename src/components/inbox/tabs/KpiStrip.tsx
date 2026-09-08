import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KpiCell {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  iconClassName?: string;
}

interface KpiStripProps {
  cells: KpiCell[];
  className?: string;
}

/** Faixa de KPIs (2.5/2.9/2.10) — N células com divisória, reaproveitada nas abas CRM/Tarefas/Histórico. */
export function KpiStrip({ cells, className }: KpiStripProps) {
  return (
    <div
      data-testid="kpi-strip"
      className={cn('rounded-xl border border-border bg-card grid divide-x divide-border/60 h-[84px]', className)}
      style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
    >
      {cells.map((cell, i) => (
        <div key={i} data-testid="kpi-cell" className="flex items-center gap-3 px-4 min-w-0">
          <span
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
              cell.iconClassName ?? 'bg-primary/15 text-primary'
            )}
          >
            <cell.icon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{cell.label}</p>
            <p className="text-lg font-bold tabular-nums leading-tight truncate">{cell.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
