import { useState, useCallback, memo, useEffect, useRef } from 'react';
import { useAdvancedContactSearch } from '@/hooks/crm/useAdvancedContactSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { AnimatePresence } from 'framer-motion';
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, Sparkles, Loader2, Filter, ArrowUpDown } from 'lucide-react';
import type { SearchContactResult } from '@/types/contactSearch';
import { CRMContactCard } from './CRMContactCard';
import { CRMFiltersPanel } from './CRMFiltersPanel';
import { useCRMAdminAccess } from '@/hooks/crm/useCRMAdminAccess';

interface AdvancedCRMSearchProps {
  onSelectContact?: (contact: SearchContactResult) => void;
  className?: string;
}

function AdvancedCRMSearchInner({ onSelectContact, className }: AdvancedCRMSearchProps) {
  const authorized = useCRMAdminAccess();

  const {
    results, total, totalPages, currentPage, filters,
    isLoading, isFetching, hasActiveFilters, activeFilterCount,
    params, setSearch, setFilter, setSortBy, setPage, clearFilters, isConfigured,
  } = useAdvancedContactSearch(authorized === true);

  const [searchInput, setSearchInput] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchInput = useCallback((value: string) => {
    setSearchInput(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setSearch(value), 400);
  }, [setSearch]);

  useEffect(() => () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  }, []);

  if (!isConfigured) return null;
  if (authorized === null) return <Skeleton className={cn('h-full w-full', className)} />;
  if (!authorized) {
    return (
      <div className={cn('flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground', className)}>
        Você não possui permissão para pesquisar diretamente no CRM externo.
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center gap-2 p-3 border-b border-border/30">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchInput} onChange={(e) => handleSearchInput(e.target.value)} placeholder="Buscar no CRM (nome, empresa, CNPJ...)" className="pl-9 h-9 text-sm" />
          {isFetching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />}
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 relative">
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline text-xs">Filtros</span>
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center">{activeFilterCount}</span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 sm:w-80">
            <SheetHeader><SheetTitle className="flex items-center gap-2 text-sm"><Filter className="w-4 h-4" /> Filtros avançados</SheetTitle></SheetHeader>
            <ScrollArea className="h-[calc(100vh-80px)] mt-4">
              <CRMFiltersPanel
                filters={filters}
                params={params}
                onFilter={setFilter as (key: string, value: string | boolean | undefined) => void}
                onClear={clearFilters}
                activeCount={activeFilterCount}
              />
            </ScrollArea>
          </SheetContent>
        </Sheet>
        <Select value={params.sort_by || 'relevance'} onValueChange={(v) => setSortBy(v as 'relevance' | 'name' | 'relationship_score' | 'recent')}>
          <SelectTrigger className="h-9 w-[130px] text-xs"><ArrowUpDown className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="relevance">Relevância</SelectItem>
            <SelectItem value="relationship_score">Score</SelectItem>
            <SelectItem value="recent">Recentes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {hasActiveFilters && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/10 border-b border-border/20 text-xs text-muted-foreground">
          <span>{isLoading ? '...' : `${total.toLocaleString('pt-BR')} contato${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}</span>
          {activeFilterCount > 0 && <Button variant="ghost" size="sm" onClick={clearFilters} className="h-5 text-[10px] px-1.5">Limpar filtros</Button>}
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          ) : !hasActiveFilters ? (
            <div className="text-center py-12 text-muted-foreground">
              <Sparkles className="w-8 h-8 mx-auto mb-3 text-primary/40" />
              <p className="text-sm font-medium">Busca avançada no CRM</p>
              <p className="text-xs mt-1">Pesquise por nome, empresa, CNPJ ou use os filtros</p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum resultado</p>
              <p className="text-xs mt-1">Tente ajustar os filtros ou termo de busca</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {results.map((contact) => <CRMContactCard key={contact.contact_id} contact={contact} onSelect={onSelectContact} />)}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border/30 bg-muted/5">
          <span className="text-xs text-muted-foreground">Pág. {currentPage + 1} de {totalPages}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0 || isFetching}>
              <ChevronLeft className="w-3 h-3 mr-0.5" /> Anterior
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages - 1 || isFetching}>
              Próxima <ChevronRight className="w-3 h-3 ml-0.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export const AdvancedCRMSearch = memo(AdvancedCRMSearchInner);
