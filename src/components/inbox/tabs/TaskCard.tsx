import { Clock, MoreVertical, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { ConversationTask } from '@/hooks/chat/useConversationTasks';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const PRIORITY_PILL: Record<string, { label: string; className: string }> = {
  high: { label: 'Alta prioridade', className: 'bg-destructive/15 text-destructive border-destructive/30' },
  medium: { label: 'Média', className: 'bg-warning/15 text-warning border-warning/30' },
  low: { label: 'Baixa', className: 'bg-primary/15 text-primary border-primary/30' },
};

interface TaskCardProps {
  task: ConversationTask;
  assigneeName?: string;
  onToggle: (task: ConversationTask) => void;
  onDelete: (id: string) => void;
}

/** Card de tarefa (2.9) — checkbox, prioridade, data e responsável, reaproveitado nas 3 colunas da aba Tarefas. */
export function TaskCard({ task, assigneeName, onToggle, onDelete }: TaskCardProps) {
  const priority = PRIORITY_PILL[task.priority] ?? PRIORITY_PILL.medium;
  const completed = task.status === 'completed';
  const due = task.due_date ? new Date(task.due_date) : null;
  const now = new Date();
  const isPast = due ? due.getTime() < now.getTime() : false;
  const isToday = due ? due.toDateString() === now.toDateString() : false;
  const dueUrgent = !completed && (isPast || isToday);

  return (
    <div data-testid="task-card" className="rounded-[10px] bg-muted/30 border border-border p-3 flex gap-3">
      <Checkbox checked={completed} onCheckedChange={() => onToggle(task)} className="mt-0.5 shrink-0 w-4 h-4" aria-label={`Concluir ${task.title}`} />
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className={cn('text-[13px] font-semibold', completed && 'line-through text-muted-foreground')}>{task.title}</p>
            {task.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{task.description}</p>}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Mais ações da tarefa">
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onDelete(task.id)} className="text-destructive focus:text-destructive">
                <Trash2 className="w-3.5 h-3.5 mr-2" />Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {completed ? (
            <span className="h-6 px-2.5 rounded-full border text-[11px] font-semibold inline-flex items-center bg-success/15 text-success border-success/30">Concluída</span>
          ) : (
            <span className={cn('h-6 px-2.5 rounded-full border text-[11px] font-semibold inline-flex items-center', priority.className)}>{priority.label}</span>
          )}
          {due && (
            <span className={cn('text-xs inline-flex items-center gap-1', dueUrgent ? 'text-destructive' : isToday ? 'text-warning' : 'text-muted-foreground')}>
              <Clock className="w-3 h-3" />
              {isToday || completed ? `Hoje, ${format(due, 'HH:mm')}` : format(due, "EEE, dd/MM, HH:mm", { locale: ptBR })}
            </span>
          )}
          {assigneeName && (
            <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-muted/60 flex items-center justify-center text-[10px] font-semibold shrink-0">{assigneeName[0]?.toUpperCase()}</span>
              {assigneeName}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
