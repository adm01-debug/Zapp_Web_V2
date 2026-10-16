/**
 * Etapa 105 do plano de design — **Testes de arrastar, teclado e acessibilidade**
 * (`docs/plans/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`,
 * linha 364): "Atualizar `resolveDragEnd`, limite cheio e motivo obrigatório."
 * Elemento da imagem 05 na tabela da seção 3.5, linha 148: "Alvos e arrasto
 * polidos (alça, destaque da coluna)".
 *
 * Conferência contra o código ATUAL (16/10/2026) — o que já estava coberto NÃO
 * foi reescrito (o relato da entrega cita o arquivo de cada um):
 *
 *  limite cheio .......... `board/__tests__/resolveDragEnd.limites.test.ts` (E23:
 *                          3/3 bloqueia, 15 e 5 avisam e não bloqueiam) + o toast e
 *                          o tremor em `board/__tests__/BoardColumn.subtitulo-limite.test.tsx`
 *                          (etapa 083).
 *  teclado e a11y ......... `quadroArrastarTecladoRolagem.test.tsx` (etapa 097) e
 *                          `TasksBoardMode.a11y.test.tsx` (região viva).
 *
 * O que FALTAVA, e é o corpo deste arquivo:
 *  1. `indiceDeDestino` / `fullByStatus` (#423) — nenhum teste do repositório citava
 *     o parâmetro; a tradução "índice do recorte visível → posição na coluna
 *     completa" não tinha prova nenhuma;
 *  2. o caminho `null` (arrasto cancelado, id fora das colunas) e a transição
 *     proibida (`invalid_transition`);
 *  3. o motivo obrigatório pelo caminho do ARRASTO (o que existia provava pelo
 *     teclado, em 097) — incluindo o índice traduzido chegando ao `onMove` da tela.
 *
 * O `@hello-pangea/dnd` é substituído por um mock que guarda o `onDragEnd` (mesmo
 * padrão de `BoardColumn.subtitulo-limite.test.tsx`): o drop é exercitado sem
 * depender de geometria real no jsdom.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { DropResult } from '@hello-pangea/dnd';

import { makeTaskRow } from '@/test/mocks/tarefas';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksBoardMode } from '@/components/tasks/board/TasksBoardMode';
import { resolveDragEnd, indiceDeDestino } from '@/components/tasks/board/resolveDragEnd';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

/** O `onDragEnd` que o quadro registrou (o mock do dnd preenche). */
const dnd = vi.hoisted(() => ({
  onDragEnd: undefined as undefined | ((r: unknown) => void),
}));

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ onDragEnd, children }: { onDragEnd: (r: unknown) => void; children: ReactNode }) => {
    dnd.onDragEnd = onDragEnd;
    return children;
  },
  Droppable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) =>
    children({ innerRef: () => undefined, droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
  Draggable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) =>
    children({ innerRef: () => undefined, draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
}));

function item(over: Record<string, unknown> = {}): WorkItem {
  return makeTaskRow(over) as unknown as WorkItem;
}

/** Coluna completa (sem o recorte do filtro): `status` da coluna, `position` 0..n-1. */
function coluna(status: WorkItemStatus, ids: string[]): WorkItem[] {
  return ids.map((id, i) => item({ id, status, position: i }));
}

function colunas(over: Partial<Record<WorkItemStatus, WorkItem[]>> = {}): Record<WorkItemStatus, WorkItem[]> {
  return { backlog: [], todo: [], doing: [], waiting: [], done: [], cancelled: [], ...over };
}

/** `DropResult` mínimo — só `draggableId`, `source` e `destination` entram na decisão. */
function drop(draggableId: string, de: WorkItemStatus, deIndex: number, para: WorkItemStatus, paraIndex = 0): DropResult {
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

const VAZIO = colunas();

beforeEach(() => { cleanup(); dnd.onDragEnd = undefined; });
afterEach(() => { cleanup(); });

// ---------------------------------------------------------------------------
// #423 — índice do RECORTE visível → posição na coluna COMPLETA
// ---------------------------------------------------------------------------

describe('etapa 105 — indiceDeDestino traduz o recorte visível para a coluna completa (#423)', () => {
  const CASOS: Array<{ caso: string; visiveis: string[]; completas: string[]; indice: number; esperado: number }> = [
    { caso: 'solta antes do 1º cartão visível → posição dele na completa', visiveis: ['a', 'b'], completas: ['x', 'a', 'b', 'y'], indice: 0, esperado: 1 },
    { caso: 'solta antes do 2º cartão visível → posição dele na completa', visiveis: ['a', 'b'], completas: ['x', 'a', 'b', 'y'], indice: 1, esperado: 2 },
    { caso: 'solta depois do último visível → ANEXA no fim da completa', visiveis: ['a', 'b'], completas: ['x', 'a', 'b', 'y'], indice: 2, esperado: 4 },
    { caso: 'coluna visível vazia (o filtro escondeu tudo) → anexa no fim', visiveis: [], completas: ['x', 'y'], indice: 0, esperado: 2 },
    { caso: 'coluna visível e completa vazias → 0', visiveis: [], completas: [], indice: 0, esperado: 0 },
    { caso: 'vizinho visível não está na completa (dado incoerente) → cai no índice visível', visiveis: ['z'], completas: ['x', 'y'], indice: 0, esperado: 0 },
  ];

  it.each(CASOS)('$caso', ({ visiveis, completas, indice, esperado }) => {
    const vis = visiveis.map((id) => item({ id }));
    const comp = completas.map((id) => item({ id }));

    // A âncora é o VIZINHO visível: o oculto antes dele fica onde estava.
    expect(indiceDeDestino(vis, comp, indice)).toBe(esperado);
  });

  it('com fullByStatus o arrasto leva o índice traduzido; sem ela, o índice visível vai cru', () => {
    const alvo = item({ id: 'alvo', status: 'todo' });
    // Recorte visível: 1 cartão em Fazendo. Coluna completa: x, d0, y.
    const visivel = colunas({ todo: [alvo], doing: coluna('doing', ['d0']) });
    const completa = colunas({ todo: [alvo], doing: coluna('doing', ['x', 'd0', 'y']) });

    const traduzido = resolveDragEnd(drop('alvo', 'todo', 0, 'doing', 0), visivel, undefined, completa);
    // Soltar ANTES de d0 = posição de d0 na coluna completa (1); os dois ocultos seguem.
    expect(traduzido).toEqual({ action: 'move', item: alvo, to: 'doing', opts: { index: 1 } });

    const cru = resolveDragEnd(drop('alvo', 'todo', 0, 'doing', 0), visivel);
    expect(cru).toEqual({ action: 'move', item: alvo, to: 'doing', opts: { index: 0 } });
  });

  it('soltar depois do último visível anexa no fim da coluna completa', () => {
    const alvo = item({ id: 'alvo', status: 'todo' });
    const visivel = colunas({ todo: [alvo], doing: coluna('doing', ['d0']) });
    const completa = colunas({ todo: [alvo], doing: coluna('doing', ['x', 'd0', 'y']) });

    const decisao = resolveDragEnd(drop('alvo', 'todo', 0, 'doing', 1), visivel, undefined, completa);

    expect(decisao).toEqual({ action: 'move', item: alvo, to: 'doing', opts: { index: 3 } });
  });
});

// ---------------------------------------------------------------------------
// Portões: nada a fazer e transição proibida
// ---------------------------------------------------------------------------

describe('etapa 105 — arrasto cancelado, id desconhecido e transição proibida', () => {
  it('arrasto cancelado (sem destino) não decide nada', () => {
    const alvo = item({ id: 'alvo', status: 'todo' });
    const resultado = { ...drop('alvo', 'todo', 0, 'doing'), destination: null } as DropResult;

    expect(resolveDragEnd(resultado, colunas({ todo: [alvo] }))).toBeNull();
  });

  it('id que não está em nenhuma coluna não decide nada', () => {
    expect(resolveDragEnd(drop('fantasma', 'todo', 0, 'doing'), VAZIO)).toBeNull();
  });

  it.each([
    { caso: 'Concluído/Cancelado não anda mais (arquivo morto)', de: 'cancelled' as WorkItemStatus, para: 'todo' as WorkItemStatus },
    { caso: 'nem "Fazendo" volta para a Caixa de entrada (a volta só sai de A fazer/Aguardando)', de: 'doing' as WorkItemStatus, para: 'backlog' as WorkItemStatus },
  ])('$caso → bloqueado por invalid_transition', ({ de, para }) => {
    const alvo = item({ id: 'alvo', status: de });
    const decisao = resolveDragEnd(drop('alvo', de, 0, para, 0), colunas({ [de]: [alvo] }));

    // O motivo distingue a transição proibida da trava de WIP.
    expect(decisao).toEqual({ action: 'blocked', reason: 'invalid_transition' });
  });

  it('de "A fazer" a volta para a Caixa de entrada é permitida (a proibição não é geral)', () => {
    const alvo = item({ id: 'alvo', status: 'todo', position: 0 });
    const decisao = resolveDragEnd(drop('alvo', 'todo', 0, 'backlog', 0), colunas({ todo: [alvo] }));

    expect(decisao).toEqual({ action: 'move', item: alvo, to: 'backlog', opts: { index: 0 } });
  });
});

// ---------------------------------------------------------------------------
// Motivo obrigatório pelo caminho do ARRASTO (a tela, não só a função pura)
// ---------------------------------------------------------------------------

describe('etapa 105 — motivo obrigatório e índice traduzido na tela do Quadro', () => {
  it('soltar em Aguardando sem motivo pede o motivo e NÃO escreve', () => {
    const alvo = item({ id: 't1', status: 'todo', title: 'Retorno da transportadora' });
    const onMove = vi.fn();
    const onRequestWaitingReason = vi.fn();

    render(
      <TooltipProvider>
        <TasksBoardMode
          byStatus={colunas({ todo: [alvo] })}
          isLoading={false}
          onMove={onMove}
          onReorder={vi.fn()}
          onOpen={vi.fn()}
          onDelete={vi.fn()}
          onCreate={vi.fn()}
          onRequestWaitingReason={onRequestWaitingReason}
        />
      </TooltipProvider>,
    );
    act(() => dnd.onDragEnd?.(drop('t1', 'todo', 0, 'waiting', 0)));

    expect(onRequestWaitingReason).toHaveBeenCalledTimes(1);
    expect(onRequestWaitingReason.mock.calls[0][0]).toMatchObject({ id: 't1' });
    // O portão abre a folha: nada é gravado antes do motivo existir.
    expect(onMove).not.toHaveBeenCalled();
  });

  it('o índice da coluna COMPLETA chega ao onMove quando há filtro (#423)', () => {
    const alvo = item({ id: 't1', status: 'todo' });
    const onMove = vi.fn();

    render(
      <TooltipProvider>
        <TasksBoardMode
          byStatus={colunas({ todo: [alvo], doing: [] })}
          byStatusFull={colunas({ todo: [alvo], doing: coluna('doing', ['d0', 'd1']) })}
          isLoading={false}
          onMove={onMove}
          onReorder={vi.fn()}
          onOpen={vi.fn()}
          onDelete={vi.fn()}
          onCreate={vi.fn()}
        />
      </TooltipProvider>,
    );
    act(() => dnd.onDragEnd?.(drop('t1', 'todo', 0, 'doing', 0)));

    // A coluna VISÍVEL de Fazendo está vazia: o índice visível (0) anexa no FIM da
    // coluna completa (2) — é essa posição que o hook persiste.
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0][0]).toMatchObject({ id: 't1' });
    expect(onMove.mock.calls[0][1]).toBe('doing');
    expect(onMove.mock.calls[0][2]).toEqual({ index: 2 });
  });
});