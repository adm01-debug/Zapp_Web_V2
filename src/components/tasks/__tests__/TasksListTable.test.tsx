/**
 * Etapas 050/051/053/054 — a Lista em TABELA.
 *
 * O que este arquivo pina (e que antes NÃO existia: a Lista eram cartões):
 *
 *  1. a `<table>` com as 6 colunas do contrato (049) na ordem, cabeçalho fixo;
 *  2. a linha de grupo com ícone circular, contador e o subtítulo de data do
 *     "Hoje" em pt-BR (051);
 *  3. os dois vazios e o carregamento continuam sendo do modo (via
 *     `TasksListMode`, que passa a renderizar a tabela);
 *  4. a célula Tarefa (053): checkbox que conclui sem abrir + motivo âmbar;
 *  5. a célula Contato (054): avatar + nome, "Sem contato" e o clique que abre
 *     a conversa sem abrir os detalhes;
 *  6. as 4 colunas 056–060 (Prioridade, Prazo, Lembrete e Estado) preenchidas —
 *     os casos delas estão em `TasksListCells.test.tsx`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksListMode } from '@/components/tasks/list/TasksListMode';
import { TasksListTable } from '@/components/tasks/list/TasksListTable';
import type { BucketsByDue } from '@/hooks/tasks/workItemAggregates';
import type { WorkItem } from '@/hooks/tasks/workItem.types';
import { makeTaskRow } from '@/test/mocks/tarefas';

/** Item do domínio: reusa a fixture do banco (mesmo shape) sem duplicar dados. */
function item(over: Record<string, unknown> = {}): WorkItem {
  return makeTaskRow(over) as unknown as WorkItem;
}

const vazio: WorkItem[] = [];

function buckets(over: Partial<BucketsByDue> = {}): BucketsByDue {
  return {
    overdue: vazio,
    today: vazio,
    tomorrow: vazio,
    upcoming: vazio,
    noDue: vazio,
    done7d: vazio,
    doneOlder: vazio,
    ...over,
  };
}

/** A primeira renderização não anima a entrada (o ref é o mesmo do modo). */
const temMontado = { current: true };

interface Acoes {
  onOpen: ReturnType<typeof vi.fn>;
  onToggleDone: ReturnType<typeof vi.fn>;
  onOpenContact: ReturnType<typeof vi.fn>;
}

function renderTabela(byDue: BucketsByDue, now?: Date): Acoes {
  // A implementação tipada faz o `vi.fn` devolver a assinatura do callback (sem cast).
  const acoes = {
    onOpen: vi.fn((_item: WorkItem) => {}),
    onToggleDone: vi.fn((_item: WorkItem) => {}),
    onOpenContact: vi.fn((_item: WorkItem) => {}),
  };
  render(
    <TooltipProvider>
      <TasksListTable byDue={byDue} now={now} hasMounted={temMontado} {...acoes} />
    </TooltipProvider>
  );
  return acoes;
}

/** Etapa 067: "Amanhã", "Próximas", "Sem prazo" e "Concluídas" nascem recolhidos. */
function abrirGrupo(titulo: string) {
  fireEvent.click(screen.getByRole('button', { name: (nome: string) => nome.startsWith(titulo) }));
}

describe('TasksListTable — etapas 050/051/053/054 (estrutura, grupos e as duas células)', () => {
  beforeEach(() => {
    cleanup();
    // Etapa 065: a escolha do grupo é lembrada no navegador — zera a cada teste.
    window.localStorage.clear();
  });

  it('1) desenha as 6 colunas do contrato na ordem, num cabeçalho fixo', () => {
    const { container } = render(
      <TooltipProvider>
        <TasksListTable
          byDue={buckets({ noDue: [item({ id: 'n1' })] })}
          hasMounted={temMontado}
          onOpen={vi.fn()}
          onToggleDone={vi.fn()}
        />
      </TooltipProvider>
    );

    expect(container.querySelector('table')).toBeTruthy();
    const thead = container.querySelector('thead');
    expect(thead).toBeTruthy();
    const colunas = within(thead as HTMLElement).getAllByRole('columnheader');
    expect(colunas.map((c) => c.textContent)).toEqual([
      'Tarefa', 'Contato', 'Prioridade', 'Prazo', 'Lembrete', 'Estado',
    ]);
    // "cabeçalho fixo" (etapa 050): a célula de cabeçalho é `sticky`.
    colunas.forEach((c) => expect(c.className).toContain('sticky'));
  });

  it('2) a linha de grupo traz ícone circular, contador e o subtítulo de data no "Hoje"', () => {
    const { container } = render(
      <TooltipProvider>
        <TasksListTable
          byDue={buckets({
            overdue: [item({ id: 'o1' }), item({ id: 'o2' })],
            today: [item({ id: 'h1' })],
          })}
          now={new Date(2026, 9, 11, 10, 0)}
          hasMounted={temMontado}
          onOpen={vi.fn()}
          onToggleDone={vi.fn()}
        />
      </TooltipProvider>
    );

    const atrasadas = container.querySelector('[data-group="atrasadas"]') as HTMLElement;
    expect(atrasadas.textContent).toContain('Atrasadas');
    expect(atrasadas.textContent).toContain('2');                    // o contador
    expect(atrasadas.querySelector('span.rounded-full svg')).toBeTruthy();  // o ícone circular

    const hoje = container.querySelector('[data-group="hoje"]') as HTMLElement;
    expect(hoje.querySelector('span.rounded-full svg')).toBeTruthy();
    // 11/10/2026 é domingo: o subtítulo é a regra única (`daySubtitle`).
    expect(hoje.textContent).toContain('Domingo, 11 de outubro');
  });

  it('2b) "Próximas" sai separada por dia, com o subcabeçalho de cada dia', () => {
    const dia = (d: number) => new Date(2026, 9, d, 12, 0).toISOString();
    renderTabela(
      buckets({
        upcoming: [
          item({ id: 'u1', due_date: dia(14) }),
          item({ id: 'u2', due_date: dia(16) }),
        ],
      }),
      new Date(2026, 9, 11, 10, 0)
    );
    abrirGrupo('Próximas');

    const dias = screen.getAllByTestId('list-day-row');
    expect(dias).toHaveLength(2);
    expect(dias[0].textContent?.length).toBeGreaterThan(0);
    expect(dias[1].textContent?.length).toBeGreaterThan(0);
    expect(dias[0].textContent).not.toBe(dias[1].textContent);
    expect(screen.getAllByTestId('task-row')).toHaveLength(2);
  });

  it('4) a célula Tarefa conclui pelo checkbox sem abrir a linha e mostra o motivo âmbar', () => {
    const alvo = item({
      id: 'k1',
      title: 'Ligar para o cliente',
      status: 'waiting',
      waiting_reason: 'Aguardando aprovação do cliente',
    });
    const acoes = renderTabela(buckets({ noDue: [alvo] }));
    abrirGrupo('Sem prazo');

    const linha = screen.getByTestId('task-row');
    expect(within(linha).getByText('Ligar para o cliente')).toBeTruthy();
    expect(within(linha).getByText('Aguardando aprovação do cliente')).toBeTruthy();

    fireEvent.click(within(linha).getByRole('checkbox', { name: 'Concluir tarefa' }));

    expect(acoes.onToggleDone).toHaveBeenCalledWith(alvo);
    expect(acoes.onOpen).not.toHaveBeenCalled();
  });

  it('4b) a linha VENCIDA/concluída usa o checkbox de reabrir', () => {
    const feita = item({ id: 'c1', title: 'Já foi', status: 'done', completed_at: new Date().toISOString() });
    const acoes = renderTabela(buckets({ done7d: [feita] }));

    // A seção "Concluídas" nasce recolhida: o item só existe depois de abrir.
    expect(screen.queryByTestId('task-row')).toBeNull();
    abrirGrupo('Concluídas');
    fireEvent.click(within(screen.getByTestId('task-row')).getByRole('checkbox', { name: 'Reabrir tarefa' }));

    expect(acoes.onToggleDone).toHaveBeenCalledWith(feita);
  });

  it('5) a célula Contato mostra avatar e nome e abre a conversa sem abrir os detalhes', () => {
    const comContato = item({
      id: 'c1',
      title: 'Retornar orçamento',
      contact: { id: 'ct1', name: 'Maria Souza', phone: null, avatar_url: null },
    });
    const acoes = renderTabela(buckets({ noDue: [comContato] }));
    abrirGrupo('Sem prazo');

    const linha = screen.getByTestId('task-row');
    const botao = within(linha).getByRole('button', { name: /Maria Souza/ });
    expect(within(botao).getByText('MS')).toBeTruthy();   // iniciais do avatar

    fireEvent.click(botao);
    expect(acoes.onOpenContact).toHaveBeenCalledWith(comContato);
    expect(acoes.onOpen).not.toHaveBeenCalled();           // o clique do contato não abre a linha
  });

  it('5b) sem contato a célula diz "Sem contato" e não é acionável', () => {
    renderTabela(buckets({ noDue: [item({ id: 's1', title: 'Sem vínculo', contact: null })] }));
    abrirGrupo('Sem prazo');

    const linha = screen.getByTestId('task-row');
    expect(within(linha).getByText('Sem contato')).toBeTruthy();
    expect(within(linha).queryByRole('button', { name: /Sem contato/ })).toBeNull();
  });

  it('6) as células 056–060 estão preenchidas na linha (prioridade, prazo, lembrete e estado)', () => {
    renderTabela(buckets({ noDue: [item({ id: 'n1' })] }));
    abrirGrupo('Sem prazo');

    const linha = screen.getByTestId('task-row');
    expect(within(linha).getAllByRole('cell')).toHaveLength(6);
    expect(within(linha).queryAllByTestId('list-cell-pendente')).toHaveLength(0);
    expect(within(linha).getByTestId('priority-cell').textContent).toBe('Média');
    expect(within(linha).getByTestId('date-label').textContent).toBe('Sem prazo');
    expect(within(linha).getByTestId('remind-cell').textContent).toBe('Sem lembrete');
    expect(within(linha).getByTestId('status-pill').textContent).toBe('A fazer');
  });

  it('3) o modo Lista passa a renderizar a tabela, com a linha do item dentro dela', () => {
    render(
      <TooltipProvider>
        <TasksListMode
          byDue={buckets({ noDue: [item({ id: 'n1', title: 'Na tabela' })] })}
          isLoading={false}
          searchQuery=""
          onOpen={vi.fn()}
          onToggleDone={vi.fn()}
          onMoveTo={vi.fn()}
          onDelete={vi.fn()}
          onClearFilter={vi.fn()}
          hasMounted={temMontado}
        />
      </TooltipProvider>
    );

    expect(screen.getByTestId('tasks-list-table')).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
    abrirGrupo('Sem prazo');
    expect(screen.getByTestId('task-row').getAttribute('data-item-id')).toBe('n1');
    expect(screen.getByText('Na tabela')).toBeTruthy();
  });
});
