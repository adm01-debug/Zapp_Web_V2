import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FilesToolbar } from '../FilesToolbar';
import type { ColumnOption } from '@/hooks/chat/useFilesContainerColumns';

const OPCOES: ColumnOption[] = ([3, 4, 5, 6, 8] as const).map((n) => ({ n, fits: true }));

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

/** Gatilho do filtro por data dentro da barra (o seletor e o mesmo da aba IA). */
function gatilhoPeriodo() {
  // O X de limpar tambem e `role="button"` dentro do wrapper; o gatilho e o primeiro na DOM.
  return within(screen.getByTestId('files-period-filter')).getAllByRole('button')[0];
}

function abrirPeriodo() {
  fireEvent.click(gatilhoPeriodo());
  return screen.getByTestId('files-period-filter');
}

describe('FilesToolbar (etapa 11)', () => {
  it('expõe busca, ordenação, Selecionar e Layout na ordem do plano', () => {
    renderToolbar();
    const barra = screen.getByTestId('files-toolbar');
    expect(barra).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar arquivos')).toBeInTheDocument();
    expect(screen.getByLabelText('Ordenar arquivos')).toBeInTheDocument();
    expect(screen.getByTestId('files-select-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('files-layout-trigger')).toBeInTheDocument();
  });

  it('quebra em segunda linha em vez de rolar (flex-wrap) e a busca tem mínimo de 220px', () => {
    renderToolbar();
    expect(screen.getByTestId('files-toolbar').className).toContain('flex-wrap');
    const campo = screen.getByLabelText('Buscar arquivos');
    expect(campo.parentElement?.className).toContain('min-w-[220px]');
    // F04: o seletor de data também não estoura a barra — largura mínima bem abaixo dos 390px do
    // celular e `flex-1` para o rótulo longo ("05/03/26 — 07/03/26") caber quando há espaço.
    const periodo = screen.getByTestId('files-period-filter').className;
    expect(periodo).toContain('min-w-[180px]');
    expect(periodo).toContain('flex-1');
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
  it('traz o seletor de período ao lado da ordenação e NÃO oferece "Última interação"', () => {
    renderToolbar();
    expect(screen.getByTestId('files-period-filter')).toBeInTheDocument();

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
