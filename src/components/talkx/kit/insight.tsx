import type { LucideIcon } from 'lucide-react';
import { Clock, MessageSquare, RefreshCw, MousePointerClick } from 'lucide-react';

// ─── E92: InsightCard ──────────────────────────────────────────────────────────────────────
export type InsightType = 'timing' | 'template' | 'reactivation' | 'links';
export type InsightPriority = 'high' | 'medium' | 'low';

const INSIGHT_ICON: Record<InsightType, LucideIcon> = {
  timing: Clock,
  template: MessageSquare,
  reactivation: RefreshCw,
  links: MousePointerClick,
};

const INSIGHT_COLOR: Record<InsightPriority, string> = {
  high:   'border-l-red-500   bg-red-50   dark:bg-red-950/30',
  medium: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/30',
  low:    'border-l-blue-500  bg-blue-50  dark:bg-blue-950/30',
};

const PRIORITY_LABEL: Record<InsightPriority, string> = {
  high: 'Prioridade alta', medium: 'Prioridade média', low: 'Prioridade baixa',
};

export function InsightCard({
  type,
  title,
  description,
  priority,
  applyLabel,
  onApply,
}: {
  type: InsightType;
  title: string;
  description: string;
  priority: InsightPriority;
  applyLabel?: string;
  onApply?: () => void;
}) {
  const Icon = INSIGHT_ICON[type] ?? MessageSquare;
  return (
    <div className={'rounded-lg border border-l-4 p-4 ' + INSIGHT_COLOR[priority]}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <span className="text-3xs font-medium text-muted-foreground border rounded px-1 py-0 leading-4">
              Heurístico
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
          {applyLabel && onApply && (
            <button
              type="button"
              onClick={onApply}
              className="mt-2 text-xs font-medium text-primary hover:underline"
            >
              {applyLabel} →
            </button>
          )}
        </div>
        <span className="shrink-0 text-3xs text-muted-foreground">{PRIORITY_LABEL[priority]}</span>
      </div>
    </div>
  );
}
