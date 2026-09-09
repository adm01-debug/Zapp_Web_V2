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
    <dl
      data-testid="kpi-strip"
      className={cn(
        'grid min-h-[84px] overflow-hidden rounded-xl border border-border bg-border/60 gap-px',
        className,
      )}
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))' }}
    >
      {cells.map((cell, i) => (
        <div key={i} data-testid="kpi-cell" className="flex min-h-[84px] min-w-0 items-center gap-3 bg-card px-4 py-3">
          <span
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
              cell.iconClassName ?? 'bg-primary/15 text-primary'
            )}
          >
            <cell.icon className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground break-words">{cell.label}</dt>
            <dd className="text-lg font-bold tabular-nums leading-tight break-words">{cell.value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
