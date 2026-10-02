import { useState as _useState, useEffect as _useEffect } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Search, AlignJustify, LayoutGrid } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SegmentedToggle } from './primitives';

/** Barra de filtros: busca + selects + limpar. */
export interface FilterSelectDef { key: string; value: string; onChange: (v: string) => void; label: string; options: { value: string; label: string }[]; icon?: LucideIcon }
export function FilterBar({ search, onSearch, placeholder, selects, onClear, right }: { search: string; onSearch: (v: string) => void; placeholder: string; selects: FilterSelectDef[]; onClear?: () => void; right?: ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} className="pl-9 h-9 text-[13px] bg-input/40 border-border/70 rounded-lg" />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {selects.map((s) => (
          <Select key={s.key} value={s.value} onValueChange={s.onChange}>
            <SelectTrigger className="h-9 rounded-lg bg-input/40 border-border/70 text-xs min-w-[140px] w-auto gap-2">
              {s.icon && <s.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              <SelectValue placeholder={s.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{s.label}</SelectItem>
              {s.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ))}
        {onClear && (
          <button type="button" onClick={onClear} className="h-9 px-3 rounded-lg text-xs font-medium text-primary-glow hover:bg-primary/10 transition-colors">Limpar filtros</button>
        )}
        {right}
      </div>
    </div>
  );
}

// E16 — FilterBarV2: busca debounced + selects + labeled + toggle
export interface FilterOption { value: string; label: string; }
export interface FilterDefinition { key: string; label: string; options: FilterOption[]; icon?: LucideIcon; labeled?: boolean; }

export function FilterBarV2({
  search, onSearch, placeholder = 'Buscar...', filters = [], values, onFilter, onClear, hasActive,
  view, onView, rightSlot,
}: {
  search?: string; onSearch?: (s: string) => void; placeholder?: string;
  filters?: FilterDefinition[]; values?: Record<string, string>; onFilter?: (key: string, val: string) => void;
  onClear?: () => void; hasActive?: boolean;
  view?: 'list' | 'grid'; onView?: (v: 'list' | 'grid') => void;
  rightSlot?: ReactNode;
}) {
  const [local, setLocal] = _useState(search ?? '');
  // eslint-disable-next-line react-hooks/set-state-in-effect
  _useEffect(() => { setLocal(search ?? ''); }, [search]);
  _useEffect(() => {
    if (!onSearch) return;
    const t = setTimeout(() => onSearch(local), 250);
    return () => clearTimeout(t);
  }, [local, onSearch]);
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-center gap-2'>
        {onSearch !== undefined && (
          <div className='relative'>
            <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none' />
            <Input value={local} onChange={e => setLocal(e.target.value)} placeholder={placeholder}
              className='h-9 pl-8 pr-3 w-52 text-xs bg-input/40 border-border/70 rounded-lg' />
          </div>
        )}
        {filters.map(fd => (
          <div key={fd.key} className='flex flex-col'>
            {fd.labeled && <label className='text-3xs font-medium text-muted-foreground mb-0.5 px-0.5 uppercase tracking-wide'>{fd.label}</label>}
            <Select value={values?.[fd.key] ?? 'all'} onValueChange={v => onFilter?.(fd.key, v)}>
              <SelectTrigger aria-label={fd.label} className='h-9 text-xs bg-input/40 border-border/70 rounded-lg min-w-[120px]'>
                <SelectValue placeholder={!fd.labeled ? fd.label : undefined} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>Todos</SelectItem>
                {fd.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
        {hasActive && onClear && (
          <button type='button' onClick={onClear} className='h-9 px-3 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors'>
            Limpar filtros
          </button>
        )}
        <div className='ml-auto flex items-center gap-2'>
          {rightSlot}
          {onView && (
            <SegmentedToggle value={view ?? 'list'} onChange={onView}
              options={[{value:'list' as const,icon:AlignJustify,label:'Lista'},{value:'grid' as const,icon:LayoutGrid,label:'Grade'}]} />
          )}
        </div>
      </div>
    </div>
  );
}
