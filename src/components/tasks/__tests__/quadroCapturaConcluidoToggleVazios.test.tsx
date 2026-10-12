/**
 * Etapas 091 / 092 / 093 / 103 do Quadro (plano de design, 2026-10-11).
 *
 *  - 091: só a Caixa de entrada captura (D19) — cartão tracejado no FIM da coluna
 *         com o QuickAdd compacto e a dica "Pressione Enter para criar";
 *  - 092: a coluna Concluído marca cada cartão com o check verde + data e traz o
 *         rodapé "Ver até 30 dias →";
 *  - 093: o toggle "Concluídas" mostra/oculta a COLUNA Concluído e o ⁙ do
 *         cabeçalho recolhe/expande a coluna;
 *  - 103: o vazio por coluna usa a microcopy "Nada aqui. Arraste uma tarefa ou
 *         capture acima" (o esqueleto já é o BoardColumnSkeleton da etapa 53).
 *
 * Tudo aqui passa pelo componente REAL (TasksBoardMode → BoardColumn): nenhum
 * mock devolve a resposta — as asserções leem o DOM renderizado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

// Importa o harness ANTES dos módulos sob teste (registra os `vi.mock`).
import { makeTaskRow } from '@/test/mocks/tarefas';
import { TasksBoardMode } from '@/components/tasks/board/TasksBoardMode';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

const item = (over: Partial<WorkItem> = {}): WorkItem =>
  makeTaskRow(over as Record<string, unknown>) as unknown as WorkItem;

const VAZIO: Record<WorkItemStatus, WorkItem[]> = {
  backlog: [], todo: [], doing: [], waiting: [], done: [], cancelled: [],
};

const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function renderQuadro(over: Partial<Parameters<typeof TasksBoardMode>[0]> = {}) {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <TooltipProvider>
      <TasksBoardMode
        byStatus={VAZIO}
        isLoading={false}
        onMove={vi.fn()}
        onReorder={vi.fn()}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onCreate={onCreate}
        {...over}
      />
    </TooltipProvider>,
  );
  return { ...utils, onCreate };
}

const coluna = (status: WorkItemStatus) =>
  document.querySelector<HTMLElement>(`[data-board-column="${status}"]`);

beforeEach(() => { cleanup(); });
afterEach(() => { cleanup(); });

describe('etapa 091 — captura só na Caixa de entrada', () => {
  it('mostra o cartão tracejado no FIM da Caixa de entrada, com a dica e o QuickAdd compacto', () => {
    renderQuadro();

    const cartoes = screen.getAllByTestId('capture-card');
    expect(cartoes, 'só a Caixa de entrada captura (D19)').toHaveLength(1);

    const captura = cartoes[0];
    expect(captura.closest('[data-board-column]')?.getAttribute('data-board-column')).toBe('backlog');
    expect(within(captura).getByText('Pressione Enter para criar')).toBeTruthy();
    expect(within(captura).getByPlaceholderText('Capturar tarefa…')).toBeTruthy();

    // No FIM da coluna: o cartão é o último filho da Caixa de entrada.
    expect(coluna('backlog')?.lastElementChild).toBe(captura);
  });

  it('nenhuma outra coluna captura', () => {
    renderQuadro();
    for (const status of ['todo', 'doing', 'waiting', 'done'] as WorkItemStatus[]) {
      expect(within(coluna(status)!).queryAllByTestId('capture-card')).toHaveLength(0);
      expect(within(coluna(status)!).queryByPlaceholderText('Capturar tarefa…')).toBeNull();
    }
  });

  it('Enter no campo cria a tarefa na Caixa de entrada', () => {
    const { onCreate } = renderQuadro();
    const campo = screen.getByPlaceholderText('Capturar tarefa…');

    fireEvent.change(campo, { target: { value: 'Ligar para o cliente' } });
    fireEvent.keyDown(campo, { key: 'Enter' });

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0][0]).toMatchObject({
      title: 'Ligar para o cliente',
      status: 'backlog',
    });
  });
});

describe('etapa 092 — a coluna Concluído marca o cartão e tem o rodapé da janela', () => {
  it('cada cartão concluído leva o check verde e a data da conclusão', () => {
    renderQuadro({
      byStatus: { ...VAZIO, done: [
        item({ id: 'r1', title: 'Feita hoje', status: 'done', completed_at: dias(0) }),
      ] },
    });

    const carimbos = screen.getAllByTestId('done-stamp');
    expect(carimbos).toHaveLength(1);
    expect(carimbos[0].closest('[data-board-column]')?.getAttribute('data-board-column')).toBe('done');
    expect(carimbos[0].querySelector('svg')?.getAttribute('class')).toContain('text-success');
    expect(carimbos[0].textContent).toContain('Hoje');
  });

  it('o "Ver até 30 dias →" é o rodapé da coluna Concluído e revela a janela', () => {
    renderQuadro({
      byStatus: { ...VAZIO, done: [
        item({ id: 'r1', title: 'Feita hoje', status: 'done', completed_at: dias(0) }),
        item({ id: 'o1', title: 'Feita ha duas semanas', status: 'done', completed_at: dias(13) }),
      ] },
    });

    const botao = screen.getByTestId('board-done-older');
    expect(botao.textContent).toBe('Ver até 30 dias →');
    expect(botao.closest('[data-board-column]')?.getAttribute('data-board-column')).toBe('done');
    expect(coluna('done')?.lastElementChild).toBe(botao.parentElement);
    expect(screen.queryByText('Feita ha duas semanas')).toBeNull();

    fireEvent.click(botao);
    expect(screen.getByText('Feita ha duas semanas')).toBeTruthy();
    expect(screen.getByTestId('board-done-older').textContent).toBe('Ver menos');
  });
});

describe('etapa 093 — toggle "Concluídas" e o ⁙ que recolhe a coluna', () => {
  it('nasce ligado com as 5 colunas e, desligado, tira a coluna Concluído do trilho', () => {
    renderQuadro();
    const toggle = screen.getByTestId('board-done-toggle');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent).toBe('Concluídas');
    expect(document.querySelectorAll('[data-board-column]')).toHaveLength(5);

    fireEvent.click(toggle);
    expect(screen.getByTestId('board-done-toggle').getAttribute('aria-pressed')).toBe('false');
    expect(coluna('done')).toBeNull();
    expect(document.querySelectorAll('[data-board-column]')).toHaveLength(4);

    fireEvent.click(screen.getByTestId('board-done-toggle'));
    expect(coluna('done')).not.toBeNull();
    expect(document.querySelectorAll('[data-board-column]')).toHaveLength(5);
  });

  it('o ⁙ do cabeçalho recolhe a coluna (só o cabeçalho fica) e expande de volta', () => {
    renderQuadro({
      byStatus: { ...VAZIO, done: [
        item({ id: 'r1', title: 'Feita hoje', status: 'done', completed_at: dias(0) }),
      ] },
    });

    const recolher = screen.getByTestId('board-collapse-done');
    expect(recolher.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Feita hoje')).toBeTruthy();

    fireEvent.click(recolher);
    expect(screen.getByTestId('board-collapse-done').getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('board-collapse-done').getAttribute('aria-label')).toBe('Expandir coluna Concluído');
    expect(screen.getByText('Concluído')).toBeTruthy();
    expect(screen.queryByText('Feita hoje')).toBeNull();
    expect(within(coluna('done')!).queryAllByTestId('board-column-empty')).toHaveLength(0);

    fireEvent.click(screen.getByTestId('board-collapse-done'));
    expect(screen.getByText('Feita hoje')).toBeTruthy();
  });
});

describe('etapa 103 — esqueleto e vazio por coluna', () => {
  it('toda coluna vazia mostra a microcopy única e a sua política', () => {
    renderQuadro();

    expect(screen.getAllByTestId('board-column-empty')).toHaveLength(5);
    expect(screen.getAllByText('Nada aqui. Arraste uma tarefa ou capture acima')).toHaveLength(5);
    // a política sai da KANBAN_COLUMNS (mesmo texto do tooltip do cabeçalho)
    expect(screen.getByText('Feito. Fica 7 dias à vista.')).toBeTruthy();
  });

  it('carregando, cada coluna traz 3 esqueletos e nenhum vazio', () => {
    const { container } = renderQuadro({ isLoading: true });

    expect(container.querySelectorAll('.animate-shimmer')).toHaveLength(15);
    expect(screen.queryAllByTestId('board-column-empty')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Regra de tela do plano: TODO controle novo do cartão tem alvo de >= 40 px nas
// duas medidas. O jsdom não calcula layout, então a medida é lida da classe
// REALMENTE aplicada ao elemento renderizado e convertida pela escala do
// Tailwind (n => n*4px): assim `h-8` = 32 e `min-h-[24px]` = 24 reprovam, e o
// teste fica vermelho sem a correção — não é conferência de string solta.
// ---------------------------------------------------------------------------

/** Menor alvo garantido em uma dimensão, em px, lido da classe aplicada. */
function alvoGarantidoPx(el: Element | null, eixo: 'h' | 'w'): number {
  const cls = el?.className ?? '';
  // `w-full`/`h-full` ocupam toda a coluna (muito mais que 40 px): vale.
  if (cls.split(/\s+/).some(c => c === `${eixo}-full` || c === `min-${eixo}-full`)) return Infinity;
  let px = 0;
  const re = new RegExp(`(?:min-)?${eixo}-(\[[0-9.]+px\]|[0-9.]+)`, 'g');
  for (const m of cls.matchAll(re)) {
    const v = m[1];
    px = Math.max(px, v.startsWith('[') ? parseFloat(v.slice(1, -3)) : parseFloat(v) * 4);
  }
  return px;
}

describe('regra de tela — alvos de pelo menos 40 px nos controles deste cartão', () => {
  it('toggle, ⁙ do cabeçalho e rodapé de 30 dias passam de 40 px nas duas medidas', () => {
    renderQuadro({
      byStatus: { ...VAZIO, done: [
        item({ id: 'r1', title: 'Feita hoje', status: 'done', completed_at: dias(0) }),
        item({ id: 'o1', title: 'Feita ha duas semanas', status: 'done', completed_at: dias(13) }),
      ] },
    });

    for (const id of ['board-done-toggle', 'board-collapse-done', 'board-done-older']) {
      const botao = screen.getByTestId(id);
      expect(alvoGarantidoPx(botao, 'h'), `${id} altura`).toBeGreaterThanOrEqual(40);
      expect(alvoGarantidoPx(botao, 'w'), `${id} largura`).toBeGreaterThanOrEqual(40);
    }
  });
});
