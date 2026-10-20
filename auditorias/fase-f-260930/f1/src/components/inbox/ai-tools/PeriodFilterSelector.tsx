import { useState, useMemo, useCallback } from 'react';
import { format, startOfDay as fnsStartOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { CalendarDays, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// ── Shared types & constants ──

export type AnalysisPeriod = 'all' | 'last_interaction' | 'today' | '3d' | '7d' | '14d' | '30d' | '90d' | 'custom';

export interface PeriodMessage {
  id: string;
  created_at: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_GAP_MS = 4 * 60 * 60 * 1000;

const PERIOD_PRESETS: { key: AnalysisPeriod; label: string }[] = [
  { key: 'all', label: 'Qualquer data' },
  { key: 'last_interaction', label: 'Última interação' },
  { key: 'today', label: 'Hoje' },
  { key: '3d', label: 'Últimos 3 dias' },
  { key: '7d', label: 'Últimos 7 dias' },
  { key: '14d', label: 'Últimos 14 dias' },
  { key: '30d', label: 'Últimos 30 dias' },
  { key: '90d', label: 'Últimos 90 dias' },
];

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

// ── Shared utility functions ──

function startOfDay(date: Date): Date {
  return fnsStartOfDay(date);
}

export function getLastConversationStart<T extends PeriodMessage>(messages: T[]): Date | null {
  if (messages.length === 0) return null;
  const sorted = [...messages].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  let sessionStart = new Date(sorted[0].created_at);
  for (let i = 1; i < sorted.length; i++) {
    const newer = new Date(sorted[i - 1].created_at).getTime();
    const older = new Date(sorted[i].created_at).getTime();
    if (newer - older > SESSION_GAP_MS) break;
    sessionStart = new Date(sorted[i].created_at);
  }
  return sessionStart;
}

export function filterMessagesByPeriod<T extends PeriodMessage>(
  messages: T[],
  period: AnalysisPeriod,
  customFrom?: Date | null,
  customTo?: Date | null
): T[] {
  if (period === 'all') return messages;

  if (period === 'custom') {
    if (!customFrom && !customTo) return messages;
    return messages.filter((m) => {
      const d = new Date(m.created_at);
      if (customFrom && d < startOfDay(customFrom)) return false;
      if (customTo) {
        const endOfTo = new Date(startOfDay(customTo).getTime() + DAY_MS - 1);
        if (d > endOfTo) return false;
      }
      return true;
    });
  }

  if (period === 'last_interaction') {
    const sessionStart = getLastConversationStart(messages);
    if (!sessionStart) return [];
    return messages.filter((m) => new Date(m.created_at) >= sessionStart);
  }

  const now = new Date();
  const dayMap: Record<string, number> = { today: 0, '3d': 3, '7d': 7, '14d': 14, '30d': 30, '90d': 90 };
  const days = dayMap[period];
  if (days !== undefined) {
    const cutoff = days === 0 ? startOfDay(now) : startOfDay(new Date(now.getTime() - days * DAY_MS));
    return messages.filter((m) => new Date(m.created_at) >= cutoff);
  }

  return messages;
}

export function getPeriodDays(period: AnalysisPeriod): number | null {
  const map: Record<string, number> = { today: 1, '3d': 3, '7d': 7, '14d': 14, '30d': 30, '90d': 90 };
  return map[period] ?? null;
}

// ── Hook for period filter state ──

export function usePeriodFilter<T extends PeriodMessage>(messages: T[], defaultPeriod: AnalysisPeriod = '7d') {
  const [analysisPeriod, setAnalysisPeriod] = useState<AnalysisPeriod>(defaultPeriod);
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>(undefined);
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>(undefined);

  const filteredMessages = useMemo(
    () => filterMessagesByPeriod(messages, analysisPeriod, customDateFrom, customDateTo),
    [messages, analysisPeriod, customDateFrom, customDateTo]
  );

  const handlePeriodChange = useCallback((period: AnalysisPeriod) => {
    setAnalysisPeriod(period);
    if (period !== 'custom') {
      setCustomDateFrom(undefined);
      setCustomDateTo(undefined);
    }
  }, []);

  const handleCustomFromChange = useCallback((date: Date | undefined) => setCustomDateFrom(date), []);
  const handleCustomToChange = useCallback((date: Date | undefined) => setCustomDateTo(date), []);
  const clearCustomDates = useCallback(() => { setCustomDateFrom(undefined); setCustomDateTo(undefined); }, []);

  return {
    analysisPeriod,
    setAnalysisPeriod: handlePeriodChange,
    customDateFrom,
    customDateTo,
    setCustomDateFrom: handleCustomFromChange,
    setCustomDateTo: handleCustomToChange,
    clearCustomDates,
    filteredMessages,
  };
}

// ── Trigger label helper ──

function PeriodLabel({ period, from, to }: { period: AnalysisPeriod; from?: Date; to?: Date }) {
  if (period === 'custom' && from) {
    const fromStr = format(from, 'dd/MM/yy');
    const toStr = to ? format(to, 'dd/MM/yy') : 'agora';
    return <span>{fromStr} — {toStr}</span>;
  }
  const found = PERIOD_PRESETS.find((p) => p.key === period);
  return <span>{found?.label ?? 'Data'}</span>;
}

// ── Premium UI Component (Popover identical to ChatSearchBar) ──

interface PeriodFilterSelectorProps {
  period: AnalysisPeriod;
  onPeriodChange: (period: AnalysisPeriod) => void;
  customFrom?: Date;
  customTo?: Date;
  onCustomFromChange: (date: Date | undefined) => void;
  onCustomToChange: (date: Date | undefined) => void;
  onClearCustom: () => void;
  filteredCount: number;
  totalCount: number;
}

export function PeriodFilterSelector({
  period,
  onPeriodChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  onClearCustom,
  filteredCount,
  totalCount,
}: PeriodFilterSelectorProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const hasFilter = period !== 'all';

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-1.5 w-full justify-center whitespace-nowrap text-xs px-3 py-2 rounded-xl font-medium transition-all duration-150 select-none',
            hasFilter
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
              : 'bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60'
          )}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          <PeriodLabel period={period} from={customFrom} to={customTo} />
          <span className={cn(
            'ml-1 px-1.5 py-0.5 rounded-full text-3xs font-bold tabular-nums',
            hasFilter ? 'bg-primary-foreground/20' : 'bg-foreground/10'
          )}>
            {filteredCount}{totalCount !== filteredCount ? `/${totalCount}` : ''}
          </span>
          {hasFilter && (
            <span
              role="button"
              className="ml-0.5 p-0.5 rounded-full hover:bg-primary-foreground/20"
              onClick={(e) => {
                e.stopPropagation();
                onPeriodChange('all');
                onClearCustom();
              }}
              aria-label="Remover filtro de data"
            >
              <X className="w-3 h-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto scale-[0.7] origin-top-left" align="start" side="bottom" sideOffset={4}>
        <div className="flex min-h-[340px]">
          {/* Presets column */}
          <div className="w-[160px] border-r border-border bg-muted/30 p-2 flex flex-col gap-0.5">
            <p className="text-3xs text-muted-foreground font-semibold px-2.5 pt-1 pb-2 uppercase tracking-widest">Atalhos</p>
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.key}
                className={cn(
                  'w-full text-left text-[13px] px-2.5 py-2 rounded-lg transition-all duration-150 font-medium',
                  period === p.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                )}
                onClick={() => {
                  onPeriodChange(p.key);
                  onClearCustom();
                  setPopoverOpen(false);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom calendar area */}
          <div className="p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <p className="text-2xs text-muted-foreground font-semibold uppercase tracking-widest">Período personalizado</p>
              {(customFrom || customTo) && (
                <button
                  className="text-3xs text-destructive hover:underline font-medium"
                  onClick={() => {
                    onClearCustom();
                    onPeriodChange('all');
                  }}
                >
                  Limpar datas
                </button>
              )}
            </div>
            <div className="flex gap-6">
              <div className="space-y-1.5">
                <span className="text-2xs text-muted-foreground font-semibold px-0.5 uppercase tracking-wide">De</span>
                <CalendarComponent
                  mode="single"
                  selected={customFrom}
                  onSelect={(day) => {
                    onCustomFromChange(day);
                    onPeriodChange('custom');
                    if (day && customTo) setPopoverOpen(false);
                  }}
                  disabled={(date) => date > new Date()}
                  locale={ptBR}
                  className="rounded-lg border border-border/60 p-2.5 pointer-events-auto bg-background"
                  classNames={calendarClassNames}
                />
              </div>
              <div className="space-y-1.5">
                <span className="text-2xs text-muted-foreground font-semibold px-0.5 uppercase tracking-wide">Até</span>
                <CalendarComponent
                  mode="single"
                  selected={customTo}
                  onSelect={(day) => {
                    onCustomToChange(day);
                    onPeriodChange('custom');
                    if (customFrom && day) setPopoverOpen(false);
                  }}
                  disabled={(date) => date > new Date() || (customFrom ? date < customFrom : false)}
                  locale={ptBR}
                  className="rounded-lg border border-border/60 p-2.5 pointer-events-auto bg-background"
                  classNames={calendarClassNames}
                />
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
