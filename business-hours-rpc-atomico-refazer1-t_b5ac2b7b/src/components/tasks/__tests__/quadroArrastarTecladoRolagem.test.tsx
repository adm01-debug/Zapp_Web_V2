import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';

import { makeTaskRow } from '@/test/mocks/tarefas';
import { TasksBoardMode } from '@/components/tasks/board/TasksBoardMode';
import { TooltipProvider } from '@/components/ui/tooltip';
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
  /** última resposta de `isDropDisabled` por coluna. */
  dropBloqueado: {} as Record<string, boolean>,
}));

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: (props: { children: ReactNode } & CtxDnd) => {
    ctl.ctx = props;
    return props.children;
  },
  Droppable: ({ droppableId, isDropDisabled, children }: { droppableId: string; isDropDisabled?: boolean; children: (p: unknown, s: unknown) => ReactNode }) => {
    ctl.dropBloqueado[droppableId] = Boolean(isDropDisabled);
    return children(
      { innerRef: () => undefined, droppableProps: {}, placeholder: null },
      { isDraggingOver: ctl.sobre === droppableId },
    );
  },
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
  ctl.dropBloqueado = {};
});
afterEach(() => { cleanup(); vi.useRealTimers(); });


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
      expect(ctl.dropBloqueado.todo, 'no toque ainda não armado, a coluna não aceita soltura').toBe(true);
      expect(dica()?.textContent).toBe('Pressione e segure para arrastar');

      fireEvent.pointerDown(corpo);
      act(() => { vi.advanceTimersByTime(300); });
      expect(ctl.bloqueado['b1']).toBe(false);
      expect(ctl.dropBloqueado.todo, 'depois da pressão longa, o Droppable volta a aceitar a soltura').toBe(false);
      expect(dica()?.textContent).toBe('Arraste o cartão');

      fireEvent.pointerUp(corpo);
      expect(ctl.bloqueado['b1'], 'a pressão longa continua armada para o arrasto seguinte').toBe(false);

      fireEvent.pointerDown(corpo);
      fireEvent.pointerUp(corpo);
      expect(ctl.bloqueado['b1']).toBe(true);
    } finally {
      desfazer();
    }
  });
});


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

    const corpo = coluna('doing')!.querySelector<HTMLElement>('[class*="ring-primary"]');
    expect(corpo?.className).toContain('ring-inset');
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

  it('no toque, Aguardando só realça depois da pressão longa armar o arrasto', () => {
    const desfazer = fingirMidia(q => q.includes('pointer: coarse'));
    vi.useFakeTimers();
    try {
      renderQuadro({
        byStatus: {
          ...VAZIO,
          backlog: [item({ id: 'b1', status: 'backlog' })],
          waiting: [item({ id: 'w1', status: 'waiting' })],
        },
      });

      const b1 = cartao('b1')!;
      fireEvent.pointerDown(b1);
      comecarArrasto('backlog');
      expect(screen.queryByTestId('board-waiting-emphasis'), 'toque antes da pressão longa não realça').toBeNull();

      act(() => { vi.advanceTimersByTime(300); });

      const realce = screen.getByTestId('board-waiting-emphasis');
      expect(realce.getAttribute('data-board-column')).toBe('waiting');
      expect(realce.className).toContain('ring-warning/60');
    } finally {
      desfazer();
    }
  });
});


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

    comecarArrasto('backlog');
    const b2 = cartao('b2')!;
    b1.focus();
    fireEvent.keyDown(b1, { key: 'ArrowDown' });
    expect(document.activeElement, 'durante o arrasto o teclado do Quadro não move o foco').toBe(b1);
    expect(b2).toBeTruthy();
  });
});


describe('etapa 098 — rolagem horizontal', () => {
  it('o trilho rola com snap e encaixe animado, e a coluna rola por dentro', () => {
    renderQuadro({ byStatus: { ...VAZIO, backlog: [item({ id: 'b1', status: 'backlog' })] } });

    const t = trilho()!;
    expect(t.className).toMatch(/(^|\s)overflow-x-auto(\s|$)/);
    expect(t.className).toMatch(/(^|\s)snap-x(\s|$)/);
    expect(t.className).toContain('motion-safe:scroll-smooth');

    expect(coluna('backlog')!.querySelector('[class*="overflow-y-auto"]')).toBeTruthy();
  });

  it('as sombras das bordas aparecem no carregamento e acompanham scroll/resize', async () => {
    const propriedades = ['clientWidth', 'scrollWidth', 'scrollLeft'] as const;
    const descritoresOriginais = propriedades.map(nome => [
      nome,
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, nome),
    ] as const);
    const larguraVisivel = 300;
    let larguraTotal = 900;
    let deslocamento = 0;
    const ehTrilho = (el: HTMLElement) => String(el.className ?? '').includes('overflow-x-auto');
    const restaurar = () => {
      for (const [nome, descritor] of descritoresOriginais) {
        if (descritor) Object.defineProperty(HTMLElement.prototype, nome, descritor);
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[nome];
      }
    };

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() { return ehTrilho(this) ? larguraVisivel : 0; },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() { return ehTrilho(this) ? larguraTotal : 0; },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollLeft', {
      configurable: true,
      get() { return ehTrilho(this) ? deslocamento : 0; },
      set(valor: number) { if (ehTrilho(this)) deslocamento = Number(valor); },
    });

    try {
      renderQuadro({ byStatus: { ...VAZIO, backlog: [item({ id: 'b1', status: 'backlog' })] } });

      const t = trilho()!;
      expect(screen.queryByTestId('board-scroll-shadow-left')).toBeNull();
      expect(await screen.findByTestId('board-scroll-shadow-right'), 'já mede no carregamento, sem primeiro scroll').toBeTruthy();

      deslocamento = 300;
      fireEvent.scroll(t);
      expect(screen.getByTestId('board-scroll-shadow-left')).toBeTruthy();
      expect(screen.getByTestId('board-scroll-shadow-right')).toBeTruthy();

      deslocamento = 600;
      fireEvent.scroll(t);
      expect(screen.getByTestId('board-scroll-shadow-left')).toBeTruthy();
      expect(screen.queryByTestId('board-scroll-shadow-right')).toBeNull();

      deslocamento = 0;
      larguraTotal = 300;
      window.dispatchEvent(new Event('resize'));
      await waitFor(() => {
        expect(screen.queryByTestId('board-scroll-shadow-left')).toBeNull();
        expect(screen.queryByTestId('board-scroll-shadow-right')).toBeNull();
      });
    } finally {
      restaurar();
    }
  });
});
