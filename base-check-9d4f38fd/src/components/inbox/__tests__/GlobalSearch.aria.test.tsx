/**
 * N-038 — busca global: botões de ícone (X) e o seletor de período têm nome
 * acessível para leitores de tela (aria-label).
 *
 * Vermelho antes: getByRole('button', { name: ... }) lança
 * TestingLibraryElementNotFound porque os botões <X> e o SelectTrigger não
 * tinham aria-label (um botão só com ícone não expõe nome acessível).
 *
 * Verde depois: cada botão de ícone e o seletor de período expõem um nome
 * acessível que o leitor de tela anuncia.
 *
 * Para chegar aos botões de tag e de histórico, o hook de dados é substituído
 * por um estado controlado — o aria-label vive no JSX de GlobalSearch, que é o
 * que este cartão corrige.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlobalSearch } from '@/components/inbox/GlobalSearch';
import { GlobalSearchFilters } from '@/components/inbox/search/GlobalSearchFilters';

const state = vi.hoisted(() => ({
  search: '',
  showFilters: false,
  selectedTags: [] as string[],
  allTags: [] as { id: string; name: string; color: string }[],
  history: [] as { query: string; timestamp: number; resultCount: number }[],
}));

vi.mock('@/components/inbox/useGlobalSearchData', () => ({
  useGlobalSearchData: () => ({
    search: state.search,
    setSearch: vi.fn(),
    isLoading: false,
    results: [],
    setResults: vi.fn(),
    selectedIndex: 0,
    setSelectedIndex: vi.fn(),
    allTags: state.allTags,
    tagSuggestions: [],
    selectedTags: state.selectedTags,
    activeTypes: new Set(['message', 'transcription', 'contact', 'action', 'crm']),
    dateFilter: 'all',
    setDateFilter: vi.fn(),
    mediaTypeFilter: 'all',
    setMediaTypeFilter: vi.fn(),
    showFilters: state.showFilters,
    setShowFilters: vi.fn(),
    history: state.history,
    removeFromHistory: vi.fn(),
    clearHistory: vi.fn(),
    toggleType: vi.fn(),
    handleSearch: vi.fn(),
    handleTagSelect: vi.fn(),
    removeTag: vi.fn(),
    performSearch: vi.fn(),
    resetFilters: vi.fn(),
  }),
}));

vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({
  useCRMIntegrationEnabled: () => false,
}));

function renderSearch() {
  return render(<GlobalSearch open onOpenChange={vi.fn()} onSelectResult={vi.fn()} />);
}

describe('N-038 — aria-label nos botões da busca global', () => {
  beforeEach(() => {
    state.search = '';
    state.showFilters = false;
    state.selectedTags = [];
    state.allTags = [];
    state.history = [];
  });

  it('botão limpar busca tem nome acessível', () => {
    state.search = 'teste';
    renderSearch();
    expect(screen.getByRole('button', { name: 'Limpar busca' })).toBeInTheDocument();
  });

  it('botão de alternar filtros tem nome acessível', () => {
    renderSearch();
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeInTheDocument();
  });

  it('botão remover tag expõe o nome da tag no nome acessível', () => {
    state.selectedTags = ['vip'];
    state.allTags = [{ id: 'vip', name: 'VIP', color: '#6366f1' }];
    renderSearch();
    expect(screen.getByRole('button', { name: 'Remover tag VIP' })).toBeInTheDocument();
  });

  it('botão remover do histórico tem nome acessível', () => {
    state.search = '';
    state.history = [{ query: 'teste', timestamp: 1, resultCount: 2 }];
    renderSearch();
    expect(screen.getByRole('button', { name: 'Remover do histórico' })).toBeInTheDocument();
  });
});

describe('N-038 — aria-label no seletor de período (GlobalSearchFilters)', () => {
  it('o seletor de período tem nome acessível', () => {
    render(
      <GlobalSearchFilters
        show
        activeTypes={new Set()}
        dateFilter="all"
        mediaTypeFilter="all"
        activeFiltersCount={0}
        onToggleType={vi.fn()}
        onSetDateFilter={vi.fn()}
        onSetMediaTypeFilter={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Período' })).toBeInTheDocument();
  });
});
