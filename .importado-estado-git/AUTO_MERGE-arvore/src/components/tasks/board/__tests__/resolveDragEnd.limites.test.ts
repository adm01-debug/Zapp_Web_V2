/**
 * E23 (fusão Quadro→Tarefas) — LIMITES do arrasto em `resolveDragEnd`, em TABELA.
 *
 * A decisão do arrasto é pura (`src/components/tasks/board/resolveDragEnd.ts`), então os
 * limites de WIP (`WIP_LIMITS`) podem ser exercitados sem React e sem a geometria do DnD.
 * O que esta tabela fecha:
 *  - a única trava DURA é "Fazendo" (3) e ela vale para o que VEM DE FORA;
 *  - os limites SUAVES de "A fazer" (15) e "Aguardando" (5) avisam (o `BoardColumn` pinta o
 *    cabeçalho com o anel de aviso) e NUNCA bloqueiam o arrasto;
 *  - entrar em "Aguardando" exige motivo (a folha abre em vez de escrever no banco);
 *  - soltar na mesma coluna não muda nada (nem passa por portão nenhum).
 *
 * O esperado de cada linha é a REGRA de negócio (3 / 15 / 5, o portão do motivo), não uma
 * cópia do código: cada linha monta a coluna de destino com N itens de verdade e exige do
 * arrasto o veredito da regra.
 *
 * Por que só a decisão aqui: quem interpreta o veredito (`toast.error`, `onMove`,
 * `onRequestWaitingReason`) e quem pinta o aviso de coluna cheia é o `TasksBoardMode` /
 * `BoardColumn`, cobertos pelos testes de tela do módulo.
 */
import { describe, it, expect } from 'vitest';
import type { DropResult } from '@hello-pangea/dnd';
import { resolveDragEnd } from '@/components/tasks/board/resolveDragEnd';
import {
  type WorkItem,
  type WorkItemStatus,
} from '@/hooks/tasks/workItem.types';
// Fixture do banco (mesmo shape) — o harness já existe para não duplicar dados.
import { makeTaskRow } from '@/test/mocks/tarefas';

/** Item do domínio a partir da linha que o banco devolve. */
function item(over: Record<string, unknown> = {}): WorkItem {
  return makeTaskRow(over) as unknown as WorkItem;
}

/** As seis colunas do quadro; o que o caso pedir sobrescreve, o resto nasce vazio. */
function colunas(
  over: Partial<Record<WorkItemStatus, WorkItem[]>> = {},
): Record<WorkItemStatus, WorkItem[]> {
  return { backlog: [], todo: [], doing: [], waiting: [], done: [], cancelled: [], ...over };
}

/** `DropResult` mínimo — só `draggableId`, `source` e `destination` entram na decisão. */
function drop(
  draggableId: string,
  de: WorkItemStatus,
  deIndex: number,
  para: WorkItemStatus,
  paraIndex = 0,
): DropResult {
  return {
    draggableId,
    type: 'DEFAULT',
    mode: 'FLUID',
    reason: 'DROP',
    combine: null,
    source: { droppableId: de, index: deIndex },
    destination: { droppableId: para, index: paraIndex },
  };
}

/** N itens coerentes com a coluna: id e `status` da própria coluna, `position` 0..n-1. */
function preenche(para: WorkItemStatus, n: number): WorkItem[] {
  return Array.from({ length: n }, (_, i) =>
    item({ id: `${para}-${i}`, status: para, position: i }),
  );
}

describe('resolveDragEnd — limites do arrasto (E23)', () => {
  /**
   * O destino é preenchido até o número da linha ANTES do arrasto; o item arrastado vem de
   * outra coluna (é o caso em que o portão de destino se aplica).
   */
  const CASOS_DE_LIMITE: Array<{
    caso: string;
    de: WorkItemStatus;
    para: WorkItemStatus;
    quantosNoDestino: number;
    motivoDoItem?: string;
    esperado: 'move' | 'blocked';
  }> = [
    { caso: 'Fazendo com 1 item (abaixo da trava): o arrasto passa', de: 'todo', para: 'doing', quantosNoDestino: 1, esperado: 'move' },
    { caso: 'Fazendo com 2 itens (trava-1): o arrasto passa', de: 'todo', para: 'doing', quantosNoDestino: 2, esperado: 'move' },
    { caso: 'Fazendo com 3 itens (trava dura exata): BLOQUEADO', de: 'todo', para: 'doing', quantosNoDestino: 3, esperado: 'blocked' },
    { caso: 'Fazendo com 4 itens (trava+1): segue BLOQUEADO', de: 'todo', para: 'doing', quantosNoDestino: 4, esperado: 'blocked' },
    { caso: 'A fazer com 15 itens (limite suave exato): avisa e NÃO bloqueia', de: 'backlog', para: 'todo', quantosNoDestino: 15, esperado: 'move' },
    { caso: 'A fazer com 16 itens (limite suave+1): avisa e NÃO bloqueia', de: 'backlog', para: 'todo', quantosNoDestino: 16, esperado: 'move' },
    { caso: 'Aguardando com 5 itens (limite suave exato): avisa e NÃO bloqueia', de: 'todo', para: 'waiting', quantosNoDestino: 5, motivoDoItem: 'Cliente responde', esperado: 'move' },
    { caso: 'Aguardando com 6 itens (limite suave+1): avisa e NÃO bloqueia', de: 'todo', para: 'waiting', quantosNoDestino: 6, motivoDoItem: 'Cliente responde', esperado: 'move' },
  ];

  it.each(CASOS_DE_LIMITE)(
    '$caso',
    ({ de, para, quantosNoDestino, motivoDoItem, esperado }) => {
      const alvo = item({
        id: 'alvo',
        status: de,
        ...(motivoDoItem ? { waiting_reason: motivoDoItem } : {}),
      });
      const byStatus = colunas({ [de]: [alvo], [para]: preenche(para, quantosNoDestino) });

      // Arrasta para a ÚLTIMA posição do destino (a que exige `hard` de verdade).
      const decisao = resolveDragEnd(drop('alvo', de, 0, para, quantosNoDestino), byStatus);

      if (esperado === 'blocked') {
        // O motivo distingue a trava de WIP de uma transição inválida.
        expect(decisao).toEqual({ action: 'blocked', reason: 'wip_full' });
        return;
      }

      // Avisa (limite suave estourado) mas o arrasto segue: `move`, sem portão.
      expect(decisao).toMatchObject({ action: 'move', item: alvo, to: para });
    },
  );

  /**
   * "Soltar na mesma coluna não muda nada": volta para o próprio índice — mesma ordem,
   * mesmo `position`, sem passar pela trava dura (etapa 52) nem pelo portão do motivo.
   */
  it.each([
    { coluna: 'doing' as WorkItemStatus, quantos: 3 }, // coluna na trava dura (3/3)
    { coluna: 'todo' as WorkItemStatus, quantos: 15 }, // coluna no limite suave
    { coluna: 'waiting' as WorkItemStatus, quantos: 2 }, // sem motivo: o portão é só na ENTRADA
  ])(
    'soltar na mesma coluna ($coluna, $quantos itens) reordena no próprio lugar, sem portão',
    ({ coluna, quantos }) => {
      const itens = preenche(coluna, quantos);
      const primeiro = itens[0];
      const decisao = resolveDragEnd(
        drop(primeiro.id, coluna, 0, coluna, 0),
        colunas({ [coluna]: itens }),
      );

      // Nem bloqueado, nem movido: a MESMA ordem de volta.
      expect(decisao).toEqual({
        action: 'reorder',
        positions: itens.map((it, idx) => ({ id: it.id, position: idx })),
      });
    },
  );

  it.each([
    { rotulo: 'sem motivo (null)', motivo: null as string | null, esperado: 'need_reason' as const },
    { rotulo: 'com motivo vazio', motivo: '', esperado: 'need_reason' as const },
    { rotulo: 'com motivo só de espaços', motivo: '   ', esperado: 'need_reason' as const },
    { rotulo: 'com motivo escrito', motivo: 'Cliente responde', esperado: 'move' as const },
  ])('entrar em "Aguardando" $rotulo → $esperado', ({ motivo, esperado }) => {
    const alvo = item({ id: 'alvo', status: 'todo', waiting_reason: motivo });
    const byStatus = colunas({ todo: [alvo] });

    const decisao = resolveDragEnd(drop('alvo', 'todo', 0, 'waiting', 0), byStatus);

    if (esperado === 'need_reason') {
      // Não é bloqueio: é o convite para abrir a folha e escrever o motivo.
      expect(decisao).toEqual({ action: 'need_reason', item: alvo });
      return;
    }

    // Com motivo, o arrasto passa e leva o motivo para o `onMove` (o Sheet não abre).
    expect(decisao).toEqual({
      action: 'move',
      item: alvo,
      to: 'waiting',
      opts: { index: 0, waitingReason: motivo },
    });
  });
});
