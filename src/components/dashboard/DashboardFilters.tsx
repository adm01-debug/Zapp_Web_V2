import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Calendar as CalendarIcon,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  appDayEnd,
  appDayEndOfLocalDate,
  appDayKey,
  appDayKeyLabel,
  appDayStart,
  appDayStartOfLocalDate,
  appMonthEnd,
  appMonthStart,
  appWeekEnd,
  appWeekStart,
  parseDayKey,
} from '@/lib/localDay';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useQueues } from '@/hooks/business/useQueues';
import { useAgents } from '@/hooks/crm/useAgents';
import type { DashboardFiltersState } from './dashboardFilterDefaults';

interface DashboardFiltersProps {
  filters: DashboardFiltersState;
  onFiltersChange: (filters: DashboardFiltersState) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /** false para agent/special_agent: dashboard ja e pessoal, filtro por fila/agente nao se aplica. */
  showTeamFilters?: boolean;
}

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'week', label: 'Esta Semana' },
  { value: 'month', label: 'Este Mês' },
  { value: 'custom', label: 'Personalizado' },
] as const;

export function DashboardFilters({ 
  filters, 
  onFiltersChange, 
  onRefresh,
  isRefreshing,
  showTeamFilters = true,
}: DashboardFiltersProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const { queues } = useQueues();
  const { agents } = useAgents();

  const handlePeriodChange = (period: DashboardFiltersState['period']) => {
    const now = new Date();
    let from: Date;
    let to: Date;

    switch (period) {
      case 'today':
        from = appDayStart(0, now);
        to = appDayEnd(0, now);
        break;
      case 'yesterday':
        from = appDayStart(1, now);
        to = appDayEnd(1, now);
        break;
      case 'week':
        from = appWeekStart(now);
        to = appWeekEnd(now);
        break;
      case 'month':
        from = appMonthStart(now);
        to = appMonthEnd(now);
        break;
      case 'custom':
        return; // Don't change dates for custom
      default:
        from = appDayStart(0, now);
        to = appDayEnd(0, now);
    }

    onFiltersChange({
      ...filters,
      period,
      dateRange: { from, to },
    });
  };

  const handleDateRangeChange = (range: { from?: Date; to?: Date }) => {
    if (range.from && range.to) {
      onFiltersChange({
        ...filters,
        period: 'custom',
        dateRange: {
          from: appDayStartOfLocalDate(range.from),
          to: appDayEndOfLocalDate(range.to),
        },
      });
      setIsCalendarOpen(false);
    } else if (range.from) {
      onFiltersChange({
        ...filters,
        period: 'custom',
        dateRange: {
          ...filters.dateRange,
          from: appDayStartOfLocalDate(range.from),
        },
      });
    }
  };

  const handleQueueChange = (queueId: string) => {
    onFiltersChange({
      ...filters,
      queueId: queueId === 'all' ? null : queueId,
    });
  };

  const handleAgentChange = (agentId: string) => {
    onFiltersChange({
      ...filters,
      agentId: agentId === 'all' ? null : agentId,
    });
  };

  const periodLabel = PERIOD_OPTIONS.find(o => o.value === filters.period)?.label ?? 'Personalizado';
  // O rótulo segue o dia de calendário do recorte (fuso do app), não o fuso do processo: com o
  // recorte de hoje ancorado em America/Sao_Paulo, `isSameDay` no fuso do processo diria que
  // início e fim estão em dias diferentes e imprimiria o rótulo de intervalo.
  const diaInicial = appDayKey(filters.dateRange.from);
  const diaFinal = appDayKey(filters.dateRange.to);
  const primeiroDia = parseDayKey(diaInicial) ?? filters.dateRange.from;
  const ultimoDia = parseDayKey(diaFinal) ?? filters.dateRange.to;
  const rangeLabel = diaInicial === diaFinal
    ? format(primeiroDia, "EEE, dd 'de' MMM 'de' yyyy", { locale: ptBR })
    : `${appDayKeyLabel(diaInicial)} – ${format(ultimoDia, 'dd/MM/yyyy', { locale: ptBR })}`;

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {/* Período */}
      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="filter-period"
            className="h-[34px] w-full md:w-[167px] rounded-lg bg-input border border-border px-3 flex items-center gap-2 text-left hover:border-border/80 transition-colors shrink-0"
          >
            <CalendarIcon className="w-4 h-4 text-foreground-secondary shrink-0" />
            <span className="flex flex-col leading-tight min-w-0">
              <span className="text-xs font-semibold text-foreground truncate">{periodLabel}</span>
              <span className="text-2xs text-muted-foreground truncate">{rangeLabel}</span>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-1 w-40">
            {PERIOD_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  handlePeriodChange(option.value);
                  if (option.value !== 'custom') setIsCalendarOpen(false);
                }}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded-md text-[13px] transition-colors',
                  filters.period === option.value ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-muted/60 text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {filters.period === 'custom' && (
            <div className="border-t border-border">
              <Calendar
                mode="range"
                selected={{
                  from: filters.dateRange.from,
                  to: filters.dateRange.to,
                }}
                onSelect={(range) => handleDateRangeChange(range || {})}
                numberOfMonths={2}
                locale={ptBR}
              />
            </div>
          )}
        </PopoverContent>
      </Popover>

      {showTeamFilters && (
        <>
        {/* Fila */}
        <Select value={filters.queueId || 'all'} onValueChange={handleQueueChange}>
          <SelectTrigger data-testid="filter-queue" className="h-[34px] w-[135px] rounded-lg bg-input border-border text-[13px] font-medium shrink-0">
            <SelectValue placeholder="Todas as filas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as filas</SelectItem>
            {queues?.map(queue => (
              <SelectItem key={queue.id} value={queue.id}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: queue.color }}
                  />
                  {queue.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Agente */}
        <Select value={filters.agentId || 'all'} onValueChange={handleAgentChange}>
          <SelectTrigger data-testid="filter-agent" className="h-[34px] w-[158px] rounded-lg bg-input border-border text-[13px] font-medium shrink-0">
            <SelectValue placeholder="Todos os agentes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os agentes</SelectItem>
            {agents?.map(agent => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>


        </>
      )}

      {/* Atualizar */}
      {onRefresh && (
        <motion.button
          type="button"
          data-testid="filter-refresh"
          whileTap={{ scale: 0.98 }}
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Atualizar"
          className="h-[34px] w-[38px] rounded-lg bg-primary/25 border border-primary/40 text-primary flex items-center justify-center shrink-0 disabled:opacity-60"
        >
          <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
        </motion.button>
      )}
    </div>
  );
}
