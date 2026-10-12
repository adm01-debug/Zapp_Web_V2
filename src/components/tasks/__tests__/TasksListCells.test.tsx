/**
 * Etapas 056/057/059/060 — as quatro células da direita da Lista em tabela.
 *
 * O que este arquivo pina:
 *  - 056: a pílula de prioridade da tabela com a cor do plano (Urgente vermelho
 *    CHEIO, Alta vermelho em CONTORNO, Média âmbar, Baixa azul) e o padrão
 *    `medium` para prioridade nula/desconhecida;
 *  - 057: calendário + "Ontem, 17:00", vermelho quando atrasada, e a data
 *    completa no tooltip; concluída mostra só o dia e nunca em vermelho;
 *  - 059: sino + "Hoje, 13:30" com o popover de adiar/remover/escolher, "Sem
 *    lembrete" em muted (não botão) e o motivo em estado terminal;
 *  - 060: a pílula de estado abre o menu de mover com as regras do card
 *    (o item atual travado e "Aguardando" sem motivo pedindo o motivo).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksListTable } from '@/components/tasks/list/TasksListTable';
import { prazoCompleto } from '@/components/tasks/list/prazoCompleto';
import type { BucketsByDue } from '@/hooks/tasks/workItemAggregates';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import { makeTaskRow } from '@/test/mocks/tarefas';

const AGORA = new Date(2026, 9, 11, 18, 0);          // domingo, 11/10/2026 18:00 (local)
const ONTEM = new Date(2026, 9, 10, 17, 0).toISOString();
const HOJE_1330 = new Date(2026, 9, 11, 13, 30).toISOString();

function item(over: Record<string, unknown> = {}): WorkItem {
  return makeTaskRow(over) as unknown as WorkItem;
}

function buckets(over: Partial<BucketsByDue> = {}): BucketsByDue {
  const vazio: WorkItem[] = [];
  return { overdue: vazio, today: vazio, tomorrow: vazio, upcoming: vazio, noDue: vazio, done7d: vazio, doneOlder: vazio, ...over };
}

const temMontado = { current: true };

/** As ações chegam do `TasksModule` por item; aqui elas são spies. O objeto NÃO
 *  pode ser anotado como `Acoes`: a anotação apagaria a assinatura do callback
 *  no `vi.fn` e o spread em `TasksListTable` viraria erro de tipo. */
function mocks() {
  return {
    onOpen: vi.fn((_item: WorkItem) => {}),
    onToggleDone: vi.fn((_i: WorkItem) => {}),
    onMoveTo: vi.fn((_item: WorkItem, _to: WorkItemStatus) => {}),
    onRequestWaitingReason: vi.fn((_i: WorkItem) => {}),
    onSnooze: vi.fn((_item: WorkItem, _minutos: number | 'tomorrow9') => {}),
    onClearReminder: vi.fn((_i: WorkItem) => {}),
    onOpenReminder: vi.fn((_i: WorkItem) => {}),
  };
}

/** O tipo das ações vem do próprio `mocks()`: declará-lo à mão com
 *  `ReturnType<typeof vi.fn>` apagaria a assinatura do callback e o spread em
 *  `TasksListTable` viraria erro de tipo. */
type Acoes = ReturnType<typeof mocks>;

function renderCom(byDue: BucketsByDue, acoes: Acoes, now: Date = AGORA) {
  render(
    // delayDuration 0: o tooltip abre no primeiro pointer move (sem esperar 700 ms).
    <TooltipProvider delayDuration={0}>
      <TasksListTable byDue={byDue} now={now} hasMounted={temMontado} {...acoes} />
    </TooltipProvider>
  );
  return acoes;
}

function renderTabela(alvo: WorkItem, now: Date = AGORA) {
  return renderCom(buckets({ noDue: [alvo] }), mocks(), now);
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

describe('056 — célula Prioridade', () => {
  it('dá a cada prioridade o par de cor do plano (Urgente cheio, Alta contorno, Média âmbar, Baixa azul)', () => {
    render(
      <TooltipProvider>
        <TasksListTable
          byDue={buckets({
            noDue: [
              item({ id: 'p1', priority: 'urgent' }),
              item({ id: 'p2', priority: 'high' }),
              item({ id: 'p3', priority: 'medium' }),
              item({ id: 'p4', priority: 'low' }),
            ],
          })}
          hasMounted={temMontado}
          onOpen={vi.fn()}
          onToggleDone={vi.fn()}
        />
      </TooltipProvider>
    );

    const pilula = (id: string) =>
      within(document.querySelector(`[data-item-id="${id}"]`) as HTMLElement).getByTestId('priority-cell');

    const urgente = pilula('p1');
    expect(urgente.textContent).toBe('Urgente');
    expect(urgente.className).toContain('bg-destructive');
    expect(urgente.className).toContain('text-destructive-foreground');

    const alta = pilula('p2');
    expect(alta.textContent).toBe('Alta');
    expect(alta.className).toContain('border-destructive');
    expect(alta.className).toContain('bg-transparent');          // contorno, não cheio

    const media = pilula('p3');
    expect(media.textContent).toBe('Média');
    expect(media.className).toContain('bg-warning/15');

    const baixa = pilula('p4');
    expect(baixa.textContent).toBe('Baixa');
    expect(baixa.className).toContain('bg-primary/10');
  });

  it('prioridade nula ou desconhecida cai no padrão do banco (Média), sem "undefined"', () => {
    render(
      <TooltipProvider>
        <TasksListTable
          byDue={buckets({ noDue: [item({ id: 'n1', priority: null }), item({ id: 'n2', priority: 'nao-existe' })] })}
          hasMounted={temMontado}
          onOpen={vi.fn()}
          onToggleDone={vi.fn()}
        />
      </TooltipProvider>
    );

    const linhas = screen.getAllByTestId('task-row');
    expect(within(linhas[0]).getByTestId('priority-cell').textContent).toBe('Média');
    expect(within(linhas[1]).getByTestId('priority-cell').textContent).toBe('Média');
  });
});

describe('057 — célula Prazo', () => {
  it('mostra "Ontem, 17:00" em vermelho quando o prazo passou e a data completa no tooltip', async () => {
    renderTabela(item({ id: 'd1', due_date: ONTEM }));

    const label = within(screen.getByTestId('task-row')).getByTestId('date-label');
    expect(label.textContent).toContain('Ontem, 17:00');
    expect(label.className).toContain('--destructive-text');

    fireEvent.pointerMove(screen.getByTestId('due-cell'));
    expect((await screen.findByRole('tooltip')).textContent).toBe('Ontem, 17:00 · 10/10/2026');
  });

  it('concluída mostra só o dia e nunca em vermelho', () => {
    const feita = item({ id: 'd2', status: 'done', completed_at: AGORA.toISOString(), due_date: ONTEM });
    renderCom(buckets({ done7d: [feita] }), mocks(), AGORA);
    // A seção "Concluídas" nasce recolhida: o item só existe depois de abrir.
    fireEvent.click(screen.getByText('Concluídas (7 dias)'));
    const label = within(screen.getByTestId('task-row')).getByTestId('date-label');
    expect(label.textContent).toBe('Ontem');
    expect(label.className).not.toContain('--destructive-text');
  });

  it('sem prazo diz "Sem prazo" e não monta tooltip', () => {
    renderTabela(item({ id: 'd3', due_date: null }));
    const label = within(screen.getByTestId('task-row')).getByTestId('date-label');
    expect(label.textContent).toBe('Sem prazo');
    expect(screen.queryByTestId('due-cell')).toBeNull();
  });

  it('prazoCompleto: regra única + dd/mm/aaaa; sem valor ou valor inválido devolve null', () => {
    expect(prazoCompleto(new Date(2026, 9, 11, 14, 0), AGORA)).toBe('Hoje, 14:00 · 11/10/2026');
    expect(prazoCompleto(new Date(2026, 9, 10, 17, 0), AGORA)).toBe('Ontem, 17:00 · 10/10/2026');
    expect(prazoCompleto(new Date(2026, 9, 12, 10, 0), AGORA)).toBe('Amanhã, 10:00 · 12/10/2026');
    expect(prazoCompleto('2026-10-13T15:00:00', AGORA)).toBe('13 out., 15:00 · 13/10/2026');
    expect(prazoCompleto(null, AGORA)).toBeNull();
    expect(prazoCompleto('nem data', AGORA)).toBeNull();
  });
});

describe('059 — célula Lembrete', () => {
  it('sem alarme: "Sem lembrete" em muted e NÃO é botão (nada para adiar)', () => {
    renderTabela(item({ id: 'r1', remind_at: null }));
    const celula = within(screen.getByTestId('task-row')).getByTestId('remind-cell');
    expect(celula.getAttribute('data-empty')).toBe('true');
    expect(celula.textContent).toBe('Sem lembrete');
    expect(celula.tagName).toBe('SPAN');
    expect(screen.queryByRole('button', { name: /Sem lembrete/ })).toBeNull();
  });

  it('com alarme mostra "Hoje, 13:30" e o popover adia 15 min sem abrir a linha', async () => {
    const acoes = renderTabela(item({ id: 'r2', remind_at: HOJE_1330 }));
    const botao = within(screen.getByTestId('task-row')).getByTestId('remind-cell');
    expect(botao.textContent).toBe('Hoje, 13:30');

    fireEvent.click(botao);
    fireEvent.click(await screen.findByRole('button', { name: '15 min' }));
    expect(acoes.onSnooze).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2' }), 15);
    expect(acoes.onOpen).not.toHaveBeenCalled();
  });

  it('"Remover" limpa o alarme e "Escolher…" abre o detalhe no campo alarme', async () => {
    const acoes = renderTabela(item({ id: 'r3', remind_at: HOJE_1330 }));

    fireEvent.click(within(screen.getByTestId('task-row')).getByTestId('remind-cell'));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));
    expect(acoes.onClearReminder).toHaveBeenCalledWith(expect.objectContaining({ id: 'r3' }));

    fireEvent.click(within(screen.getByTestId('task-row')).getByTestId('remind-cell'));
    fireEvent.click(await screen.findByRole('button', { name: /Escolher/ }));
    expect(acoes.onOpenReminder).toHaveBeenCalledWith(expect.objectContaining({ id: 'r3' }));
  });

  it('em estado terminal explica o motivo em vez de oferecer um adiamento que não dispara', async () => {
    const feita = item({ id: 'r4', status: 'done', completed_at: AGORA.toISOString(), remind_at: HOJE_1330 });
    renderCom(buckets({ done7d: [feita] }), mocks(), AGORA);
    fireEvent.click(screen.getByText('Concluídas (7 dias)'));

    fireEvent.click(within(screen.getByTestId('task-row')).getByTestId('remind-cell'));
    await waitFor(() => expect(screen.getByText(/reabra a tarefa/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: '15 min' })).toBeNull();
  });
});

describe('060 — célula Estado', () => {
  it('mostra a pílula do estado e o clique abre o menu de mover com as colunas do quadro', async () => {
    renderTabela(item({ id: 'e1', status: 'todo' }));

    const linha = screen.getByTestId('task-row');
    const pilula = within(linha).getByTestId('status-pill');
    expect(pilula.textContent).toBe('A fazer');
    expect(pilula.getAttribute('data-status')).toBe('todo');

    await abrirMenu(within(linha).getByTestId('status-cell'));
    const itens = screen.getAllByRole('menuitem').map((m) => m.textContent);
    expect(itens).toEqual(['Entrada', 'A fazer', 'Fazendo', 'Aguardando', 'Concluído']);
    // A coluna ATUAL fica travada (regra do card): "A fazer" não é acionável.
    expect(screen.getByRole('menuitem', { name: 'A fazer' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('clicar numa coluna move o item e não abre a linha', async () => {
    const acoes = renderTabela(item({ id: 'e2', status: 'todo' }));
    await abrirMenu(within(screen.getByTestId('task-row')).getByTestId('status-cell'));

    fireEvent.click(screen.getByRole('menuitem', { name: 'Fazendo' }));
    expect(acoes.onMoveTo).toHaveBeenCalledWith(expect.objectContaining({ id: 'e2' }), 'doing');
    expect(acoes.onOpen).not.toHaveBeenCalled();
  });

  it('"Aguardando" sem motivo pede o motivo em vez de mover', async () => {
    const acoes = renderTabela(item({ id: 'e3', status: 'todo', waiting_reason: null }));
    await abrirMenu(within(screen.getByTestId('task-row')).getByTestId('status-cell'));

    fireEvent.click(screen.getByRole('menuitem', { name: 'Aguardando' }));
    expect(acoes.onRequestWaitingReason).toHaveBeenCalledWith(expect.objectContaining({ id: 'e3' }));
    expect(acoes.onMoveTo).not.toHaveBeenCalled();
  });

  it('com "Fazendo" cheio (3/3) a coluna fica travada com o motivo', async () => {
    render(
      <TooltipProvider>
        <TasksListTable
          byDue={buckets({ noDue: [item({ id: 'e4', status: 'todo' })] })}
          now={AGORA}
          doingCount={3}
          hasMounted={temMontado}
          onOpen={vi.fn()}
          onToggleDone={vi.fn()}
          onMoveTo={vi.fn()}
        />
      </TooltipProvider>
    );

    await abrirMenu(screen.getByTestId('status-cell'));
    const fazendo = screen.getByRole('menuitem', { name: /Fazendo/ });
    expect(fazendo.getAttribute('aria-disabled')).toBe('true');
    expect(fazendo.getAttribute('title')).toBe('Fazendo está cheio (3/3)');
  });

  it('sem as ações de mover, a célula é só a pílula (sem gatilho de menu)', () => {
    render(
      <TooltipProvider>
        <TasksListTable
          byDue={buckets({ noDue: [item({ id: 'e5', status: 'waiting', waiting_reason: 'cliente' })] })}
          hasMounted={temMontado}
          onOpen={vi.fn()}
          onToggleDone={vi.fn()}
        />
      </TooltipProvider>
    );
    expect(screen.queryByTestId('status-cell')).toBeNull();
    expect(screen.getByTestId('status-pill').textContent).toBe('Aguardando');
  });
});
