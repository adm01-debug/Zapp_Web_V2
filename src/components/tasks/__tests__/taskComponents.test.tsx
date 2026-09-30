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
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
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

/**
 * A Lista usa `Tooltip` no cabeçalho de "Próximas" (etapa 49); a app fornece o
 * `TooltipProvider` em `AppProviders.tsx`, então o harness faz o mesmo — padrão
 * já usado no caso do Quadro (etapa 15).
 */
function renderLista(byDue: BucketsByDue) {
  const ui = (b: BucketsByDue) => (
    <TooltipProvider>
      <TasksListMode
        byDue={b}
        isLoading={false}
        searchQuery=""
        onOpen={vi.fn()}
        onToggleDone={vi.fn()}
        onMoveTo={vi.fn()}
        onDelete={vi.fn()}
        onClearFilter={vi.fn()}
        hasMounted={refMounted}
      />
    </TooltipProvider>
  );

  const view = render(ui(byDue));
  /** Troca os buckets no mesmo harness (ex.: a tarefa foi concluída). */
  return { ...view, renderBuckets: (b: BucketsByDue) => view.rerender(ui(b)) };
}

describe('Tarefas — componentes dos três modos', () => {
  beforeEach(() => {
    resetSupabaseMock();
    dnd.onDragEnd = undefined;
  });

  it('B9: a Lista rotula as seções com acento (Amanhã, Próximas, Concluídas)', () => {
    renderLista(buckets({
      tomorrow: [item({ id: 'a', title: 'Amanha tem' })],
      upcoming: [item({ id: 'b', title: 'Depois tem' })],
      done7d: [item({ id: 'c', title: 'Ja foi', status: 'done' })],
    }));

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

  it('etapa 51 (B5): a coluna Concluído mostra 7 dias e "Ver mais antigas (30 dias)" revela o resto', () => {
    cleanup();
    const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

    render(
      <TooltipProvider>
        <TasksBoardMode
          byStatus={{ ...byStatusVazio, done: [
            item({ id: 'r1', title: 'Feita ontem',             status: 'done', completed_at: dias(1) }),
            item({ id: 'o1', title: 'Feita ha duas semanas',   status: 'done', completed_at: dias(13) }),
          ] }}
          isLoading={false}
          onMove={vi.fn()}
          onReorder={vi.fn()}
          onOpen={vi.fn()}
          onDelete={vi.fn()}
          onCreate={vi.fn()}
        />
      </TooltipProvider>
    );

    // a de 7 dias aparece; a de 13 dias só depois do rodapé
    expect(screen.getByText('Feita ontem')).toBeTruthy();
    expect(screen.queryByText('Feita ha duas semanas')).toBeNull();

    fireEvent.click(screen.getByText('Ver mais antigas (30 dias)'));
    expect(screen.getByText('Feita ha duas semanas')).toBeTruthy();
    expect(screen.getByText('Ver menos')).toBeTruthy();
  });

  it('etapa 48 (B4): "Concluídas (7 dias)" recolhida e "ver mais (30 dias)" revela as antigas', async () => {
    cleanup();
    renderLista(buckets({
      done7d: [item({ id: 'c', title: 'Feita ontem', status: 'done' })],
      doneOlder: [item({ id: 'd', title: 'Feita duas semanas atras', status: 'done' })],
    }));

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
    // Etapa 50: o item fica montado durante a animacao de saida (fade 200ms),
    // por isso a saida de cena e observada com waitFor.
    await waitFor(() => expect(screen.queryByText('Feita duas semanas atras')).toBeNull());
  });

  it('etapa 49: "Próximas" agrupa por dia e joga o que passa de 7 dias em "Semana que vem"', () => {
    cleanup();
    const em2Dias  = new Date(Date.now() + 2  * 86_400_000).toISOString();
    const em10Dias = new Date(Date.now() + 10 * 86_400_000).toISOString();
    renderLista(buckets({
      upcoming: [
        item({ id: 'u1', title: 'Daqui a 2 dias',  due_date: em2Dias }),
        item({ id: 'u2', title: 'Daqui a 10 dias', due_date: em10Dias }),
      ],
    }));

    expect(screen.getByText('Daqui a 2 dias')).toBeTruthy();
    expect(screen.getByText('Daqui a 10 dias')).toBeTruthy();
    // subcabecalho do dia no formato "Seg 05/10" (maiusculo; o chip do card e minusculo)
    expect(screen.getByText(/^[A-ZÀ-Ú].{2} \d{2}\/\d{2}$/)).toBeTruthy();
    expect(screen.getByText('Semana que vem')).toBeTruthy();
  });

  it('etapa 49: "Sem prazo" abre com 10 itens e nasce recolhida com 11', () => {
    cleanup();
    renderLista(buckets({
      noDue: Array.from({ length: 10 }, (_, i) => item({ id: `d${i}`, title: `Sem prazo ${i}` })),
    }));
    expect(screen.getByText('Sem prazo')).toBeTruthy();
    expect(screen.getByText('Sem prazo 0')).toBeTruthy();

    cleanup();
    renderLista(buckets({
      noDue: Array.from({ length: 11 }, (_, i) => item({ id: `m${i}`, title: `Sem prazo ${i}` })),
    }));
    expect(screen.getByText('11')).toBeTruthy();       // o contador segue visivel
    expect(screen.queryByText('Sem prazo 0')).toBeNull();  // mas os itens nascem escondidos

    fireEvent.click(screen.getByText('Sem prazo'));
    expect(screen.getByText('Sem prazo 0')).toBeTruthy();
  });

  it('etapa 49: o cabeçalho de "Próximas" explica a ordenação no tooltip', () => {
    cleanup();
    renderLista(buckets({
      upcoming: [item({ id: 'u1', title: 'Depois', due_date: new Date(Date.now() + 3 * 86_400_000).toISOString() })],
    }));

    expect(screen.getByLabelText('Ordenado por prazo, depois prioridade')).toBeTruthy();
  });

  it('etapa 50: concluir deixa o item montado durante a saída e ele reaparece em "Concluídas (7 dias)"', async () => {
    cleanup();
    const { renderBuckets } = renderLista(buckets({
      noDue: [item({ id: 'k1', title: 'Concluir agora' }), item({ id: 'k2', title: 'Fica aqui' })],
    }));
    expect(screen.getByText('Concluir agora')).toBeTruthy();

    // A tarefa sai de "Sem prazo" e passa a "Concluidas (7 dias)"; a secao segue
    // de pe por causa da outra tarefa (é nela que o fade por item acontece).
    renderBuckets(buckets({
      noDue: [item({ id: 'k2', title: 'Fica aqui' })],
      done7d: [item({ id: 'k1', title: 'Concluir agora', status: 'done' })],
    }));

    // Continua montada: e a animacao de saida em curso (sem exit + AnimatePresence
    // o item sumiria no mesmo instante, e este getByText falharia).
    expect(screen.getByText('Fica aqui')).toBeTruthy();
    expect(screen.getByText('Concluir agora')).toBeTruthy();
    expect(screen.getByText('Concluídas (7 dias)')).toBeTruthy();

    // O fade de 200ms nao acaba num piscar: 60ms depois o item ainda esta em cena
    // (com saida instantanea ele ja teria saido — é o que pina a duracao).
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(screen.getByText('Concluir agora')).toBeTruthy();

    // Terminada a saida, o item sai de cena (a secao de concluidas esta recolhida).
    await waitFor(() => expect(screen.queryByText('Concluir agora')).toBeNull());
  });
});
