/**
 * useExternalDB — Generic hook for querying any table in the external CRM database
 * Uses externalSupabase client directly (secured by RLS policies on the external DB)
 */
 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { useState, useCallback } from 'react';
 import { getExternalSupabase, isExternalConfigured } from '@/integrations/supabase/externalClient';
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

// ─── Mutation (insert/update/delete via external client) ──────
export function useExternalMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      action: 'insert' | 'update' | 'delete';
      table: string;
      data?: Record<string, unknown> | Record<string, unknown>[];
      match?: Record<string, unknown>;
    }) => {
      if (params.action === 'insert') {
        const { data, error } = await getExternalSupabase().from(params.table).insert(params.data as any).select();
        if (error) throw new Error(error.message);
        return data;
      }
      if (params.action === 'update') {
        let q = getExternalSupabase().from(params.table).update(params.data as any);
        if (params.match) {
          for (const [k, v] of Object.entries(params.match)) q = q.eq(k, v as string);
        }
        const { data, error } = await q.select();
        if (error) throw new Error(error.message);
        return data;
      }
      if (params.action === 'delete') {
        let q = getExternalSupabase().from(params.table).delete();
        if (params.match) {
          for (const [k, v] of Object.entries(params.match)) q = q.eq(k, v as string);
        }
        const { data, error } = await q.select();
        if (error) throw new Error(error.message);
        return data;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['external-db', variables.table] });
    },
  });
}
