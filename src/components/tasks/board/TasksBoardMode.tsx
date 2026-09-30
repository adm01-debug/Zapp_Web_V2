import { useCallback, useState } from 'react';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { BoardColumn }      from './BoardColumn';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import type { WorkItemInput, MoveOpts } from '@/hooks/tasks/useMyWorkItems';
import { WIP_LIMITS, KANBAN_COLUMNS } from '@/hooks/tasks/workItem.types';
import { canTransition, countDoing } from '@/hooks/tasks/workItemMachine';

interface Props {
  byStatus: Record<WorkItemStatus, WorkItem[]>;
  isLoading: boolean;
  /** Fase F (auditoria): contagem REAL de "Fazendo" (lista não filtrada) — é ela
   *  que vale para a trava de WIP. Sem a prop, cai na própria coluna visível. */
  doingCount?: number;
  onMove: (item: WorkItem, to: WorkItemStatus, opts?: MoveOpts) => void;
  onReorder: (positions: Array<{ id: string; position: number }>) => void;
  onOpen: (item: WorkItem) => void;
  onDelete: (item: WorkItem) => void;
  onCreate: (input: WorkItemInput) => Promise<void>;
}

const BOARD_COLUMNS: WorkItemStatus[] = ['backlog','todo','doing','waiting','done'];

export function TasksBoardMode({ byStatus, isLoading, doingCount, onMove, onReorder, onOpen, onDelete, onCreate }: Props) {
  const doingTotal = doingCount ?? byStatus.doing.length;
  // Etapa 52 (B8): guarda de onde o arrasto COMECOU — sem isso a coluna "Fazendo"
  // cheia bloqueia ate a reorganizacao dela mesma.
  const [dragSourceStatus, setDragSourceStatus] = useState<WorkItemStatus | null>(null);

  const handleDragEnd = useCallback((result: DropResult) => {
    setDragSourceStatus(null);
    if (!result.destination) return;
    const { source, destination } = result;
    const fromStatus = source.droppableId as WorkItemStatus;
    const toStatus   = destination.droppableId as WorkItemStatus;
    const allItems   = Object.values(byStatus).flat();
    const item       = allItems.find(i => i.id === result.draggableId);
    if (!item) return;

    if (fromStatus === toStatus) {
      // reordenação dentro da mesma coluna
      const col    = [...byStatus[fromStatus]];
      const [moved] = col.splice(source.index, 1);
      col.splice(destination.index, 0, moved);
      onReorder(col.map((it, idx) => ({ id: it.id, position: idx })));
      return;
    }

    // transição de coluna
    const check = canTransition(fromStatus, toStatus, { doingCount: doingTotal, waitingReason: undefined });
    if (!check.ok) {
      if (check.reason === 'wip_full')
        toast.error('Fazendo está cheio (máx. 3). Conclua um item antes.');
      else if (check.reason === 'waiting_reason_required')
        toast.error('Escreva o motivo antes de mover para Aguardando.');
      return;
    }
    // etapa 15: leva o indice de destino para persistir a ordem das duas colunas
    onMove(item, toStatus, { index: destination.index });
  }, [byStatus, doingTotal, onMove, onReorder]);

  return (
    <DragDropContext
      onDragEnd={handleDragEnd}
      onDragStart={start => setDragSourceStatus(start.source.droppableId as WorkItemStatus)}
    >
      <div className="flex gap-3 h-full overflow-x-auto snap-x snap-mandatory pb-4">
        {BOARD_COLUMNS.map(status => (
          <BoardColumn
            key={status}
            status={status}
            items={byStatus[status] ?? []}
            isLoading={isLoading}
            doingCount={doingTotal}
            dragSourceStatus={dragSourceStatus}
            onOpen={onOpen}
            onMoveTo={(it, to) => onMove(it, to)}
            onDelete={onDelete}
            onCreate={status === 'backlog' ? onCreate : undefined}
          />
        ))}
      </div>
    </DragDropContext>
  );
}
