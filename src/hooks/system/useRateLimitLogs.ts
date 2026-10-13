import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVisiblePolling } from '@/hooks/realtime/useVisiblePolling';
import { escapeOrFilterValue } from '@/lib/postgrestFilters';

export interface RateLimitLog {
  id: string;
  ip_address: string;
  endpoint: string;
  user_id: string | null;
  request_count: number;
  blocked: boolean | null;
  user_agent: string | null;
  country: string | null;
  city: string | null;
  created_at: string;
}

export interface RateLimitStats {
  totalRequests: number;
  blockedRequests: number;
  uniqueIPs: number;
  topEndpoints: { endpoint: string; count: number }[];
  topIPs: { ip: string; count: number; blocked: boolean }[];
}

export type RateLimitSortKey =
  | 'created_at'
  | 'ip_address'
  | 'endpoint'
  | 'request_count'
  | 'blocked';
export type RateLimitSortDir = 'asc' | 'desc';

export interface RateLimitLogsFilters {
  /** Trecho de IP (busca parcial, sem diferenciar maiúsculas). */
  ip: string;
  /** Trecho do endpoint (busca parcial, sem diferenciar maiúsculas). */
  endpoint: string;
  /** Só requisições bloqueadas. */
  blockedOnly: boolean;
  sortBy: RateLimitSortKey;
  sortDir: RateLimitSortDir;
  /** Página 1-based pedida ao servidor via `range`. */
  page: number;
  pageSize: number;
}

export const DEFAULT_RATE_LIMIT_FILTERS: RateLimitLogsFilters = {
  ip: '',
  endpoint: '',
  blockedOnly: false,
  sortBy: 'created_at',
  sortDir: 'desc',
  page: 1,
  pageSize: 25,
};

/** Janela recente que alimenta os cartões de estatística (não é a listagem paginada). */
const STATS_WINDOW = 100;

function calculateStats(data: RateLimitLog[]): RateLimitStats {
  const totalRequests = data.reduce((sum, log) => sum + log.request_count, 0);
  const blockedRequests = data.filter(log => log.blocked).length;
  const uniqueIPs = new Set(data.map(log => log.ip_address)).size;

  const endpointCounts: Record<string, number> = {};
  data.forEach(log => {
    endpointCounts[log.endpoint] = (endpointCounts[log.endpoint] || 0) + log.request_count;
  });
  const topEndpoints = Object.entries(endpointCounts)
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const ipData: Record<string, { count: number; blocked: boolean }> = {};
  data.forEach(log => {
    if (!ipData[log.ip_address]) {
      ipData[log.ip_address] = { count: 0, blocked: false };
    }
    ipData[log.ip_address].count += log.request_count;
    if (log.blocked) ipData[log.ip_address].blocked = true;
  });
  const topIPs = Object.entries(ipData)
    .map(([ip, { count, blocked }]) => ({ ip, count, blocked }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { totalRequests, blockedRequests, uniqueIPs, topEndpoints, topIPs };
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  if (cause && typeof cause === 'object' && 'message' in cause) {
    const message = (cause as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return 'Não foi possível carregar os logs de rate limit.';
}

export function useRateLimitLogs(enabled = true) {
  const [filters, setFiltersState] = useState<RateLimitLogsFilters>(DEFAULT_RATE_LIMIT_FILTERS);
  const [logs, setLogs] = useState<RateLimitLog[]>([]);
  const [stats, setStats] = useState<RateLimitStats | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const setFilters = useCallback((patch: Partial<RateLimitLogsFilters>) => {
    setFiltersState(prev => {
      const next = { ...prev, ...patch };
      // Trocar filtro/ordem/tamanho de página volta para a página 1; só um patch
      // explícito de `page` mantém a página pedida pelo chamador.
      const changed =
        patch.ip !== undefined ||
        patch.endpoint !== undefined ||
        patch.blockedOnly !== undefined ||
        patch.pageSize !== undefined ||
        patch.sortBy !== undefined ||
        patch.sortDir !== undefined;
      if (patch.page === undefined && changed) next.page = 1;
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => setFiltersState(DEFAULT_RATE_LIMIT_FILTERS), []);

  // Listagem: filtro, ordem e recorte de página são resolvidos no SERVIDOR
  // (`range` + `count: 'exact'`), não cortando um lote fixo no cliente.
  const fetchPage = useCallback(async (signal: AbortSignal) => {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
    const page = Math.max(1, filters.page);
    const pageSize = Math.max(1, filters.pageSize);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const ascending = filters.sortDir === 'asc';

    try {
      let query = supabase.from('rate_limit_logs').select('*', { count: 'exact' });

      const ip = filters.ip.trim();
      const endpoint = filters.endpoint.trim();
      if (ip) query = query.ilike('ip_address', escapeOrFilterValue(`%${ip}%`));
      if (endpoint) query = query.ilike('endpoint', escapeOrFilterValue(`%${endpoint}%`));
      if (filters.blockedOnly) query = query.eq('blocked', true);

      // Ordem determinística com desempate por `id`: sem ele, duas linhas com o
      // mesmo `created_at` podem trocar de lugar entre páginas.
      query = query
        .order(filters.sortBy, { ascending })
        .order('id', { ascending })
        .range(from, to);

      const { data, count, error: queryError } = await query.abortSignal(requestSignal);

      // Resposta obsoleta (filtro trocado ou desmontagem): não sobrescreve o estado novo.
      if (requestSignal.aborted) return;
      if (queryError) throw queryError;

      setLogs(data ?? []);
      setTotal(count ?? 0);
      setError(null);
    } catch (cause) {
      if (signal.aborted) return;
      setError(errorMessage(cause));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [filters]);

  // Estatística: janela recente separada da listagem. O erro dela é deixado subir
  // para o `useVisiblePolling`, que mantém o último retrato bom; o erro que o
  // chamador vê é o da listagem (`fetchPage`).
  const fetchStats = useCallback(async (signal: AbortSignal) => {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
    const { data, error: queryError } = await supabase
      .from('rate_limit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(STATS_WINDOW)
      .abortSignal(requestSignal);

    if (requestSignal.aborted) return;
    if (queryError) throw queryError;
    setStats(calculateStats(data ?? []));
  }, []);

  const refresh = useCallback(async (signal: AbortSignal) => {
    await fetchPage(signal);
    if (signal.aborted) return;
    await fetchStats(signal);
  }, [fetchPage, fetchStats]);

  // Security logs intentionally are not in the Realtime publication.
  // Use the existing authenticated/RLS-protected read, not a new publication.
  // `refresh` muda de identidade quando o filtro muda: o poller rearma e busca de imediato.
  const refetch = useVisiblePolling(refresh, 30_000, enabled);

  const effectivePageSize = Math.max(1, filters.pageSize);
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

  return {
    logs,
    stats,
    total,
    totalPages,
    error,
    loading,
    filters,
    setFilters,
    resetFilters,
    refetch,
  };
}
