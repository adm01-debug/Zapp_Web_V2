import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Filter } from 'lucide-react';

interface ContactResultsSummaryProps {
  totalCount: number;
  filteredCount: number;
  selectedCount: number;
  activeFiltersCount: number;
  search: string;
  onSelectAll: () => void;
  allSelected: boolean;
}

export function ContactResultsSummary({
  totalCount, filteredCount, selectedCount, activeFiltersCount,
  search, onSelectAll, allSelected,
}: ContactResultsSummaryProps) {
  if (filteredCount === 0) return null;

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={onSelectAll}>
          <Checkbox
            checked={allSelected && filteredCount > 0}
            onCheckedChange={() => onSelectAll()}
            className="w-3.5 h-3.5"
          />
          {selectedCount > 0 ? `${selectedCount} selecionado${selectedCount !== 1 ? 's' : ''}` : 'Selecionar todos'}
        </Button>
        <span className="text-muted-foreground/60">|</span>
        <span>
          Exibindo <span className="font-semibold text-foreground">{filteredCount}</span>
          {filteredCount < totalCount && <> de <span className="font-semibold text-foreground">{totalCount}</span></>}
          {' '}contato{totalCount !== 1 ? 's' : ''}
        </span>
        {activeFiltersCount > 0 && (
          <Badge variant="outline" className="text-xs gap-1"><Filter className="w-3 h-3" />{activeFiltersCount} filtro{activeFiltersCount !== 1 ? 's' : ''}</Badge>
        )}
      </div>
      {search && (
        <span className="text-xs italic text-muted-foreground/70">Buscando por "{search}"</span>
      )}
    </div>
  );
}
