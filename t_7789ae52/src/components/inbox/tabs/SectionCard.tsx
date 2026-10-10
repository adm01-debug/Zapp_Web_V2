import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KpiTone } from './KpiStrip';

const TONE_CLASS: Record<KpiTone, string> = {
  blue: 'bg-kpi-blue text-kpi-blue-fg',
  green: 'bg-kpi-green text-kpi-green-fg',
  purple: 'bg-kpi-purple text-kpi-purple-fg',
  yellow: 'bg-kpi-yellow text-kpi-yellow-fg',
  red: 'bg-destructive/15 text-destructive',
};

interface SectionCardProps {
  icon: LucideIcon;
  title: string;
  count?: number;
  action?: { label: string; onClick: () => void; variant?: 'link' | 'pill' };
  className?: string;
  children: React.ReactNode;
  tone?: KpiTone;
  subtitle?: string;
  headerRight?: ReactNode;
}

/** Card de seção reaproveitado nas abas CRM 360°, Arquivos, IA, Notas etc. (Apêndice B). */
export function SectionCard({ icon: Icon, title, count, action, className, children, tone, subtitle, headerRight }: SectionCardProps) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-4 flex flex-col gap-3', className)}>
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', tone ? TONE_CLASS[tone] : 'bg-primary/15 text-primary')}>
            <Icon className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold truncate">{title}</h3>
              {typeof count === 'number' && count > 0 && (
                <span className="text-xs text-muted-foreground shrink-0">({count})</span>
              )}
            </div>
            {subtitle && <p className="text-[13px] text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {headerRight}
          {action && (
            action.variant === 'pill' ? (
              <button
                type="button"
                onClick={action.onClick}
                className="h-7 px-3 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 transition-colors"
              >
                {action.label}
              </button>
            ) : (
              <button
                type="button"
                onClick={action.onClick}
                className="text-xs font-medium text-primary hover:underline"
              >
                {action.label}
              </button>
            )
          )}
        </div>
      </header>
      {children}
    </section>
  );
}
