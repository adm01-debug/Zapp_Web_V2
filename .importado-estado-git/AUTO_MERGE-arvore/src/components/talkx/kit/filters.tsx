import { useState as _useState, useEffect as _useEffect } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Search, AlignJustify, LayoutGrid, Calendar, RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SegmentedToggle } from './primitives';
import { PERIOD_LABELS, PERIOD_OPTIONS, resolvePeriodRange } from './periods';
import type { TalkXPeriodRange } from './periods';

/**
 * X045 — barra ÚNICA de filtros do TalkX.
 * Substitui a antiga FilterBar (apagada) e absorve a FilterBarV2.
 */

/** Filtro de select (legado — mantido para consumidores existentes). */
export interface FilterSelectDef { key: string; value: string; onChange: (v: string) => void; label: string; options: { value: string; label: string }[]; icon?: LucideIcon }

export interface FilterOption { value: string; label: string; }

export interface FilterDefinition {
  key: string;
  label: string;
  /** Texto do GATILHO e PRIMEIRO item da lista (ex.: "Todos os status"). */
  allLabel?: string;
  options: FilterOption[];
  icon?: LucideIcon;
  labeled?: boolean;
}

export interface TalkXFilterBarProps {
  search?: string; onSearch?: (s: string) => void; placeholder?: string;
  filters?: FilterDefinition[]; values?: Record<string, string>; onFilter?: (key: string, val: string) => void;
  onClear?: () => void; hasActive?: boolean;
  period?: string | null; onPeriodChange?: (p: string | null, range?: TalkXPeriodRange | null) => void;
  onRefresh?: () => void; refreshing?: boolean;
  rightSlot?: ReactNode;
  view?: 'list' | 'grid';
  onViewChange?: (v: 'list' | 'grid') => void;
  /** Alias legado do alternador lista/grade. */
  onView?: (v: 'list' | 'grid') => void;
}

export function TalkXFilterBar({
  search, onSearch, placeholder = 'Buscar...', filters = [], values, onFilter, onClear, hasActive,
  period = null, onPeriodChange, onRefresh, refreshing = false, rightSlot, view, onViewChange, onView,
}: TalkXFilterBarProps) {
  const incoming = search ?? '';
  const [local, setLocal] = _useState(incoming);
  const [syncedSearch, setSyncedSearch] = _useState(incoming);
  // Ajuste de estado durante o render (padrão React para "prop mudou -> recalcula"),
  // sem setState em effect.
  if (incoming !== syncedSearch) { setSyncedSearch(incoming); setLocal(incoming); }

  const [periodOpen, setPeriodOpen] = _useState(false);
  const [panelOpen, setPanelOpen] = _useState(false);

  _useEffect(() => {
    if (!onSearch) return;
    const t = setTimeout(() => onSearch(local), 250);
    return () => clearTimeout(t);
  }, [local, onSearch]);

  const toggleView = onViewChange ?? onView;
  const periodAtivo = !!period && period !== 'all';
  const periodLabel = period ? (PERIOD_LABELS[period] ?? 'Todo o período') : 'Todo o período';

  const activeChips = filters
    .map((fd) => ({ fd, value: values?.[fd.key] ?? 'all' }))
    .filter(({ value }) => value !== 'all' && value !== '')
    .map(({ fd, value }) => ({ fd, label: fd.options.find((o) => o.value === value)?.label ?? value }));

  const renderSelect = (fd: FilterDefinition) => (
    <div key={fd.key} className='flex flex-col'>
      {fd.labeled && <label className='text-3xs font-medium text-muted-foreground mb-0.5 px-0.5 uppercase tracking-wide'>{fd.label}</label>}
      <Select value={values?.[fd.key] ?? 'all'} onValueChange={(v) => onFilter?.(fd.key, v)}>
        <SelectTrigger aria-label={fd.label} className='h-9 text-xs bg-input/40 border-border/70 rounded-lg min-w-[120px]'>
          {fd.icon && <fd.icon className='w-3.5 h-3.5 text-muted-foreground shrink-0' />}
          <SelectValue placeholder={fd.allLabel ?? 'Todos'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>{fd.allLabel ?? 'Todos'}</SelectItem>
          {fd.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-center gap-2'>
        {onSearch !== undefined && (
          <div className='relative'>
            <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none' />
            <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder={placeholder}
              className='h-9 pl-8 pr-3 w-52 text-xs bg-input/40 border-border/70 rounded-lg' />
          </div>
        )}

        {/* selects inline: >= 768px */}
        {filters.length > 0 && (
          <div className='hidden md:flex flex-wrap items-center gap-2'>
            {filters.map(renderSelect)}
          </div>
        )}

        {/* gatilho do painel "Filtros": < 768px */}
        {filters.length > 0 && (
          <button type='button' aria-label='Filtros' aria-expanded={panelOpen}
            onClick={() => setPanelOpen((o) => !o)}
            className='md:hidden h-9 px-3 rounded-lg text-xs font-medium bg-input/40 border border-border/70 inline-flex items-center gap-1.5'>
            <SlidersHorizontal className='w-3.5 h-3.5' /> Filtros
          </button>
        )}

        {/* período: chip com calendário + popover.
            R2-MOD-059: o menu só aparece quando a tela liga um consumidor
            (`onPeriodChange`). Sem ele o cabeçalho prometia um recorte por data que
            não existia — o clique fechava o popover, o rótulo continuava "Todo o
            período" e os dados não mudavam. Nenhuma das telas do Talk X passa o
            consumidor, então o controle mentiroso não é oferecido. */}
        {onPeriodChange && (
          <div className='relative'>
            <button type='button' aria-label='Período' aria-expanded={periodOpen}
              onClick={() => setPeriodOpen((o) => !o)}
              className='h-9 px-3 rounded-lg text-xs font-medium bg-input/40 border border-border/70 inline-flex items-center gap-1.5'>
              <Calendar className='w-3.5 h-3.5 text-muted-foreground' />
              <span>{periodLabel}</span>
            </button>
            {periodOpen && (
              <div role='menu' className='absolute z-30 mt-1 left-0 min-w-[180px] rounded-lg border border-border/70 bg-popover p-1 shadow-md'>
                {PERIOD_OPTIONS.map((o) => (
                  <button key={o.value} type='button' role='menuitem'
                    onClick={() => { setPeriodOpen(false); onPeriodChange(o.value, resolvePeriodRange(o.value)); }}
                    className='w-full text-left px-3 py-1.5 rounded-md text-xs hover:bg-primary/10'>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Limpar filtros: SEMPRE visível, desabilitado sem filtro ativo */}
        <button type='button' onClick={onClear} disabled={!hasActive}
          className='h-9 px-3 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent'>
          Limpar filtros
        </button>

        {/* Atualizar */}
        <button type='button' aria-label='Atualizar' onClick={onRefresh} disabled={refreshing || !onRefresh}
          className='h-9 w-9 rounded-lg inline-flex items-center justify-center bg-input/40 border border-border/70 disabled:opacity-40'>
          <RefreshCw className={refreshing ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
        </button>

        <div className='ml-auto flex items-center gap-2'>
          {rightSlot}
          {toggleView && (
            <SegmentedToggle value={view ?? 'list'} onChange={toggleView}
              options={[{ value: 'list' as const, icon: AlignJustify, label: 'Lista' }, { value: 'grid' as const, icon: LayoutGrid, label: 'Grade' }]} />
          )}
        </div>
      </div>

      {/* painel de filtros: < 768px */}
      {panelOpen && filters.length > 0 && (
        <div className='md:hidden flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card/40 p-2'>
          {filters.map(renderSelect)}
        </div>
      )}

      {/* chips de filtro ativo: < 1024px */}
      {(activeChips.length > 0 || periodAtivo) && (
        <div className='flex flex-wrap items-center gap-2 lg:hidden'>
          {activeChips.map(({ fd, label }) => (
            <button key={fd.key} type='button' onClick={() => onFilter?.(fd.key, 'all')}
              className='inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-3xs'>
              {fd.label}: {label} <X className='w-3 h-3' />
            </button>
          ))}
          {periodAtivo && onPeriodChange && (
            <button type='button' onClick={() => onPeriodChange(null, null)}
              className='inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-3xs'>
              {periodLabel} <X className='w-3 h-3' />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Alias exportado: o barrel e os consumidores atuais usam o nome FilterBarV2. */
export const FilterBarV2 = TalkXFilterBar;
