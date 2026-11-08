import { Lightbulb, AlertTriangle, Info, PartyPopper } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { CopilotInsight } from '@/hooks/chat/useCopilotSession';

const INSIGHT_CONFIG = {
  suggestion:  { icon: Lightbulb,    className: 'bg-primary/10 border-primary/30 text-primary' },
  warning:     { icon: AlertTriangle, className: 'bg-warning/10 border-warning/30 text-warning' },
  info:        { icon: Info,          className: 'bg-muted/40 border-border text-muted-foreground' },
  celebration: { icon: PartyPopper,   className: 'bg-success/10 border-success/30 text-success' },
} as const;

interface InsightCardProps {
  insight: CopilotInsight;
  isLatest?: boolean;
  className?: string;
}

export function InsightCard({ insight, isLatest = false, className }: InsightCardProps) {
  const cfg = INSIGHT_CONFIG[insight.insight_type] ?? INSIGHT_CONFIG.info;
  const Icon = cfg.icon;
  const ago = formatDistanceToNow(new Date(insight.created_at), { addSuffix: true, locale: ptBR });

  return (
    <div
      className={cn(
        'flex gap-3 rounded-xl border p-3 text-sm transition-all',
        cfg.className,
        isLatest && 'ring-1 ring-inset ring-current/30',
        className,
      )}
    >
      <span className="mt-0.5 shrink-0">
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="leading-snug">{insight.content}</p>
        <p className="text-[11px] opacity-60">{ago}</p>
      </div>
    </div>
  );
}
