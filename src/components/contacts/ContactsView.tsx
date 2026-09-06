import { useMemo } from 'react';
import { useExternalContact360Batch } from '@/hooks/crm/useExternalContact360Batch';
import { ScrollToTopButton } from '@/components/ui/scroll-to-top';
import { useLayoutScroll } from '@/contexts/LayoutScrollContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users, Sparkles, RefreshCw,
} from 'lucide-react';
import { CONTACT_TYPES } from '@/utils/whatsappFileTypes';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { BulkActionsBar } from '@/components/contacts/BulkActionsBar';
import { CONTACT_TYPE_ICONS } from './ContactsTable';
import { ContactStatsCards } from './ContactStatsCards';
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

  const contactPhones = useMemo(() => filteredContacts.map(c => c.phone), [filteredContacts]);
  const { lookup } = useExternalContact360Batch(contactPhones);
  const getCRMData = (phone: string) => lookup(phone) ?? null;
  const layoutScrollRef = useLayoutScroll();

  return (
    <div className="space-y-4 relative bg-background w-full min-w-0">
      <ScrollToTopButton scrollRef={layoutScrollRef} />

      <PageHeader
        title="Contatos"
        subtitle={`Base de clientes e leads (${totalCount} contatos)`}
        breadcrumbs={[{ label: 'Início' }, { label: 'Gestão' }, { label: 'Contatos' }]}
        actions={
          <div className="flex items-center gap-2">
            {isExternalConfigured && (
              <Button variant="outline" onClick={() => setIsCRMSearchOpen(true)} className="border-primary/30 text-primary hover:bg-primary/10">
                <Sparkles className="w-4 h-4 mr-2" />CRM 360°
              </Button>
            )}
            <Button variant="outline" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Sincronizar
            </Button>
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

      <ContactStatsCards totalCount={totalCount} contactCountByType={contactCountByType} uniqueCompanies={uniqueCompanies} contacts={filteredContacts} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="h-9 bg-muted/40 border border-border/30 p-0.5 gap-0.5 flex-wrap">
          <TabsTrigger
            value="all"
            className="h-8 px-3 text-xs font-medium rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5" />
            Todos
            <Badge variant="secondary" className="ml-0.5 text-[10px] h-4 px-1 min-w-[18px] justify-center">
              {contactCountByType['all'] || 0}
            </Badge>
          </TabsTrigger>
          {CONTACT_TYPES.map((type) => (
            <TabsTrigger
              key={type.value}
              value={type.value}
              className="h-8 px-3 text-xs font-medium rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex items-center gap-1.5"
            >
              {CONTACT_TYPE_ICONS[type.value]}
              {type.label}
              {contactCountByType[type.value] > 0 && (
                <Badge variant="secondary" className="ml-0.5 text-[10px] h-4 px-1 min-w-[18px] justify-center">
                  {contactCountByType[type.value]}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

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

      {detailContact && (
        <ContactDetailPanel
          contact={detailContact}
          onClose={() => setDetailContact(null)}
          onOpenChat={openContactChat}
          onEdit={openEditDialog}
        />
      )}

      {isExternalConfigured && (
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
  );
}
