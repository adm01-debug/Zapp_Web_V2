import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useExternalContact360Batch } from '@/hooks/crm/useExternalContact360Batch';
import { ScrollToTopButton } from '@/components/ui/scroll-to-top';
import { useLayoutScroll } from '@/contexts/LayoutScrollContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Upload, Users, Sparkles, FileSpreadsheet, RefreshCw,
} from 'lucide-react';
import { CONTACT_TYPES } from '@/utils/whatsappFileTypes';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { BulkActionsBar } from '@/components/contacts/BulkActionsBar';
import { CONTACT_TYPE_ICONS } from './ContactsTable';
import { ContactStatsCards } from './ContactStatsCards';
import { ContactImportDialog } from './ContactImportDialog';
import { ContactMergeDialog } from './ContactMergeDialog';
import { ContactCompareDialog } from './ContactCompareDialog';
import { ContactBulkTagDialog } from './ContactBulkTagDialog';
import { ContactBirthdayPanel } from './ContactBirthdayPanel';
import { ContactDialogs } from './ContactDialogs';
import { ContactToolbar } from './ContactToolbar';
import { ContactPagination } from './ContactPagination';
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
    handleContactClick, handleExportCSV,
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
  const { lookup: getCRMData } = useExternalContact360Batch(contactPhones);
  const layoutScrollRef = useLayoutScroll();

  return (
    <div className="space-y-5 relative bg-background w-full min-w-0">
      <ScrollToTopButton scrollRef={layoutScrollRef} />
      <AuroraBorealis />
      <FloatingParticles />

      <PageHeader
        title="Contatos"
        subtitle={`Base de clientes e leads (${totalCount} contatos)`}
        breadcrumbs={[{ label: 'Gestão' }, { label: 'Contatos' }]}
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
            <Button variant="outline" onClick={() => setIsImportOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />Importar
            </Button>
            <Button variant="outline" onClick={handleExportCSV} disabled={filteredContacts.length === 0}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />Exportar
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

      <ContactImportDialog open={isImportOpen} onOpenChange={setIsImportOpen} onImportComplete={refetch} />
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

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <div className="col-span-full lg:col-span-3">
          <ContactStatsCards totalCount={totalCount} contactCountByType={contactCountByType} uniqueCompanies={uniqueCompanies} contacts={filteredContacts} />
        </div>
        <div className="col-span-full xl:col-span-1">
          <ContactBirthdayPanel
            contacts={filteredContacts.map(c => ({ id: c.id, name: c.name, avatar_url: c.avatar_url, birthday: undefined }))}
            onContactClick={openContactChat}
          />
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-muted/50 p-1 h-auto flex-wrap">
            <TabsTrigger value="all" className="data-[state=active]:bg-background flex items-center gap-2">
              <Users className="w-4 h-4" />Todos
              <Badge variant="secondary" className="ml-1 text-xs">{contactCountByType['all'] || 0}</Badge>
            </TabsTrigger>
            {CONTACT_TYPES.map((type) => (
              <TabsTrigger key={type.value} value={type.value} className="data-[state=active]:bg-background flex items-center gap-2">
                {CONTACT_TYPE_ICONS[type.value]}
                {type.label}
                {contactCountByType[type.value] > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">{contactCountByType[type.value]}</Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </motion.div>

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
        onImport={() => setIsImportOpen(true)}
        getCRMData={getCRMData}
      />

      <ContactPagination
        totalCount={totalCount} pageSize={pageSize} page={page}
        setPage={setPage} loadMore={loadMore} loadPrevious={loadPrevious}
        hasMore={hasMore} loading={loading}
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
