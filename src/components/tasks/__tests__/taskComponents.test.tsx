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
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';

// Importa o harness ANTES dos módulos sob teste (ele registra os `vi.mock`).
import { makeTaskRow, resetSupabaseMock } from '@/test/mocks/tarefas';

import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksListMode } from '@/components/tasks/list/TasksListMode';
import { WorkItemCard } from '@/components/tasks/shared/WorkItemCard';
import { TasksBoardMode } from '@/components/tasks/board/TasksBoardMode';
import { TasksFilterBar } from '@/components/tasks/shared/TasksFilterBar';
import type { BucketsByDue } from '@/hooks/tasks/workItemAggregates';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

/** O `onDragEnd` que o quadro registrou (preenchido pelo mock do dnd). */
const dnd = vi.hoisted(() => ({
  onDragEnd: undefined as undefined | ((r: unknown) => void),
  onDragStart: undefined as undefined | ((r: unknown) => void),
  /** `isDropDisabled` de cada coluna na última renderização (etapa 52/B8). */
  droppables: {} as Record<string, boolean | undefined>,
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
  Droppable: ({ droppableId, isDropDisabled, children }: {
    droppableId: string;
    isDropDisabled?: boolean;
    children: (p: unknown, s: unknown) => ReactNode;
  }) => {
    dnd.droppables[droppableId] = isDropDisabled;
    return children(
      { innerRef: () => undefined, droppableProps: {}, placeholder: null },
      { isDraggingOver: false }
    );
  },
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
    dnd.onDragStart = undefined;
    dnd.droppables = {};
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

  it('a ordem das colunas do Quadro e a contratada (nao pode mudar em silencio)', () => {
    cleanup();
    render(
      <TooltipProvider>
        <TasksBoardMode
          byStatus={byStatusVazio}
          isLoading={false}
          onMove={vi.fn()}
          onReorder={vi.fn()}
          onOpen={vi.fn()}
          onDelete={vi.fn()}
          onCreate={vi.fn()}
        />
      </TooltipProvider>
    );

    // A ordem que o usuario ve, da esquerda para a direita.
    const esperados = ['Caixa de entrada', 'A fazer', 'Fazendo', 'Aguardando', 'Concluido'];
    const titulos   = esperados.map(rotulo => screen.getByText(rotulo));

    // 1) a linha que contem as colunas nao inverte a ordem visual (flex-row-reverse)
    const linha = titulos[0].closest('.flex.gap-3') as HTMLElement | null;
    expect(linha).toBeTruthy();
    expect(linha!.className).not.toMatch(/reverse/);

    // 2) os 5 titulos estao no DOM exatamente nessa ordem
    for (let i = 1; i < titulos.length; i++) {
      const posicao = titulos[i - 1].compareDocumentPosition(titulos[i]);
      expect(posicao & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    // 3) a coluna de destino do arrasto segue a mesma ordem (indice da coluna)
    const colunas = linha!.querySelectorAll(':scope > div');
    expect(colunas).toHaveLength(5);
    expect(colunas[0].contains(titulos[0])).toBe(true);
    expect(colunas[4].contains(titulos[4])).toBe(true);

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

  it('Fase F (auditoria): coluna só com concluídas de 8 a 30 dias mostra o rodapé e NÃO diz "Coluna vazia"', () => {
    cleanup();
    const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

    render(
      <TooltipProvider>
        <TasksBoardMode
          byStatus={{ ...byStatusVazio, done: [
            item({ id: 'o1', title: 'Feita ha duas semanas', status: 'done', completed_at: dias(13) }),
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

    // A coluna TEM conteúdo (atrás do rodapé): antes ela dizia "Coluna vazia" e
    // oferecia "Ver mais antigas (30 dias)" ao mesmo tempo — contradição.
    expect(screen.getByText('Ver mais antigas (30 dias)')).toBeTruthy();
    expect(screen.getAllByText('Coluna vazia')).toHaveLength(4);
  });

  it('Fase F (auditoria): contato sem nome aparece como "Sem nome" e id fora da lista como "Contato indisponível"', () => {
    cleanup();
    const comuns = {
      searchText: '',
      onSearch: vi.fn(),
      onPrio: vi.fn(),
      onContact: vi.fn(),
      onToggleAlarm: vi.fn(),
      onToggleDone: vi.fn(),
      onClear: vi.fn(),
    };

    const { rerender } = render(
      <TooltipProvider>
        <TasksFilterBar
          {...comuns}
          filters={{ q: '', prio: 'all', contact: 'c1', alarm: false, done: true }}
          contactOptions={[{ id: 'c1', name: '' }]}
          isActive
        />
      </TooltipProvider>
    );
    // Antes: o gatilho ficava em BRANCO ('' não casa com o `??`).
    expect(screen.getByLabelText('Contato').textContent).toBe('Sem nome');

    rerender(
      <TooltipProvider>
        <TasksFilterBar
          {...comuns}
          filters={{ q: '', prio: 'all', contact: 'c9', alarm: false, done: true }}
          contactOptions={[{ id: 'c1', name: '' }]}
          isActive
        />
      </TooltipProvider>
    );
    // Antes: id desconhecido se passava por "Todos os contatos".
    expect(screen.getByLabelText('Contato').textContent).toBe('Contato indisponível');
  });

  it('etapa 52 (B8): "Fazendo" cheio aceita reorganizar por dentro e recusa o que vem de fora', () => {
    cleanup();
    render(
      <TooltipProvider>
        <TasksBoardMode
          byStatus={{ ...byStatusVazio,
            doing: [item({ id: 'f1', status: 'doing' }), item({ id: 'f2', status: 'doing' }), item({ id: 'f3', status: 'doing' })],
            todo:  [item({ id: 't1', status: 'todo' })],
          }}
          isLoading={false}
          onMove={vi.fn()}
          onReorder={vi.fn()}
          onOpen={vi.fn()}
          onDelete={vi.fn()}
          onCreate={vi.fn()}
        />
      </TooltipProvider>
    );

    // 3/3 sem arrasto em curso: a coluna recusa o drop
    expect(dnd.droppables.doing).toBe(true);

    // arrasto vindo de fora continua recusado
    act(() => dnd.onDragStart?.({ source: { droppableId: 'todo', index: 0 } }));
    expect(dnd.droppables.doing).toBe(true);

    // arrasto comecado DENTRO de "Fazendo" e aceito (reorganizar 3/3)
    act(() => dnd.onDragStart?.({ source: { droppableId: 'doing', index: 0 } }));
    expect(dnd.droppables.doing).toBe(false);
  });

  it('etapa 52 (B8): a coluna cheia marca o cabeçalho com o anel de aviso', () => {
    cleanup();
    render(
      <TooltipProvider>
        <TasksBoardMode
          byStatus={{ ...byStatusVazio,
            doing: [item({ id: 'f1', status: 'doing' }), item({ id: 'f2', status: 'doing' }), item({ id: 'f3', status: 'doing' })],
          }}
          isLoading={false}
          onMove={vi.fn()}
          onReorder={vi.fn()}
          onOpen={vi.fn()}
          onDelete={vi.fn()}
          onCreate={vi.fn()}
        />
      </TooltipProvider>
    );

    expect(screen.getByText('Fazendo').closest('div')?.className).toContain('ring-destructive');
  });

  it('etapa 53: coluna vazia mostra a política da coluna', () => {
    cleanup();
    render(
      <TooltipProvider>
        <TasksBoardMode
          byStatus={byStatusVazio}
          isLoading={false}
          onMove={vi.fn()}
          onReorder={vi.fn()}
          onOpen={vi.fn()}
          onDelete={vi.fn()}
          onCreate={vi.fn()}
        />
      </TooltipProvider>
    );

    expect(screen.getAllByText('Coluna vazia')).toHaveLength(5);
    // a política sai da KANBAN_COLUMNS (mesmo texto do tooltip do cabeçalho)
    expect(screen.getByText('O que esta nas suas maos agora. Tres e o limite.')).toBeTruthy();
    expect(screen.getByText('Feito. Fica 7 dias a vista.')).toBeTruthy();
  });

  it('etapa 53: o carregamento usa o esqueleto da coluna (3 cartões por coluna)', () => {
    cleanup();
    const { container } = render(
      <TooltipProvider>
        <TasksBoardMode
          byStatus={byStatusVazio}
          isLoading
          onMove={vi.fn()}
          onReorder={vi.fn()}
          onOpen={vi.fn()}
          onDelete={vi.fn()}
          onCreate={vi.fn()}
        />
      </TooltipProvider>
    );

    // 5 colunas × 3 cartões do BoardColumnSkeleton
    expect(container.querySelectorAll('.animate-shimmer')).toHaveLength(15);
    expect(screen.queryByText('Coluna vazia')).toBeNull();
  });

  it('etapa 53: a coluna não usa mais o teto mágico de 100vh e encolhe por flex', () => {
    cleanup();
    render(
      <TooltipProvider>
        <TasksBoardMode
          byStatus={byStatusVazio}
          isLoading={false}
          onMove={vi.fn()}
          onReorder={vi.fn()}
          onOpen={vi.fn()}
          onDelete={vi.fn()}
          onCreate={vi.fn()}
        />
      </TooltipProvider>
    );

    const raiz = screen.getByText('Fazendo').closest('div')?.parentElement;
    expect(raiz?.className).toContain('min-h-0');
    expect(raiz?.className).not.toContain('100vh-280px');
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

  it('etapa 51: sem concluídas nos 7 dias, a seção e o "ver mais (30 dias)" seguem alcançáveis', () => {
    cleanup();
    renderLista(buckets({
      doneOlder: [
        item({ id: 'o1', title: 'Feita ha duas semanas', status: 'done' }),
        item({ id: 'o2', title: 'Feita ha tres semanas', status: 'done' }),
      ],
    }));

    // O defeito: com a janela de 7 dias vazia, a secao — e com ela o rodape, unica
    // entrada para as antigas — desaparecia da tela.
    const cabecalho = screen.getByText('Concluídas (7 dias)');
    expect(cabecalho).toBeTruthy();
    // O contador nao mente: recolhida, nada esta renderizado na secao.
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.queryByText('Feita ha duas semanas')).toBeNull();

    // Abrir a secao confirma o vazio de 7 dias e mantem o rodape a mao.
    fireEvent.click(cabecalho);
    expect(screen.getByText('ver mais (30 dias)')).toBeTruthy();
    expect(screen.queryByText('Feita ha duas semanas')).toBeNull();

    // O rodape revela as duas antigas e o contador passa a contar o que esta na tela.
    fireEvent.click(screen.getByText('ver mais (30 dias)'));
    expect(screen.getByText('Feita ha duas semanas')).toBeTruthy();
    expect(screen.getByText('Feita ha tres semanas')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('ver menos')).toBeTruthy();
  });

  it('etapa 51: sem concluída nenhuma, a seção não aparece', () => {
    cleanup();
    renderLista(buckets({ noDue: [item({ id: 'n1', title: 'Sem prazo aqui' })] }));

    expect(screen.getByText('Sem prazo')).toBeTruthy();
    expect(screen.queryByText('Concluídas (7 dias)')).toBeNull();
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
