import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// --- estado de permissao controlavel ---------------------------------------
let adminAccess: boolean | null = null;
vi.mock('@/hooks/crm/useCRMAdminAccess', () => ({
  useCRMAdminAccess: () => adminAccess,
}));
vi.mock('@/hooks/crm/useExternalContact360Batch', () => ({
  useExternalContact360Batch: () => ({ lookup: () => null }),
}));
vi.mock('@/contexts/LayoutScrollContext', () => ({
  useLayoutScroll: () => ({ current: null }),
}));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({
  useCRMIntegrationEnabled: () => false,
}));
vi.mock('../useContactsViewState', () => ({
  useContactsViewState: () => ({
    crud: {
      contacts: [], totalCount: 0, loading: false, hasMore: false,
      contactCountByType: {}, uniqueCompanies: [], uniqueJobTitles: [], uniqueTags: [],
      searchInput: '', debouncedSearch: '', handleSearchChange: () => {}, clearSearch: () => {},
      activeTab: 'all', setActiveTab: () => {}, filterCompany: '', setFilterCompany: () => {},
      filterJobTitle: '', setFilterJobTitle: () => {}, filterTag: '', setFilterTag: () => {},
      filterDateRange: '', setFilterDateRange: () => {}, sortBy: 'name_asc', setSortBy: () => {},
      activeFiltersCount: 0, clearFilters: () => {}, page: 1, setPage: () => {}, pageSize: 20,
      loadMore: () => {}, loadPrevious: () => {}, refetch: () => {},
      profile: null, scrollContainerRef: { current: null },
      isSubmitting: false, deleteTarget: null, setDeleteTarget: () => {},
      showSuccess: false, setShowSuccess: () => {},
      isAddDialogOpen: false, setIsAddDialogOpen: () => {},
      isEditDialogOpen: false, setIsEditDialogOpen: () => {},
      editingContact: null, showFilters: false, setShowFilters: () => {},
      isCRMSearchOpen: false, setIsCRMSearchOpen: () => {},
      selectedIds: ['a', 'b'], setSelectedIds: () => {},
      newContact: {}, openContactChat: () => {},
      handleAddContact: () => {}, handleEditContact: () => {}, handleDeleteContact: () => {},
      openEditDialog: () => {}, handleCancelForm: () => {},
      handleNewContactChange: () => {}, handleEditContactChange: () => {},
      invalidateContactAggregates: () => {},
    },
    viewMode: 'grid', setViewMode: () => {}, gridColumns: 4, setGridColumns: () => {},
    isMergeOpen: true, setIsMergeOpen: () => {},
    isCompareOpen: false, setIsCompareOpen: () => {}, groupByCompany: false, setGroupByCompany: () => {},
    isBulkTagOpen: false, setIsBulkTagOpen: () => {}, detailContact: null, setDetailContact: () => {},
    handleApplyPreset: () => {}, handleToggleSelect: () => {}, handleSelectAll: () => {},
    handleContactClick: () => {},
  }),
}));
// --- filhos pesados: stubs com marcas ---------------------------------------
vi.mock('../ContactMergeDialog', () => ({
  ContactMergeDialog: () => <div data-testid="merge-dialog" />,
}));
vi.mock('@/components/ui/scroll-to-top', () => ({ ScrollToTopButton: () => null }));
vi.mock('../ContactDialogs', () => ({ ContactDialogs: () => null }));
vi.mock('../ContactStatsCards', () => ({ ContactStatsCards: () => null }));
vi.mock('../ContactTypeTabs', () => ({ ContactTypeTabs: () => null }));
vi.mock('../ContactToolbar', () => ({ ContactToolbar: () => null }));
vi.mock('../ContactCompareDialog', () => ({ ContactCompareDialog: () => null }));
vi.mock('../ContactBulkTagDialog', () => ({ ContactBulkTagDialog: () => null }));
vi.mock('../ContactContentArea', () => ({ ContactContentArea: () => null }));
vi.mock('../ContactResultsSummary', () => ({ ContactResultsSummary: () => null }));
vi.mock('../ContactDetailPanel', () => ({ ContactDetailPanel: () => null }));
vi.mock('../ContactCRMDialog', () => ({ ContactCRMDialog: () => null }));
vi.mock('@/components/contacts/BulkActionsBar', () => ({ BulkActionsBar: () => null }));

import { ContactsView } from '../ContactsView';

describe('r2a5 · ContactsView · gate de montagem do ContactMergeDialog', () => {
  beforeEach(() => { adminAccess = null; });
  it('monta o dialogo quando adminAccess ainda e null (fail-open, primeiro render)', () => {
    adminAccess = null;
    render(<ContactsView />);
    expect(screen.getByTestId('merge-dialog')).toBeInTheDocument();
  });
  it('NAO monta o dialogo quando is_admin_or_supervisor responde false', () => {
    adminAccess = false;
    render(<ContactsView />);
    expect(screen.queryByTestId('merge-dialog')).not.toBeInTheDocument();
  });
});
