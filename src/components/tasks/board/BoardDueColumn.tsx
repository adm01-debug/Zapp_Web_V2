import { WorkItemCard } from '../shared/WorkItemCard';
import { BoardColumnSkeleton } from '../shared/BoardColumnSkeleton';
import { BOARD_DUE_COLUMNS, type BoardDueColumnKey } from '@/hooks/tasks/workItemBoardGroups';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import type { WorkItemCardActions } from '../shared/cardActions';

interface Props extends WorkItemCardActions {
  /** Chave do recorte por prazo (etapa 101: `atrasadas`…`concluidas`). */
  columnKey: BoardDueColumnKey;
  label: string;
  items: WorkItem[];
  /** Etapa 53: enquanto o hook responde, a coluna mostra o esqueleto (não o vazio). */
  isLoading?: boolean;
  onOpen: (item: WorkItem) => void;
  onMoveTo: (item: WorkItem, to: WorkItemStatus) => void;
  onDelete: (item: WorkItem) => void;
}

/**
 * Etapa 102 (D1) — coluna do agrupamento **por prazo** (imagem 03), somente
 * leitura: mesma moldura do `BoardColumn` (cabeçalho sticky, a política como
 * subtítulo e contador), mas **sem** DnD — nada aqui é `Droppable`/`Draggable`,
 * porque
 * "arrastar por prazo não tem semântica". O cartão é o MESMO `WorkItemCard` e as
 * ações do kebab (mover pelo menu, concluir, adiar…) continuam valendo.
 */
export function BoardDueColumn({
  columnKey, label, items, isLoading = false, onOpen, onMoveTo, onDelete,
  onOpenContact, onRequestWaitingReason, onComplete, onReopen, onSnooze, onClearReminder, onOpenReminder,
}: Props) {
  const policy = BOARD_DUE_COLUMNS.find(c => c.key === columnKey)?.policy ?? '';

  return (
    <div
      data-board-due={columnKey}
      data-testid={`board-due-column-${columnKey}`}
      className="flex flex-col flex-1 min-w-[200px] h-full min-h-0 rounded-[14px] border border-border/70 bg-card overflow-hidden snap-start"
    >
      <div className="flex items-center gap-2 min-w-0 px-3 py-2 border-b border-border/50 bg-card/95 backdrop-blur">
        <span className="min-w-0 shrink-0 truncate text-[13px] font-semibold">{label}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{policy}</span>
        {items.length > 0 && (
          <span className="shrink-0 text-xs font-bold tabular-nums">{items.length}</span>
        )}
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto p-2 space-y-1.5 min-h-[80px]">
        {isLoading && <BoardColumnSkeleton />}
        {!isLoading && items.length === 0 && (
          <div data-testid="board-due-empty" className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-xs text-muted-foreground italic">Nada aqui</p>
            <p className="text-xs text-muted-foreground/70">{policy}</p>
          </div>
        )}
        {!isLoading && items.map(item => (
          <WorkItemCard
            key={item.id}
            item={item}
            mode="board"
            onOpen={() => onOpen(item)}
            onMoveTo={(to) => onMoveTo(item, to)}
            onDelete={() => onDelete(item)}
            contactName={item.contact?.name ?? undefined}
            onOpenContact={onOpenContact ? () => onOpenContact(item) : undefined}
            onRequestWaitingReason={onRequestWaitingReason ? () => onRequestWaitingReason(item) : undefined}
            onComplete={onComplete ? () => onComplete(item) : undefined}
            onReopen={onReopen ? () => onReopen(item) : undefined}
            onSnooze={onSnooze ? (minutes) => onSnooze(item, minutes) : undefined}
            onClearReminder={onClearReminder ? () => onClearReminder(item) : undefined}
            onOpenReminder={onOpenReminder ? () => onOpenReminder(item) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
