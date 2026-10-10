import { useState } from 'react';
import { ChevronDown, Inbox, ListTodo, Play, Hourglass, CheckCircle2, type LucideIcon } from 'lucide-react';
import { useMyWorkItems } from '@/hooks/tasks/useMyWorkItems';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import { WorkItemCard }   from '@/components/tasks/shared/WorkItemCard';
import { QuickAdd }       from '@/components/tasks/shared/QuickAdd';
import { WorkItemCardSkeleton } from '@/components/tasks/shared/WorkItemCardSkeleton';
import { cn } from '@/lib/utils';


interface TasksTabProps {
  contactId: string;
}

/** Ordem do mini-quadro (etapa 72): Fazendo · A fazer · Aguardando · Caixa de entrada. */
const STATUS_GROUPS: Array<{ status: WorkItemStatus; label: string; icon: LucideIcon }> = [
  { status: 'doing',   label: 'Fazendo',         icon: Play },
  { status: 'todo',    label: 'A fazer',         icon: ListTodo },
  { status: 'waiting', label: 'Aguardando',      icon: Hourglass },
  { status: 'backlog', label: 'Caixa de entrada', icon: Inbox },
];

interface GroupHeaderProps {
  open: boolean;
  onToggle: () => void;
  icon: LucideIcon;
  label: string;
  count: number;
  testId: string;
}

/** Cabeçalho colapsável do grupo — o contador fica sempre visível. */
function GroupHeader({ open, onToggle, icon: Icon, label, count, testId }: GroupHeaderProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-expanded={open}
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-muted/50 transition-colors"
    >
      <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} />
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-[13px] font-semibold text-foreground">{label}</span>
      <span data-testid={`${testId}-count`} className="ml-auto text-xs tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}

interface TaskGroupProps {
  status: string;
  label: string;
  icon: LucideIcon;
  items: WorkItem[];
  doingCount: number;
  defaultOpen?: boolean;
  onToggleDone: (item: WorkItem) => void;
  onMoveTo: (item: WorkItem, to: WorkItemStatus) => void;
  onDelete: (item: WorkItem) => void;
}

/** Um grupo (coluna) do mini-quadro, colapsável, com contador e cards em `mode="list"`. */
function TaskGroup({ status, label, icon, items, doingCount, defaultOpen = true, onToggleDone, onMoveTo, onDelete }: TaskGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section data-testid={`tasks-group-${status}`} className="flex flex-col gap-1.5">
      <GroupHeader
        open={open}
        onToggle={() => setOpen((o) => !o)}
        icon={icon}
        label={label}
        count={items.length}
        testId={`tasks-group-toggle-${status}`}
      />
      {open && (
        <div className="space-y-1.5">
          {items.length === 0 && <p className="px-1.5 py-1 text-xs text-muted-foreground">Nada aqui</p>}
          {items.map((item) => (
            <WorkItemCard
              key={item.id}
              item={item}
              mode="list"
              doingCount={doingCount}
              onToggleDone={() => onToggleDone(item)}
              onMoveTo={(to) => onMoveTo(item, to)}
              onDelete={() => onDelete(item)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Aba Tarefas do chat — mini-quadro vertical por status (etapa 72): Fazendo ·
 * A fazer · Aguardando · Caixa de entrada (cada um colapsável com contador) +
 * Concluídas (7 dias), colapsada. QuickAdd no topo cria com o contato fixo.
 */
export function TasksTab({ contactId }: TasksTabProps) {
  const { byDue, byStatus, create, complete, deleteItem, move, isLoading } = useMyWorkItems({ contactId });

  const done = byDue.done7d;
  const doingCount = byStatus.doing.length;
  const activeTotal = STATUS_GROUPS.reduce((n, g) => n + byStatus[g.status].length, 0);
  const total = activeTotal + done.length;

  // Concluída reabre (volta para "A fazer"); aberta conclui. Mesma regra do módulo.
  const toggleDone = (item: WorkItem) => {
    if (item.status === 'done') void move({ ...item, status: 'done' }, 'todo');
    else void complete(item);
  };

  return (
    <div className="flex flex-col gap-3 p-3 h-full overflow-y-auto">
      {/* Captura rápida com contato fixo (o chip @ some quando o contato é fixo) */}
      <QuickAdd
        onAdd={create}
        defaultStatus="todo"
        defaultContactId={contactId}
        placeholder="Nova tarefa para este contato…"
        compact
      />

      {isLoading && (
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => <WorkItemCardSkeleton key={i} />)}
        </div>
      )}

      {!isLoading && total === 0 && (
        <p className="text-center text-[13px] text-muted-foreground py-6">
          Nenhuma tarefa aberta com este contato
        </p>
      )}

      {!isLoading && total > 0 && (
        <div className="flex flex-col gap-3">
          {STATUS_GROUPS.map((g) => (
            <TaskGroup
              key={g.status}
              status={g.status}
              label={g.label}
              icon={g.icon}
              items={byStatus[g.status]}
              doingCount={doingCount}
              onToggleDone={toggleDone}
              onMoveTo={(item, to) => void move(item, to)}
              onDelete={(item) => void deleteItem(item)}
            />
          ))}

          <TaskGroup
            status="done"
            label="Concluídas"
            icon={CheckCircle2}
            items={done}
            doingCount={doingCount}
            defaultOpen={false}
            onToggleDone={toggleDone}
            onMoveTo={(item, to) => void move(item, to)}
            onDelete={(item) => void deleteItem(item)}
          />
        </div>
      )}
    </div>
  );
}
