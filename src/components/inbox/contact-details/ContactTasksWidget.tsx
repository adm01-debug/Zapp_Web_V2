import { Clock, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useConversationTasks } from '@/hooks/chat/useConversationTasks';

interface ContactTasksWidgetProps {
  contactId: string;
  onOpenTasksTab: () => void;
}

export function ContactTasksWidget({ contactId, onOpenTasksTab }: ContactTasksWidgetProps) {
  const { open, isLoading } = useConversationTasks(contactId);
  const visible = open.slice(0, 5);
  // react-hooks/purity acusa Date.now() (mesmo padrão de SatisfactionMetrics.tsx) — usa getTime().
  const now = new Date().getTime();

  return (
    <div className="space-y-1.5">
      {isLoading && <div className="h-10 rounded-lg bg-muted/20 animate-pulse" />}

      {!isLoading && visible.length === 0 && (
        <p className="text-xs text-muted-foreground/60 text-center py-2">Nenhuma tarefa aberta</p>
      )}

      {visible.map((task) => {
        const due = task.due_date ? new Date(task.due_date) : null;
        const isPast = due ? due.getTime() < now : false;
        return (
          <div key={task.id} className="flex items-center gap-2 text-sm bg-muted/20 rounded-lg p-2">
            <Clock className={cn('w-3.5 h-3.5 shrink-0', isPast ? 'text-destructive' : 'text-primary')} />
            <span className="truncate flex-1 text-foreground">{task.title}</span>
            {due && (
              <span className={cn('text-[10px] shrink-0', isPast ? 'text-destructive' : 'text-muted-foreground')}>
                {format(due, 'dd/MM HH:mm', { locale: ptBR })}
              </span>
            )}
          </div>
        );
      })}

      <Button variant="ghost" size="sm" className="h-7 text-xs w-full justify-start text-primary hover:bg-primary/10" onClick={onOpenTasksTab}>
        <Plus className="w-3 h-3 mr-1" />Nova tarefa
      </Button>
    </div>
  );
}
