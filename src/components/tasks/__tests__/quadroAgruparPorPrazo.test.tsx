/**
 * Etapa 102 do Quadro (plano de design, 2026-10-11 — decisão D1). O Quadro nasce
 * agrupado por ESTADO (imagem 05); "Agrupar por: Estado | Prazo" é a alternância
 * OPCIONAL (imagem 03, etapa 101) e SOMENTE LEITURA — no prazo não há
 * `Droppable`/`Draggable`, a dica diz por quê e a escolha é persistida.
 * Componente REAL, nenhum mock devolve resposta.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

// Importa o harness ANTES dos módulos sob teste (registra os `vi.mock`).
import { makeTaskRow } from '@/test/mocks/tarefas';
import { TasksBoardMode } from '@/components/tasks/board/TasksBoardMode';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BOARD_DUE_COLUMNS } from '@/hooks/tasks/workItemBoardGroups';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

const item = (over: Partial<WorkItem> = {}): WorkItem =>
  makeTaskRow(over as Record<string, unknown>) as unknown as WorkItem;

const VAZIO: Record<WorkItemStatus, WorkItem[]> = {
  backlog: [], todo: [], doing: [], waiting: [], done: [], cancelled: [],
};

const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** Fim do dia de hoje — cabe em "hoje" e só vira atraso nos últimos milissegundos. */
const fimDeHoje = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
};

function renderQuadro(over: Partial<Parameters<typeof TasksBoardMode>[0]> = {}) {
  return render(
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
}

const colunaPrazo = (key: string) =>
  document.querySelector<HTMLElement>(`[data-board-due="${key}"]`);

const chavesNoTrilho = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-board-due]'))
    .map(el => el.getAttribute('data-board-due'));

const estado = () => screen.getByTestId('board-group-estado').getAttribute('aria-pressed');
const prazo = () => screen.getByTestId('board-group-prazo').getAttribute('aria-pressed');
const irParaPrazo = () => fireEvent.click(screen.getByTestId('board-group-prazo'));

beforeEach(() => { cleanup(); localStorage.clear(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('etapa 102 — alternador "Agrupar por: Estado | Prazo"', () => {
  it('nasce no agrupamento por ESTADO: o botão certo marcado e as 5 colunas por estado', () => {
    renderQuadro();

    expect(screen.getByText('Agrupar por:')).toBeTruthy();
    expect(estado()).toBe('true');
    expect(prazo()).toBe('false');
    expect(document.querySelectorAll('[data-board-column]')).toHaveLength(5);
    expect(chavesNoTrilho()).toHaveLength(0);
    expect(screen.queryByTestId('board-due-hint')).toBeNull();
  });

  it('"Prazo" troca o trilho pelas 4 colunas da imagem 03, na ordem, e "Estado" volta', () => {
    renderQuadro();

    irParaPrazo();

    expect(prazo()).toBe('true');
    expect(estado()).toBe('false');
    expect(document.querySelectorAll('[data-board-column]')).toHaveLength(0);
    expect(chavesNoTrilho()).toEqual(BOARD_DUE_COLUMNS.map(c => c.key));

    fireEvent.click(screen.getByTestId('board-group-estado'));

    expect(estado()).toBe('true');
    expect(chavesNoTrilho()).toHaveLength(0);
    expect(document.querySelectorAll('[data-board-column]')).toHaveLength(5);
  });

  it('no agrupamento por prazo o arrasto não existe e a dica explica por quê', () => {
    renderQuadro({ byStatus: { ...VAZIO, todo: [item({ id: 'a1', title: 'Vencida', due_date: dias(2) })] } });
    expect(document.querySelectorAll('[data-rfd-droppable-id]')).toHaveLength(5);

    irParaPrazo();

    // Sem `Droppable`/`Draggable` não há onde soltar nem alça para pegar (D1).
    expect(document.querySelectorAll('[data-rfd-droppable-id]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-rfd-drag-handle-draggable-id]')).toHaveLength(0);

    const dica = screen.getByTestId('board-due-hint');
    expect(dica.textContent).toContain('somente leitura');
    expect(dica.textContent).toContain('arrastar fica desligado');
  });

  it('a escolha é persistida e um valor salvo que não é "prazo" cai em Estado', () => {
    renderQuadro();
    irParaPrazo();
    expect(localStorage.getItem('tasks-board-group')).toBe('prazo');

    cleanup();
    renderQuadro();
    expect(prazo()).toBe('true');
    expect(chavesNoTrilho()).toEqual(BOARD_DUE_COLUMNS.map(c => c.key));

    fireEvent.click(screen.getByTestId('board-group-estado'));
    expect(localStorage.getItem('tasks-board-group')).toBe('estado');

    // Valor estranho no storage (versão antiga, mão no localStorage) não quebra o Quadro.
    localStorage.setItem('tasks-board-group', 'por-prioridade');
    cleanup();
    renderQuadro();
    expect(estado()).toBe('true');
    expect(document.querySelectorAll('[data-board-column]')).toHaveLength(5);
  });

  it('o "Concluídas" (coluna do agrupamento por estado) não fica como controle morto no prazo', () => {
    renderQuadro();
    expect(screen.getByTestId('board-done-toggle')).toBeTruthy();

    irParaPrazo();
    expect(screen.queryByTestId('board-done-toggle')).toBeNull();

    fireEvent.click(screen.getByTestId('board-group-estado'));
    expect(screen.getByTestId('board-done-toggle')).toBeTruthy();
  });

  // Regra de tela: todo controle novo tem alvo de >= 40 px nas duas medidas
  // (`min-h-10`/`min-w-10` = 40 px) — a classe realmente aplicada no botão.
  it('"Estado" e "Prazo" saem com alvo de 40 px nas duas medidas', () => {
    renderQuadro();

    for (const id of ['board-group-estado', 'board-group-prazo']) {
      const { className } = screen.getByTestId(id);
      expect(className, `${id} altura`).toContain('min-h-10');
      expect(className, `${id} largura`).toContain('min-w-10');
    }
  });
});

describe('etapa 102 — cada tarefa cai em UMA coluna do agrupamento por prazo', () => {
  const byStatus: Record<WorkItemStatus, WorkItem[]> = {
    ...VAZIO,
    todo: [
      item({ id: 'a1', title: 'Vencida', status: 'todo', due_date: dias(2) }),
      item({ id: 'h1', title: 'Vence hoje', status: 'todo', due_date: fimDeHoje() }),
      item({ id: 'f1', title: 'Sem prazo', status: 'todo', due_date: null }),
    ],
    doing: [item({ id: 'f2', title: 'Prazo futuro', status: 'doing', due_date: dias(-5) })],
    done: [
      item({ id: 'c1', title: 'Feita hoje', status: 'done', completed_at: dias(0) }),
      item({ id: 'c9', title: 'Feita ha 20 dias', status: 'done', completed_at: dias(20) }),
    ],
    cancelled: [item({ id: 'x1', title: 'Cancelada', status: 'cancelled', due_date: dias(3) })],
  };

  it('Atrasadas / Para hoje / Fazendo / Concluídas recebem o que é delas — e só isso', () => {
    renderQuadro({ byStatus });
    irParaPrazo();

    expect(within(colunaPrazo('atrasadas')!).getByText('Vencida')).toBeTruthy();
    expect(within(colunaPrazo('paraHoje')!).getByText('Vence hoje')).toBeTruthy();
    expect(within(colunaPrazo('fazendo')!).getByText('Sem prazo')).toBeTruthy();
    expect(within(colunaPrazo('fazendo')!).getByText('Prazo futuro')).toBeTruthy();
    expect(within(colunaPrazo('concluidas')!).getByText('Feita hoje')).toBeTruthy();

    // cada tarefa em UMA coluna só — nenhuma duplicada no trilho
    for (const titulo of ['Vencida', 'Vence hoje', 'Sem prazo', 'Prazo futuro', 'Feita hoje']) {
      expect(screen.getAllByText(titulo), titulo).toHaveLength(1);
    }
    // cancelada e concluída com mais de 7 dias não viram card em coluna nenhuma
    expect(screen.queryByText('Cancelada')).toBeNull();
    expect(screen.queryByText('Feita ha 20 dias')).toBeNull();
    expect(document.querySelectorAll('[data-board-due]')).toHaveLength(4);
  });

  it('carregando: as colunas por prazo mostram o esqueleto (etapa 53), não o vazio', () => {
    renderQuadro({ byStatus: VAZIO, isLoading: true });
    irParaPrazo();

    expect(screen.queryAllByTestId('board-due-empty')).toHaveLength(0);
    // 3 cartões do `BoardColumnSkeleton` em cada uma das 4 colunas
    expect(document.querySelectorAll('.animate-shimmer')).toHaveLength(12);
  });
});
