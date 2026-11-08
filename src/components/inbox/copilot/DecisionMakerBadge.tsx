import { UserCheck, Users, Eye, ArrowRight, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLE_CONFIG: Record<string, { label: string; icon: typeof UserCheck; className: string }> = {
  buyer:        { label: 'Comprador',    icon: UserCheck, className: 'bg-primary/10 text-primary' },
  user:         { label: 'Usuário',      icon: Eye,       className: 'bg-muted/60 text-muted-foreground' },
  approver:     { label: 'Aprovador',    icon: UserCheck, className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  intermediary: { label: 'Intermediário',icon: ArrowRight, className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  unknown:      { label: 'Indefinido',   icon: HelpCircle, className: 'bg-muted/40 text-muted-foreground' },
};

interface DecisionMakerBadgeProps {
  role: string | null;
  stakeholders?: Array<{ name: string; role?: string }>;
  className?: string;
}

export function DecisionMakerBadge({ role, stakeholders = [], className }: DecisionMakerBadgeProps) {
  if (!role && stakeholders.length === 0) return null;

  const cfg = role ? (ROLE_CONFIG[role] ?? ROLE_CONFIG.unknown) : null;
  const Icon = cfg?.icon ?? HelpCircle;

  return (
    <div className={cn('space-y-1.5', className)}>
      {cfg && (
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full', cfg.className)}>
            <Icon className="w-3 h-3" />
            {cfg.label}
          </span>
        </div>
      )}
      {stakeholders.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {stakeholders.map((s, i) => (
            <span
              key={i}
              title={s.role}
              className="inline-flex items-center gap-1 text-[11px] bg-muted/40 text-muted-foreground px-2 py-0.5 rounded-full"
            >
              <Users className="w-2.5 h-2.5" />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
