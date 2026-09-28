import { Calendar, AlertCircle } from 'lucide-react';
import { dueLabel } from '@/hooks/tasks/workItemAggregates';

interface Props { dueDate: string; compact?: boolean; }

export function DueChip({ dueDate, compact = false }: Props) {
  const { label, overdue } = dueLabel(dueDate);
  const cls = overdue
    ? 'text-destructive'
    : label === 'Hoje' ? 'text-warning' : 'text-muted-foreground';
  const Icon = overdue ? AlertCircle : Calendar;
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] font-medium ${cls}`} title={`Prazo: ${label}`}>
      <Icon className="h-3 w-3" />
      {!compact && label}
    </span>
  );
}
