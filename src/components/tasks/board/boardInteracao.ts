// Etapas 094–098 — o que o Quadro decide FORA do React: a ordem das colunas, a
// vizinha de cada uma, o movimento por teclado (com as MESMAS travas do arrasto)
// e as sombras de rolagem do trilho.
//
// Vive num `.ts` (e não no `.tsx` do componente) pela mesma razão do
// `resolveDragEnd`: é regra testável sem montar React, e exportar função de
// arquivo de componente reprova no `react-refresh/only-export-components`.

import type { DropResult } from '@hello-pangea/dnd';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import { resolveDragEnd, type DragEndResolution } from './resolveDragEnd';

/** Ordem do trilho — a MESMA das cinco colunas desenhadas. */
export const BOARD_ORDER: WorkItemStatus[] = ['backlog', 'todo', 'doing', 'waiting', 'done'];

/** Coluna vizinha na direção pedida; `null` nas pontas do trilho. */
export function colunaVizinha(atual: WorkItemStatus, passo: -1 | 1): WorkItemStatus | null {
  const i = BOARD_ORDER.indexOf(atual);
  if (i < 0) return null;
  const j = i + passo;
  return j >= 0 && j < BOARD_ORDER.length ? BOARD_ORDER[j] : null;
}

/**
 * Etapa 097 — movimento por teclado (Alt+←/→) decidido pela MESMA função pura do
 * arrasto (`resolveDragEnd`), para o teclado não ter trava própria: limite de
 * "Fazendo" cheio continua recusando e "Aguardando" sem motivo continua abrindo
 * o painel pedindo o motivo. O `DropResult` é montado aqui a partir do item e das
 * colunas — a origem é a coluna real do item e o destino entra no fim da coluna
 * alvo (o teclado não escolhe posição).
 */
export function resolverMoverPorTeclado(
  item: WorkItem,
  to: WorkItemStatus,
  byStatus: Record<WorkItemStatus, WorkItem[]>,
  doingCount?: number,
  byStatusFull?: Record<WorkItemStatus, WorkItem[]>,
): DragEndResolution | null {
  const origem = item.status;
  const sourceIndex = Math.max((byStatus[origem] ?? []).findIndex(i => i.id === item.id), 0);
  const result = {
    draggableId: item.id,
    type: 'DEFAULT',
    source: { droppableId: origem, index: sourceIndex },
    destination: { droppableId: to, index: (byStatus[to] ?? []).length },
    reason: 'DROP',
    mode: 'FLUID',
    combine: null,
  } as unknown as DropResult;
  return resolveDragEnd(result, byStatus, doingCount, byStatusFull);
}

/** Etapa 098 — sombra das bordas: só onde ainda há conteúdo escondido no trilho. */
export function bordasDeRolagem(medida: {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}): { esq: boolean; dir: boolean } {
  const esq = medida.scrollLeft > 1;
  const dir = medida.scrollLeft + medida.clientWidth < medida.scrollWidth - 1;
  return { esq, dir };
}
