import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tag, Filter, SortAsc, X,
  GitCompareArrows, Merge, LayoutList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContactViewSwitcher, type ContactViewMode } from './ContactViewSwitcher';
import { FilterPresets, type FilterPreset } from './FilterPresets';
import { ContactSearchWithSuggestions } from './ContactSearchWithSuggestions';
import { ContactAdvancedFilters } from './ContactAdvancedFilters';

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Nome (A-Z)' },
  { value: 'name_desc', label: 'Nome (Z-A)' },
  { value: 'created_desc', label: 'Mais recentes' },
  { value: 'created_asc', label: 'Mais antigos' },
  { value: 'updated_desc', label: 'Atualizado recentemente' },
];

interface ContactToolbarProps {
  searchInput: string;
  onSearchChange: (val: string) => void;
  sortBy: string;
  setSortBy: (val: string) => void;
  showFilters: boolean;
  setShowFilters: (val: boolean) => void;
  activeFiltersCount: number;
  clearFilters: () => void;
  activeTab: string;
  filterCompany: string;
  setFilterCompany: (val: string) => void;
  filterJobTitle: string;
  setFilterJobTitle: (val: string) => void;
  filterTag: string;
  setFilterTag: (val: string) => void;
  filterDateRange: string;
  setFilterDateRange: (val: string) => void;
  uniqueCompanies: string[];
  uniqueJobTitles: string[];
  uniqueTags: string[];
  onApplyPreset: (preset: FilterPreset) => void;
  groupByCompany: boolean;
  setGroupByCompany: (val: boolean) => void;
  selectedIds: string[];
  onBulkTag: () => void;
  onCompare: () => void;
  onMerge: () => void;
  viewMode: ContactViewMode;
  setViewMode: (mode: ContactViewMode) => void;
  gridColumns: number;
  setGridColumns: (cols: number) => void;
  totalCount: number;
}

export function ContactToolbar({
  searchInput, onSearchChange, sortBy, setSortBy,
  showFilters, setShowFilters, activeFiltersCount, clearFilters,
  activeTab, filterCompany, setFilterCompany, filterJobTitle, setFilterJobTitle,
  filterTag, setFilterTag, filterDateRange, setFilterDateRange,
  uniqueCompanies, uniqueJobTitles, uniqueTags,
  onApplyPreset, groupByCompany, setGroupByCompany,
  selectedIds, onBulkTag, onCompare, onMerge,
  viewMode, setViewMode, gridColumns, setGridColumns, totalCount,
}: ContactToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <ContactSearchWithSuggestions
          value={searchInput}
          onChange={onSearchChange}
          uniqueCompanies={uniqueCompanies}
          uniqueTags={uniqueTags}
          totalCount={totalCount}
        />

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SortAsc className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={showFilters ? "default" : "outline"}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className={cn("h-8 text-xs gap-1.5", showFilters && "bg-primary hover:bg-primary/90")}
          aria-expanded={showFilters}
          aria-controls="contact-filters-panel"
        >
          <Filter className="w-3.5 h-3.5" />
          Filtros
          {activeFiltersCount > 0 && (
            <Badge variant="secondary" className="ml-1 bg-background/20 text-[10px] h-4 px-1">{activeFiltersCount}</Badge>
          )}
        </Button>

        {activeFiltersCount > 0 && (
          <Button variant="ghost" onClick={clearFilters} size="sm" className="h-8 text-xs" aria-label="Limpar todos os filtros">
            <X className="w-3.5 h-3.5 mr-1" />Limpar
          </Button>
        )}

        <FilterPresets
          currentFilters={{ type: activeTab, company: filterCompany, jobTitle: filterJobTitle, tag: filterTag, dateRange: filterDateRange }}
          onApplyPreset={onApplyPreset}
        />

        <Button
          variant={groupByCompany ? "default" : "outline"}
          size="sm"
          onClick={() => setGroupByCompany(!groupByCompany)}
          className="h-8 text-xs gap-1.5"
          aria-pressed={groupByCompany}
        >
          <LayoutList className="w-3.5 h-3.5" />
          Agrupar
        </Button>

        {selectedIds.length >= 1 && (
          <>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={onBulkTag}>
              <Tag className="w-3.5 h-3.5" />
              Tags ({selectedIds.length})
            </Button>
            {selectedIds.length >= 2 && (
              <>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={onCompare}>
                  <GitCompareArrows className="w-3.5 h-3.5" />
                  Comparar
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-primary/30 text-primary" onClick={onMerge}>
                  <Merge className="w-3.5 h-3.5" />
                  Mesclar
                </Button>
              </>
            )}
          </>
        )}

        <div className="ml-auto">
          <ContactViewSwitcher
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            gridColumns={gridColumns}
            onGridColumnsChange={setGridColumns}
          />
        </div>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div id="contact-filters-panel" role="region" aria-label="Painel de filtros avançados">
          <ContactAdvancedFilters
            filterCompany={filterCompany} setFilterCompany={setFilterCompany}
            filterJobTitle={filterJobTitle} setFilterJobTitle={setFilterJobTitle}
            filterTag={filterTag} setFilterTag={setFilterTag}
            filterDateRange={filterDateRange} setFilterDateRange={setFilterDateRange}
            uniqueCompanies={uniqueCompanies} uniqueJobTitles={uniqueJobTitles} uniqueTags={uniqueTags}
            onClearFilters={clearFilters} activeFiltersCount={activeFiltersCount}
          />
        </div>
      )}
    </div>
  );
}
