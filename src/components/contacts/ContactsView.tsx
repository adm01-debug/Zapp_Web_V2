import { useMemo } from 'react';
import { MotionConfig } from 'framer-motion';
import { useExternalContact360Batch } from '@/hooks/crm/useExternalContact360Batch';
import { useCRMAdminAccess } from '@/hooks/crm/useCRMAdminAccess';
import { ScrollToTopButton } from '@/components/ui/scroll-to-top';
import { useLayoutScroll } from '@/contexts/LayoutScrollContext';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import { useUserRole } from '@/hooks/system/useUserRole';
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
import { canChangeSelectedContactsType, canDeleteSelectedContacts, canMergeContacts } from './contactPermissions';
export function ContactsView() {
  const crmIntegrationEnabled = useCRMIntegrationEnabled();
  const {
    crud, viewMode, setViewMode, gridColumns, setGridColumns,
    isMergeOpen, setIsMergeOpen,
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
    showLegacy, setShowLegacy,
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
    invalidateContactAggregates,
  } = crud;

  const { isSupervisor } = useUserRole();
  const crmContacts = useMemo(() => filteredContacts.map(c => ({ id: c.id, phone: c.phone })), [filteredContacts]);
  const { lookup } = useExternalContact360Batch(crmContacts);
  const getCRMData = (phone: string) => lookup(phone) ?? null;
  const layoutScrollRef = useLayoutScroll();

  /**
   * `can_delete` chega do banco por contato (RPC `can_delete_contacts`). A seleção
   * sobrevive à troca de página/filtro, então um contato selecionado pode não estar
   * na lista carregada agora: nesse caso não há informação sobre ele e o botão NÃO
   * deve ser bloqueado -- mesma semântica do item avulso (`undefined` = segue
   * visível). Antes, o cálculo era feito sobre a página visível e desabilitava o
   * botão com a mensagem errada ("nenhum pode ser excluído") só por paginar.
   */
  const canDeleteSelection = useMemo(
    () => canDeleteSelectedContacts(selectedIds, filteredContacts),
    [filteredContacts, selectedIds],
  );

  /**
   * "Alterar tipo em massa" usa o mesmo predicado do banco que a exclusão
   * (`can_edit_contact`: admin/supervisor OU responsável pelo contato) — o
   * UPDATE de `contacts` é governado pela policy "Users can update their
   * assigned contacts". Mesma semântica da exclusão em lote: um conhecido com
   * permissão habilita; seleção sem informação não bloqueia.
   */
  const canChangeTypeSelection = useMemo(
    () => canChangeSelectedContactsType(selectedIds, filteredContacts),
    [filteredContacts, selectedIds],
  );

  /**
   * Mesclar não tem permissão por contato: a RPC `merge_contacts_atomic` recusa
   * com `42501` quem não é admin/supervisor (`is_admin_or_supervisor`), e o merge
   * faz DELETE físico dos secundários. O dado vem do mesmo predicado do servidor
   * (`useCRMAdminAccess`); `null` (consulta em andamento) não bloqueia — mesma
   * semântica da série de exclusão.
   */
  const adminAccess = useCRMAdminAccess();
  const canMerge = canMergeContacts(adminAccess);

  return (
    <MotionConfig reducedMotion="user">
    <div className="relative bg-background w-full min-w-0">
      <ScrollToTopButton
        scrollRef={layoutScrollRef}
        className="bottom-[calc(228px+env(safe-area-inset-bottom,0px))] md:bottom-[168px] md:right-8"
      />

      {/* Identificação semântica da página (o cabeçalho visual foi removido;
          o documento continua anunciando "Contatos" para leitores de tela). */}
      <h1 className="sr-only">Contatos</h1>

      {/* ContactDialogs vive fora de qualquer condição de lista vazia/carregamento:
          uma única instância preserva os quatro diálogos e o gatilho verde flutuante. */}
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

      <div className="space-y-4">
      {canMerge && (
        <ContactMergeDialog
          open={isMergeOpen} onOpenChange={setIsMergeOpen}
          contacts={filteredContacts.filter(c => selectedIds.includes(c.id))}
          onMergeComplete={() => { setSelectedIds([]); refetch(); invalidateContactAggregates(); }}
        />
      )}
      <ContactCompareDialog
        open={isCompareOpen} onOpenChange={setIsCompareOpen}
        contacts={filteredContacts.filter(c => selectedIds.includes(c.id))}
      />
      <ContactBulkTagDialog
        open={isBulkTagOpen} onOpenChange={setIsBulkTagOpen}
        contactIds={selectedIds} allTags={uniqueTags}
        onComplete={() => { setSelectedIds([]); refetch(); }}
      />

      <ContactStatsCards
        totalAll={contactCountByType['all'] ?? 0}
        fornecedoresAll={contactCountByType['fornecedor'] ?? 0}
        includeLegacy={showLegacy}
      />

      <ContactTypeTabs activeTab={activeTab} setActiveTab={setActiveTab} contactCountByType={contactCountByType} />

      <ContactToolbar
        searchInput={searchInput} onSearchChange={handleSearchChange}
        sortBy={sortBy} setSortBy={setSortBy}
        showLegacy={showLegacy} setShowLegacy={setShowLegacy}
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
        canMerge={canMerge}
        onMerge={() => setIsMergeOpen(true)}
        viewMode={viewMode} setViewMode={setViewMode}
        gridColumns={gridColumns} setGridColumns={setGridColumns}
        totalCount={totalCount}
        crmIntegrationEnabled={crmIntegrationEnabled}
        onOpenCRM={() => setIsCRMSearchOpen(true)}
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
        onOpenChat={openContactChat}
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
          onImported={invalidateContactAggregates}
        />
      )}

      <BulkActionsBar
        selectedIds={selectedIds}
        onClearSelection={() => setSelectedIds([])}
        onActionComplete={() => { setSelectedIds([]); refetch(); }}
        onCountersChanged={invalidateContactAggregates}
        availableTags={uniqueTags}
        canDeleteSelection={canDeleteSelection}
        canChangeType={isSupervisor}
        canChangeTypeSelection={canChangeTypeSelection}
      />
    </div>
    </MotionConfig>
  );
}
