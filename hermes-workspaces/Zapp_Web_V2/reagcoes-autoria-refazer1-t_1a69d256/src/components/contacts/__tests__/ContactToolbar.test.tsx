import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { openMenu } from './contactDeleteFixtures';

vi.mock('../ContactSearchWithSuggestions', () => ({ ContactSearchWithSuggestions: () => null }));
vi.mock('../ContactAdvancedFilters', () => ({ ContactAdvancedFilters: () => <div>painel-filtros</div> }));
vi.mock('../FilterPresets', () => ({ FilterPresets: () => null }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <ul aria-label="Ordenação">{children}</ul>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <li data-value={value}>{children}</li>,
}));

import { ContactToolbar } from '../ContactToolbar';
import { ContactViewSwitcher, type ContactViewMode } from '../ContactViewSwitcher';

function toolbarProps(overrides: Partial<React.ComponentProps<typeof ContactToolbar>> = {}) {
  const noop = () => {};
  return {
    searchInput: '', onSearchChange: noop, sortBy: 'name_asc', setSortBy: noop,
    showLegacy: false, setShowLegacy: vi.fn(), showFilters: false, setShowFilters: vi.fn(),
    activeFiltersCount: 0, clearFilters: noop, activeTab: 'all',
    filterCompany: '', setFilterCompany: noop, filterJobTitle: '', setFilterJobTitle: noop,
    filterTag: '', setFilterTag: noop, filterDateRange: '', setFilterDateRange: noop,
    uniqueCompanies: [], uniqueJobTitles: [], uniqueTags: [], onApplyPreset: noop,
    groupByCompany: false, setGroupByCompany: noop, selectedIds: [] as string[],
    onBulkTag: noop, onCompare: vi.fn(), onMerge: noop, canMerge: true,
    viewMode: 'grid' as ContactViewMode, setViewMode: noop, gridColumns: 4, setGridColumns: noop,
    totalCount: 0, crmIntegrationEnabled: false, onOpenCRM: noop,
    ...overrides,
  };
}

describe('ContactToolbar (etapa 82)', () => {
  it('oferece os 5 critérios de ordenação', () => {
    render(<ContactToolbar {...toolbarProps()} />);
    const values = Array.from(document.querySelectorAll('li[data-value]')).map(li => li.getAttribute('data-value'));
    expect(values).toEqual(['name_asc', 'name_desc', 'created_desc', 'created_asc', 'updated_desc']);
  });

  it('Comparar só aparece com 2 ou mais selecionados', () => {
    const { rerender } = render(<ContactToolbar {...toolbarProps({ selectedIds: ['a'] })} />);
    expect(screen.getByRole('button', { name: /Tags \(1\)/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Comparar/ })).not.toBeInTheDocument();

    const props = toolbarProps({ selectedIds: ['a', 'b'] });
    rerender(<ContactToolbar {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Comparar/ }));
    expect(props.onCompare).toHaveBeenCalled();
  });

  it('Filtros alterna o painel e expõe aria-expanded', () => {
    const props = toolbarProps({ showFilters: true });
    render(<ContactToolbar {...props} />);
    const button = screen.getByRole('button', { name: /Filtros/ });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Painel de filtros avançados' })).toBeInTheDocument();
    fireEvent.click(button);
    expect(props.setShowFilters).toHaveBeenCalledWith(false);
  });

  it('"Mostrar legados" é um switch rotulado', () => {
    const props = toolbarProps();
    render(<ContactToolbar {...props} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar legados' }));
    expect(props.setShowLegacy).toHaveBeenCalledWith(true);
  });
});

describe('ContactViewSwitcher (etapa 82)', () => {
  function renderSwitcher(viewMode: ContactViewMode = 'grid') {
    const props = {
      viewMode, onViewModeChange: vi.fn(), gridColumns: 4, onGridColumnsChange: vi.fn(),
      groupByCompany: false, onGroupByCompanyChange: vi.fn(),
    };
    render(<ContactViewSwitcher {...props} />);
    return props;
  }

  it('alterna entre as 6 vistas (3 diretas + 3 no menu "Mais")', () => {
    const props = renderSwitcher();
    for (const label of ['Cards', 'Lista', 'Tabela']) fireEvent.click(screen.getByTitle(label));

    for (const label of ['Pipeline', 'Mapa', 'Analytics']) {
      openMenu(screen.getByTitle('Mais visualizações'));
      fireEvent.click(screen.getByRole('menuitem', { name: label }));
    }
    expect(props.onViewModeChange.mock.calls.map(c => c[0])).toEqual(['grid', 'list', 'table', 'kanban', 'map', 'analytics']);
  });

  it('na vista Cards oferece colunas de 3 a 6 e agrupar por empresa', () => {
    const props = renderSwitcher('grid');
    openMenu(screen.getByRole('button', { name: /Colunas/ }));
    const options = screen.getAllByRole('menuitem').map(i => i.textContent?.trim());
    expect(options).toEqual(['3 colunas', '4 colunas', '5 colunas', '6 colunas', 'Por empresa']);

    fireEvent.click(screen.getByRole('menuitem', { name: '3 colunas' }));
    expect(props.onGridColumnsChange).toHaveBeenCalledWith(3);
  });

  it('fora da vista Cards o menu só oferece o agrupamento', () => {
    const props = renderSwitcher('table');
    openMenu(screen.getByRole('button', { name: /Colunas/ }));
    expect(screen.getAllByRole('menuitem').map(i => i.textContent?.trim())).toEqual(['Por empresa']);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Por empresa' }));
    expect(props.onGroupByCompanyChange).toHaveBeenCalledWith(true);
  });
});
