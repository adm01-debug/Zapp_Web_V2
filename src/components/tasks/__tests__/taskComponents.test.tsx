/**
 * Testes dos componentes dos três modos de Tarefas (dentes que faltavam):
 *
 *  - B9  — os rótulos das seções da Lista são acentuados (Amanhã/Próximas/Concluídas);
 *  - B12 — o Backspace NÃO apaga a tarefa (só Delete apaga);
 *  - etapa 15 — o Quadro leva o índice de destino no `onMove` (ordem persistida).
 *
 * Por que aqui e não em cada componente: os três casos compartilham o mesmo
 * cabeçalho de imports/mocks, e um arquivo só evita duplicação de código novo
 * (o gate de duplicação do SonarCloud limita a 3% no código novo).
 *
 * O `@hello-pangea/dnd` é substituído por um mock que guarda o `onDragEnd`:
 * assim o drag&drop é exercitado sem precisar de geometria real no jsdom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';

// Importa o harness ANTES dos módulos sob teste (ele registra os `vi.mock`).
import { makeTaskRow, resetSupabaseMock } from '@/test/mocks/tarefas';

import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksListMode } from '@/components/tasks/list/TasksListMode';
import { WorkItemCard } from '@/components/tasks/shared/WorkItemCard';
import { TasksBoardMode } from '@/components/tasks/board/TasksBoardMode';
import type { BucketsByDue } from '@/hooks/tasks/workItemAggregates';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

/** O `onDragEnd` que o quadro registrou (preenchido pelo mock do dnd). */
const dnd = vi.hoisted(() => ({ onDragEnd: undefined as undefined | ((r: unknown) => void) }));

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ onDragEnd, children }: { onDragEnd: (r: unknown) => void; children: ReactNode }) => {
    dnd.onDragEnd = onDragEnd;
    return children;
  },
  Droppable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) =>
    children(
      { innerRef: () => undefined, droppableProps: {}, placeholder: null },
      { isDraggingOver: false }
    ),
  Draggable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) =>
    children(
      { innerRef: () => undefined, draggableProps: {}, dragHandleProps: {} },
      { isDragging: false, isDropAnimating: false, draggingOver: null }
    ),
}));

/** Item do domínio: reusa a fixture do banco (o shape é o mesmo) sem duplicar dados. */
function item(over: Record<string, unknown> = {}): WorkItem {
  return makeTaskRow(over) as unknown as WorkItem;
}

const nenhumItem: WorkItem[] = [];
const byStatusVazio: Record<WorkItemStatus, WorkItem[]> = {
  backlog: nenhumItem,
  todo: nenhumItem,
  doing: nenhumItem,
  waiting: nenhumItem,
  done: nenhumItem,
  cancelled: nenhumItem,
};

function buckets(over: Partial<BucketsByDue> = {}): BucketsByDue {
  return {
    overdue: nenhumItem,
    today: nenhumItem,
    tomorrow: nenhumItem,
    upcoming: nenhumItem,
    noDue: nenhumItem,
    done7d: nenhumItem,
    doneOlder: nenhumItem,
    ...over,
  };
}

const refMounted = { current: true };

describe('Tarefas — componentes dos três modos', () => {
  beforeEach(() => {
    resetSupabaseMock();
    dnd.onDragEnd = undefined;
  });

  it('B9: a Lista rotula as seções com acento (Amanhã, Próximas, Concluídas)', () => {
    render(
      <TasksListMode
        byDue={buckets({
          tomorrow: [item({ id: 'a', title: 'Amanha tem' })],
          upcoming: [item({ id: 'b', title: 'Depois tem' })],
          done7d: [item({ id: 'c', title: 'Ja foi', status: 'done' })],
        })}
        isLoading={false}
        searchQuery=""
        onOpen={vi.fn()}
        onToggleDone={vi.fn()}
        onMoveTo={vi.fn()}
        onDelete={vi.fn()}
        onClearFilter={vi.fn()}
        hasMounted={refMounted}
      />
    );

    // A `Section` só renderiza com itens, por isso cada bucket tem um item acima.
    expect(screen.getByText('Amanhã')).toBeTruthy();
    expect(screen.getByText('Próximas')).toBeTruthy();
    expect(screen.getByText('Concluídas (7 dias)')).toBeTruthy();
    expect(screen.queryByText('Amanha')).toBeNull();
    expect(screen.queryByText('Proximas')).toBeNull();
    expect(screen.queryByText('Concluidas')).toBeNull();
  });

  it('B12: Backspace NÃO apaga a tarefa, Delete apaga', () => {
    const onDelete = vi.fn();
    render(
      <WorkItemCard
        item={item()}
        mode="list"
        onDelete={onDelete}
      />
    );

    const card = screen.getByRole('article');
    fireEvent.keyDown(card, { key: 'Backspace' });
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.keyDown(card, { key: 'Delete' });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('etapa 15: o Quadro leva o índice de destino no onMove', () => {
    const onMove = vi.fn();
    const alvo = item({ id: 't1', status: 'todo' });

    render(
      <TooltipProvider>
        <TasksBoardMode
          byStatus={{ ...byStatusVazio, todo: [alvo] }}
          isLoading={false}
          onMove={onMove}
          onReorder={vi.fn()}
          onOpen={vi.fn()}
          onDelete={vi.fn()}
          onCreate={vi.fn()}
        />
      </TooltipProvider>
    );

    expect(dnd.onDragEnd).toBeTypeOf('function');
    dnd.onDragEnd?.({
      draggableId: 't1',
      source: { droppableId: 'todo', index: 0 },
      destination: { droppableId: 'doing', index: 2 },
    });

    expect(onMove).toHaveBeenCalledWith(alvo, 'doing', { index: 2 });
    cleanup();
  });

  it('etapa 48 (B4): "Concluídas (7 dias)" recolhida e "ver mais (30 dias)" revela as antigas', () => {
    cleanup();
    render(
      <TasksListMode
        byDue={buckets({
          done7d: [item({ id: 'c', title: 'Feita ontem', status: 'done' })],
          doneOlder: [item({ id: 'd', title: 'Feita duas semanas atras', status: 'done' })],
        })}
        isLoading={false}
        searchQuery=""
        onOpen={vi.fn()}
        onToggleDone={vi.fn()}
        onMoveTo={vi.fn()}
        onDelete={vi.fn()}
        onClearFilter={vi.fn()}
        hasMounted={refMounted}
      />
    );

    // Nasce recolhida: nem a concluida da semana nem a antiga aparecem.
    expect(screen.getByText('Concluídas (7 dias)')).toBeTruthy();
    expect(screen.queryByText('Feita ontem')).toBeNull();
    expect(screen.queryByText('Feita duas semanas atras')).toBeNull();

    // Abrir a secao mostra a de 7 dias; a antiga segue atras do "ver mais (30 dias)".
    fireEvent.click(screen.getByText('Concluídas (7 dias)'));
    expect(screen.getByText('Feita ontem')).toBeTruthy();
    expect(screen.queryByText('Feita duas semanas atras')).toBeNull();

    // O rodape revela a janela de 30 dias e oferece voltar.
    fireEvent.click(screen.getByText('ver mais (30 dias)'));
    expect(screen.getByText('Feita duas semanas atras')).toBeTruthy();
    expect(screen.getByText('ver menos')).toBeTruthy();

    fireEvent.click(screen.getByText('ver menos'));
    expect(screen.queryByText('Feita duas semanas atras')).toBeNull();
  });
});
