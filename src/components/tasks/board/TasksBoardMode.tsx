import { useCallback } from 'react';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { BoardColumn }      from './BoardColumn';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import type { WorkItemInput } from '@/hooks/tasks/useMyWorkItems';
import { WIP_LIMITS, KANBAN_COLUMNS } from '@/hooks/tasks/workItem.types';
import { canTransition, countDoing } from '@/hooks/tasks/workItemMachine';

interface Props {
  byStatus: Record<WorkItemStatus, WorkItem[]>;
  isLoading: boolean;
  onMove: (item: WorkItem, to: WorkItemStatus, waitingReason?: string) => void;
  onReorder: (positions: Array<{ id: string; position: number }>) => void;
  onOpen: (item: WorkItem) => void;
  onDelete: (item: WorkItem) => void;
  onCreate: (input: WorkItemInput) => Promise<void>;
}

const BOARD_COLUMNS: WorkItemStatus[] = ['backlog','todo','doing','waiting','done'];

export function TasksBoardMode({ byStatus, isLoading, onMove, onReorder, onOpen, onDelete, onCreate }: Props) {
  const doingCount = byStatus.doing.length;

  const handleDragEnd = useCallback((result: DropResult) => {
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
    const check = canTransition(fromStatus, toStatus, { doingCount, waitingReason: undefined });
    if (!check.ok) {
      if (check.reason === 'wip_full')
        toast.error('Fazendo está cheio (máx. 3). Conclua um item antes.');
      else if (check.reason === 'waiting_reason_required')
        toast.error('Escreva o motivo antes de mover para Aguardando.');
      return;
    }
    onMove(item, toStatus);
  }, [byStatus, doingCount, onMove, onReorder]);

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 h-full overflow-x-auto snap-x snap-mandatory pb-4">
        {BOARD_COLUMNS.map(status => (
          <BoardColumn
            key={status}
            status={status}
            items={byStatus[status] ?? []}
            isLoading={isLoading}
            doingCount={doingCount}
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
