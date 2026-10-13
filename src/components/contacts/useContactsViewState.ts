import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useContactsCRUD } from './useContactsCRUD';
import type { ContactViewMode } from './ContactViewSwitcher';
import type { FilterPreset } from './FilterPresets';
import { VALID_TAB_TYPES } from './contactTypeOrder';

/** Chave do `localStorage` que lembra o modo de visualização entre visitas. */
const VIEW_MODE_STORAGE_KEY = 'contacts:view-mode';
/** Modos aceitos — um valor estranho/antigo guardado não vira modo inválido na tela. */
const VALID_VIEW_MODES: readonly ContactViewMode[] = ['grid', 'list', 'table', 'map', 'kanban', 'analytics'];

/**
 * Lê o modo guardado. `localStorage` pode estar indisponível (modo privado,
 * ambiente sem `window`): nesse caso o padrão é 'grid' e a tela não quebra.
 */
function readStoredViewMode(): ContactViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored && (VALID_VIEW_MODES as readonly string[]).includes(stored)) return stored as ContactViewMode;
  } catch {
    /* sem localStorage: a escolha vale só nesta visita */
  }
  return 'grid';
}

export function useContactsViewState() {
  const crud = useContactsCRUD();
  const {
    contacts: filteredContacts, searchInput, clearSearch,
    setActiveTab, setFilterCompany, setFilterJobTitle, setFilterTag,
    setFilterDateRange, selectedIds, setSelectedIds, setIsAddDialogOpen,
  } = crud;

  const [viewMode, setViewModeState] = useState<ContactViewMode>(readStoredViewMode);
  const [gridColumns, setGridColumns] = useState(4);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [groupByCompany, setGroupByCompany] = useState(false);
  const [isBulkTagOpen, setIsBulkTagOpen] = useState(false);
  const [detailContactId, setDetailContactId] = useState<string | null>(null);

  /** Grava a escolha para a próxima visita; sem `localStorage` vale só nesta. */
  const setViewMode = useCallback((mode: ContactViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      /* sem localStorage: a escolha vale só nesta visita */
    }
  }, []);

  /**
   * O contato do painel é DERIVADO da lista atual, não uma cópia do clique:
   * a cópia continuava mostrando nome/telefone antigos depois de editar pelo
   * próprio painel. Se o contato sair da lista (filtro/tipo mudou), o painel fecha.
   */
  const detailContact = useMemo(
    () => (detailContactId === null ? null : filteredContacts.find(c => c.id === detailContactId) ?? null),
    [filteredContacts, detailContactId],
  );
  const setDetailContact = useCallback((contact: typeof filteredContacts[0] | null) => {
    setDetailContactId(contact ? contact.id : null);
  }, []);

  const handleApplyPreset = useCallback((preset: FilterPreset) => {
    if (preset.filters.type) {
      // Sanitize: preset salvo com tipo extinto (lead, sicoob_gifts, outros) → fallback 'all'
      setActiveTab(VALID_TAB_TYPES.has(preset.filters.type) ? preset.filters.type : 'all');
    }
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
    if (!filteredContacts.some(c => c.id === id)) return;
    setDetailContactId(id);
  }, [filteredContacts]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); setIsAddDialogOpen(true); }
      if (e.key === 'Escape') {
        if (e.defaultPrevented || document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
        if (detailContact) { setDetailContact(null); return; }
        if (selectedIds.length > 0) { setSelectedIds([]); }
        else if (searchInput) { clearSearch(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault(); handleSelectAll();
      }
    };
    // Captura: roda antes do Esc do Radix fechar o diálogo, enquanto ele ainda está `data-state="open"`.
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [selectedIds.length, searchInput, clearSearch, setIsAddDialogOpen, setSelectedIds, handleSelectAll, detailContact, setDetailContact]);

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
