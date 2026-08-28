import { ShieldAlert, ShieldCheck, ShieldX, ShieldQuestion } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useQuarantineForMessage } from '@/hooks/integrations/useQuarantineForMessage';

interface QuarantineBadgeProps {
  messageId: string | null | undefined;
  className?: string;
}

const STYLE_BY_DECISION: Record<string, { icon: typeof ShieldAlert; label: string; tone: string }> = {
  pending: { icon: ShieldAlert, label: 'Mídia em quarentena (análise pendente)', tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/30' },
  deleted: { icon: ShieldX, label: 'Ameaça confirmada — mídia bloqueada', tone: 'bg-destructive/15 text-destructive ring-destructive/30' },
  allowed: { icon: ShieldCheck, label: 'Liberada após revisão', tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30' },
  whitelisted: { icon: ShieldCheck, label: 'Whitelisted — sempre segura', tone: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-sky-500/30' },
};

/**
 * Renders an inline shield badge when the message has an entry in the
 * external ClamAV quarantine table. Hidden otherwise.
 */
export function QuarantineBadge({ messageId, className }: QuarantineBadgeProps) {
  const record = useQuarantineForMessage(messageId);
  if (!record) return null;

  const decision = (record.decision ?? 'pending').toString();
  const config = STYLE_BY_DECISION[decision] ?? { icon: ShieldQuestion, label: `Quarentena: ${decision}`, tone: 'bg-muted text-muted-foreground ring-border' };
  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          aria-label={config.label}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
            config.tone,
            className,
          )}
        >
          <Icon className="h-3 w-3" aria-hidden />
          {record.threat_level ? <span className="uppercase tracking-wide">{record.threat_level}</span> : null}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <p className="font-medium">{config.label}</p>
        {record.threat_name ? <p className="text-muted-foreground">Ameaça: {record.threat_name}</p> : null}
        {record.scan_engine ? <p className="text-muted-foreground">Engine: {record.scan_engine}</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}
