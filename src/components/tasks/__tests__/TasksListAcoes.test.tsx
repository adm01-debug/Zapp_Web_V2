/**
 * Etapas 061/062/063/064 — o menu ⋮ da linha, a linha selecionada, o clique
 * seguro e o teclado da tabela.
 *
 * O que este arquivo pina:
 *  - 061: o kebab de cada LINHA traz os grupos do card (Abrir · Concluir/Reabrir
 *    · Lembrar-me ▸ · Mover para ▸ · Cancelar) e cada item chama a ação que o
 *    `TasksModule` já entrega ao modo Lista — nada de ação nova na tabela;
 *  - 062: clicar (ou teclar Enter) na linha seleciona o item no estado do
 *    módulo (`TasksUiContext`) e abre os detalhes; a linha ganha `bg-primary/10`
 *    e a barra esquerda de 3 px;
 *  - 063: clique no checkbox, no contato e no menu ⋮ NÃO abre os detalhes;
 *  - 064: o teclado da tabela — ↑/↓ trocam a linha focada, Enter/E abrem, Espaço
 *    (e o X herdado) concluem, Delete cancela.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksUiProvider } from '@/components/tasks/shared/TasksUiContext';
import { useTasksUi } from '@/components/tasks/shared/tasksUi';
import { TasksListTable } from '@/components/tasks/list/TasksListTable';
import type { BucketsByDue } from '@/hooks/tasks/workItemAggregates';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import { makeTaskRow } from '@/test/mocks/tarefas';

const AGORA = new Date(2026, 9, 11, 18, 0);

function item(over: Record<string, unknown> = {}): WorkItem {
  return makeTaskRow(over) as unknown as WorkItem;
}

function buckets(over: Partial<BucketsByDue> = {}): BucketsByDue {
  const vazio: WorkItem[] = [];
  return { overdue: vazio, today: vazio, tomorrow: vazio, upcoming: vazio, noDue: vazio, done7d: vazio, doneOlder: vazio, ...over };
}

const temMontado = { current: true };

/** As mesmas ações que o `TasksModule` passa ao modo Lista, agora com o menu ⋮
 *  e o cancelar da linha. A anotação fica por conta do `ReturnType`. */
function mocks() {
  return {
    onOpen: vi.fn((_item: WorkItem) => {}),
    onToggleDone: vi.fn((_i: WorkItem) => {}),
    onOpenContact: vi.fn((_i: WorkItem) => {}),
    onComplete: vi.fn((_i: WorkItem) => {}),
    onReopen: vi.fn((_i: WorkItem) => {}),
    onMoveTo: vi.fn((_item: WorkItem, _to: WorkItemStatus) => {}),
    onDelete: vi.fn((_i: WorkItem) => {}),
    onRequestWaitingReason: vi.fn((_i: WorkItem) => {}),
    onSnooze: vi.fn((_item: WorkItem, _minutos: number | 'tomorrow9') => {}),
    onClearReminder: vi.fn((_i: WorkItem) => {}),
    onOpenReminder: vi.fn((_i: WorkItem) => {}),
  };
}

type Acoes = ReturnType<typeof mocks>;

function renderCom(byDue: BucketsByDue, acoes: Acoes) {
  render(
    <TooltipProvider delayDuration={0}>
      <TasksListTable byDue={byDue} now={AGORA} hasMounted={temMontado} {...acoes} />
    </TooltipProvider>
  );
  return acoes;
}

/** Sonda do estado de UI do módulo: prova que a seleção vive no CONTEXTO. */
function SondaSelecao() {
  const ui = useTasksUi();
  return <span data-testid="sonda-selecao">{ui.selectedId ?? 'nada'}</span>;
}

function renderSelecao(alvo: WorkItem) {
  const acoes = mocks();
  render(
    <TasksUiProvider>
      <SondaSelecao />
      <TooltipProvider delayDuration={0}>
        <TasksListTable byDue={buckets({ noDue: [alvo] })} now={AGORA} hasMounted={temMontado} {...acoes} />
      </TooltipProvider>
    </TasksUiProvider>
  );
  return acoes;
}

/** Abre um Radix Menu pelo gatilho (teclado; click como reserva) — igual ao cardAcoes. */
async function abrirMenu(el: HTMLElement) {
  fireEvent.keyDown(el, { key: 'Enter', code: 'Enter' });
  try {
    return await screen.findByRole('menu');
  } catch {
    fireEvent.click(el);
    return screen.findByRole('menu');
  }
}

beforeEach(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});
afterEach(() => cleanup());

describe('061 — menu ⋮ da linha', () => {
  it('traz os 5 grupos do card e cada item chama a ação do módulo', async () => {
    const alvo = item({ id: 'm1', title: 'Ligar para o cliente' });
    const acoes = renderCom(buckets({ noDue: [alvo] }), mocks());
    const kebab = within(screen.getByTestId('task-row')).getByRole('button', { name: 'Mais opções' });

    await abrirMenu(kebab);
    expect(screen.getByRole('menuitem', { name: 'Abrir' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Concluir' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Lembrar-me/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Mover para/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Cancelar' })).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Abrir' }));
    expect(acoes.onOpen).toHaveBeenCalledWith(alvo);

    await abrirMenu(kebab);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Concluir' }));
    expect(acoes.onComplete).toHaveBeenCalledWith(alvo);

    await abrirMenu(kebab);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar' }));
    expect(acoes.onDelete).toHaveBeenCalledWith(alvo);

    // O caminho do menu é o do card: abrir/concluir/cancelar não abrem a linha
    // por conta própria e o clique de dentro do menu não vaza para a linha.
    expect(acoes.onOpen).toHaveBeenCalledTimes(1);
  });

  it('o gatilho ⋮ tem alvo de 40 px e anel de foco visível (regra de tela)', () => {
    const alvo = item({ id: 'm-size' });
    renderCom(buckets({ noDue: [alvo] }), mocks());
    const kebab = within(screen.getByTestId('task-row')).getByRole('button', { name: 'Mais opções' });
    // h-10 = w-10 = 40 px: o mesmo alvo de toque do primitivo compartilhado.
    expect(kebab.className).toContain('h-10');
    expect(kebab.className).toContain('w-10');
    // foco visível com o anel do sistema (não some com o opacity-0 do hover).
    expect(kebab.className).toContain('focus-visible:ring-2');
    expect(kebab.className).toContain('focus-visible:ring-ring');
  });

  it('num item concluído a segunda opção é "Reabrir" e chama onReopen', async () => {
    const feita = item({ id: 'm2', status: 'done', completed_at: new Date().toISOString() });
    const acoes = renderCom(buckets({ done7d: [feita] }), mocks());

    fireEvent.click(screen.getByText('Concluídas (7 dias)'));
    await abrirMenu(within(screen.getByTestId('task-row')).getByRole('button', { name: 'Mais opções' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reabrir' }));

    expect(acoes.onReopen).toHaveBeenCalledWith(feita);
    expect(acoes.onComplete).not.toHaveBeenCalled();
  });

  it('"Lembrar-me ▸ 15 min" adia o item sem abrir os detalhes', async () => {
    const alvo = item({ id: 'm3', remind_at: new Date(2026, 9, 12, 9, 0).toISOString() });
    const acoes = renderCom(buckets({ noDue: [alvo] }), mocks());

    await abrirMenu(within(screen.getByTestId('task-row')).getByRole('button', { name: 'Mais opções' }));
    const sub = screen.getByRole('menuitem', { name: /Lembrar-me/ });
    fireEvent.keyDown(sub, { key: 'ArrowRight', code: 'ArrowRight' });
    fireEvent.click(await screen.findByRole('menuitem', { name: '15 min' }));

    expect(acoes.onSnooze).toHaveBeenCalledWith(alvo, 15);
    expect(acoes.onOpen).not.toHaveBeenCalled();
  });

  it('"Mover para ▸ A fazer" usa as regras do MoveTargets (coluna atual travada)', async () => {
    // Status padrão da fixture é `todo`: a própria coluna fica desabilitada.
    const alvo = item({ id: 'm4', status: 'backlog' });
    const acoes = renderCom(buckets({ noDue: [alvo] }), mocks());

    await abrirMenu(within(screen.getByTestId('task-row')).getByRole('button', { name: 'Mais opções' }));
    const sub = screen.getByRole('menuitem', { name: /Mover para/ });
    fireEvent.keyDown(sub, { key: 'ArrowRight', code: 'ArrowRight' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'A fazer' }));

    expect(acoes.onMoveTo).toHaveBeenCalledWith(alvo, 'todo');
  });
});

describe('062 — linha selecionada', () => {
  it('clicar na linha seleciona no estado do módulo e abre os detalhes', () => {
    const alvo = item({ id: 's1' });
    const acoes = renderSelecao(alvo);

    expect(screen.getByTestId('task-row').getAttribute('data-selected')).toBe('false');
    expect(screen.getByTestId('sonda-selecao').textContent).toBe('nada');

    fireEvent.click(screen.getByTestId('task-row'));

    expect(screen.getByTestId('sonda-selecao').textContent).toBe('s1');
    expect(acoes.onOpen).toHaveBeenCalledWith(alvo);

    const linha = screen.getByTestId('task-row');
    expect(linha.getAttribute('data-selected')).toBe('true');
    expect(linha.className).toContain('bg-primary/10');
    // A barra esquerda de 3 px é um elemento próprio (não muda a largura das colunas).
    expect(within(linha).getByTestId('row-selection-bar').className).toContain('w-[3px]');
  });

  it('Enter também seleciona — clique e teclado mexem no MESMO estado', () => {
    const acoes = renderSelecao(item({ id: 's2' }));

    const linha = screen.getByTestId('task-row');
    linha.focus();
    fireEvent.keyDown(linha, { key: 'Enter' });

    expect(screen.getByTestId('sonda-selecao').textContent).toBe('s2');
    expect(acoes.onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('063 — clique seguro na linha', () => {
  it('checkbox, contato e menu ⋮ não abrem os detalhes; o título abre', async () => {
    const alvo = item({
      id: 'k1',
      title: 'Retornar orçamento',
      contact: { id: 'ct1', name: 'Maria Souza', phone: null, avatar_url: null },
    });
    const acoes = renderSelecao(alvo);
    const linha = screen.getByTestId('task-row');

    fireEvent.click(within(linha).getByRole('checkbox', { name: 'Concluir tarefa' }));
    fireEvent.click(within(linha).getByRole('button', { name: /Maria Souza/ }));
    await abrirMenu(within(screen.getByTestId('task-row')).getByRole('button', { name: 'Mais opções' }));

    expect(acoes.onToggleDone).toHaveBeenCalledWith(alvo);
    expect(acoes.onOpenContact).toHaveBeenCalledWith(alvo);
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(acoes.onOpen).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'Escape' });   // fecha o menu
    fireEvent.click(within(screen.getByTestId('task-row')).getByText('Retornar orçamento'));
    expect(acoes.onOpen).toHaveBeenCalledWith(alvo);
  });
});

describe('064 — teclado da tabela', () => {
  it('↑/↓ trocam a linha focada e as teclas agem na linha focada', () => {
    const a = item({ id: 'a', title: 'Primeira' });
    const b = item({ id: 'b', title: 'Segunda' });
    const acoes = renderCom(buckets({ noDue: [a, b] }), mocks());
    const [primeira, segunda] = screen.getAllByTestId('task-row');

    primeira.focus();
    expect(document.activeElement).toBe(primeira);

    fireEvent.keyDown(primeira, { key: 'ArrowDown', code: 'ArrowDown' });
    expect(document.activeElement).toBe(segunda);

    fireEvent.keyDown(segunda, { key: 'ArrowUp', code: 'ArrowUp' });
    expect(document.activeElement).toBe(primeira);

    fireEvent.keyDown(primeira, { key: 'Enter' });
    expect(acoes.onOpen).toHaveBeenCalledWith(a);

    fireEvent.keyDown(primeira, { key: ' ' });
    expect(acoes.onToggleDone).toHaveBeenCalledWith(a);

    // `E` edita e `X`/Espaço concluem — os atalhos que o card tinha.
    fireEvent.keyDown(primeira, { key: 'e' });
    fireEvent.keyDown(primeira, { key: 'x' });
    expect(acoes.onOpen).toHaveBeenCalledTimes(2);
    expect(acoes.onToggleDone).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(primeira, { key: 'Delete' });
    expect(acoes.onDelete).toHaveBeenCalledWith(a);
  });

  it('↓ na última linha não sai da tabela', () => {
    const acoes = renderCom(buckets({ noDue: [item({ id: 'u1' })] }), mocks());
    const linha = screen.getByTestId('task-row');

    linha.focus();
    fireEvent.keyDown(linha, { key: 'ArrowDown', code: 'ArrowDown' });

    expect(document.activeElement).toBe(linha);
    expect(acoes.onOpen).not.toHaveBeenCalled();
  });
});
