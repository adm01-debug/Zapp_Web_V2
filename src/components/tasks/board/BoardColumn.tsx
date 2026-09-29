import { Droppable, Draggable } from '@hello-pangea/dnd';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { WorkItemCard }         from '../shared/WorkItemCard';
import { WorkItemCardSkeleton } from '../shared/WorkItemCardSkeleton';
import { QuickAdd }             from '../shared/QuickAdd';
import { TasksEmptyState }      from '../TasksEmptyState';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import type { WorkItemInput }   from '@/hooks/tasks/useMyWorkItems';
import { WIP_LIMITS, KANBAN_COLUMNS } from '@/hooks/tasks/workItem.types';

interface Props {
  status: WorkItemStatus;
  items: WorkItem[];
  isLoading: boolean;
  doingCount: number;
  onOpen: (item: WorkItem) => void;
  onMoveTo: (item: WorkItem, to: WorkItemStatus) => void;
  onDelete: (item: WorkItem) => void;
  onCreate?: (input: WorkItemInput) => Promise<void>;
}

export function BoardColumn({ status, items, isLoading, doingCount, onOpen, onMoveTo, onDelete, onCreate }: Props) {
  const col   = KANBAN_COLUMNS.find(c => c.status === status)!;
  const limit = WIP_LIMITS[status];
  const hardFull  = limit.hard != null && doingCount >= limit.hard;
  const softOver  = limit.soft != null && items.length > limit.soft;

  const headerCount = limit.hard
    ? `${doingCount}/${limit.hard}`
    : items.length > 0 ? String(items.length) : '';

  return (
    <div className="flex flex-col min-w-[232px] xl:min-w-[260px] max-h-[calc(100vh-280px)] rounded-[14px] border border-border/70 bg-card overflow-hidden snap-start">
      {/* cabeçalho sticky */}
      <div className={[
        'flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-card/95 backdrop-blur',
        hardFull ? 'text-destructive' : softOver ? 'text-warning' : 'text-foreground',
      ].join(' ')}>
        <span className="flex-1 text-[13px] font-semibold">{col.label}</span>
        {headerCount && (
          <span className={`text-xs font-bold tabular-nums ${hardFull ? 'text-destructive' : ''}`}>
            {headerCount}
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="h-5 w-5 rounded flex items-center justify-center hover:bg-muted" aria-label="Política da coluna">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[220px] text-xs">
            {col.policy}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* QuickAdd na coluna Backlog */}
      {status === 'backlog' && onCreate && (
        <div className="px-2 pt-2">
          <QuickAdd onAdd={onCreate} defaultStatus="backlog" compact placeholder="Capturar tarefa…" />
        </div>
      )}

      {/* cards */}
      <Droppable droppableId={status} isDropDisabled={hardFull}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 overflow-y-auto p-2 space-y-1.5 min-h-[80px] ${snapshot.isDraggingOver ? 'bg-primary/5' : ''}`}
          >
            {isLoading && Array.from({ length: 2 }).map((_, i) => <WorkItemCardSkeleton key={i} />)}
            {!isLoading && items.length === 0 && <TasksEmptyState variant="column" />}
            {!isLoading && items.map((item, index) => (
              <Draggable key={item.id} draggableId={item.id} index={index}>
                {(drag, snap) => (
                  <div ref={drag.innerRef} {...drag.draggableProps}>
                    <WorkItemCard
                      item={item}
                      mode="board"
                      isDragging={snap.isDragging}
                      dragHandleProps={drag.dragHandleProps ?? undefined}
                      onOpen={() => onOpen(item)}
                      onMoveTo={(to) => onMoveTo(item, to)}
                      onDelete={() => onDelete(item)}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
