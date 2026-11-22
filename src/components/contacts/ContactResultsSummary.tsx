import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Filter, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface ContactResultsSummaryProps {
  totalCount: number;
  filteredCount: number;
  selectedCount: number;
  activeFiltersCount: number;
  search: string;
  onSelectAll: () => void;
  allSelected: boolean;
  page: number;
  pageSize: number;
  loadMore: () => void;
  loadPrevious: () => void;
  hasMore: boolean;
  loading: boolean;
  /** ZD-043/ZD-044 — rótulo da visão atual ("Cards de contatos", "Lista", …) e chips dos filtros ativos. */
  viewCaption?: string;
  activeFilterChips?: { key: string; label: string; onRemove: () => void }[];
}

export function ContactResultsSummary({
  totalCount, filteredCount, selectedCount, activeFiltersCount,
  search, onSelectAll, allSelected,
  page, pageSize, loadMore, loadPrevious, hasMore, loading,
  viewCaption, activeFilterChips = [],
}: ContactResultsSummaryProps) {
  if (filteredCount === 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = page + 1;
  const showPagination = totalCount > pageSize;
  const primeiro = page * pageSize + 1;
  const ultimo = Math.min((page + 1) * pageSize, totalCount);

  return (
    <div className="space-y-2">
      <div className="min-h-[23px] flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-[13px] flex-wrap min-w-0">
          <div
            role="button"
            tabIndex={0}
            className="flex items-center gap-2 whitespace-nowrap text-[11px] cursor-pointer select-none rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onSelectAll}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectAll()}
            aria-label={selectedCount > 0 ? `${selectedCount} contatos selecionados — clique para desselecionar` : 'Selecionar todos os contatos'}
          >
            <Checkbox
              checked={allSelected && filteredCount > 0}
              className="w-[15px] h-[15px] rounded-[4px] border-border pointer-events-none"
              aria-hidden="true"
              tabIndex={-1}
            />
            <span className="font-medium text-foreground">
              {selectedCount > 0
                ? `${selectedCount} selecionado${selectedCount !== 1 ? 's' : ''}`
                : 'Selecionar todos'}
            </span>
          </div>
          <span className="pl-3 border-l border-[hsl(var(--contacts-line))]" data-testid="contacts-showing" aria-live="polite">
            Exibindo <strong className="font-medium text-foreground">{primeiro}–{ultimo}</strong> de{' '}
            <strong className="font-medium text-foreground">{totalCount}</strong>{' '}
            contato{totalCount !== 1 ? 's' : ''}
            {filteredCount < totalCount && <> · {filteredCount} no filtro</>}
          </span>
          {activeFiltersCount > 0 && (
            <span className="inline-flex items-center gap-[5px] text-[11px] text-primary">
              <Filter className="w-[13px] h-[13px]" />
              {activeFiltersCount} filtro{activeFiltersCount !== 1 ? 's' : ''}
            </span>
          )}
          {search && (
            <span className="text-[11px] italic text-[hsl(var(--contacts-quiet))]">"{search}"</span>
          )}
        </div>

        <span className="text-[11px] text-[hsl(var(--contacts-quiet))] max-[659px]:hidden">{viewCaption}</span>
      </div>

      {activeFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="contacts-filter-chips">
          {activeFilterChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-[6px] h-7 pl-[9px] pr-1 rounded-[7px] border border-black/20 dark:border-white/15 bg-[hsl(var(--primary)/0.18)] text-[11px] text-foreground"
            >
              {chip.label}
              <button type="button" onClick={chip.onRemove} className="grid place-items-center w-[18px] h-[18px] rounded-[5px] hover:bg-[hsl(var(--primary)/0.3)]" aria-label={`Remover filtro ${chip.label}`}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {showPagination && (
        <div className="flex items-center justify-between gap-3 mt-1">
          <span className="text-[11px] text-[hsl(var(--contacts-quiet))] max-[659px]:hidden">{viewCaption}</span>
          <div className="flex items-center gap-[6px] ml-auto">
            <Button
              variant="outline"
              size="icon"
              className="w-[30px] h-[30px] rounded-[7px] border-border bg-card hover:border-primary/60 hover:bg-muted disabled:opacity-40"
              onClick={loadPrevious}
              disabled={page === 0 || loading}
              aria-label="Página anterior"
            >
              <ChevronLeft className="w-[14px] h-[14px]" />
            </Button>
            <span data-testid="contacts-page-indicator" className="min-w-[51px] max-[659px]:min-w-[38px] text-center text-[11px] tabular-nums text-muted-foreground">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="w-[30px] h-[30px] rounded-[7px] border-border bg-card hover:border-primary/60 hover:bg-muted disabled:opacity-40"
              onClick={loadMore}
              disabled={!hasMore || loading}
              aria-label="Próxima página"
            >
              <ChevronRight className="w-[14px] h-[14px]" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
