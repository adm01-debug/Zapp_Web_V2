import { Calendar, AlertCircle } from 'lucide-react';
import { dueLabel } from '@/hooks/tasks/workItemAggregates';

interface Props { dueDate: string; compact?: boolean; }

export function DueChip({ dueDate, compact = false }: Props) {
  const { label, overdue } = dueLabel(dueDate);
  // Etapa 80 (E.3): prazo atrasado e "Hoje" usam o par de TEXTO do estado
  // (`--destructive-text`/`--warning-text`): o token cru é preenchimento e ficava em
  // 2,6:1 no card escuro e 2,1:1 no card claro. O ícone herda a cor (currentColor).
  const cls = overdue
    ? 'text-[hsl(var(--destructive-text))]'
    : label === 'Hoje' ? 'text-[hsl(var(--warning-text))]' : 'text-muted-foreground';
  const Icon = overdue ? AlertCircle : Calendar;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cls}`} title={`Prazo: ${label}`}>
      <Icon className="h-3 w-3" />
      {!compact && label}
    </span>
  );
}
