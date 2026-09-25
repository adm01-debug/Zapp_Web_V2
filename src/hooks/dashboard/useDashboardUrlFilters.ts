import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DashboardFiltersState } from '@/components/dashboard/DashboardFilters';

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
      return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
    case 'week':
      return { from: startOfWeek(now, { locale: ptBR }), to: endOfWeek(now, { locale: ptBR }) };
    case 'month':
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'today':
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

function isValidPeriod(value: string | null): value is DashboardFiltersState['period'] {
  return value === 'today' || value === 'yesterday' || value === 'week' || value === 'month' || value === 'custom';
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
      const from = fromParam ? new Date(fromParam) : null;
      const to = toParam ? new Date(toParam) : null;
      if (from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
        return { period, dateRange: { from: startOfDay(from), to: endOfDay(to) }, queueId, agentId };
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
        params.set(PARAM_KEYS.from, next.dateRange.from.toISOString().split('T')[0]);
        params.set(PARAM_KEYS.to, next.dateRange.to.toISOString().split('T')[0]);
      } else {
        params.delete(PARAM_KEYS.from);
        params.delete(PARAM_KEYS.to);
      }

      return params;
    }, { replace: true });
  }, [setSearchParams]);

  return [filters, setFilters];
}
