import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  appDayEnd,
  appDayEndOfLocalDate,
  appDayKey,
  appDayStart,
  appDayStartOfLocalDate,
  appMonthEnd,
  appMonthStart,
  appWeekEnd,
  appWeekStart,
} from '@/lib/localDay';
import type { DashboardFiltersState } from '@/components/dashboard/dashboardFilterDefaults';

/**
 * E35: persiste os filtros do dashboard (período/fila/agente) na URL
 * (?period=&queue=&agent=&from=&to=) — F5 ou compartilhar o link não perde o
 * filtro selecionado. Mesmo padrão de useUrlFilters/useInboxFilters (Inbox),
 * mas em hook dedicado: o dashboard tem campos próprios (period, queueId) que
 * useUrlFilters não modela, e um hook isolado evita tocar no hook
 * compartilhado do Inbox por um módulo concorrente (diff mínimo).
 */
const PARAM_KEYS = {
  period: 'period',
  queue: 'queue',
  agent: 'agent',
  from: 'from',
  to: 'to',
} as const;

function rangeForPeriod(period: DashboardFiltersState['period']): { from: Date; to: Date } {
  const now = new Date();
  switch (period) {
    case 'yesterday':
      return { from: appDayStart(1, now), to: appDayEnd(1, now) };
    case 'week':
      return { from: appWeekStart(now), to: appWeekEnd(now) };
    case 'month':
      return { from: appMonthStart(now), to: appMonthEnd(now) };
    case 'today':
    default:
      return { from: appDayStart(0, now), to: appDayEnd(0, now) };
  }
}

function isValidPeriod(value: string | null): value is DashboardFiltersState['period'] {
  return value === 'today' || value === 'yesterday' || value === 'week' || value === 'month' || value === 'custom';
}

// Parseia uma string 'YYYY-MM-DD' (date-only) como data LOCAL. `new Date(str)`
// trata date-only ISO como meia-noite UTC, o que desloca o dia em -1 em
// fusos negativos (America/Sao_Paulo) ao combinar com startOfDay/endOfDay
// (que operam em hora local) — daí o off-by-one no filtro de período custom.
function parseDateOnlyLocal(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function useDashboardUrlFilters(): [DashboardFiltersState, (filters: DashboardFiltersState) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<DashboardFiltersState>(() => {
    const periodParam = searchParams.get(PARAM_KEYS.period);
    const period: DashboardFiltersState['period'] = isValidPeriod(periodParam) ? periodParam : 'today';
    const queueId = searchParams.get(PARAM_KEYS.queue);
    const agentId = searchParams.get(PARAM_KEYS.agent);

    if (period === 'custom') {
      const fromParam = searchParams.get(PARAM_KEYS.from);
      const toParam = searchParams.get(PARAM_KEYS.to);
      const from = fromParam ? parseDateOnlyLocal(fromParam) : null;
      const to = toParam ? parseDateOnlyLocal(toParam) : null;
      if (from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
        return { period, dateRange: { from: appDayStartOfLocalDate(from), to: appDayEndOfLocalDate(to) }, queueId, agentId };
      }
      // custom sem from/to válidos na URL (link incompleto/editado à mão) — cai para hoje.
      return { period: 'today', dateRange: rangeForPeriod('today'), queueId, agentId };
    }

    return { period, dateRange: rangeForPeriod(period), queueId, agentId };
  }, [searchParams]);

  const setFilters = useCallback((next: DashboardFiltersState) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set(PARAM_KEYS.period, next.period);

      if (next.queueId) params.set(PARAM_KEYS.queue, next.queueId);
      else params.delete(PARAM_KEYS.queue);

      if (next.agentId) params.set(PARAM_KEYS.agent, next.agentId);
      else params.delete(PARAM_KEYS.agent);

      if (next.period === 'custom') {
        params.set(PARAM_KEYS.from, appDayKey(next.dateRange.from));
        params.set(PARAM_KEYS.to, appDayKey(next.dateRange.to));
      } else {
        params.delete(PARAM_KEYS.from);
        params.delete(PARAM_KEYS.to);
      }

      return params;
    }, { replace: true });
  }, [setSearchParams]);

  return [filters, setFilters];
}
