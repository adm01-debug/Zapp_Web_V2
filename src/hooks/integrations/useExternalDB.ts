/**
 * useExternalDB — Generic hook for querying any table in the external CRM database
 * Uses the authenticated crm-integration Edge Function. External credentials and
 * privileged table access never reach the browser.
 */
 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { useState, useCallback } from 'react';
 import { isExternalConfigured } from '@/integrations/supabase/externalClient';
 import { callCRMIntegration } from '@/lib/crmIntegration';
 import { ExternalCRMService } from '@/services/crm/external-crm.service';
import type {
  ExternalDBFilter,
  ExternalDBOrder,
  ExternalDBQueryResult,
  ExternalTableName,
} from '@/types/externalDB';

// ─── Select query hook ────────────────────────────────────────
interface UseExternalSelectOptions<T> {
  table: ExternalTableName | string;
  select?: string;
  filters?: ExternalDBFilter[];
  order?: ExternalDBOrder;
  limit?: number;
  offset?: number;
  countMode?: 'exact' | 'planned' | 'estimated';
  enabled?: boolean;
  staleTime?: number;
}

export function useExternalSelect<T = Record<string, unknown>>(options: UseExternalSelectOptions<T>) {
  const { table, select, filters, order, limit = 50, offset = 0, countMode, enabled = true, staleTime = 5 * 60 * 1000 } = options;

  return useQuery({
    queryKey: ['external-db', table, { select, filters, order, limit, offset, countMode }],
     queryFn: () => ExternalCRMService.queryExternal<T>({
       table,
       select,
       filters,
       order,
       limit,
       offset,
       countMode,
     }),
    enabled: enabled && isExternalConfigured,
    staleTime,
    gcTime: staleTime * 2,
  });
}

// ─── RPC call hook ────────────────────────────────────────────
interface UseExternalRPCOptions {
  rpc: string;
  params?: Record<string, unknown>;
  enabled?: boolean;
  staleTime?: number;
}

export function useExternalRPC<T = unknown>(options: UseExternalRPCOptions) {
  return useQuery({
    queryKey: ['external-db', 'rpc', options.rpc, options.params],
     queryFn: () => ExternalCRMService.callRPC<T>(options.rpc, options.params),
    enabled: (options.enabled ?? true) && isExternalConfigured,
    staleTime: options.staleTime ?? 10 * 60 * 1000,
  });
}

// ─── Paginated table browser ──────────────────────────────────
export function useExternalTableBrowser<T = Record<string, unknown>>(tableName: ExternalTableName | string) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState<ExternalDBFilter[]>([]);
  const [order, setOrder] = useState<ExternalDBOrder | undefined>();
  const [searchTerm, setSearchTerm] = useState('');

  const query = useExternalSelect<T>({
    table: tableName,
    filters,
    order,
    limit: pageSize,
    offset: page * pageSize,
    countMode: 'exact',
    staleTime: 2 * 60 * 1000,
  });

  const nextPage = useCallback(() => setPage(p => p + 1), []);
  const prevPage = useCallback(() => setPage(p => Math.max(0, p - 1)), []);
  const goToPage = useCallback((p: number) => setPage(p), []);

  const addFilter = useCallback((filter: ExternalDBFilter) => {
    setFilters(prev => [...prev, filter]);
    setPage(0);
  }, []);

  const removeFilter = useCallback((index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index));
    setPage(0);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters([]);
    setPage(0);
  }, []);

  const setSort = useCallback((column: string, ascending = true) => {
    setOrder({ column, ascending });
    setPage(0);
  }, []);

  return {
    data: query.data?.data || [],
    totalRecords: query.data?.meta?.record_count ?? 0,
    duration: query.data?.meta?.duration_ms ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message || null,
    page,
    pageSize,
    filters,
    order,
    searchTerm,
    setSearchTerm,
    setPageSize: (size: number) => { setPageSize(size); setPage(0); },
    nextPage,
    prevPage,
    goToPage,
    addFilter,
    removeFilter,
    clearFilters,
    setSort,
    refetch: query.refetch,
  };
}

// ─── Mutation via authenticated server-side integration ──────
export function useExternalMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      action: 'insert' | 'update';
      table: string;
      data: Record<string, unknown>;
      match?: Record<string, unknown>;
    }) => {
      const response = await callCRMIntegration<unknown[]>('mutate', {
        mutationAction: params.action,
        table: params.table,
        data: params.data,
        match: params.match,
      });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['external-db', variables.table] });
    },
  });
}
