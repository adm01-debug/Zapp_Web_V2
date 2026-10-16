import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FilesToolbar, type SenderFilterOption } from '../FilesToolbar';
import type { ColumnOption } from '@/hooks/chat/useFilesContainerColumns';

const OPCOES: ColumnOption[] = ([3, 4, 5, 6, 8] as const).map((n) => ({ n, fits: true }));

const REMETENTES: SenderFilterOption[] = [
  { key: 'self', label: 'Você', count: 3 },
  { key: 'contact', label: 'Ana Cliente', count: 2 },
  { key: 'agent:p-2', label: 'Ana Atendente', count: 1 },
  { key: 'team', label: 'Equipe', count: 1 },
];

function renderToolbar(overrides: Partial<React.ComponentProps<typeof FilesToolbar>> = {}) {
  const props: React.ComponentProps<typeof FilesToolbar> = {
    search: '',
    onSearchChange: vi.fn(),
    sort: 'recent',
    onSortChange: vi.fn(),
    period: 'all',
    onPeriodChange: vi.fn(),
    customFrom: null,
    customTo: null,
    onCustomFromChange: vi.fn(),
    onCustomToChange: vi.fn(),
    onClearCustom: vi.fn(),
    filteredCount: 2,
    totalCount: 2,
    senderOptions: [],
    selectedSenders: [],
    onToggleSender: vi.fn(),
    viewMode: 'grid',
    onViewModeChange: vi.fn(),
    columns: 4,
    columnOptions: OPCOES,
    onColumnsChange: vi.fn(),
    selectionMode: false,
    selectedCount: 0,
    onToggleSelectionMode: vi.fn(),
    ...overrides,
  };
  return { ...render(<FilesToolbar {...props} />), props };
}

/** R08: o painel do funil guarda o período e o remetente. Idempotente — depois de escolher um
 * atalho o painel do funil continua aberto (só o popover interno do seletor fecha). */
function abrirFunil() {
  if (!screen.queryByTestId('files-filter-panel')) {
    fireEvent.click(screen.getByTestId('files-filter-trigger'));
  }
  return screen.getByTestId('files-filter-panel');
}

/** Gatilho do filtro por data (o seletor e o mesmo da aba IA, agora dentro do funil). */
function gatilhoPeriodo() {
  abrirFunil();
  // O X de limpar tambem e `role="button"` dentro do wrapper; o gatilho e o primeiro na DOM.
  return within(screen.getByTestId('files-period-filter')).getAllByRole('button')[0];
}

function abrirPeriodo() {
  fireEvent.click(gatilhoPeriodo());
  return screen.getByTestId('files-period-filter');
}

describe('FilesToolbar (etapa 11)', () => {
  it('expõe busca, ordenação, o funil, Selecionar e Layout na ordem do plano', () => {
    renderToolbar();
    const barra = screen.getByTestId('files-toolbar');
    expect(barra).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar arquivos')).toBeInTheDocument();
    expect(screen.getByLabelText('Ordenar arquivos')).toBeInTheDocument();
    expect(screen.getByTestId('files-filter-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('files-select-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('files-layout-trigger')).toBeInTheDocument();
  });

  it('quebra em segunda linha em vez de rolar (flex-wrap) e a busca tem mínimo de 220px', () => {
    renderToolbar();
    expect(screen.getByTestId('files-toolbar').className).toContain('flex-wrap');
    const campo = screen.getByLabelText('Buscar arquivos');
    expect(campo.parentElement?.className).toContain('min-w-[220px]');
    // R08: o seletor de data (F04) saiu da barra e passou a morar no painel do funil, que tem
    // largura fixa — a barra nao estoura mais por causa dele (antes eram 180px de minimo + flex-1).
    const painel = abrirFunil();
    expect(painel.className).toContain('w-72');
    expect(screen.getByTestId('files-period-filter')).toBeInTheDocument();
  });

  it('digitar na busca avisa o hook', () => {
    const onSearchChange = vi.fn();
    renderToolbar({ onSearchChange });
    fireEvent.change(screen.getByLabelText('Buscar arquivos'), { target: { value: 'contrato' } });
    expect(onSearchChange).toHaveBeenCalledWith('contrato');
  });

  it('oferece os quatro modos de ordenação, incluindo Nome (A–Z)', () => {
    renderToolbar();
    fireEvent.click(screen.getByLabelText('Ordenar arquivos'));
    expect(screen.getByRole('option', { name: 'Mais recentes' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Mais antigos' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Maiores' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Nome (A–Z)' })).toBeInTheDocument();
  });

  it('Selecionar alterna para Cancelar com aria-pressed e mostra o contador', () => {
    const onToggleSelectionMode = vi.fn();
    const { rerender, props } = renderToolbar({ onToggleSelectionMode });
    const botao = screen.getByTestId('files-select-toggle');
    expect(botao).toHaveTextContent('Selecionar');
    expect(botao).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(botao);
    expect(onToggleSelectionMode).toHaveBeenCalled();

    rerender(<FilesToolbar {...props} selectionMode selectedCount={3} />);
    const ativo = screen.getByTestId('files-select-toggle');
    expect(ativo).toHaveTextContent('Cancelar');
    expect(ativo).toHaveAttribute('aria-pressed', 'true');
    expect(ativo).toHaveTextContent('3');
  });
});

describe('FilesToolbar — filtro por data (F04)', () => {
  it('traz o seletor de período dentro do funil e NÃO oferece "Última interação"', () => {
    renderToolbar();
    // Antes de abrir o funil o seletor nao esta na barra: ele mora no painel.
    expect(screen.queryByTestId('files-period-filter')).not.toBeInTheDocument();

    abrirPeriodo();
    expect(screen.getByText('Atalhos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hoje' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Últimos 3 dias' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Últimos 90 dias' })).toBeInTheDocument();
    // Só a aba IA tem histórico de mensagens para a "Última interação".
    expect(screen.queryByRole('button', { name: 'Última interação' })).not.toBeInTheDocument();
  });

  it('sem período ativo o gatilho anuncia "Qualquer data" e não mostra o X', () => {
    renderToolbar();
    const gatilho = gatilhoPeriodo();
    expect(gatilho).toHaveTextContent('Qualquer data');
    expect(screen.queryByLabelText('Remover filtro de data')).not.toBeInTheDocument();
  });

  it('escolher um atalho avisa o hook e zera SÓ as datas personalizadas', () => {
    const onPeriodChange = vi.fn();
    const onClearCustom = vi.fn();
    renderToolbar({ onPeriodChange, onClearCustom, period: 'custom', customFrom: new Date(2026, 2, 5) });

    abrirPeriodo();
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(onPeriodChange).toHaveBeenCalledWith('today');
    // O seletor chama `onClearCustom` junto com a troca de atalho: se esse callback limpasse o
    // período (em vez de só as datas), o atalho recém-escolhido seria desfeito na mesma hora.
    expect(onClearCustom).toHaveBeenCalled();
  });

  it('com período ativo mostra o rótulo e um X que limpa o filtro', () => {
    const onPeriodChange = vi.fn();
    const onClearCustom = vi.fn();
    renderToolbar({ period: '7d', onPeriodChange, onClearCustom });

    expect(gatilhoPeriodo()).toHaveTextContent('Últimos 7 dias');

    fireEvent.click(screen.getByLabelText('Remover filtro de data'));
    expect(onPeriodChange).toHaveBeenCalledWith('all');
    expect(onClearCustom).toHaveBeenCalled();
  });

  it('período personalizado mostra o intervalo De — Até no gatilho', () => {
    renderToolbar({ period: 'custom', customFrom: new Date(2026, 2, 5), customTo: new Date(2026, 2, 7) });
    expect(gatilhoPeriodo()).toHaveTextContent('05/03/26 — 07/03/26');
  });
});

/**
 * R08 (S55/S56) — funil: o painel junta o período (F04, que mudou de lugar) e o remetente
 * (seleção múltipla com contagem). Nenhum marcado = todos; a ordem padrão segue "Mais recentes".
 */
describe('FilesToolbar — funil: período e remetente (R08)', () => {
  it('abre um painel com as duas seções, cada uma com o seu controle', () => {
    renderToolbar({ senderOptions: REMETENTES });

    expect(screen.queryByTestId('files-filter-panel')).not.toBeInTheDocument();
    const painel = abrirFunil();

    expect(within(painel).getByText('Período')).toBeInTheDocument();
    expect(within(painel).getByText('Remetente')).toBeInTheDocument();
    // O período é o MESMO seletor do F04 (com o mesmo estado vindo do hook).
    expect(within(painel).getByTestId('files-period-filter')).toBeInTheDocument();
    expect(within(painel).getByTestId('files-sender-options')).toBeInTheDocument();
  });

  it('lista Você, o contato, os atendentes e Equipe com a contagem, todos desmarcados', () => {
    renderToolbar({ senderOptions: REMETENTES });
    const painel = abrirFunil();

    expect(within(painel).getByText('Nenhum marcado = todos')).toBeInTheDocument();
    for (const opcao of REMETENTES) {
      const linha = within(painel).getByTestId(`files-sender-${opcao.key}`);
      expect(within(linha).getByRole('checkbox', { name: opcao.label })).not.toBeChecked();
      expect(within(linha).getByText(opcao.label)).toBeInTheDocument();
      expect(linha).toHaveTextContent(String(opcao.count));
    }
  });

  it('marcar um remetente avisa o hook com a chave e o gatilho conta os filtros ativos', () => {
    const onToggleSender = vi.fn();
    renderToolbar({ senderOptions: REMETENTES, selectedSenders: ['self'], period: '7d', onToggleSender });

    // Período ativo (1) + remetente marcado (1) = 2 recortes ligados.
    expect(screen.getByTestId('files-filter-trigger').textContent).toBe('Filtros2');

    abrirFunil();
    expect(within(screen.getByTestId('files-sender-self')).getByRole('checkbox', { name: 'Você' })).toBeChecked();
    fireEvent.click(within(screen.getByTestId('files-sender-team')).getByRole('checkbox', { name: 'Equipe' }));
    expect(onToggleSender).toHaveBeenCalledWith('team');
  });

  it('sem remetente marcado nem período o gatilho não mostra contador (todos)', () => {
    renderToolbar({ senderOptions: REMETENTES });
    expect(screen.getByTestId('files-filter-trigger').textContent).toBe('Filtros');
  });

  it('sem remetentes no recorte avisa no lugar da lista', () => {
    renderToolbar({ senderOptions: [] });
    const painel = abrirFunil();
    expect(within(painel).getByTestId('files-sender-empty')).toBeInTheDocument();
    expect(within(painel).queryByTestId('files-sender-options')).not.toBeInTheDocument();
  });

  it('a ordem padrão continua "Mais recentes", com ou sem o funil aberto', () => {
    renderToolbar();
    expect(screen.getByLabelText('Ordenar arquivos')).toHaveTextContent('Mais recentes');
    abrirFunil();
    expect(screen.getByLabelText('Ordenar arquivos')).toHaveTextContent('Mais recentes');
  });
});
