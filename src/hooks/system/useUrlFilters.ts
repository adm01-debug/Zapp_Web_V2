import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Hook to persist and sync filters with URL search params.
 * Enables sharing filtered views via URL and restores filters on navigation.
 *
 * O texto livre da busca NÃO vai para a URL (SEC-FRONTEND-05): no Inbox ele casa
 * nome, telefone e e-mail do contato, e na barra de endereço vazaria para o
 * histórico, a restauração de sessão e qualquer link copiado. Fica só em estado
 * local; os demais filtros (status, tags, agente, datas) não são PII e seguem na URL.
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
} as const;

// Chave antiga da busca. Nunca mais é gravada nem lida; só é apagada para limpar
// links/históricos antigos que ainda carreguem o texto digitado.
const LEGACY_SEARCH_KEY = 'q';

export function useUrlFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');

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
      search,
    };
  }, [searchParams, search]);

  // Update URL with new filters
  const setFilters = useCallback((newFilters: Partial<UrlFiltersState>) => {
    if (newFilters.search !== undefined) setSearch(newFilters.search);

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

      // Link antigo com ?q= (texto digitado): some assim que qualquer filtro muda.
      params.delete(LEGACY_SEARCH_KEY);

      return params;
    }, { replace: true });
  }, [setSearchParams]);

  // Clear all filters — preserves non-filter params (e.g. ?view=)
  const clearFilters = useCallback(() => {
    setSearch('');
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      Object.values(PARAM_KEYS).forEach(key => params.delete(key));
      params.delete(LEGACY_SEARCH_KEY);
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
