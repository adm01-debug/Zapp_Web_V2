import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fromTable } from '@/lib/supabaseHelpers';

export interface SearchOptions {
  columns: string[];
  minChars?: number;
  debounceMs?: number;
  limit?: number;
  orderBy?: { column: string; ascending?: boolean };
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export function useSearch<T extends Record<string, unknown>>(
  tableName: string,
  options: SearchOptions
) {
  const { columns, minChars = 2, debounceMs = 300, limit = 50, orderBy } = options;
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedTerm = useDebouncedValue(searchTerm, debounceMs);
  const shouldSearch = debouncedTerm.length >= minChars;

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', tableName, debouncedTerm, columns],
    queryFn: async () => {
      if (!shouldSearch) return [];
      const orConditions = columns.map(col => `${col}.ilike.%${debouncedTerm}%`).join(',');
      
      let query = fromTable(tableName)
        .select('*')
        .or(orConditions)
        .limit(limit);
      
      if (orderBy) {
        query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as T[];
    },
    enabled: shouldSearch,
  });

  const clearSearch = useCallback(() => setSearchTerm(''), []);
  const results = useMemo(() => data ?? [], [data]);

  return { 
    results, 
    isLoading: shouldSearch && isLoading, 
    error: error as Error | null, 
    searchTerm, 
    setSearchTerm, 
    clearSearch, 
    hasResults: results.length > 0 
  };
}

export default useSearch;
