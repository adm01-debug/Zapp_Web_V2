/**
 * useAdvancedContactSearch
 * 
 * Calls search_contacts_advanced on the external CRM database.
 * Supports text search, multi-filter, sorting and pagination.
 * Filter options (vendedores, ramos, etc.) are cached from page 0.
 */
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useState, useCallback, useMemo } from 'react';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import { callCRMIntegration } from '@/lib/crmIntegration';
import { log } from '@/lib/logger';
import type {
  SearchContactsParams,
  SearchContactsResponse,
  SearchFiltersOptions,
} from '@/types/contactSearch';

const DEFAULT_PAGE_SIZE = 25;

export function normalizeSearchFilterValue<T extends string | number | boolean | undefined>(value: T): T | undefined {
  return value === '' ? undefined : value;
}

export function useAdvancedContactSearch(authorized = false) {
  const crmEnabled = useCRMIntegrationEnabled();
  const [params, setParams] = useState<SearchContactsParams>({
    page: 0,
    page_size: DEFAULT_PAGE_SIZE,
    sort_by: 'relevance',
  });

  // Cache filter options from first successful fetch
  const [cachedFilters, setCachedFilters] = useState<SearchFiltersOptions | null>(null);

  const hasActiveFilters = Boolean(
    params.search || params.vendedor || params.ramo || params.rfm_segment ||
    params.estado || params.cliente_ativado !== undefined || params.ja_comprou !== undefined
  );

  const query = useQuery<SearchContactsResponse | null>({
    queryKey: ['advanced-contact-search', params],
    queryFn: async () => {
      try {
        const { data } = await callCRMIntegration<SearchContactsResponse>('rpc', {
          rpc: 'search_contacts_advanced',
          params: {
            p_search: params.search || null, p_vendedor: params.vendedor || null,
            p_ramo: params.ramo || null, p_rfm_segment: params.rfm_segment || null,
            p_estado: params.estado || null, p_cliente_ativado: params.cliente_ativado ?? null,
            p_ja_comprou: params.ja_comprou ?? null, p_sort_by: params.sort_by || 'relevance',
            p_page: params.page || 0, p_page_size: params.page_size || DEFAULT_PAGE_SIZE,
          },
        });
        if (data?.filters) setCachedFilters(data.filters);
        return data;
      } catch (error) {
        log.error('Advanced search error:', error);
        return null;
      }
    },
    enabled: authorized && crmEnabled && hasActiveFilters,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 2, // 2 min
    gcTime: 1000 * 60 * 10,
  });

  // Actions
  const setSearch = useCallback((search: string) => {
    setParams((prev) => ({ ...prev, search: search || undefined, page: 0 }));
  }, []);

  const setFilter = useCallback((key: keyof SearchContactsParams, value: string | number | boolean | undefined) => {
    setParams((prev) => ({ ...prev, [key]: normalizeSearchFilterValue(value), page: 0 }));
  }, []);

  const setSortBy = useCallback((sort_by: SearchContactsParams['sort_by']) => {
    setParams((prev) => ({ ...prev, sort_by, page: 0 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setParams((prev) => ({ ...prev, page }));
  }, []);

  const clearFilters = useCallback(() => {
    setParams({ page: 0, page_size: DEFAULT_PAGE_SIZE, sort_by: 'relevance' });
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (params.vendedor) count++;
    if (params.ramo) count++;
    if (params.rfm_segment) count++;
    if (params.estado) count++;
    if (params.cliente_ativado !== undefined) count++;
    if (params.ja_comprou !== undefined) count++;
    return count;
  }, [params]);

  return {
    // Data
    results: query.data?.results || [],
    total: query.data?.total || 0,
    totalPages: query.data?.total_pages || 0,
    currentPage: params.page || 0,
    filters: cachedFilters,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    hasActiveFilters,
    activeFilterCount,
    params,

    // Actions
    setSearch,
    setFilter,
    setSortBy,
    setPage,
    clearFilters,

    // Config
    isConfigured: crmEnabled,
  };
}
