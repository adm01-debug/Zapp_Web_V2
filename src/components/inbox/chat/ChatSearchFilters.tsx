import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search, CalendarDays, X } from 'lucide-react';
import type { SearchFilter, DatePreset } from '@/hooks/chat/useChatSearch';

const FILTERS: { key: SearchFilter; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: 'Todos', icon: <Search className="w-3.5 h-3.5" /> },
  { key: 'text', label: 'Textos', icon: <Search className="w-3.5 h-3.5" /> },
  { key: 'image', label: 'Imagens', icon: <Search className="w-3.5 h-3.5" /> },
  { key: 'video', label: 'Vídeos', icon: <Search className="w-3.5 h-3.5" /> },
  { key: 'audio', label: 'Áudios', icon: <Search className="w-3.5 h-3.5" /> },
  { key: 'document', label: 'Documentos', icon: <Search className="w-3.5 h-3.5" /> },
  { key: 'link', label: 'Links', icon: <Search className="w-3.5 h-3.5" /> },
];

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'Qualquer data' },
  { key: 'last_interaction', label: 'Última interação' },
  { key: 'today', label: 'Hoje' },
  { key: '3d', label: 'Últimos 3 dias' },
  { key: '7d', label: 'Últimos 7 dias' },
  { key: '14d', label: 'Últimos 14 dias' },
  { key: '30d', label: 'Últimos 30 dias' },
  { key: '90d', label: 'Últimos 90 dias' },
  { key: 'custom', label: 'Personalizado' },
];

function DatePresetLabel({ preset, from, to }: { preset: DatePreset; from: Date | null; to: Date | null }) {
  if (preset === 'custom' && from) {
    return <span>{format(from, 'dd/MM/yy')} — {to ? format(to, 'dd/MM/yy') : 'agora'}</span>;
  }
  return <span>{DATE_PRESETS.find((p) => p.key === preset)?.label ?? 'Data'}</span>;
}

interface ChatSearchFiltersProps {
  filter: SearchFilter;
  setFilter: (f: SearchFilter) => void;
  filterCounts: Record<SearchFilter, number>;
  debouncedQuery: string;
  hasDateFilter: boolean;
  datePreset: DatePreset;
  setDatePreset: (p: DatePreset) => void;
  customDateFrom: Date | null;
  setCustomDateFrom: (d: Date | null) => void;
  customDateTo: Date | null;
  setCustomDateTo: (d: Date | null) => void;
}

export function ChatSearchFilters({
  filter, setFilter, filterCounts, debouncedQuery, hasDateFilter,
  datePreset, setDatePreset, customDateFrom, setCustomDateFrom, customDateTo, setCustomDateTo,
}: ChatSearchFiltersProps) {
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  const calendarClassNames = {
    day_selected: 'bg-primary text-primary-foreground hover:bg-primary',
    day_today: 'bg-accent text-accent-foreground font-bold',
    head_cell: 'text-3xs font-semibold text-muted-foreground w-9',
    cell: 'h-9 w-9 text-center text-sm p-0',
    day: 'h-9 w-9 p-0 text-sm font-normal',
    caption_label: 'text-sm font-bold',
    nav_button: 'h-7 w-7 bg-transparent opacity-60 hover:opacity-100',
    table: 'w-full border-collapse',
    head_row: 'flex',
    row: 'flex w-full mt-1',
  };

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1" role="tablist">
      {FILTERS.map((f) => {
        const isActive = filter === f.key;
        const count = filterCounts[f.key];
        const showCount = (debouncedQuery.trim() || f.key !== 'all' || hasDateFilter) && count > 0;
        return (
          <button key={f.key} role="tab" aria-selected={isActive} tabIndex={0}
            className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-xs px-3 py-1.5 rounded-lg font-medium transition-all duration-150 shrink-0 select-none',
              isActive ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25' : 'bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
            onClick={() => setFilter(f.key)}
          >
            {f.icon}<span>{f.label}</span>
            {showCount && (
              <span className={cn("min-w-[18px] h-[18px] flex items-center justify-center rounded-md text-3xs font-bold leading-none",
                isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-foreground"
              )}>{count}</span>
            )}
          </button>
        );
      })}

      <div className="w-px h-4 bg-border shrink-0 mx-0.5" />
      <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
        <PopoverTrigger asChild>
          <button className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-xs px-3 py-1.5 rounded-lg font-medium transition-all duration-150 shrink-0 select-none',
            hasDateFilter ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25' : 'bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground'
          )}>
            <CalendarDays className="w-3.5 h-3.5" />
            <DatePresetLabel preset={datePreset} from={customDateFrom} to={customDateTo} />
            {hasDateFilter && (
              <span role="button" className="ml-0.5 p-0.5 rounded-full hover:bg-primary-foreground/20"
                onClick={(e) => { e.stopPropagation(); setDatePreset('all'); setCustomDateFrom(null); setCustomDateTo(null); }}
              ><X className="w-3 h-3" /></span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 pointer-events-auto" align="start" side="bottom" sideOffset={8}>
          <div className="flex min-h-[340px]">
            <div className="w-[160px] border-r border-border bg-muted/30 p-2 flex flex-col gap-0.5">
              <p className="text-3xs text-muted-foreground font-semibold px-2.5 pt-1 pb-2 uppercase tracking-widest">Atalhos</p>
              {DATE_PRESETS.filter((p) => p.key !== 'custom').map((p) => (
                <button key={p.key} className={cn('w-full text-left text-[13px] px-2.5 py-2 rounded-lg transition-all duration-150 font-medium',
                  datePreset === p.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                )} onClick={() => { setDatePreset(p.key); setCustomDateFrom(null); setCustomDateTo(null); if (p.key !== 'custom') setDatePopoverOpen(false); }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="p-4 flex flex-col">
              <p className="text-2xs text-muted-foreground font-semibold mb-3 uppercase tracking-widest">Período personalizado</p>
              <div className="flex gap-6">
                <div className="space-y-1.5">
                  <span className="text-2xs text-muted-foreground font-semibold uppercase tracking-wide">De</span>
                  <Calendar mode="single" selected={customDateFrom ?? undefined} onSelect={(day) => { setCustomDateFrom(day ?? null); setDatePreset('custom'); }}
                    disabled={(date) => date > new Date()} locale={ptBR} className="rounded-lg border border-border/60 p-2.5 pointer-events-auto bg-background" classNames={calendarClassNames} />
                </div>
                <div className="space-y-1.5">
                  <span className="text-2xs text-muted-foreground font-semibold uppercase tracking-wide">Até</span>
                  <Calendar mode="single" selected={customDateTo ?? undefined} onSelect={(day) => { setCustomDateTo(day ?? null); setDatePreset('custom'); }}
                    disabled={(date) => date > new Date() || (customDateFrom ? date < customDateFrom : false)} locale={ptBR} className="rounded-lg border border-border/60 p-2.5 pointer-events-auto bg-background" classNames={calendarClassNames} />
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
