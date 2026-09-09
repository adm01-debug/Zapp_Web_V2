import { Clock } from 'lucide-react';
import { format, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useConversationTasks } from '@/hooks/chat/useConversationTasks';

interface ContactTasksWidgetProps {
  contactId: string;
}

export function ContactTasksWidget({ contactId }: ContactTasksWidgetProps) {
  const { open, isLoading } = useConversationTasks(contactId);
  const visible = open.slice(0, 5);
  // react-hooks/purity acusa Date.now() (mesmo padrão de SatisfactionMetrics.tsx) — usa getTime().
  const now = new Date().getTime();

  if (isLoading) return <div className="h-10 rounded-lg bg-muted/20 animate-pulse" />;
  if (visible.length === 0) return <p className="text-xs text-muted-foreground/60 text-center py-2">Nenhuma tarefa aberta</p>;

  return (
    <div className="space-y-1.5">
      {visible.map((task) => {
        const due = task.due_date ? new Date(task.due_date) : null;
        const isPast = due ? due.getTime() < now : false;
        const isDueToday = due ? isToday(due) : false;
        return (
          <div key={task.id} className="flex items-center gap-2 text-[13px]">
            <Clock className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1 text-foreground">{task.title}</span>
            {due && (
              <span className={cn('text-[11px] shrink-0', isPast ? 'text-destructive' : isDueToday ? 'text-warning' : 'text-muted-foreground')}>
                {format(due, 'dd/MM HH:mm', { locale: ptBR })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
