import { TasksEmptyState } from '../TasksEmptyState';
import { TasksListTable } from './TasksListTable';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import type { BucketsByDue } from '@/hooks/tasks/workItemAggregates';
import type { WorkItemCardActions } from '../shared/cardActions';

/**
 * Etapa 071 — o esqueleto do carregamento agora é o DA TABELA: uma faixa de
 * cabeçalho + 6 linhas de 44 px, na mesma grade, em vez dos cartões do layout
 * antigo (que já não existe). Grupo vazio continua sumindo, como antes.
 */
function TabelaSkeleton() {
  return (
    <div className="w-full min-w-0 pb-8" data-testid="tasks-list-skeleton" aria-hidden="true">
      <div className="mb-2 h-8 rounded-md bg-muted/40" />
      <div className="overflow-hidden rounded-lg border border-border/40">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-11 border-b border-border/40 px-3 last:border-b-0 animate-shimmer"
          />
        ))}
      </div>
    </div>
  );
}

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
 * `onMoveTo`/`onDelete` seguem no contrato da Lista porque são eles que a
 * coluna "Estado" (060) e o menu ⋮ da linha (061) vão consumir; até lá o que a
 * tabela usa é o clique da linha (detalhes), o checkbox e o contato.
 */
export function TasksListMode({
  byDue, isLoading, searchQuery, filtersActive, onOpen, onToggleDone, onClearFilter, hasMounted,
  onOpenContact, onMoveTo, doingCount, onRequestWaitingReason, onSnooze, onClearReminder, onOpenReminder,
  onComplete, onReopen, onDelete,
}: Props) {
  if (isLoading) {
    return <TabelaSkeleton />;
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
      onComplete={onComplete}
      onReopen={onReopen}
      onDelete={onDelete}
      hasMounted={hasMounted}
    />
  );
}
