import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionCardProps {
  icon: LucideIcon;
  title: string;
  count?: number;
  action?: { label: string; onClick: () => void };
  className?: string;
  children: React.ReactNode;
}

/** Card de seção reaproveitado nas abas CRM 360°, Arquivos, IA, Notas etc. (Apêndice B). */
export function SectionCard({ icon: Icon, title, count, action, className, children }: SectionCardProps) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-4 flex flex-col gap-3', className)}>
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4" />
          </span>
          <h3 className="text-sm font-semibold truncate">{title}</h3>
          {typeof count === 'number' && count > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">({count})</span>
          )}
        </div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="text-xs font-medium text-primary hover:underline shrink-0"
          >
            {action.label}
          </button>
        )}
      </header>
      {children}
    </section>
  );
}
