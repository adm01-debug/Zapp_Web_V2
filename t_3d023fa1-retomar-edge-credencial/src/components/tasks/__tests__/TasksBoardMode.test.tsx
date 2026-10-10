/**
 * Etapa 87 — `handleDragEnd` do Quadro extraído para a função PURA `resolveDragEnd`
 * (`src/components/tasks/board/resolveDragEnd.ts`) e coberto aqui.
 *
 * O que estes casos fecham (DoD: ≥ 6):
 *  1. 5 colunas: as cinco colunas do quadro aceitam reordenar por dentro;
 *  2. "Fazendo" cheio (3/3) bloqueia o drop que VEM DE FORA;
 *  3. "Aguardando" sem motivo pede o motivo (não escreve no banco);
 *  4. `reorder` recalcula `position` 0..n-1;
 *  5. `move` entre colunas leva o índice de destino (é ele que persiste as DUAS ordens);
 *  6. os casos de borda que a extração não pode perder: destino nulo, id desconhecido,
 *     a contagem REAL de WIP mandando na coluna visível e a transição inválida.
 *
 * Só a decisão é exercitada — sem React e sem geometria do DnD. Quem interpreta o
 * veredito (`toast.error`, `onMove`, `onReorder`, `onRequestWaitingReason`) é o
 * componente, e a fiação dele continua coberta pelos casos de tela do
 * `taskComponents.test.tsx` (etapa 15 e etapa 52).
 */
import { describe, it, expect } from 'vitest';
import type { DropResult } from '@hello-pangea/dnd';
import { resolveDragEnd } from '@/components/tasks/board/resolveDragEnd';
import { KANBAN_COLUMNS, type WorkItem, type WorkItemStatus } from '@/hooks/tasks/workItem.types';
// Fixture do banco (mesmo shape) — o harness já existe para não duplicar dados.
import { makeTaskRow } from '@/test/mocks/tarefas';

/** Item do domínio a partir da linha que o banco devolve. */
function item(over: Record<string, unknown> = {}): WorkItem {
  return makeTaskRow(over) as unknown as WorkItem;
}

const VAZIO: Record<WorkItemStatus, WorkItem[]> = {
  backlog: [], todo: [], doing: [], waiting: [], done: [], cancelled: [],
};

/** As seis colunas com o que o caso pedir; o resto nasce vazio. */
function colunas(over: Partial<Record<WorkItemStatus, WorkItem[]>> = {}) {
  return { ...VAZIO, ...over };
}

/** `DropResult` mínimo — só `source`, `destination` e `draggableId` entram na decisão. */
function drop(
  draggableId: string,
  de: WorkItemStatus,
  deIndex: number,
  para: WorkItemStatus | null,
  paraIndex = 0,
): DropResult {
  return {
    draggableId,
    type: 'DEFAULT',
    mode: 'FLUID',
    reason: 'DROP',
    combine: null,
    source: { droppableId: de, index: deIndex },
    destination: para === null ? null : { droppableId: para, index: paraIndex },
  };
}

describe('resolveDragEnd — decisão do arrasto do Quadro (etapa 87)', () => {
  it('1) as 5 colunas do quadro reordenam por dentro e recalculam a position', () => {
    // A fonte da verdade da lista de colunas é a KANBAN_COLUMNS (5 rótulos visíveis).
    expect(KANBAN_COLUMNS).toHaveLength(5);

    for (const { status } of KANBAN_COLUMNS) {
      const coluna = [
        item({ id: `${status}-a`, status }),
        item({ id: `${status}-b`, status }),
        item({ id: `${status}-c`, status }),
      ];
      const decisao = resolveDragEnd(
        drop(`${status}-a`, status, 0, status, 2),
        colunas({ [status]: coluna }),
      );

      expect(decisao, `coluna ${status}`).toEqual({
        action: 'reorder',
        positions: [
          { id: `${status}-b`, position: 0 },
          { id: `${status}-c`, position: 1 },
          { id: `${status}-a`, position: 2 },
        ],
      });
    }
  });

  it('2) reorder recalcula position 0..n-1 na ordem de destino', () => {
    const decisao = resolveDragEnd(
      // m1 está no índice 1 e cai na frente (índice 0).
      drop('m1', 'todo', 1, 'todo', 0),
      colunas({
        todo: [
          item({ id: 'm0', status: 'todo' }),
          item({ id: 'm1', status: 'todo' }),
          item({ id: 'm2', status: 'todo' }),
        ],
      }),
    );

    // m1 sai do fim e entra na frente: nada de reusar a position antiga.
    expect(decisao).toEqual({
      action: 'reorder',
      positions: [
        { id: 'm1', position: 0 },
        { id: 'm0', position: 1 },
        { id: 'm2', position: 2 },
      ],
    });
  });

  it('3) "Fazendo" cheio (3/3) bloqueia o drop que vem de fora', () => {
    const decisao = resolveDragEnd(
      drop('t1', 'todo', 0, 'doing', 0),
      colunas({
        doing: [
          item({ id: 'f1', status: 'doing' }),
          item({ id: 'f2', status: 'doing' }),
          item({ id: 'f3', status: 'doing' }),
        ],
        todo: [item({ id: 't1', status: 'todo' })],
      }),
    );

    expect(decisao).toEqual({ action: 'blocked', reason: 'wip_full' });
  });

  it('4) reorganizar por dentro da coluna "Fazendo" cheia NÃO é bloqueado (etapa 52)', () => {
    const decisao = resolveDragEnd(
      drop('f3', 'doing', 2, 'doing', 0),
      colunas({
        doing: [
          item({ id: 'f1', status: 'doing' }),
          item({ id: 'f2', status: 'doing' }),
          item({ id: 'f3', status: 'doing' }),
        ],
      }),
    );

    // Mesma coluna: o WIP não se aplica — só a ordem muda.
    expect(decisao?.action).toBe('reorder');
  });

  it('5) a contagem REAL de WIP manda: doingCount 0 libera mesmo com a coluna visível cheia', () => {
    const byStatus = colunas({
      doing: [
        item({ id: 'f1', status: 'doing' }),
        item({ id: 'f2', status: 'doing' }),
        item({ id: 'f3', status: 'doing' }),
      ],
      todo: [item({ id: 't1', status: 'todo' })],
    });

    // A coluna VISÍVEL está cheia, mas o dono liberou um item (dado real = 0).
    const decisao = resolveDragEnd(drop('t1', 'todo', 0, 'doing', 0), byStatus, 0);
    expect(decisao).toMatchObject({ action: 'move', to: 'doing', opts: { index: 0 } });

    // Sem o número real, a trava cai na própria coluna visível (3/3) e bloqueia.
    expect(resolveDragEnd(drop('t1', 'todo', 0, 'doing', 1), byStatus)).toEqual({
      action: 'blocked',
      reason: 'wip_full',
    });
  });

  it('6) "Aguardando" sem motivo PEDE o motivo em vez de mover', () => {
    const alvo = item({ id: 't1', status: 'todo', waiting_reason: null });
    const decisao = resolveDragEnd(
      drop('t1', 'todo', 0, 'waiting', 0),
      colunas({ todo: [alvo] }),
    );

    expect(decisao).toEqual({ action: 'need_reason', item: alvo });
  });

  it('7) "Aguardando" COM motivo move e leva o waitingReason para o onMove', () => {
    const alvo = item({ id: 't1', status: 'todo', waiting_reason: 'Cliente responde' });
    const decisao = resolveDragEnd(
      drop('t1', 'todo', 0, 'waiting', 0),
      colunas({ todo: [alvo] }),
    );

    expect(decisao).toMatchObject({
      action: 'move',
      item: alvo,
      to: 'waiting',
      opts: { index: 0, waitingReason: 'Cliente responde' },
    });
  });

  it('8) mover entre colunas leva o índice de destino — é ele que persiste as DUAS ordens', () => {
    const alvo = item({ id: 't1', status: 'todo' });
    const decisao = resolveDragEnd(
      drop('t1', 'todo', 0, 'doing', 2),
      colunas({ todo: [alvo], doing: [item({ id: 'f1', status: 'doing' })] }),
    );

    // A função pura entrega o `index` de destino (etapa 15); o hook `useMyWorkItems`
    // recalcula a ordem da origem e do destino e grava as duas num único upsert.
    expect(decisao).toEqual({
      action: 'move',
      item: alvo,
      to: 'doing',
      opts: { index: 2 },
    });
  });

  it('9) destino nulo (arrasto cancelado) e id desconhecido não decidem nada', () => {
    const byStatus = colunas({ todo: [item({ id: 't1', status: 'todo' })] });

    expect(resolveDragEnd(drop('t1', 'todo', 0, null), byStatus)).toBeNull();
    expect(resolveDragEnd(drop('inexistente', 'todo', 0, 'doing', 0), byStatus)).toBeNull();
  });

  it('10) transição inválida (Concluído → Fazendo) é bloqueada sem passar pela trava de WIP', () => {
    const decisao = resolveDragEnd(
      drop('d1', 'done', 0, 'doing', 0),
      colunas({ done: [item({ id: 'd1', status: 'done' })] }),
    );

    expect(decisao).toEqual({ action: 'blocked', reason: 'invalid_transition' });
  });
});
