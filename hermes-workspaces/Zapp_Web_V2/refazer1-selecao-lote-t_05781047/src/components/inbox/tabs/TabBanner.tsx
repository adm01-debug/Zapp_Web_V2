import { useState, type ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TabBannerProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  /** Se definido, mostra o X e persiste o fechamento por navegador em localStorage. */
  dismissKey?: string;
  testId?: string;
  className?: string;
  children?: ReactNode;
  /** Tile do ícone; default = bg-primary (Notas/Tarefas). Chat/IA usa bg-kpi-purple. */
  iconClassName?: string;
}

/** Banner de destaque reaproveitado nas abas Chat, Notas e Tarefas (2.7/2.8/2.9). */
export function TabBanner({ icon: Icon, title, description, action, dismissKey, testId, className, children, iconClassName }: TabBannerProps) {
  const [dismissed, setDismissed] = useState(
    () => !!dismissKey && typeof window !== 'undefined' && window.localStorage.getItem(dismissKey) === '1'
  );

  if (dismissed) return null;

  return (
    <div
      data-testid={testId}
      className={cn('rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 flex items-center gap-3 h-14', className)}
    >
      <span className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', iconClassName || 'bg-primary text-white')}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-[13px] text-muted-foreground truncate">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {children}
        {action && (
          <Button
            size="sm"
            className="h-9 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        )}
        {dismissKey && (
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => { window.localStorage.setItem(dismissKey, '1'); setDismissed(true); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
