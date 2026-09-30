import type { Priority } from '@/hooks/tasks/workItem.types';
import { PRIORITY_LABELS } from '@/hooks/tasks/workItemLabels';

const PRIORITY_STYLES: Record<Priority, string> = {
  low:    'bg-muted/60 text-muted-foreground border-border/40',
  medium: 'bg-primary/15 text-primary border-primary/30',
  high:   'bg-warning/15 text-warning border-warning/40',
  urgent: 'bg-destructive/15 text-destructive border-destructive/40',
};

interface Props { priority: Priority; compact?: boolean; }

export function PriorityChip({ priority, compact = false }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-2xs font-semibold leading-none ${PRIORITY_STYLES[priority]}`}
      title={`Prioridade: ${PRIORITY_LABELS[priority]}`}
    >
      {compact ? PRIORITY_LABELS[priority][0] : PRIORITY_LABELS[priority]}
    </span>
  );
}
