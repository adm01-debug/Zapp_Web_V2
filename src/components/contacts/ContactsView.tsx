import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion, MotionConfig } from 'framer-motion';
import { useExternalContact360Batch } from '@/hooks/crm/useExternalContact360Batch';
import { ScrollToTopButton } from '@/components/ui/scroll-to-top';
import { useLayoutScroll } from '@/contexts/LayoutScrollContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Sparkles, RefreshCw,
} from 'lucide-react';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import { BulkActionsBar } from '@/components/contacts/BulkActionsBar';
import { ContactStatsCards } from './ContactStatsCards';
import { ContactTypeTabs } from './ContactTypeTabs';
import { ContactMergeDialog } from './ContactMergeDialog';
import { ContactCompareDialog } from './ContactCompareDialog';
import { ContactBulkTagDialog } from './ContactBulkTagDialog';
import { ContactDialogs } from './ContactDialogs';
import { ContactToolbar } from './ContactToolbar';
import { ContactDetailPanel } from './ContactDetailPanel';
import { ContactContentArea } from './ContactContentArea';
import { ContactResultsSummary } from './ContactResultsSummary';
import { ContactCRMDialog } from './ContactCRMDialog';
import { useContactsViewState } from './useContactsViewState';

export function ContactsView() {
  const crmIntegrationEnabled = useCRMIntegrationEnabled();
  const {
    crud, viewMode, setViewMode, gridColumns, setGridColumns,
    isImportOpen, setIsImportOpen, isMergeOpen, setIsMergeOpen,
    isCompareOpen, setIsCompareOpen, groupByCompany, setGroupByCompany,
    isBulkTagOpen, setIsBulkTagOpen, detailContact, setDetailContact,
    handleApplyPreset, handleToggleSelect, handleSelectAll,
    handleContactClick,
  } = useContactsViewState();

  const {
    contacts: filteredContacts, totalCount, loading, hasMore,
    contactCountByType, uniqueCompanies, uniqueJobTitles, uniqueTags,
    searchInput, debouncedSearch: search, handleSearchChange, clearSearch,
    activeTab, setActiveTab, filterCompany, setFilterCompany,
    filterJobTitle, setFilterJobTitle, filterTag, setFilterTag,
    filterDateRange, setFilterDateRange, sortBy, setSortBy,
    activeFiltersCount, clearFilters, page, setPage, pageSize,
    loadMore, loadPrevious, refetch,
    profile, scrollContainerRef,
    isSubmitting, deleteTarget, setDeleteTarget,
    showSuccess, setShowSuccess,
    isAddDialogOpen, setIsAddDialogOpen,
    isEditDialogOpen, setIsEditDialogOpen,
    editingContact, showFilters, setShowFilters,
    isCRMSearchOpen, setIsCRMSearchOpen,
    selectedIds, setSelectedIds,
    newContact, openContactChat,
    handleAddContact, handleEditContact, handleDeleteContact,
    openEditDialog, handleCancelForm,
    handleNewContactChange, handleEditContactChange,
  } = crud;

  const crmContacts = useMemo(() => filteredContacts.map(c => ({ id: c.id, phone: c.phone })), [filteredContacts]);
  const { lookup } = useExternalContact360Batch(crmContacts);
  const getCRMData = (phone: string) => lookup(phone) ?? null;
  const layoutScrollRef = useLayoutScroll();
  const reduceMotion = useReducedMotion();
  const tapAnimation = reduceMotion ? undefined : { scale: 0.98 };
  const queryClient = useQueryClient();
  const handleSync = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['contacts-kpi'] });
    queryClient.invalidateQueries({ queryKey: ['contacts-type-counts'] });
  };

  return (
    <MotionConfig reducedMotion="user">
    <div className="relative bg-background w-full min-w-0">
      <ScrollToTopButton scrollRef={layoutScrollRef} />

      <div className="space-y-4">
      <PageHeader
        variant="plain"
        title="Contatos"
        subtitle={`Base de clientes e leads (${totalCount.toLocaleString('pt-BR')} contatos)`}
        breadcrumbs={[{ label: 'Início' }, { label: 'Gestão' }, { label: 'Contatos' }]}
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            {crmIntegrationEnabled && (
              <motion.div whileTap={tapAnimation}>
                <Button
                  onClick={() => setIsCRMSearchOpen(true)}
                  className="h-12 px-5 rounded-xl bg-primary/20 border border-primary/50 text-primary-glow hover:bg-primary/30 font-semibold text-base gap-2"
                >
                  <Sparkles className="w-[18px] h-[18px]" />CRM 360°
                </Button>
              </motion.div>
            )}
            <motion.div whileTap={tapAnimation}>
              <Button
                onClick={handleSync}
                disabled={loading}
                className="h-12 px-5 rounded-xl bg-card border border-border text-foreground hover:bg-muted font-semibold text-base gap-2"
              >
                <RefreshCw className={`w-[18px] h-[18px] ${loading ? 'animate-spin' : ''}`} />Sincronizar
              </Button>
            </motion.div>
            <ContactDialogs
              isAddDialogOpen={isAddDialogOpen} setIsAddDialogOpen={setIsAddDialogOpen}
              newContact={newContact} handleNewContactChange={handleNewContactChange}
              handleAddContact={handleAddContact} handleCancelForm={handleCancelForm}
              isSubmitting={isSubmitting}
              isEditDialogOpen={isEditDialogOpen} setIsEditDialogOpen={setIsEditDialogOpen}
              editingContact={editingContact} handleEditContactChange={handleEditContactChange}
              handleEditContact={handleEditContact}
              showSuccess={showSuccess} setShowSuccess={setShowSuccess}
              deleteTarget={deleteTarget} setDeleteTarget={setDeleteTarget}
              handleDeleteContact={handleDeleteContact}
              tapAnimation={tapAnimation}
            />
          </div>
        }
      />

      <ContactMergeDialog
        open={isMergeOpen} onOpenChange={setIsMergeOpen}
        contacts={filteredContacts.filter(c => selectedIds.includes(c.id))}
        onMergeComplete={() => { setSelectedIds([]); refetch(); }}
      />
      <ContactCompareDialog
        open={isCompareOpen} onOpenChange={setIsCompareOpen}
        contacts={filteredContacts.filter(c => selectedIds.includes(c.id))}
      />
      <ContactBulkTagDialog
        open={isBulkTagOpen} onOpenChange={setIsBulkTagOpen}
        contactIds={selectedIds} allTags={uniqueTags}
        onComplete={() => { setSelectedIds([]); refetch(); }}
      />

      <ContactStatsCards totalAll={contactCountByType['all'] ?? 0} leadsAll={contactCountByType['lead'] ?? 0} />

      <ContactTypeTabs activeTab={activeTab} setActiveTab={setActiveTab} contactCountByType={contactCountByType} />

      <ContactToolbar
        searchInput={searchInput} onSearchChange={handleSearchChange}
        sortBy={sortBy} setSortBy={setSortBy}
        showFilters={showFilters} setShowFilters={setShowFilters}
        activeFiltersCount={activeFiltersCount} clearFilters={clearFilters}
        activeTab={activeTab}
        filterCompany={filterCompany} setFilterCompany={setFilterCompany}
        filterJobTitle={filterJobTitle} setFilterJobTitle={setFilterJobTitle}
        filterTag={filterTag} setFilterTag={setFilterTag}
        filterDateRange={filterDateRange} setFilterDateRange={setFilterDateRange}
        uniqueCompanies={uniqueCompanies} uniqueJobTitles={uniqueJobTitles} uniqueTags={uniqueTags}
        onApplyPreset={handleApplyPreset}
        groupByCompany={groupByCompany} setGroupByCompany={setGroupByCompany}
        selectedIds={selectedIds}
        onBulkTag={() => setIsBulkTagOpen(true)}
        onCompare={() => setIsCompareOpen(true)}
        onMerge={() => setIsMergeOpen(true)}
        viewMode={viewMode} setViewMode={setViewMode}
        gridColumns={gridColumns} setGridColumns={setGridColumns}
        totalCount={totalCount}
      />
      </div>

      <div className="space-y-3 mt-3">
      {!loading && (
        <ContactResultsSummary
          totalCount={totalCount}
          filteredCount={filteredContacts.length}
          selectedCount={selectedIds.length}
          activeFiltersCount={activeFiltersCount}
          search={search}
          onSelectAll={handleSelectAll}
          allSelected={selectedIds.length === filteredContacts.length}
          page={page}
          pageSize={pageSize}
          loadMore={loadMore}
          loadPrevious={loadPrevious}
          hasMore={hasMore}
          loading={loading}
        />
      )}

      <ContactContentArea
        loading={loading}
        contacts={filteredContacts}
        viewMode={viewMode}
        gridColumns={gridColumns}
        groupByCompany={groupByCompany}
        selectedIds={selectedIds}
        search={search}
        activeFiltersCount={activeFiltersCount}
        onToggleSelect={handleToggleSelect}
        onContactClick={handleContactClick}
        onEdit={openEditDialog}
        onDelete={setDeleteTarget}
        onSelectIds={setSelectedIds}
        onAddContact={() => setIsAddDialogOpen(true)}
        onClearSearch={search ? clearSearch : undefined}
        onClearFilters={activeFiltersCount > 0 ? clearFilters : undefined}
        getCRMData={getCRMData}
      />
      </div>

      {detailContact && (
        <ContactDetailPanel
          contact={detailContact}
          onClose={() => setDetailContact(null)}
          onOpenChat={openContactChat}
          onEdit={openEditDialog}
        />
      )}

      {crmIntegrationEnabled && (
        <ContactCRMDialog
          open={isCRMSearchOpen}
          onOpenChange={setIsCRMSearchOpen}
          onContactSelected={openContactChat}
        />
      )}

      <BulkActionsBar
        selectedIds={selectedIds}
        onClearSelection={() => setSelectedIds([])}
        onActionComplete={() => { setSelectedIds([]); refetch(); }}
        availableTags={uniqueTags}
      />
    </div>
    </MotionConfig>
  );
}
