import { Bookmark } from 'lucide-react';
import { useSavedFilters, type SavedFilter } from '@/hooks/chat/useSavedFilters';
import { savedFilterToState } from './savedFilterToState';
import type { InboxFiltersState } from './InboxFilters';

interface SavedFilterChipsProps {
  onFiltersChange: (filters: InboxFiltersState) => void;
  onContactTypeChange?: (v: string | null) => void;
  onQueueChange?: (v: string | null) => void;
  onShowAllChange?: (v: boolean) => void;
}

/**
 * Linha de chips rápidos dos filtros salvos, SEMPRE VISÍVEL acima da lista
 * (como a linha de chips de etapa).
 *
 * [refazer 1] ponto 1 (t_82388172): a seção "Filtros salvos" vivia só dentro
 * do popover — quem nunca abria o painel nem sabia que o recurso existia.
 * Cada chip reaplica o snapshot com a MESMA conversão do popover
 * (`savedFilterToState`, sem toast como lá); sem filtro salvo, nada é
 * renderizado (sem bloco vazio no layout).
 */
export function SavedFilterChips({
  onFiltersChange,
  onContactTypeChange,
  onQueueChange,
  onShowAllChange,
}: SavedFilterChipsProps) {
  const { filters: savedFilters, isLoading } = useSavedFilters('inbox');

  if (isLoading || savedFilters.length === 0) return null;

  const applySaved = (saved: SavedFilter) => {
    onFiltersChange(savedFilterToState(saved.filters));
    if (onContactTypeChange) {
      onContactTypeChange(typeof saved.filters.contactType === 'string' ? saved.filters.contactType : null);
    }
    if (onQueueChange) {
      onQueueChange(typeof saved.filters.queueId === 'string' ? saved.filters.queueId : null);
    }
    if (onShowAllChange) onShowAllChange(saved.filters.showAll === true);
  };

  return (
    <div className="px-4 pb-2">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" role="group" aria-label="Filtros salvos">
        {savedFilters.map((saved) => (
          <button
            key={saved.id}
            type="button"
            onClick={() => applySaved(saved)}
            title={saved.is_shared ? `${saved.name} (compartilhado)` : saved.name}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Bookmark className="h-3 w-3" aria-hidden="true" />
            {saved.name}
          </button>
        ))}
      </div>
    </div>
  );
}
