import { useCallback, useMemo, useState } from 'react';

/**
 * Selecao da aba Arquivos (etapa 08), por ID estavel - nunca por indice.
 *
 * Ciclo de vida (etapa 34): sobrevive a troca de modo, ordenacao e rolagem; zera ao
 * trocar de contato (ou desmontar a aba) e ao cancelar; NAO zera quando uma acao falha,
 * porque o operador precisa tentar de novo com a mesma selecao. Nunca vai para storage.
 */

export interface FilesSelection {
  selectionMode: boolean;
  selectedIds: Set<string>;
  selectedCount: number;
  /** Selecionados que nao estao no recorte visivel agora (barra contextual). */
  selectedOutsideFilter: string[];
  enter: () => void;
  exit: () => void;
  toggle: (id: string) => void;
  selectAllVisible: () => void;
  clear: () => void;
}

export function useFilesSelection(
  visibleIds: readonly string[],
  contactId: string | null | undefined,
): FilesSelection {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [currentContact, setCurrentContact] = useState<string>(() => contactId ?? '');

  // Troca de contato: comeca limpo. Reset durante o render (estado derivado de props),
  // sem efeito em cascata e sem depender de remontagem.
  const contactKey = contactId ?? '';
  if (currentContact !== contactKey) {
    setCurrentContact(contactKey);
    setSelectedIds(new Set());
    setSelectionMode(false);
  }

  const visibleIdSet = useMemo(() => new Set(visibleIds), [visibleIds]);

  const enter = useCallback(() => setSelectionMode(true), []);
  const exit = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);
  const clear = useCallback(() => setSelectedIds(new Set()), []);
  const toggle = useCallback((id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectAllVisible = useCallback(() => setSelectedIds(new Set(visibleIds)), [visibleIds]);

  const selectedOutsideFilter = useMemo(
    () => Array.from(selectedIds).filter((id) => !visibleIdSet.has(id)),
    [selectedIds, visibleIdSet],
  );

  return {
    selectionMode,
    selectedIds,
    selectedCount: selectedIds.size,
    selectedOutsideFilter,
    enter,
    exit,
    toggle,
    selectAllVisible,
    clear,
  };
}
