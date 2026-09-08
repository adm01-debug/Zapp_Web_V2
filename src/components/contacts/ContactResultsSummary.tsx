import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Filter, ChevronLeft, ChevronRight } from 'lucide-react';

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
}

export function ContactResultsSummary({
  totalCount, filteredCount, selectedCount, activeFiltersCount,
  search, onSelectAll, allSelected,
  page, pageSize, loadMore, loadPrevious, hasMore, loading,
}: ContactResultsSummaryProps) {
  if (filteredCount === 0) return null;

  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = page + 1;
  const showPagination = totalCount > pageSize;

  return (
    <div className="h-9 flex items-center justify-between text-[14px] text-muted-foreground">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Fix: <button> aninhado em <button> é HTML inválido.
            Usamos div com role=button + onKeyDown para acessibilidade. */}
        <div
          role="button"
          tabIndex={0}
          className="h-9 flex items-center gap-2 text-[14px] font-medium cursor-pointer select-none rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          onClick={onSelectAll}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectAll()}
          aria-label={selectedCount > 0 ? `${selectedCount} contatos selecionados — clique para desselecionar` : 'Selecionar todos os contatos'}
        >
          <Checkbox
            checked={allSelected && filteredCount > 0}
            className="w-[18px] h-[18px] rounded-[5px] border-border pointer-events-none"
            aria-hidden="true"
            tabIndex={-1}
          />
          <span>
            {selectedCount > 0
              ? `${selectedCount} selecionado${selectedCount !== 1 ? 's' : ''}`
              : 'Selecionar todos'}
          </span>
        </div>
        <span className="h-4 w-px bg-border" />
        <span>
          Exibindo <span className="font-semibold text-foreground">{filteredCount}</span>
          {filteredCount < totalCount && <> de <span className="font-semibold text-foreground">{totalCount}</span></>}
          {' '}contato{totalCount !== 1 ? 's' : ''}
        </span>
        {activeFiltersCount > 0 && (
          <Badge variant="outline" className="text-xs gap-1">
            <Filter className="w-3 h-3" />
            {activeFiltersCount} filtro{activeFiltersCount !== 1 ? 's' : ''}
          </Badge>
        )}
        {search && (
          <span className="text-xs italic text-muted-foreground/70">"{search}"</span>
        )}
      </div>

      {showPagination && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[14px] font-medium text-muted-foreground">
            Página <span className="font-semibold text-foreground">{currentPage}</span> de{' '}
            <span className="font-semibold text-foreground">{totalPages}</span>
          </span>
          <Button
            variant="outline"
            size="icon"
            className="w-9 h-9 rounded-[10px] border border-border bg-card hover:bg-muted disabled:opacity-40"
            onClick={loadPrevious}
            disabled={page === 0 || loading}
            aria-label="Página anterior"
          >
            <ChevronLeft className="w-[18px] h-[18px]" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="w-9 h-9 rounded-[10px] border border-border bg-card hover:bg-muted disabled:opacity-40"
            onClick={loadMore}
            disabled={!hasMore || loading}
            aria-label="Próxima página"
          >
            <ChevronRight className="w-[18px] h-[18px]" />
          </Button>
        </div>
      )}
    </div>
  );
}
