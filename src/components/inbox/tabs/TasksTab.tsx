import { useState } from 'react';
import { useMyWorkItems } from '@/hooks/tasks/useMyWorkItems';
import { WorkItemCard }   from '@/components/tasks/shared/WorkItemCard';
import { QuickAdd }       from '@/components/tasks/shared/QuickAdd';
import { WorkItemCardSkeleton } from '@/components/tasks/shared/WorkItemCardSkeleton';


interface TasksTabProps {
  contactId: string;
}

/** Aba Tarefas do chat — lista as tarefas do usuário para este contato + QuickAdd. */
export function TasksTab({ contactId }: TasksTabProps) {
  const { byDue, create, complete, deleteItem, move, isLoading } = useMyWorkItems({ contactId });
  const [showDone, setShowDone] = useState(false);

  const active = [
    ...byDue.overdue,
    ...byDue.today,
    ...byDue.tomorrow,
    ...byDue.upcoming,
    ...byDue.noDue,
  ];
  const done = byDue.done7d;

  return (
    <div className="flex flex-col gap-3 p-3 h-full overflow-y-auto">
      {/* Captura rápida com contato fixo */}
      <QuickAdd
        onAdd={create}
        defaultStatus="todo"
        defaultContactId={contactId}
        placeholder="Nova tarefa para este contato…"
        compact
      />

      {/* Lista de tarefas ativas */}
      {isLoading && (
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => <WorkItemCardSkeleton key={i} />)}
        </div>
      )}

      {!isLoading && active.length === 0 && (
        <p className="text-center text-[13px] text-muted-foreground py-6">
          Nenhuma tarefa aberta com este contato
        </p>
      )}

      <div className="space-y-1.5">
        {active.map((item) => (
          <WorkItemCard
            key={item.id}
            item={item}
            mode="list"
            onToggleDone={() => void complete(item)}
            onMoveTo={(to) => void move(item, to)}
            onDelete={() => void deleteItem(item)}
          />
        ))}
      </div>

      {/* Concluídas (7 dias) */}
      {done.length > 0 && (
        <div className="border-t border-border/30 pt-2 mt-1">
          <button
            type="button"
            onClick={() => setShowDone(o => !o)}
            className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showDone ? 'Ocultar concluídas' : `Ver ${done.length} concluída${done.length > 1 ? 's' : ''}`}
          </button>
          {showDone && (
            <div className="space-y-1.5 mt-2">
              {done.map((item) => (
                <WorkItemCard
                  key={item.id}
                  item={item}
                  mode="list"
                  onToggleDone={() => void move(item as WorkItem & { status: 'done' }, 'todo')}
                  onDelete={() => void deleteItem(item)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
