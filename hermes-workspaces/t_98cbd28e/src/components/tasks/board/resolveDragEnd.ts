// Etapa 87 — `handleDragEnd` do Quadro extraído para uma FUNÇÃO PURA.
//
// Vive num arquivo `.ts` (e não no `.tsx` do componente) por dois motivos:
//   1. a regra da casa — o `react-refresh/only-export-components` do lint-ratchet
//      reprova exportar função de arquivo de componente, e isso viraria dívida nova;
//   2. a decisão do arrasto é regra de negócio (portão do Aguardando + trava de WIP
//      3/3) e precisa ser testável sem montar React nem o DnD.
//
// A função só DECIDE: não fala com toast, banco nem callback. Quem interpreta o
// veredito é o `TasksBoardMode` (`toast.error` no `blocked`, `onMove`/`onReorder`/
// `onRequestWaitingReason` nas demais ações).

import type { DropResult } from '@hello-pangea/dnd';
import type {
  WorkItem,
  WorkItemStatus,
  TransitionBlockReason,
} from '@/hooks/tasks/workItem.types';
import { canTransition, precisaMotivoDeEspera } from '@/hooks/tasks/workItemMachine';

/** Opções levadas ao `onMove` — mesmo shape de `MoveOpts` (`index` persiste a
 *  ordem das duas colunas; `waitingReason` alimenta o portão do Aguardando). */
export interface DragEndMoveOpts {
  index: number;
  waitingReason?: string;
}

/**
 * Veredito do arrasto. `action` é o discriminante:
 *  - `reorder`     — arrasto DENTRO da mesma coluna: recalcula `position` 0..n-1;
 *  - `move`        — transição de coluna liberada: leva item, destino e opts;
 *  - `need_reason` — Aguardando sem motivo: abre o Sheet em vez de escrever no banco;
 *  - `blocked`     — a máquina de estados recusou (`wip_full`, `invalid_transition`…).
 *
 * `null` (nada a fazer) cobre o arrasto cancelado sem destino e o id que não está
 * em nenhuma coluna.
 */
export type DragEndResolution =
  | { action: 'reorder'; positions: Array<{ id: string; position: number }> }
  | { action: 'move'; item: WorkItem; to: WorkItemStatus; opts: DragEndMoveOpts }
  | { action: 'need_reason'; item: WorkItem }
  | { action: 'blocked'; reason: TransitionBlockReason };

/**
 * Decide o que fazer com o resultado de um arrasto do Quadro.
 *
 * @param result     resultado do `onDragEnd` do `@hello-pangea/dnd`
 * @param byStatus   as 6 colunas visíveis (a origem do item sai daqui)
 * @param doingCount contagem REAL de "Fazendo" para a trava de WIP; sem ela,
 *                   cai na própria coluna visível (mesma regra da prop do Quadro)
 */
export function resolveDragEnd(
  result: DropResult,
  byStatus: Record<WorkItemStatus, WorkItem[]>,
  doingCount?: number,
): DragEndResolution | null {
  const { source, destination } = result;
  if (!destination) return null;

  const fromStatus = source.droppableId as WorkItemStatus;
  const toStatus = destination.droppableId as WorkItemStatus;
  const item = Object.values(byStatus)
    .flat()
    .find((i) => i.id === result.draggableId);
  if (!item) return null;

  // Reordenação dentro da mesma coluna: o WIP não se aplica (é o caso que a
  // etapa 52 destravou — reorganizar a própria coluna "Fazendo" cheia).
  if (fromStatus === toStatus) {
    const coluna = [...(byStatus[fromStatus] ?? [])];
    const [movido] = coluna.splice(source.index, 1);
    if (!movido) return null;
    coluna.splice(destination.index, 0, movido);
    return {
      action: 'reorder',
      positions: coluna.map((it, idx) => ({ id: it.id, position: idx })),
    };
  }

  // Aguardando sem motivo não escreve no banco — abre o Sheet pedindo o motivo.
  if (precisaMotivoDeEspera(item.waiting_reason, toStatus)) {
    return { action: 'need_reason', item };
  }

  const check = canTransition(fromStatus, toStatus, {
    doingCount: doingCount ?? byStatus.doing.length,
    waitingReason: item.waiting_reason ?? undefined,
  });
  if (!check.ok) return { action: 'blocked', reason: check.reason };

  return {
    action: 'move',
    item,
    to: toStatus,
    opts: {
      // O índice de destino vai junto para persistir a ordem das duas colunas.
      index: destination.index,
      ...(toStatus === 'waiting' && item.waiting_reason
        ? { waitingReason: item.waiting_reason }
        : {}),
    },
  };
}
