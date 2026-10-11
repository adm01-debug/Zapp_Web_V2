/**
 * Etapas 080, 082 e 083 do Quadro (plano
 * `PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`):
 *
 *  080 — as 5 colunas mostram o SUBTÍTULO curto (`KANBAN_COLUMNS.subtitle`) à
 *        vista; a política LONGA continua só no tooltip do ⓘ (não duplica texto).
 *  082 — a coluna de limite duro ("Fazendo") ganha contador "3/3", barra de
 *        progresso SEGMENTADA (primária até encher, destrutiva quando cheia) e o
 *        rodapé "Seu limite é de 3 tarefas em execução." com ícone de informação.
 *  083 — soltar em "Fazendo" cheio faz a coluna tremer curto (o tranco só existe
 *        SEM movimento reduzido — `motion-safe:animate-wiggle`; a BORDA muda
 *        sempre) e mostra o toast explicativo. O card volta à origem: o
 *        `onMove` NÃO é chamado.
 *
 * O `@hello-pangea/dnd` é substituído por um mock que guarda o `onDragEnd`
 * (mesmo padrão de `taskComponents.test.tsx`): assim o drop é exercitado sem
 * depender de geometria real no jsdom.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import type { ReactNode } from 'react';

import { makeTaskRow, supabaseMock } from '@/test/mocks/tarefas';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BoardColumn } from '../BoardColumn';
import { TasksBoardMode } from '../TasksBoardMode';
import { KANBAN_COLUMNS, type WorkItem, type WorkItemStatus } from '@/hooks/tasks/workItem.types';

/** O `onDragEnd` que o quadro registrou (o mock do dnd preenche). */
const dnd = vi.hoisted(() => ({
  onDragEnd: undefined as undefined | ((r: unknown) => void),
  onDragStart: undefined as undefined | ((r: unknown) => void),
}));

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ onDragEnd, onDragStart, children }: {
    onDragEnd: (r: unknown) => void;
    onDragStart?: (r: unknown) => void;
    children: ReactNode;
  }) => {
    dnd.onDragEnd = onDragEnd;
    dnd.onDragStart = onDragStart;
    return children;
  },
  Droppable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) =>
    children({ innerRef: () => undefined, droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
  Draggable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) =>
    children({ innerRef: () => undefined, draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
}));

/**
 * O `sonner` já vem mockado por `@/test/mocks/tarefas` (importado acima) — o
 * mesmo espião que o `TasksBoardMode` usa ao chamar `toast.error`.
 */
const toastError = supabaseMock.toast.error;

function item(over: Record<string, unknown> = {}): WorkItem {
  return makeTaskRow(over) as unknown as WorkItem;
}

/** Textos literais (a lista vem da spec do Quadro, não de `KANBAN_COLUMNS`). */
const SUBTITULOS = ['A organizar', 'Próximas ações', 'Conclua uma para iniciar outra', 'Dependências externas', 'Últimos 7 dias'];

const props = (status: WorkItemStatus, items: WorkItem[], doingCount = 0) => ({
  status,
  items,
  isLoading: false,
  doingCount,
  dragSourceStatus: null as WorkItemStatus | null,
  onOpen: vi.fn(),
  onMoveTo: vi.fn(),
  onDelete: vi.fn(),
});

beforeEach(() => {
  cleanup();
  dnd.onDragEnd = undefined;
  dnd.onDragStart = undefined;
  toastError.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Etapa 080 — subtítulo curto nas colunas e política longa no tooltip', () => {
  it('cada coluna mostra o próprio subtítulo e o rótulo continua o primeiro span do cabeçalho', () => {
    render(
      <TooltipProvider>
        {KANBAN_COLUMNS.map(c => (
          <BoardColumn key={c.status} {...props(c.status, [item({ id: `${c.status}-1`, status: c.status })])} />
        ))}
      </TooltipProvider>,
    );

    for (const texto of SUBTITULOS) {
      expect(screen.getByText(texto), `subtítulo "${texto}"`).toBeTruthy();
    }

    // O primeiro `<span>` de cada coluna precisa ser o RÓTULO — é por ele que a
    // medição de contraste do cabeçalho (`quadroLarguraFocoContraste`) resolve a cor.
    for (const c of KANBAN_COLUMNS) {
      const coluna = document.querySelector<HTMLElement>(`[data-board-column="${c.status}"]`)!;
      expect(coluna.querySelector('span')?.textContent, `primeiro span da coluna ${c.status}`).toBe(c.label);
    }
  });

  it('a política longa NÃO vira texto do cabeçalho — ela fica no tooltip do botão ⓘ', () => {
    const todo = KANBAN_COLUMNS.find(c => c.status === 'todo')!;
    render(
      <TooltipProvider>
        <BoardColumn {...props('todo', [item({ id: 't1', status: 'todo' })])} />
      </TooltipProvider>,
    );

    // Com a coluna COM cards a política não é impressa como corpo de texto…
    expect(screen.getByText(todo.subtitle)).toBeTruthy();
    expect(screen.queryByText(todo.policy, { exact: false })).toBeNull();
    // …e continua alcançável pelo botão que o leitor de tela lê.
    expect(screen.getByRole('button', { name: 'Política da coluna' })).toBeTruthy();
  });
});

describe('Etapa 082 — limite de Fazendo: contador, barra segmentada e rodapé', () => {
  it('cheio (3/3): contador, 3 segmentos destrutivos e o rodapé do limite', () => {
    render(
      <TooltipProvider>
        <BoardColumn {...props('doing', [
          item({ id: 'f1', status: 'doing' }),
          item({ id: 'f2', status: 'doing' }),
          item({ id: 'f3', status: 'doing' }),
        ], 3)} />
      </TooltipProvider>,
    );

    expect(screen.getByText('3/3')).toBeTruthy();

    const barra = screen.getByRole('progressbar', { name: 'Limite de Fazendo' });
    expect(barra.getAttribute('aria-valuenow')).toBe('3');
    expect(barra.getAttribute('aria-valuemax')).toBe('3');

    const segmentos = Array.from(barra.querySelectorAll('span'));
    expect(segmentos).toHaveLength(3);
    // Cheia: os três segmentos usam a cor destrutiva (o aviso, não só o número).
    for (const s of segmentos) expect(s.className).toContain('bg-destructive');

    expect(screen.getByText('Seu limite é de 3 tarefas em execução.')).toBeTruthy();
    const rodape = screen.getByTestId('col-limit-footer-doing');
    expect(rodape.querySelector('svg')).toBeTruthy();
  });

  it('parcial (1/3): um segmento primário e dois vazios — a barra segue azul, não destrutiva', () => {
    render(
      <TooltipProvider>
        <BoardColumn {...props('doing', [item({ id: 'f1', status: 'doing' })], 1)} />
      </TooltipProvider>,
    );

    expect(screen.getByText('1/3')).toBeTruthy();
    const segmentos = Array.from(screen.getByRole('progressbar', { name: 'Limite de Fazendo' }).querySelectorAll('span'));
    expect(segmentos).toHaveLength(3);
    expect(segmentos[0].className).toContain('bg-primary');
    expect(segmentos[1].className).toContain('bg-muted');
    expect(segmentos[2].className).toContain('bg-muted');
    for (const s of segmentos) expect(s.className).not.toContain('bg-destructive');
  });

  it('coluna SEM limite duro não ganha barra nem rodapé', () => {
    render(
      <TooltipProvider>
        <BoardColumn {...props('todo', [item({ id: 't1', status: 'todo' })])} />
      </TooltipProvider>,
    );

    expect(screen.queryByTestId('col-limit-bar-todo')).toBeNull();
    expect(screen.queryByTestId('col-limit-footer-todo')).toBeNull();
  });
});

describe('Etapa 083 — soltar em Fazendo cheio treme a coluna, avisa e devolve o card', () => {
  const drop = (draggableId: string, de: WorkItemStatus, deIndex: number, para: WorkItemStatus, paraIndex = 0) => ({
    draggableId,
    type: 'DEFAULT',
    mode: 'FLUID',
    reason: 'DROP',
    combine: null,
    source: { droppableId: de, index: deIndex },
    destination: { droppableId: para, index: paraIndex },
  });

  function renderQuadro(onMove: ReturnType<typeof vi.fn>) {
    return render(
      <TooltipProvider>
        <TasksBoardMode
          byStatus={{
            backlog: [], todo: [item({ id: 't1', status: 'todo' })],
            doing: [item({ id: 'f1', status: 'doing' }), item({ id: 'f2', status: 'doing' }), item({ id: 'f3', status: 'doing' })],
            waiting: [], done: [], cancelled: [],
          }}
          isLoading={false}
          onMove={onMove}
          onReorder={vi.fn()}
          onOpen={vi.fn()}
          onDelete={vi.fn()}
          onCreate={vi.fn()}
        />
      </TooltipProvider>,
    );
  }

  const coluna = (status: WorkItemStatus) => document.querySelector<HTMLElement>(`[data-board-column="${status}"]`)!;

  it('treme (só a borda garante o aviso em movimento reduzido), avisa e NÃO move o card', () => {
    const onMove = vi.fn();
    renderQuadro(onMove);

    act(() => { dnd.onDragEnd?.(drop('t1', 'todo', 0, 'doing', 0)); });

    // A coluna de destino leva o tranco: o que a anima é `motion-safe` (some com
    // movimento reduzido) e a borda destrutiva permanece.
    expect(coluna('doing').className).toContain('motion-safe:animate-wiggle');
    expect(coluna('doing').className).toContain('border-destructive');
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith('Fazendo está cheio (máx. 3). Conclua um item antes.');
    // O drop recusado não escreve nada: o card volta à origem.
    expect(onMove).not.toHaveBeenCalled();
  });

  it('o tranco é curto: depois do tempo a coluna volta ao normal', () => {
    vi.useFakeTimers();
    renderQuadro(vi.fn());

    act(() => { dnd.onDragEnd?.(drop('t1', 'todo', 0, 'doing', 0)); });
    expect(coluna('doing').className).toContain('border-destructive');

    act(() => { vi.advanceTimersByTime(700); });
    expect(coluna('doing').className).not.toContain('border-destructive');
    expect(coluna('doing').className).toContain('border-border/70');
  });

  it('reorganizar por dentro da coluna cheia NÃO treme nem avisa (B8 segue valendo)', () => {
    const onReorder = vi.fn();
    render(
      <TooltipProvider>
        <TasksBoardMode
          byStatus={{
            backlog: [], todo: [],
            doing: [item({ id: 'f1', status: 'doing' }), item({ id: 'f2', status: 'doing' }), item({ id: 'f3', status: 'doing' })],
            waiting: [], done: [], cancelled: [],
          }}
          isLoading={false}
          onMove={vi.fn()}
          onReorder={onReorder}
          onOpen={vi.fn()}
          onDelete={vi.fn()}
          onCreate={vi.fn()}
        />
      </TooltipProvider>,
    );

    act(() => { dnd.onDragEnd?.(drop('f3', 'doing', 2, 'doing', 0)); });

    expect(onReorder).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(coluna('doing').className).not.toContain('border-destructive');
  });
});
