import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type KpiTone = 'blue' | 'green' | 'purple' | 'yellow' | 'red';

const TONE_CLASS: Record<KpiTone, string> = {
  blue: 'bg-kpi-blue text-kpi-blue-fg',
  green: 'bg-kpi-green text-kpi-green-fg',
  purple: 'bg-kpi-purple text-kpi-purple-fg',
  yellow: 'bg-kpi-yellow text-kpi-yellow-fg',
  red: 'bg-destructive/15 text-destructive',
};

export interface KpiCell {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  iconClassName?: string;
  tone?: KpiTone;
  sublabel?: ReactNode;
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
              'w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0',
              cell.iconClassName ?? (cell.tone ? TONE_CLASS[cell.tone] : 'bg-primary/15 text-primary')
            )}
          >
            <cell.icon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{cell.label}</p>
            <p className="text-[22px] font-bold tabular-nums leading-tight truncate">{cell.value}</p>
            {cell.sublabel && <p className="text-[11px] text-muted-foreground/70 truncate">{cell.sublabel}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
