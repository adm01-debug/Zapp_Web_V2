import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
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
    isMergeOpen, setIsMergeOpen,
    isCompareOpen, setIsCompareOpen,
    groupByCompany, setGroupByCompany,
    isBulkTagOpen, setIsBulkTagOpen,
    detailContact, setDetailContact,
    handleApplyPreset, handleToggleSelect, handleSelectAll,
    handleContactClick,
  };
}
