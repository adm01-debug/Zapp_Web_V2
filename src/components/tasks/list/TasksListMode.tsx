import { WorkItemCardSkeleton } from '../shared/WorkItemCardSkeleton';
import { TasksEmptyState } from '../TasksEmptyState';
import { TasksListTable } from './TasksListTable';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import type { BucketsByDue } from '@/hooks/tasks/workItemAggregates';
import type { WorkItemCardActions } from '../shared/cardActions';

interface Props extends WorkItemCardActions {
  byDue: BucketsByDue;
  isLoading: boolean;
  /** Texto da busca (compatibilidade com chamadas antigas do modo Lista). */
  searchQuery?: string;
  /** Fase F (auditoria): QUALQUER filtro ativo (busca, prioridade, contato,
   *  alarme, concluídas) faz a Lista oferecer "Limpar filtros" quando esvazia —
   *  antes só a busca fazia isso e a tela mentia dizendo "Adicione a primeira". */
  filtersActive?: boolean;
  onOpen: (item: WorkItem) => void;
  onToggleDone: (item: WorkItem) => void;
  onMoveTo: (item: WorkItem, to: WorkItemStatus) => void;
  onDelete: (item: WorkItem) => void;
  onClearFilter: () => void;
  hasMounted: React.MutableRefObject<boolean>;
}

/**
 * Etapa 050 — o modo Lista agora é a TABELA (`TasksListTable`): as seções de
 * cartões viraram linhas de grupo e os itens, linhas de 44 px. Este componente
 * fica com o que não é tabela — carregamento e os dois vazios — e mantém a
 * mesma API para o `TasksModule` (a montagem não muda).
 *
 * O `onMoveTo` JÁ é consumido: a coluna "Estado" (060) passa o menu de mover
 * pelo `StatusCell`. O `onDelete` segue no contrato porque o menu ⋮ da linha
 * (061) é quem o vai consumir; até lá o que a tabela usa é o clique da linha
 * (detalhes), o checkbox, o contato e o mover.
 */
export function TasksListMode({
  byDue, isLoading, searchQuery, filtersActive, onOpen, onToggleDone, onClearFilter, hasMounted,
  onOpenContact, onMoveTo, doingCount, onRequestWaitingReason, onSnooze, onClearReminder, onOpenReminder,
}: Props) {
  if (isLoading) {
    return (
      <div className="w-full min-w-0 space-y-1.5">
        {Array.from({ length: 6 }).map((_, i) => <WorkItemCardSkeleton key={i} />)}
      </div>
    );
  }

  const total = byDue.overdue.length + byDue.today.length + byDue.tomorrow.length + byDue.upcoming.length + byDue.noDue.length;

  if (total === 0 && byDue.done7d.length === 0 && byDue.doneOlder.length === 0) {
    const filtroAtivo = filtersActive ?? (searchQuery ?? '') !== '';
    if (filtroAtivo) return <TasksEmptyState variant="filter" onClearFilter={onClearFilter} />;
    return <TasksEmptyState variant="all" />;
  }

  return (
    <TasksListTable
      byDue={byDue}
      onOpen={onOpen}
      onToggleDone={onToggleDone}
      onOpenContact={onOpenContact}
      onMoveTo={onMoveTo}
      doingCount={doingCount}
      onRequestWaitingReason={onRequestWaitingReason}
      onSnooze={onSnooze}
      onClearReminder={onClearReminder}
      onOpenReminder={onOpenReminder}
      hasMounted={hasMounted}
    />
  );
}
