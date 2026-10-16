import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useContactsCRUD } from './useContactsCRUD';
import type { ContactViewMode } from './ContactViewSwitcher';
import type { FilterPreset } from './FilterPresets';
import { VALID_TAB_TYPES } from './contactTypeOrder';

/**
 * Atalhos de teclado para trocar a visualização de contatos (tecla única, sem
 * modificador): G = Cards, L = Lista, T = Tabela, M = Mapa, A = Analytics,
 * P = Pipeline. Espelha o `ContactViewSwitcher` — é a mesma lista de modos.
 */
const VIEW_SHORTCUTS: Record<string, ContactViewMode> = {
  g: 'grid', l: 'list', t: 'table', m: 'map', a: 'analytics', p: 'kanban',
};

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
    const contact = filteredContacts.find(c => c.id === id);
    if (contact) setDetailContact(contact);
  }, [filteredContacts]);

  // Atalhos do módulo. Esc fecha SÓ a camada de topo: com um diálogo Radix
  // aberto por cima, o Esc é do diálogo e o painel/lista não mexem. As teclas
  // únicas G/L/T/M/A/P trocam de visualização (Grade, Lista, Tabela, Mapa,
  // Analytics, Pipeline) — só fora de campo de texto e sem diálogo aberto.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); setIsAddDialogOpen(true); }

      const target = e.target as HTMLElement | null;
      const isTextField = !!target && target instanceof HTMLElement && (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable ||
        target.getAttribute('contenteditable') === 'true'
      );
      const dialogOpen = () => document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');

      if (e.key === 'Escape') {
        if (e.defaultPrevented || dialogOpen()) return;
        if (detailContact) { setDetailContact(null); return; }
        if (selectedIds.length > 0) { setSelectedIds([]); }
        else if (searchInput) { clearSearch(); }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !isTextField) {
        e.preventDefault(); handleSelectAll();
        return;
      }
      // Tecla única (letra), sem modificador, fora de campo de texto e sem
      // diálogo aberto: troca a visualização.
      if (!isTextField && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        const mode = VIEW_SHORTCUTS[e.key.toLowerCase()];
        if (mode && !dialogOpen()) {
          e.preventDefault();
          setViewMode(mode);
        }
      }
    };
    // Captura: roda antes do Esc do Radix fechar o diálogo, enquanto ele ainda está `data-state="open"`.
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [selectedIds.length, searchInput, clearSearch, setIsAddDialogOpen, setSelectedIds, handleSelectAll, detailContact, setViewMode]);

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
