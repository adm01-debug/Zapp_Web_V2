/**
 * Etapas 032–039 do plano de Tarefas (nível design): o seletor de modos e a
 * barra de filtros (busca, prioridade, contato, popover "Filtros" e chips).
 *
 * Convenções do módulo: o radix `Select` NÃO é dirigido por teste (portal +
 * clique flaky em jsdom — é o que diz o `TasksModule.test`); estado e prazo
 * entram pela URL e são provados pelos chips/badge, que são botões comuns. O
 * radix `Popover` é aberto com `fireEvent.click` no gatilho.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within, createEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  makeQueryClient,
  makeTaskRow,
  makeWrapper,
  resetSupabaseMock,
  setSelectResult,
} from '@/test/mocks/tarefas';

// Etapa 035: a busca de contatos do combobox sai do CRM e fica vazia aqui — o
// que este cartão prova é o filtro "Sem contato", não a busca de contatos.
vi.mock('@/hooks/crm/useContactsSearch', () => ({
  useContactsSearch: () => ({ contacts: [], loading: false, handleSearchChange: () => {} }),
}));

import { TasksModule } from '@/components/tasks/TasksModule';
import { TasksFilterBar } from '@/components/tasks/shared/TasksFilterBar';
import { ModeSwitcher, type TaskMode } from '@/components/tasks/shared/ModeSwitcher';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  DEFAULT_FILTERS,
  SEM_CONTATO,
  isFilterActive,
  type TasksFilters,
} from '@/hooks/tasks/workItemFilters';

const MODE_STORAGE_KEY = 'tasks-mode';

function filtros(over: Partial<TasksFilters> = {}): TasksFilters {
  return { ...DEFAULT_FILTERS, ...over };
}

function renderBarra(
  over: Partial<TasksFilters> = {},
  ops: { mode?: TaskMode; searchText?: string } = {},
) {
  const acoes = {
    onSearch: vi.fn(),
    onPrio: vi.fn(),
    onContact: vi.fn(),
    onStatus: vi.fn(),
    onDue: vi.fn(),
    onToggleAlarm: vi.fn(),
    onToggleDone: vi.fn(),
    onClear: vi.fn(),
  };
  const qc = makeQueryClient();
  const Wrapper = makeWrapper(qc);
  const f = filtros(over);
  render(
    <Wrapper>
      <TasksFilterBar
        filters={f}
        searchText={ops.searchText ?? ''}
        contactOptions={[]}
        mode={ops.mode ?? 'list'}
        isActive={isFilterActive(f)}
        {...acoes}
      />
    </Wrapper>,
  );
  return acoes;
}

function renderModulo() {
  const qc = makeQueryClient();
  const Wrapper = makeWrapper(qc);
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <Wrapper>
          <TasksModule />
        </Wrapper>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe('ModeSwitcher — etapa 032', () => {
  it('oferece os três modos, com rótulo acessível, ícone e ativo preenchido', () => {
    const onChange = vi.fn();
    render(<ModeSwitcher mode="board" onChange={onChange} />);

    expect(screen.getByTestId('tasks-mode').getAttribute('data-mode')).toBe('board');

    const quadro = screen.getByRole('button', { name: 'Quadro' });
    expect(quadro.getAttribute('aria-pressed')).toBe('true');
    // Etapa 032: alvo de toque de 40px, ativo preenchido e foco visível (o
    // `className` é o contrato visual — mesma prática dos testes de contraste).
    expect(quadro.className).toContain('h-10');
    expect(quadro.className).toContain('focus-visible:ring-2');
    // Ativo preenchido: o pill `bg-primary` fica no fundo do botão ativo e o
    // texto do ativo é o `primary-foreground` (o inativo é `muted-foreground`).
    expect(quadro.className).toContain('text-primary-foreground');
    expect(screen.getByRole('button', { name: 'Lista' }).className).toContain('text-muted-foreground');

    expect(screen.getByRole('button', { name: 'Lista' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Agenda' }).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Agenda' }));
    expect(onChange).toHaveBeenCalledWith('agenda');
  });

  it('esconde o rótulo do modo em tela estreita e mantém o nome acessível', () => {
    render(<ModeSwitcher mode="list" onChange={vi.fn()} />);
    const lista = screen.getByRole('button', { name: 'Lista' });

    // Comentário do componente: o rótulo some abaixo de `sm` (`hidden sm:inline`)
    // e sobra o ícone — o `aria-label` é quem sustenta o nome acessível.
    const rotulo = within(lista).getByText('Lista');
    expect(rotulo.className).toContain('hidden');
    expect(rotulo.className).toContain('sm:inline');
    expect(lista.getAttribute('aria-label')).toBe('Lista');
  });
});

describe('TasksFilterBar — etapa 033 (busca)', () => {
  beforeEach(() => limparTela());

  it('mostra o botão de limpar só com texto e o atalho `/` foca o campo', () => {
    const acoes = renderBarra();
    const campo = screen.getByRole('searchbox', { name: 'Buscar tarefa' });

    expect(screen.queryByTestId('tasks-search-clear')).toBeNull();

    fireEvent.change(campo, { target: { value: 'liga' } });
    expect(acoes.onSearch).toHaveBeenCalledWith('liga');

    // Fora de um campo de digitação, `/` foca a busca.
    (document.body as HTMLElement).focus();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).toBe(campo);

    // Dentro do campo, `/` é texto comum — a barra não pode engolir a tecla.
    const evento = createEvent.keyDown(campo, { key: '/' });
    fireEvent(campo, evento);
    expect(evento.defaultPrevented).toBe(false);
  });

  it('o "Limpar busca" devolve o campo vazio', () => {
    const acoes = renderBarra({ q: 'liga' }, { searchText: 'liga' });
    fireEvent.click(screen.getByTestId('tasks-search-clear'));
    expect(acoes.onSearch).toHaveBeenCalledWith('');
  });
});

describe('TasksFilterBar — etapa 034 (prioridade)', () => {
  beforeEach(() => limparTela());

  it('sem prioridade escolhida não há contador nem chips', () => {
    renderBarra();
    expect(within(screen.getByLabelText('Prioridade')).getByText('Prioridade')).toBeTruthy();
    expect(screen.queryByTestId('prio-count')).toBeNull();
    expect(screen.queryByTestId('tasks-filter-chips')).toBeNull();
  });

  it('com prioridade escolhida o gatilho encurta, conta e o chip remove', () => {
    const acoes = renderBarra({ prio: 'urgent' });
    const gatilho = screen.getByLabelText('Prioridade');

    expect(within(gatilho).getByText('Urgente')).toBeTruthy();
    expect(within(gatilho).getByTestId('prio-count').textContent).toBe('1');

    expect(screen.getByText('Prioridade: Urgente')).toBeTruthy();
    fireEvent.click(screen.getByTestId('filter-chip-remove-prio'));
    expect(acoes.onPrio).toHaveBeenCalledWith('all');
  });
});

describe('TasksFilterBar — etapa 035 (contato)', () => {
  beforeEach(() => limparTela());

  it('marca o chip do recorte e oferece "Sem contato" no combobox', () => {
    const acoes = renderBarra({ contact: SEM_CONTATO });

    expect(screen.getByText('Contato: Sem contato')).toBeTruthy();
    expect(screen.getByTestId('contact-count').textContent).toBe('1');

    fireEvent.click(screen.getByTestId('tasks-contact-filter'));
    expect(screen.getByTestId('contact-combobox-extra-sem')).toBeTruthy();
    fireEvent.click(screen.getByTestId('contact-combobox-extra-todos'));
    expect(acoes.onContact).toHaveBeenCalledWith(null);
  });
});

describe('TasksFilterBar — etapas 036 e 038 (popover Filtros)', () => {
  beforeEach(() => limparTela());

  it('conta os filtros ativos e traz estado, prazo, alarme e concluídas', () => {
    const acoes = renderBarra({ alarm: true, done: false, status: 'doing' }, { mode: 'board' });
    const botao = screen.getByRole('button', { name: 'Filtros' });

    expect(within(botao).getByTestId('filters-badge').textContent).toBe('3');

    fireEvent.click(botao);
    const painel = screen.getByTestId('tasks-filters-popover');
    expect(within(painel).getByLabelText('Estado')).toBeTruthy();
    expect(within(painel).getByLabelText('Prazo')).toBeTruthy();

    fireEvent.click(within(painel).getByRole('switch', { name: 'Com alarme' }));
    expect(acoes.onToggleAlarm).toHaveBeenCalled();

    // Etapa 038: no Quadro o mesmo toggle se chama "Concluídas".
    fireEvent.click(within(painel).getByRole('switch', { name: 'Concluídas' }));
    expect(acoes.onToggleDone).toHaveBeenCalled();
  });

  it('na Lista o toggle se chama "Mostrar concluídas" e o badge só existe quando há filtro', () => {
    renderBarra({}, { mode: 'list' });
    expect(screen.queryByTestId('filters-badge')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    expect(screen.getByRole('switch', { name: 'Mostrar concluídas' })).toBeTruthy();
  });
});

describe('TasksFilterBar — etapa 039 (chips e limpar)', () => {
  beforeEach(() => limparTela());

  it('lista os filtros ativos, remove um a um e limpa tudo', () => {
    const acoes = renderBarra({ q: 'liga', prio: 'high', due: 'overdue' });

    expect(screen.getByText('Busca: liga')).toBeTruthy();
    expect(screen.getByText('Prioridade: Alta')).toBeTruthy();
    expect(screen.getByText('Prazo: Atrasadas')).toBeTruthy();

    fireEvent.click(screen.getByTestId('filter-chip-remove-due'));
    expect(acoes.onDue).toHaveBeenCalledWith('all');

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(acoes.onClear).toHaveBeenCalled();
  });
});

describe('TasksModule — integração da barra (etapas 035, 036 e 039)', () => {
  beforeEach(() => {
    limparTela();
    resetSupabaseMock();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    localStorage.setItem(MODE_STORAGE_KEY, 'list');
  });

  it('recorta por estado e prazo da URL e o chip remove o parâmetro', async () => {
    window.history.replaceState(null, '', '/?status=doing&due=overdue');
    const ontem = new Date(Date.now() - 86_400_000).toISOString();
    setSelectResult({
      data: [makeTaskRow({ id: 't1', title: 'Atrasada e em andamento', status: 'doing', due_date: ontem })],
      error: null,
    });

    renderModulo();

    expect(await screen.findByText('Atrasada e em andamento')).toBeTruthy();
    expect(screen.getByText('Estado: Fazendo')).toBeTruthy();
    expect(screen.getByText('Prazo: Atrasadas')).toBeTruthy();
    expect(screen.getByTestId('filters-badge').textContent).toBe('2');

    fireEvent.click(screen.getByTestId('filter-chip-remove-status'));
    await waitFor(() => expect(window.location.search).not.toContain('status='));
    expect(window.location.search).toContain('due=overdue');
  });

  it('"Sem contato" recorta as tarefas sem contato (etapa 035)', async () => {
    window.history.replaceState(null, '', '/?contact=__none__');
    setSelectResult({
      data: [
        makeTaskRow({ id: 't1', title: 'Falar com a Ana', contact_id: 'c1', contact: { id: 'c1', name: 'Ana' } }),
        makeTaskRow({ id: 't2', title: 'Tarefa solta' }),
      ],
      error: null,
    });

    renderModulo();

    expect(await screen.findByText('Tarefa solta')).toBeTruthy();
    expect(screen.queryByText('Falar com a Ana')).toBeNull();
    expect(screen.getByText('Contato: Sem contato')).toBeTruthy();
  });
});

describe('TasksFilterBar — alvos de toque de 40 px (regra de tela do cartão)', () => {
  beforeEach(() => limparTela());

  it('busca, chip, "Limpar filtros", itens e "x" do combobox têm 40 px de área', () => {
    renderBarra({ q: 'liga', prio: 'urgent', contact: SEM_CONTATO }, { searchText: 'liga' });

    const limparBusca = screen.getByTestId('tasks-search-clear');
    expect(limparBusca.className).toContain('min-h-10');
    expect(limparBusca.className).toContain('min-w-10');

    const removerChip = screen.getByTestId('filter-chip-remove-prio');
    expect(removerChip.className).toContain('min-h-10');
    expect(removerChip.className).toContain('min-w-10');

    const limparFiltros = screen.getByRole('button', { name: 'Limpar filtros' });
    expect(limparFiltros.className).toContain('min-h-10');

    // Os itens extras e o "x" do combobox só existem com o popover aberto/valor.
    fireEvent.click(screen.getByTestId('tasks-contact-filter'));
    expect(screen.getByTestId('contact-combobox-extra-sem').className).toContain('min-h-10');
    expect(screen.getByTestId('contact-combobox-extra-todos').className).toContain('min-h-10');

    const limparContato = screen.getByTestId('contact-combobox-clear');
    expect(limparContato.className).toContain('min-h-10');
    expect(limparContato.className).toContain('min-w-10');
  });
});

/** Desmonta o que o caso anterior deixou montado (o módulo tem portais). */
function limparTela() {
  cleanup();
}
