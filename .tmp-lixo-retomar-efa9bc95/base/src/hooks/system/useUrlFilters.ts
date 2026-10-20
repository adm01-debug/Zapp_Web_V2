import { useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Hook to persist and sync filters with URL search params
 * Enables sharing filtered views via URL and restores filters on navigation
 */

export interface UrlFiltersState {
  status: string[];
  tags: string[];
  agentId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  search: string;
}

const PARAM_KEYS = {
  status: 'status',
  tags: 'tags',
  agentId: 'agent',
  dateFrom: 'from',
  dateTo: 'to',
  search: 'q',
} as const;

export function useUrlFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse filters from URL
  const filters = useMemo<UrlFiltersState>(() => {
    const statusParam = searchParams.get(PARAM_KEYS.status);
    const tagsParam = searchParams.get(PARAM_KEYS.tags);

    return {
      status: statusParam ? statusParam.split(',').filter(Boolean) : [],
      tags: tagsParam ? tagsParam.split(',').filter(Boolean) : [],
      agentId: searchParams.get(PARAM_KEYS.agentId),
      dateFrom: searchParams.get(PARAM_KEYS.dateFrom),
      dateTo: searchParams.get(PARAM_KEYS.dateTo),
      search: searchParams.get(PARAM_KEYS.search) || '',
    };
  }, [searchParams]);

  // Update URL with new filters
  const setFilters = useCallback((newFilters: Partial<UrlFiltersState>) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);

      // Handle status array
      if (newFilters.status !== undefined) {
        if (newFilters.status.length > 0) {
          params.set(PARAM_KEYS.status, newFilters.status.join(','));
        } else {
          params.delete(PARAM_KEYS.status);
        }
      }

      // Handle tags array
      if (newFilters.tags !== undefined) {
        if (newFilters.tags.length > 0) {
          params.set(PARAM_KEYS.tags, newFilters.tags.join(','));
        } else {
          params.delete(PARAM_KEYS.tags);
        }
      }

      // Handle agentId
      if (newFilters.agentId !== undefined) {
        if (newFilters.agentId) {
          params.set(PARAM_KEYS.agentId, newFilters.agentId);
        } else {
          params.delete(PARAM_KEYS.agentId);
        }
      }

      // Handle dateFrom
      if (newFilters.dateFrom !== undefined) {
        if (newFilters.dateFrom) {
          params.set(PARAM_KEYS.dateFrom, newFilters.dateFrom);
        } else {
          params.delete(PARAM_KEYS.dateFrom);
        }
      }

      // Handle dateTo
      if (newFilters.dateTo !== undefined) {
        if (newFilters.dateTo) {
          params.set(PARAM_KEYS.dateTo, newFilters.dateTo);
        } else {
          params.delete(PARAM_KEYS.dateTo);
        }
      }

      // Handle search
      if (newFilters.search !== undefined) {
        if (newFilters.search) {
          params.set(PARAM_KEYS.search, newFilters.search);
        } else {
          params.delete(PARAM_KEYS.search);
        }
      }

      return params;
    }, { replace: true });
  }, [setSearchParams]);

  // Clear all filters — preserves non-filter params (e.g. ?view=)
  const clearFilters = useCallback(() => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      Object.values(PARAM_KEYS).forEach(key => params.delete(key));
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      filters.status.length > 0 ||
      filters.tags.length > 0 ||
      filters.agentId !== null ||
      filters.dateFrom !== null ||
      filters.dateTo !== null ||
      filters.search !== ''
    );
  }, [filters]);

  return {
    filters,
    setFilters,
    clearFilters,
    hasActiveFilters,
  };
}
