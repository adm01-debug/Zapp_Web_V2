import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tag, Filter, ArrowUpDown, X,
  GitCompareArrows, Merge, Sparkles,
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
  /** D4: contatos legados (LID/telefone não numérico) ficam fora por padrão. */
  showLegacy: boolean;
  setShowLegacy: (val: boolean) => void;
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
  /**
   * Se o usuário pode mesclar contatos (RPC `is_admin_or_supervisor` via
   * `useCRMAdminAccess`). `false` esconde o botão "Mesclar"; `null`/ausente não
   * bloqueia (ver `canMergeContacts`).
   */
  canMerge: boolean;
  viewMode: ContactViewMode;
  setViewMode: (mode: ContactViewMode) => void;
  gridColumns: number;
  setGridColumns: (cols: number) => void;
  totalCount: number;
  crmIntegrationEnabled: boolean;
  onOpenCRM: () => void;
}

export function ContactToolbar({
  searchInput, onSearchChange, sortBy, setSortBy, showLegacy, setShowLegacy,
  showFilters, setShowFilters, activeFiltersCount, clearFilters,
  activeTab, filterCompany, setFilterCompany, filterJobTitle, setFilterJobTitle,
  filterTag, setFilterTag, filterDateRange, setFilterDateRange,
  uniqueCompanies, uniqueJobTitles, uniqueTags,
  onApplyPreset, groupByCompany, setGroupByCompany,
  selectedIds, onBulkTag, onCompare, onMerge, canMerge,
  viewMode, setViewMode, gridColumns, setGridColumns, totalCount,
  crmIntegrationEnabled, onOpenCRM,
}: ContactToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap xl:flex-nowrap">
        <ContactSearchWithSuggestions
          value={searchInput}
          onChange={onSearchChange}
          uniqueCompanies={uniqueCompanies}
          uniqueTags={uniqueTags}
          totalCount={totalCount}
        />

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[150px] h-11 rounded-xl bg-input border-border text-sm font-medium gap-2 shrink-0">
            <ArrowUpDown className="w-[18px] h-[18px]" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "h-11 px-4 rounded-xl text-sm font-medium gap-2 shrink-0",
            showFilters ? "bg-primary text-primary-foreground hover:bg-primary/90 border border-primary" : "bg-input border border-border text-foreground hover:bg-muted"
          )}
          aria-expanded={showFilters}
          aria-controls="contact-filters-panel"
        >
          <Filter className="w-[18px] h-[18px]" />
          Filtros
          {activeFiltersCount > 0 && (
            <Badge variant="secondary" className="ml-1 bg-background/20 text-3xs h-4 px-1">{activeFiltersCount}</Badge>
          )}
        </Button>

        {activeFiltersCount > 0 && (
          <Button variant="ghost" onClick={clearFilters} className="h-11 text-sm shrink-0" aria-label="Limpar todos os filtros">
            <X className="w-4 h-4 mr-1" />Limpar
          </Button>
        )}

        <div className="flex items-center gap-2 h-11 px-3 rounded-xl bg-input border border-border shrink-0">
          <Switch
            id="contact-show-legacy"
            checked={showLegacy}
            onCheckedChange={setShowLegacy}
            data-testid="contact-show-legacy"
          />
          <Label htmlFor="contact-show-legacy" className="text-sm font-medium cursor-pointer">
            Mostrar legados
          </Label>
        </div>

        <FilterPresets
          currentFilters={{ type: activeTab, company: filterCompany, jobTitle: filterJobTitle, tag: filterTag, dateRange: filterDateRange }}
          onApplyPreset={onApplyPreset}
        />

        {selectedIds.length >= 1 && (
          <>
            <Button variant="outline" className="h-11 rounded-xl text-sm gap-2 shrink-0" onClick={onBulkTag}>
              <Tag className="w-[18px] h-[18px]" />
              Tags ({selectedIds.length})
            </Button>
            {selectedIds.length >= 2 && (
              <>
                <Button variant="outline" className="h-11 rounded-xl text-sm gap-2 shrink-0" onClick={onCompare}>
                  <GitCompareArrows className="w-[18px] h-[18px]" />
                  Comparar
                </Button>
                {/* Mesclar faz DELETE físico dos secundários e exige admin/supervisor
                    no banco (RPC `merge_contacts_atomic`, 42501): só é oferecido a quem pode. */}
                {canMerge && (
                  <Button variant="outline" className="h-11 rounded-xl text-sm gap-2 shrink-0 border-primary/30 text-primary" onClick={onMerge}>
                    <Merge className="w-[18px] h-[18px]" />
                    Mesclar
                  </Button>
                )}
              </>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {crmIntegrationEnabled && (
            <Button
              onClick={onOpenCRM}
              className="h-11 px-4 rounded-xl bg-primary/20 border border-primary/50 text-primary-glow hover:bg-primary/30 font-semibold text-sm gap-2 shrink-0"
            >
              <Sparkles className="w-[18px] h-[18px]" />CRM 360°
            </Button>
          )}
          <ContactViewSwitcher
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            gridColumns={gridColumns}
            onGridColumnsChange={setGridColumns}
            groupByCompany={groupByCompany}
            onGroupByCompanyChange={setGroupByCompany}
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
