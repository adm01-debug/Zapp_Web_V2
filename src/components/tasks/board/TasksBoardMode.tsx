import { useCallback, useRef, useState } from 'react';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BoardColumn }      from './BoardColumn';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import type { WorkItemInput, MoveOpts } from '@/hooks/tasks/useMyWorkItems';
import { WIP_LIMITS, KANBAN_COLUMNS } from '@/hooks/tasks/workItem.types';
import { canTransition, countDoing, precisaMotivoDeEspera } from '@/hooks/tasks/workItemMachine';
import { useNarrowViewport, usePointerCoarse } from '../shared/pointerMedia';
import type { WorkItemCardActions } from '../shared/cardActions';

interface Props extends WorkItemCardActions {
  byStatus: Record<WorkItemStatus, WorkItem[]>;
  isLoading: boolean;
  /** Fase F (auditoria): contagem REAL de "Fazendo" (lista não filtrada) — é ela
   *  que vale para a trava de WIP. Sem a prop, cai na própria coluna visível. */
  doingCount?: number;
  onMove: (item: WorkItem, to: WorkItemStatus, opts?: MoveOpts) => void;
  /** Etapa 29: o kebab/menu do card passa pelo portão do Aguardando. */
  onMoveTo?: (item: WorkItem, to: WorkItemStatus) => void;
  /** Etapa 28: DnD para Aguardando sem motivo abre o Sheet pedindo o motivo. */
  onRequestWaitingReason?: (item: WorkItem) => void;
  onReorder: (positions: Array<{ id: string; position: number }>) => void;
  onOpen: (item: WorkItem) => void;
  onDelete: (item: WorkItem) => void;
  onCreate: (input: WorkItemInput) => Promise<void>;
}

const BOARD_COLUMNS: WorkItemStatus[] = ['backlog','todo','doing','waiting','done'];

/** Rótulo da coluna na faixa de navegação (mesma fonte das colunas). */
function rotuloDaColuna(status: WorkItemStatus): string {
  return KANBAN_COLUMNS.find(c => c.status === status)?.label ?? status;
}


export function TasksBoardMode({
  byStatus, isLoading, doingCount, onMove, onMoveTo, onRequestWaitingReason, onReorder, onOpen, onDelete, onCreate,
  onOpenContact, onComplete, onReopen, onSnooze, onClearReminder, onOpenReminder,
}: Props) {
  const doingTotal = doingCount ?? byStatus.doing.length;
  // Etapa 52 (B8): guarda de onde o arrasto COMECOU — sem isso a coluna "Fazendo"
  // cheia bloqueia ate a reorganizacao dela mesma.
  const [dragSourceStatus, setDragSourceStatus] = useState<WorkItemStatus | null>(null);
  // Etapa 81: no ponteiro grosso o arrasto sai de cena e o `MoveToMenu` do card
  // assume; na tela estreita as setas e os dots conduzem a faixa de colunas.
  const dragDesligado = usePointerCoarse();
  const telaEstreita  = useNarrowViewport();
  const trilhoRef     = useRef<HTMLDivElement>(null);
  const [colunaVisivel, setColunaVisivel] = useState(0);

  /** Qual coluna está encostada à esquerda da faixa (o snap alinha por ali). */
  const aoRolar = useCallback(() => {
    const trilho = trilhoRef.current;
    if (!trilho) return;
    const base = trilho.getBoundingClientRect().left;
    let indice = 0;
    let menorDistancia = Number.POSITIVE_INFINITY;
    Array.from(trilho.children).forEach((coluna, i) => {
      const distancia = Math.abs(coluna.getBoundingClientRect().left - base);
      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        indice = i;
      }
    });
    setColunaVisivel(indice);
  }, []);

  /** Leva a faixa até a coluna pedida (setas e dots). */
  const irParaColuna = useCallback((indice: number) => {
    const trilho = trilhoRef.current;
    if (!trilho) return;
    const alvo = trilho.children[indice] as HTMLElement | undefined;
    if (!alvo) return;
    const deslocamento = alvo.getBoundingClientRect().left - trilho.getBoundingClientRect().left;
    const destino = trilho.scrollLeft + deslocamento;
    // `scrollTo` anima no navegador; ambientes sem ele (jsdom) não podem quebrar o clique.
    if (typeof trilho.scrollTo === 'function') trilho.scrollTo({ left: destino, behavior: 'smooth' });
    else trilho.scrollLeft = destino;
  }, []);

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
    // Etapa 28 (B2): Aguardando sem motivo não escreve no banco — abre o Sheet
    // já pedindo o motivo (o card volta à origem por conta da lib).
    if (precisaMotivoDeEspera(item.waiting_reason, toStatus)) {
      onRequestWaitingReason?.(item);
      return;
    }
    const check = canTransition(fromStatus, toStatus, {
      doingCount: doingTotal,
      waitingReason: item.waiting_reason ?? undefined,
    });
    if (!check.ok) {
      if (check.reason === 'wip_full')
        toast.error('Fazendo está cheio (máx. 3). Conclua um item antes.');
      return;
    }
    // etapa 15: leva o indice de destino para persistir a ordem das duas colunas
    onMove(item, toStatus, {
      index: destination.index,
      ...(toStatus === 'waiting' && item.waiting_reason ? { waitingReason: item.waiting_reason } : {}),
    });
  }, [byStatus, doingTotal, onMove, onRequestWaitingReason, onReorder]);

  const ultimaColuna = BOARD_COLUMNS.length - 1;

  return (
    <DragDropContext
      onDragEnd={handleDragEnd}
      onDragStart={start => setDragSourceStatus(start.source.droppableId as WorkItemStatus)}
      dragHandleUsageInstructions="Pressione espaço para pegar a tarefa, use as setas para movê-la e espaço de novo para soltar. Esc cancela o movimento."
    >
      <div className="flex w-full min-w-0 flex-col h-full min-h-0 gap-2">
        {/* Etapa 81: setas ‹ › — só na tela estreita, onde as 5 colunas não cabem */}
        {telaEstreita && (
          <div className="flex w-full min-w-0 items-center gap-2" data-testid="board-nav">
            <button
              type="button"
              data-testid="board-prev"
              aria-label="Coluna anterior"
              disabled={colunaVisivel === 0}
              onClick={() => irParaColuna(colunaVisivel - 1)}
              className="h-8 w-8 shrink-0 rounded-lg border border-border/70 flex items-center justify-center transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="flex-1 min-w-0 truncate text-center text-[13px] font-semibold text-foreground">
              {rotuloDaColuna(BOARD_COLUMNS[colunaVisivel])}
            </span>
            <button
              type="button"
              data-testid="board-next"
              aria-label="Próxima coluna"
              disabled={colunaVisivel === ultimaColuna}
              onClick={() => irParaColuna(colunaVisivel + 1)}
              className="h-8 w-8 shrink-0 rounded-lg border border-border/70 flex items-center justify-center transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        <div
          ref={trilhoRef}
          onScroll={aoRolar}
          className="flex w-full min-w-0 gap-3 flex-1 min-h-0 overflow-x-auto snap-x snap-mandatory pb-4"
        >
          {BOARD_COLUMNS.map(status => (
            <BoardColumn
              key={status}
              status={status}
              items={byStatus[status] ?? []}
              isLoading={isLoading}
              doingCount={doingTotal}
              dragSourceStatus={dragSourceStatus}
              dragDisabled={dragDesligado}
              onOpen={onOpen}
              onMoveTo={(it, to) => (onMoveTo ?? onMove)(it, to)}
              onDelete={onDelete}
              onCreate={status === 'backlog' ? onCreate : undefined}
              onOpenContact={onOpenContact}
              onRequestWaitingReason={onRequestWaitingReason}
              onComplete={onComplete}
              onReopen={onReopen}
              onSnooze={onSnooze}
              onClearReminder={onClearReminder}
              onOpenReminder={onOpenReminder}
            />
          ))}
        </div>

        {/* Etapa 81: 5 dots — indicador de página (só na tela estreita) */}
        {telaEstreita && (
          <div className="flex w-full items-center justify-center gap-1.5" data-testid="board-dots">
            {BOARD_COLUMNS.map((status, i) => (
              <button
                key={status}
                type="button"
                data-testid={`board-dot-${i}`}
                aria-label={`Ir para ${rotuloDaColuna(status)}`}
                aria-current={colunaVisivel === i ? 'true' : undefined}
                onClick={() => irParaColuna(i)}
                className={`h-1.5 rounded-full transition-all ${
                  colunaVisivel === i ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </DragDropContext>
  );
}
