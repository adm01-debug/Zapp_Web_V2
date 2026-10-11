/**
 * Etapas 094 a 098 do Quadro (plano de design, 2026-10-11): arrastar polido
 * (placeholder tracejado, overlay `--shadow-lg`, encaixe animado, pressão longa
 * no toque), alvo de soltura, Aguardando âmbar, teclado do Quadro e rolagem com
 * snap e sombras de borda.
 *
 * Passa pelo componente REAL (`TasksBoardMode` → `BoardColumn`) e pela decisão
 * real (`resolveDragEnd`). O `@hello-pangea/dnd` não roda no jsdom (mesmo motivo
 * dos testes vizinhos), então ele é substituído por um mock CONTROLÁVEL: só o
 * ambiente do arrasto é fingido (quem está levantado / sobre quem), nunca a regra.
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

// Harness do domínio ANTES dos módulos sob teste (registra os `vi.mock`).
import { makeTaskRow } from '@/test/mocks/tarefas';
import { TasksBoardMode } from '@/components/tasks/board/TasksBoardMode';
import { TooltipProvider } from '@/components/ui/tooltip';
import { colunaVizinha, bordasDeRolagem } from '@/components/tasks/board/boardInteracao';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

type CtxDnd = { onDragStart: (s: { source: { droppableId: string } }) => void; onDragEnd: (r: unknown) => void };

const ctl = vi.hoisted(() => ({
  ctx: null as CtxDnd | null,
  /** droppableId com o arrasto por cima (o resto fica `isDraggingOver: false`). */
  sobre: '',
  /** draggableId levantado. */
  levantado: '',
  /** última resposta de `isDragDisabled` por cartão. */
  bloqueado: {} as Record<string, boolean>,
}));

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: (props: { children: ReactNode } & CtxDnd) => {
    ctl.ctx = props;
    return props.children;
  },
  Droppable: ({ droppableId, children }: { droppableId: string; children: (p: unknown, s: unknown) => ReactNode }) =>
    children(
      { innerRef: () => undefined, droppableProps: {}, placeholder: null },
      { isDraggingOver: ctl.sobre === droppableId },
    ),
  Draggable: ({ draggableId, isDragDisabled, children }: { draggableId: string; isDragDisabled?: boolean; children: (p: unknown, s: unknown) => ReactNode }) => {
    ctl.bloqueado[draggableId] = Boolean(isDragDisabled);
    return children(
      { innerRef: () => undefined, draggableProps: {}, dragHandleProps: {} },
      { isDragging: ctl.levantado === draggableId },
    );
  },
}));

const item = (over: Partial<WorkItem> = {}): WorkItem =>
  makeTaskRow(over as Record<string, unknown>) as unknown as WorkItem;

const VAZIO: Record<WorkItemStatus, WorkItem[]> = {
  backlog: [], todo: [], doing: [], waiting: [], done: [], cancelled: [],
};

function renderQuadro(over: Partial<Parameters<typeof TasksBoardMode>[0]> = {}) {
  const utils = render(
    <TooltipProvider>
      <TasksBoardMode
        byStatus={VAZIO}
        isLoading={false}
        onMove={vi.fn()}
        onReorder={vi.fn()}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onCreate={vi.fn().mockResolvedValue(undefined)}
        {...over}
      />
    </TooltipProvider>,
  );
  return utils;
}

const coluna = (status: WorkItemStatus) =>
  document.querySelector<HTMLElement>(`[data-board-column="${status}"]`);
const cartao = (id: string) => document.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
/** O trilho das colunas é o pai direto da primeira coluna (mesma âncora do teste de largura). */
const trilho = () => coluna('backlog')?.parentElement ?? null;

/** Mente sobre as media queries do ambiente (§ pointerMedia.ts) e devolve o desfazer. */
function fingirMidia(matches: (consulta: string) => boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((consulta: string) => ({
    matches: matches(consulta),
    media: consulta,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => { window.matchMedia = original; };
}

/** Arrasta de dentro de `origem` (liga o `onDragStart` do contexto real). */
function comecarArrasto(origem: WorkItemStatus) {
  act(() => ctl.ctx?.onDragStart({ source: { droppableId: origem } }));
}

beforeEach(() => {
  cleanup();
  ctl.ctx = null;
  ctl.sobre = '';
  ctl.levantado = '';
  ctl.bloqueado = {};
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

// ─── funções puras da etapa 097/098 (sem React) ──────────────────────────────

describe('etapa 098 — as pontas do trilho não têm vizinha', () => {
  it('colunaVizinha devolve null nas pontas e a vizinha certa no meio', () => {
    expect(colunaVizinha('backlog', -1)).toBeNull();
    expect(colunaVizinha('done', 1)).toBeNull();
    expect(colunaVizinha('backlog', 1)).toBe('todo');
    expect(colunaVizinha('waiting', -1)).toBe('doing');
  });

  it('bordasDeRolagem só acende onde ainda há conteúdo escondido', () => {
    expect(bordasDeRolagem({ scrollLeft: 0, clientWidth: 300, scrollWidth: 900 })).toEqual({ esq: false, dir: true });
    expect(bordasDeRolagem({ scrollLeft: 200, clientWidth: 300, scrollWidth: 900 })).toEqual({ esq: true, dir: true });
    expect(bordasDeRolagem({ scrollLeft: 600, clientWidth: 300, scrollWidth: 900 })).toEqual({ esq: true, dir: false });
  });
});

// ─── etapa 094 ───────────────────────────────────────────────────────────────

describe('etapa 094 — polimento do arrastar', () => {
  it('o cartão levantado ganha o overlay elevado e o lugar da soltura fica tracejado', () => {
    renderQuadro({ byStatus: { ...VAZIO, backlog: [item({ id: 'b1', status: 'backlog' })], todo: [item({ id: 't1', status: 'todo' })] } });

    expect(screen.queryByTestId('drag-overlay'), 'sem arrasto não existe overlay').toBeNull();

    ctl.levantado = 'b1';
    ctl.sobre = 'todo';
    comecarArrasto('backlog');

    const overlay = screen.getByTestId('drag-overlay');
    expect(overlay.getAttribute('data-item-id'), 'o overlay é o envoltório do cartão, não o cartão').toBeNull();
    expect(overlay.querySelector('[data-item-id="b1"]'), 'o cartão b1 está dentro do overlay').toBeTruthy();
    expect(overlay.className).toContain('shadow-[var(--shadow-lg)]');

    // O placeholder tracejado vive na coluna de DESTINO, não na de origem.
    const emTodo = coluna('todo')!.querySelector<HTMLElement>('[data-testid="board-drop-placeholder"]');
    expect(emTodo?.className).toContain('border-dashed');
    const emBacklog = coluna('backlog')!.querySelector<HTMLElement>('[data-testid="board-drop-placeholder"]');
    expect(emBacklog?.className ?? '').not.toContain('border-dashed');
  });

  it('no toque o arrasto só pega depois da pressão longa; toque curto desarma', () => {
    const desfazer = fingirMidia(q => q.includes('pointer: coarse'));
    vi.useFakeTimers();
    try {
      renderQuadro({ byStatus: { ...VAZIO, backlog: [item({ id: 'b1', status: 'backlog' })] } });

      const corpo = cartao('b1')!;
      const dica = () => coluna('backlog')!.querySelector<HTMLElement>('[data-testid="board-longpress-hint"]');
      expect(ctl.bloqueado['b1'], 'no toque o arrasto nasce bloqueado').toBe(true);
      expect(dica()?.textContent).toBe('Pressione e segure para arrastar');

      // Pressão longa: 300 ms com o dedo na coluna armam o arrasto.
      fireEvent.pointerDown(corpo);
      act(() => { vi.advanceTimersByTime(300); });
      expect(ctl.bloqueado['b1']).toBe(false);
      expect(dica()?.textContent).toBe('Arraste o cartão');

      fireEvent.pointerUp(corpo);
      expect(ctl.bloqueado['b1'], 'a pressão longa continua armada para o arrasto seguinte').toBe(false);

      // Toque curto (sem segurar) desarma de novo.
      fireEvent.pointerDown(corpo);
      fireEvent.pointerUp(corpo);
      expect(ctl.bloqueado['b1']).toBe(true);
    } finally {
      desfazer();
    }
  });
});

// ─── etapas 095/096 ──────────────────────────────────────────────────────────

describe('etapas 095/096 — alvo de soltura', () => {
  it('a coluna de destino mostra a borda primary e a dica com a contagem que fica', () => {
    renderQuadro({
      byStatus: {
        ...VAZIO,
        backlog: [item({ id: 'b1', status: 'backlog' })],
        doing: [item({ id: 'd1', status: 'doing' })],
      },
    });

    expect(screen.queryByTestId('board-drop-target')).toBeNull();

    ctl.sobre = 'doing';
    comecarArrasto('backlog');

    const dica = screen.getByTestId('board-drop-target');
    expect(dica.closest('[data-board-column]')?.getAttribute('data-board-column')).toBe('doing');
    expect(dica.textContent).toBe('Solte para mover para Fazendo (2 de 3)');

    // A borda primary é o anel do corpo da coluna (sem mudar o layout).
    const corpo = coluna('doing')!.querySelector<HTMLElement>('[class*="ring-primary"]');
    expect(corpo?.className).toContain('ring-inset');
    // Só a coluna de destino: as outras não ganham a dica.
    expect(coluna('todo')!.querySelector('[data-testid="board-drop-target"]')).toBeNull();
  });

  it('a coluna Aguardando se realça em âmbar durante o arrasto (o painel do motivo é preservado)', () => {
    renderQuadro({
      byStatus: {
        ...VAZIO,
        backlog: [item({ id: 'b1', status: 'backlog' })],
        waiting: [item({ id: 'w1', status: 'waiting' })],
      },
    });

    expect(screen.queryByTestId('board-waiting-emphasis')).toBeNull();

    comecarArrasto('backlog');

    const realce = screen.getByTestId('board-waiting-emphasis');
    expect(realce.getAttribute('data-board-column')).toBe('waiting');
    expect(realce.className).toContain('ring-warning/60');
    expect(document.querySelectorAll('[data-testid="board-waiting-emphasis"]')).toHaveLength(1);
  });
});

// ─── etapa 097 ───────────────────────────────────────────────────────────────

describe('etapa 097 — teclado do Quadro', () => {
  const doisNaCaixa = {
    backlog: [item({ id: 'b1', status: 'backlog' }), item({ id: 'b2', status: 'backlog' })],
    todo: [item({ id: 't1', status: 'todo' })],
  } as Record<WorkItemStatus, WorkItem[]>;

  it('←/→ andam entre colunas (pulando as vazias) e ↑/↓ entre os cartões', () => {
    renderQuadro({ byStatus: { ...VAZIO, ...doisNaCaixa } });
    const b1 = cartao('b1')!;
    const b2 = cartao('b2')!;
    b1.focus();

    fireEvent.keyDown(b1, { key: 'ArrowDown' });
    expect(document.activeElement, '↓ desce para o próximo cartão da coluna').toBe(b2);

    fireEvent.keyDown(b2, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(b1);

    fireEvent.keyDown(b1, { key: 'ArrowRight' });
    expect(document.activeElement, '→ pula as colunas vazias até o primeiro cartão').toBe(cartao('t1'));

    fireEvent.keyDown(cartao('t1')!, { key: 'ArrowLeft' });
    expect(document.activeElement, '← volta indexado na coluna de destino').toBe(b1);

    // Ponta do trilho: ← na Caixa de entrada não move o foco.
    fireEvent.keyDown(b1, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(b1);
  });

  it('Alt+→ move o cartão para a coluna seguinte, com o índice do destino', () => {
    const onMove = vi.fn();
    renderQuadro({ byStatus: { ...VAZIO, ...doisNaCaixa }, onMove });

    const b1 = cartao('b1')!;
    b1.focus();
    fireEvent.keyDown(b1, { key: 'ArrowRight', altKey: true });

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0][0]).toMatchObject({ id: 'b1' });
    expect(onMove.mock.calls[0][1]).toBe('todo');
    expect(onMove.mock.calls[0][2]).toMatchObject({ index: 1 });
  });

  it('Alt+→ para Aguardando abre o painel do motivo em vez de escrever no banco', () => {
    const onMove = vi.fn();
    const onRequestWaitingReason = vi.fn();
    renderQuadro({
      byStatus: { ...VAZIO, doing: [item({ id: 'd1', status: 'doing' })] },
      onMove,
      onRequestWaitingReason,
    });

    const d1 = cartao('d1')!;
    d1.focus();
    fireEvent.keyDown(d1, { key: 'ArrowRight', altKey: true });

    expect(onRequestWaitingReason).toHaveBeenCalledTimes(1);
    expect(onRequestWaitingReason.mock.calls[0][0]).toMatchObject({ id: 'd1' });
    expect(onMove, 'Aguardando sem motivo não escreve no banco').not.toHaveBeenCalled();
  });

  it('Alt+→ para Fazendo 3/3 é recusado pela trava do WIP', () => {
    const onMove = vi.fn();
    renderQuadro({
      byStatus: {
        ...VAZIO,
        todo: [item({ id: 't1', status: 'todo' })],
        doing: [item({ id: 'd1', status: 'doing' }), item({ id: 'd2', status: 'doing' }), item({ id: 'd3', status: 'doing' })],
      },
      onMove,
    });

    const t1 = cartao('t1')!;
    t1.focus();
    fireEvent.keyDown(t1, { key: 'ArrowRight', altKey: true });

    expect(onMove, 'Fazendo 3/3 recusa o cartão que vem de fora').not.toHaveBeenCalled();
  });

  it('Enter continua abrindo o cartão e, com arrasto em curso, o teclado se retira', () => {
    const onOpen = vi.fn();
    renderQuadro({ byStatus: { ...VAZIO, ...doisNaCaixa }, onOpen });
    const b1 = cartao('b1')!;
    b1.focus();

    fireEvent.keyDown(b1, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }));

    // Com o arrasto em curso quem conduz as setas é a lib de DnD: nada de brigar.
    comecarArrasto('backlog');
    const b2 = cartao('b2')!;
    b1.focus();
    fireEvent.keyDown(b1, { key: 'ArrowDown' });
    expect(document.activeElement, 'durante o arrasto o teclado do Quadro não move o foco').toBe(b1);
    expect(b2).toBeTruthy();
  });
});

// ─── etapa 098 ───────────────────────────────────────────────────────────────

describe('etapa 098 — rolagem horizontal', () => {
  it('o trilho rola com snap e encaixe animado, e a coluna rola por dentro', () => {
    renderQuadro({ byStatus: { ...VAZIO, backlog: [item({ id: 'b1', status: 'backlog' })] } });

    const t = trilho()!;
    expect(t.className).toMatch(/(^|\s)overflow-x-auto(\s|$)/);
    expect(t.className).toMatch(/(^|\s)snap-x(\s|$)/);
    expect(t.className).toContain('motion-safe:scroll-smooth');

    // Rolagem vertical interna é da coluna, não do trilho.
    expect(coluna('backlog')!.querySelector('[class*="overflow-y-auto"]')).toBeTruthy();
  });

  it('as sombras das bordas aparecem só onde há coluna escondida', () => {
    renderQuadro({ byStatus: { ...VAZIO, backlog: [item({ id: 'b1', status: 'backlog' })] } });

    const t = trilho()!;
    const medir = (scrollLeft: number) => {
      Object.defineProperty(t, 'scrollLeft', { value: scrollLeft, writable: true, configurable: true });
      Object.defineProperty(t, 'clientWidth', { value: 300, configurable: true });
      Object.defineProperty(t, 'scrollWidth', { value: 900, configurable: true });
      fireEvent.scroll(t);
    };

    expect(screen.queryByTestId('board-scroll-shadow-right')).toBeNull();

    medir(0);
    expect(screen.queryByTestId('board-scroll-shadow-left')).toBeNull();
    expect(screen.getByTestId('board-scroll-shadow-right')).toBeTruthy();

    medir(300);
    expect(screen.getByTestId('board-scroll-shadow-left')).toBeTruthy();
    expect(screen.getByTestId('board-scroll-shadow-right')).toBeTruthy();

    medir(600);
    expect(screen.getByTestId('board-scroll-shadow-left')).toBeTruthy();
    expect(screen.queryByTestId('board-scroll-shadow-right')).toBeNull();
  });
});
