import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tag, Filter, ArrowUpDown, X, Search, Users,
  GitCompareArrows, Merge, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContactViewSwitcher, type ContactViewMode } from './ContactViewSwitcher';
import { FilterPresets, type FilterPreset } from './FilterPresets';
import { ContactSearchWithSuggestions } from './ContactSearchWithSuggestions';
import { ContactAdvancedFilters } from './ContactAdvancedFilters';
import { useContactsV2Flags } from '@/hooks/contacts/useContactsV2Flags';
import {
  useContactSearchV2,
  type HighlightSegment,
} from '@/hooks/contacts/useContactSearchV2';

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
  /**
   * CT-011 — a busca instantânea (nome/apelido/empresa) é liberada pela
   * sub-chave `contacts.v2.toolbar`. A leitura vem do MESMO hook compartilhado
   * de CT-005 (`useContactsV2Flags`): uma única consulta para o módulo inteiro,
   * sem chamada nova e sem versão nova do sistema para ligar/desligar. Com a
   * sub-chave desligada (ou a chave geral desligada), a barra é exatamente a
   * atual — inclusive o campo antigo.
   */
  const contactsV2 = useContactsV2Flags();

  return (
    <div className="space-y-3">
      {/* `zc-tools` do design: uma linha que quebra, gap 8px, margem inferior 12px. */}
      <div className="flex items-center gap-2 flex-wrap mb-3 max-[899px]:gap-[7px]">
        {contactsV2.toolbar ? (
          <ContactSearchV2Field value={searchInput} onChange={onSearchChange} />
        ) : (
          <ContactSearchWithSuggestions
            value={searchInput}
            onChange={onSearchChange}
            uniqueCompanies={uniqueCompanies}
            uniqueTags={uniqueTags}
            totalCount={totalCount}
          />
        )}

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger
            aria-label="Ordenar por"
            className="w-[150px] h-10 min-h-10 rounded-[9px] border-border bg-input text-[11px] font-medium gap-[7px] shrink-0 [&>svg]:w-[15px] [&>svg]:h-[15px] max-[659px]:flex-1 max-[659px]:justify-start max-[659px]:w-auto"
          >
            <ArrowUpDown className="w-[15px] h-[15px]" />
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
            'h-10 min-h-10 px-[11px] rounded-[9px] text-[11px] font-medium gap-[7px] shrink-0 border shadow-[inset_0_1px_0_hsl(0_0%_100%/0.04)]',
            showFilters
              ? 'border-[hsl(var(--primary)/0.65)] bg-[hsl(var(--primary)/0.18)] text-foreground hover:bg-[hsl(var(--primary)/0.24)]'
              : 'border-border bg-input text-foreground hover:bg-muted hover:border-muted-foreground/40',
          )}
          aria-expanded={showFilters}
          aria-controls="contact-filters-panel"
        >
          <Filter className="w-[15px] h-[15px]" />
          Filtros
          {activeFiltersCount > 0 && (
            <span
              data-testid="filters-count"
              className="grid place-items-center min-w-[19px] min-h-[19px] px-[5px] rounded-[5px] bg-primary text-primary-foreground text-[11px] font-medium"
            >
              {activeFiltersCount}
            </span>
          )}
        </Button>

        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            onClick={clearFilters}
            className="h-10 min-h-10 px-2 rounded-[9px] text-[11px] shrink-0 gap-1"
            aria-label="Limpar todos os filtros"
          >
            <X className="w-3.5 h-3.5" />Limpar
          </Button>
        )}

        {/* `zc-switch-label`: chave + rótulo, altura 40px, raio 9px, texto 11px. */}
        <div className="flex items-center gap-2 h-10 min-h-10 px-[11px] rounded-[9px] bg-input border border-border shrink-0 max-[659px]:flex-1 max-[659px]:justify-center">
          <Switch
            id="contact-show-legacy"
            checked={showLegacy}
            onCheckedChange={setShowLegacy}
            data-testid="contact-show-legacy"
          />
          <Label htmlFor="contact-show-legacy" className="text-[11px] font-medium cursor-pointer whitespace-nowrap">
            Mostrar legados
          </Label>
        </div>

        <FilterPresets
          currentFilters={{ type: activeTab, company: filterCompany, jobTitle: filterJobTitle, tag: filterTag, dateRange: filterDateRange }}
          onApplyPreset={onApplyPreset}
        />

        {selectedIds.length >= 1 && (
          <>
            <Button variant="outline" className="h-10 min-h-10 px-[11px] rounded-[9px] text-[11px] gap-[7px] shrink-0" onClick={onBulkTag}>
              <Tag className="w-[15px] h-[15px]" />
              Tags ({selectedIds.length})
            </Button>
            {selectedIds.length >= 2 && (
              <>
                <Button variant="outline" className="h-10 min-h-10 px-[11px] rounded-[9px] text-[11px] gap-[7px] shrink-0" onClick={onCompare}>
                  <GitCompareArrows className="w-[15px] h-[15px]" />
                  Comparar
                </Button>
                {/* Mesclar faz DELETE físico dos secundários e exige admin/supervisor
                    no banco (RPC `merge_contacts_atomic`, 42501): só é oferecido a quem pode. */}
                {canMerge && (
                  <Button variant="outline" className="h-10 min-h-10 px-[11px] rounded-[9px] text-[11px] gap-[7px] shrink-0 border-primary/30 text-primary" onClick={onMerge}>
                    <Merge className="w-[15px] h-[15px]" />
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
              className="h-10 min-h-10 px-[11px] rounded-[9px] bg-primary/20 border border-primary/50 text-[hsl(var(--primary-text))] hover:bg-primary/30 font-semibold text-[11px] gap-[7px] shrink-0"
            >
              <Sparkles className="w-[15px] h-[15px]" />CRM 360°
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

/** Trecho do texto que casou com o termo buscado. */
function TrechoDestacado({ segmentos }: { segmentos: HighlightSegment[] }) {
  return (
    <>
      {segmentos.map((segmento, indice) =>
        segmento.match ? (
          <mark key={indice} className="bg-primary/20 text-foreground rounded-sm px-0.5">
            {segmento.text}
          </mark>
        ) : (
          <span key={indice}>{segmento.text}</span>
        ),
      )}
    </>
  );
}

/**
 * CT-011 — campo da busca instantânea de contatos: nome (inclui apelido) ou
 * empresa, a partir da PRIMEIRA LETRA.
 *
 * O texto continua sendo o da barra (`value`/`onChange`, a lista abaixo é
 * alimentada como sempre); o que o campo acrescenta é a resposta imediata da
 * RPC local `search_contacts`: os contatos que casam aparecem aqui com o TRECHO
 * ENCONTRADO destacado, e — quando ninguém casa — o estado "nada encontrado"
 * com a ação que devolve o vendedor à lista inteira. Quem busca, cancela a
 * busca anterior e trata erro/vazio é o `useContactSearchV2` (ver o hook).
 *
 * O destaque usa o termo que produziu o resultado que está na tela
 * (`resolvedTerm`), e não o que está sendo digitado: nunca aparece trecho
 * destacado que não corresponde ao contato exibido.
 */
function ContactSearchV2Field({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { results, resolvedTerm, loading, error, notFound, highlight } = useContactSearchV2({
    term: value,
  });

  // Fecha ao clicar fora (mesmo comportamento do campo atual da barra).
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const termo = value.trim();
  // `total_count` vem do servidor sobre o filtro inteiro (antes do LIMIT), não
  // é o tamanho da amostra que apareceu aqui.
  const total = results.length > 0 ? results[0].total_count : 0;
  const aberto =
    focused && termo.length > 0 && (loading || results.length > 0 || notFound || Boolean(error));

  return (
    <div ref={containerRef} className="relative flex-1 min-w-[235px] max-[659px]:min-w-full max-[659px]:basis-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setFocused(false);
        }}
        placeholder="Buscar por nome, apelido ou empresa…"
        aria-label="Buscar por nome, apelido ou empresa"
        aria-expanded={aberto}
        aria-controls="contact-search-v2-resultados"
        autoComplete="off"
        className={cn(
          'h-10 rounded-[9px] bg-input border-border text-xs transition-all',
          value ? 'pl-[34px] pr-9' : 'pl-[34px] pr-3',
        )}
      />
      {value && (
        <button
          aria-label="Limpar busca"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {aberto && (
        <div
          id="contact-search-v2-resultados"
          className="absolute top-full left-0 right-0 mt-1.5 bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden"
        >
          {loading && results.length === 0 && (
            <p role="status" className="px-3 py-2 text-2xs text-muted-foreground">
              Buscando contatos…
            </p>
          )}

          {Boolean(error) && !loading && (
            <p role="status" className="px-3 py-2 text-2xs text-destructive">
              Não foi possível buscar agora. Digite de novo para tentar.
            </p>
          )}

          {results.length > 0 && (
            <>
              <div className="px-3 py-2 bg-muted/30 border-b border-border/30 text-2xs text-muted-foreground">
                {total} {total === 1 ? 'contato' : 'contatos'}
              </div>
              <ul className="p-2">
                {results.map((contato) => (
                  <li key={contato.id} className="px-2 py-1.5 rounded-md">
                    <p className="text-xs text-foreground truncate">
                      <TrechoDestacado segmentos={highlight(contato.name)} />
                      {contato.nickname && (
                        <span className="text-muted-foreground">
                          {' '}
                          · “<TrechoDestacado segmentos={highlight(contato.nickname)} />”
                        </span>
                      )}
                    </p>
                    {(contato.company || contato.job_title) && (
                      <p className="text-2xs text-muted-foreground truncate">
                        {contato.company && <TrechoDestacado segmentos={highlight(contato.company)} />}
                        {contato.company && contato.job_title && ' · '}
                        {contato.job_title && <TrechoDestacado segmentos={highlight(contato.job_title)} />}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {notFound && (
            <div className="p-3">
              <p className="text-xs font-medium text-foreground">
                Nenhum contato com “{resolvedTerm}”
              </p>
              <p className="text-2xs text-muted-foreground mt-0.5">
                A busca também encontra telefone e e-mail.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 text-xs gap-1.5"
                onClick={() => onChange('')}
              >
                <Users className="w-3.5 h-3.5" />
                Ver todos os contatos
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
