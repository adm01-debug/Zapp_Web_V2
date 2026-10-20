import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BulkActionsBar } from '../BulkActionsBar';
import { ContactToolbar } from '../ContactToolbar';
import { canMergeContacts } from '../contactPermissions';
import { noop } from './contactDeleteFixtures';

// PROVA r2a5 -- testes que NAO existem na suite. Os dois casos abaixo
// correspondem exatamente as mutacoes M7 (BulkActionsBar) e ao fail-open de
// canMergeContacts(null) no primeiro render.
describe('r2a5 · canMergeContacts fail-open', () => {
  it('null (RPC is_admin_or_supervisor em andamento) NAO bloqueia', () => {
    expect(canMergeContacts(null)).toBe(true);
  });
});

function bulk(over: Record<string, unknown> = {}) {
  return { selectedIds: ['a', 'b'], onClearSelection: noop, onActionComplete: noop, ...over };
}

describe('r2a5 · BulkActionsBar gate do botao Excluir do lote', () => {
  it('desabilita o Excluir quando canDeleteSelection=false', () => {
    render(<BulkActionsBar {...(bulk({ canDeleteSelection: false }) as any)} />);
    expect(screen.getByRole('button', { name: /Excluir/i })).toBeDisabled();
  });
  it('NAO desabilita quando canDeleteSelection=true', () => {
    render(<BulkActionsBar {...(bulk({ canDeleteSelection: true }) as any)} />);
    expect(screen.getByRole('button', { name: /Excluir/i })).not.toBeDisabled();
  });
});

describe('r2a5 · ContactToolbar Mesclar no primeiro render', () => {
  it('mostra Mesclar com canMerge=canMergeContacts(null) (fail-open)', () => {
    render(<ContactToolbar {...({
      searchInput: '', onSearchChange: noop, sortBy: 'name_asc', setSortBy: noop,
      showFilters: false, setShowFilters: noop, activeFiltersCount: 0, clearFilters: noop,
      activeTab: 'all', filterCompany: '', setFilterCompany: noop, filterJobTitle: '',
      setFilterJobTitle: noop, filterTag: '', setFilterTag: noop, filterDateRange: '',
      setFilterDateRange: noop, uniqueCompanies: [], uniqueJobTitles: [], uniqueTags: [],
      onApplyPreset: noop, groupByCompany: false, setGroupByCompany: noop,
      selectedIds: ['a', 'b'], onBulkTag: noop, onCompare: noop, onMerge: noop,
      canMerge: canMergeContacts(null), viewMode: 'list', setViewMode: noop,
      gridColumns: 3, setGridColumns: noop, totalCount: 2,
      crmIntegrationEnabled: false, onOpenCRM: noop,
    }) as any} />);
    expect(screen.getByText('Mesclar')).toBeInTheDocument();
  });
});
