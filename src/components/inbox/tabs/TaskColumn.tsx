import { useId } from 'react';
import type { ConversationTask } from '@/hooks/chat/useConversationTasks';
import { TaskCard } from './TaskCard';

interface TaskColumnProps {
  title: string;
  subtitle?: string;
  tasks: ConversationTask[];
  emptyText: string;
  profileNameById: ReadonlyMap<string, string>;
  onToggle: (task: ConversationTask) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

/** Coluna semântica e responsiva do quadro de tarefas da conversa. */
export function TaskColumn({
  title,
  subtitle,
  tasks,
  emptyText,
  profileNameById,
  onToggle,
  onDelete,
}: TaskColumnProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="text-sm font-semibold">{title}</h3>
        <span className="text-xs tabular-nums text-muted-foreground" aria-label={`${tasks.length} tarefas`}>({tasks.length})</span>
      </div>
      {subtitle && <p className="text-xs capitalize text-muted-foreground">{subtitle}</p>}
      {tasks.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskCard
                task={task}
                assigneeName={task.assigned_to ? profileNameById.get(task.assigned_to) : undefined}
                onToggle={onToggle}
                onDelete={onDelete}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
