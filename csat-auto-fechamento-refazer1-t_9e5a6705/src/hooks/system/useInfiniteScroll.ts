import { useInfiniteQuery } from '@tanstack/react-query';
import { fromTable } from '@/lib/supabaseHelpers';
import { useCallback, useRef } from 'react';

interface UseInfiniteScrollOptions<T> {
  tableName: string;
  pageSize?: number;
  orderBy?: { column: string; ascending?: boolean };
  filters?: Record<string, unknown>;
  select?: string;
}

export function useInfiniteScroll<T extends { id: string }>({
  tableName,
  pageSize = 20,
  orderBy = { column: 'created_at', ascending: false },
  filters = {},
  select = '*',
}: UseInfiniteScrollOptions<T>) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['infinite', tableName, filters, orderBy],
    queryFn: async ({ pageParam = 0 }) => {
      let q = fromTable(tableName)
        .select(select)
        .range(pageParam, pageParam + pageSize - 1)
        .order(orderBy.column, { ascending: orderBy.ascending });
      
      Object.entries(filters).forEach(([key, value]) => { 
        if (value !== undefined) q = q.eq(key, value); 
      });
      
      const { data, error } = await q;
      if (error) throw error;
      return { 
        data: (data || []) as T[], 
        nextPage: data?.length === pageSize ? pageParam + pageSize : undefined 
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
  });

  const setLoadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(entries => { 
      if (entries[0].isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
        query.fetchNextPage(); 
      }
    });
    if (node) observerRef.current.observe(node);
    loadMoreRef.current = node;
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  const allItems = query.data?.pages.flatMap(p => p.data) ?? [];

  return { 
    items: allItems, 
    ...query, 
    setLoadMoreRef, 
    totalLoaded: allItems.length 
  };
}
