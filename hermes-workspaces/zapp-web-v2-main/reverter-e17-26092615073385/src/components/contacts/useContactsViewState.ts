import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useContactsCRUD } from './useContactsCRUD';
import type { ContactViewMode } from './ContactViewSwitcher';
import type { FilterPreset } from './FilterPresets';

export function useContactsViewState() {
  const crud = useContactsCRUD();
  const {
    contacts: filteredContacts, searchInput, clearSearch,
    setActiveTab, setFilterCompany, setFilterJobTitle, setFilterTag,
    setFilterDateRange, selectedIds, setSelectedIds, setIsAddDialogOpen,
  } = crud;

  const [viewMode, setViewMode] = useState<ContactViewMode>('grid');
  const [gridColumns, setGridColumns] = useState(4);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [groupByCompany, setGroupByCompany] = useState(false);
  const [isBulkTagOpen, setIsBulkTagOpen] = useState(false);
  const [detailContact, setDetailContact] = useState<typeof filteredContacts[0] | null>(null);

  const handleApplyPreset = useCallback((preset: FilterPreset) => {
    if (preset.filters.type) setActiveTab(preset.filters.type);
    if (preset.filters.company) setFilterCompany(preset.filters.company);
    if (preset.filters.jobTitle) setFilterJobTitle(preset.filters.jobTitle);
    if (preset.filters.tag) setFilterTag(preset.filters.tag);
    if (preset.filters.dateRange) setFilterDateRange(preset.filters.dateRange);
    toast.success(`Filtro "${preset.name}" aplicado`);
  }, [setActiveTab, setFilterCompany, setFilterJobTitle, setFilterTag, setFilterDateRange]);

  const handleToggleSelect = useCallback((id: string, selected: boolean) => {
    setSelectedIds(prev => selected ? [...prev, id] : prev.filter(i => i !== id));
  }, [setSelectedIds]);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(prev =>
      prev.length === filteredContacts.length ? [] : filteredContacts.map(c => c.id)
    );
  }, [filteredContacts, setSelectedIds]);

  const handleContactClick = useCallback((id: string) => {
    const contact = filteredContacts.find(c => c.id === id);
    if (contact) setDetailContact(contact);
  }, [filteredContacts]);

  const handleExportCSV = useCallback(() => {
    const esc = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n')) ? `"${v.replace(/"/g, '""')}"` : v;
    const headers = ['Nome','Sobrenome','Apelido','Telefone','Email','Empresa','Cargo','Tipo','Tags','Criado em'];
    const csvRows = filteredContacts.map(c => [
      esc(c.name), esc(c.surname||''), esc(c.nickname||''), esc(c.phone),
      esc(c.email||''), esc(c.company||''), esc(c.job_title||''),
      esc(c.contact_type||'cliente'), esc((c.tags||[]).join('; ')),
      esc(format(new Date(c.created_at), 'dd/MM/yyyy', { locale: ptBR })),
    ].join(','));
    const csv = '\uFEFF' + [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `contatos_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(`${filteredContacts.length} contatos exportados!`);
  }, [filteredContacts]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); setIsAddDialogOpen(true); }
      if (e.key === 'Escape') {
        if (detailContact) { setDetailContact(null); return; }
        if (selectedIds.length > 0) { setSelectedIds([]); }
        else if (searchInput) { clearSearch(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault(); handleSelectAll();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIds.length, searchInput, clearSearch, setIsAddDialogOpen, setSelectedIds, handleSelectAll, detailContact]);

  return {
    crud,
    viewMode, setViewMode,
    gridColumns, setGridColumns,
    isImportOpen, setIsImportOpen,
    isMergeOpen, setIsMergeOpen,
    isCompareOpen, setIsCompareOpen,
    groupByCompany, setGroupByCompany,
    isBulkTagOpen, setIsBulkTagOpen,
    detailContact, setDetailContact,
    handleApplyPreset, handleToggleSelect, handleSelectAll,
    handleContactClick, handleExportCSV,
  };
}
