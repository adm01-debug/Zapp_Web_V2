import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { log } from '@/lib/logger';

/**
 * Optimized list with windowing info
 */
export function useOptimizedList<T>(
  items: T[],
  options: {
    pageSize?: number;
    initialPage?: number;
  } = {}
) {
  const { pageSize = 20, initialPage = 1 } = options;
  const [page, setPage] = useState(initialPage);

  const paginatedItems = useMemo(() => {
    return items.slice(0, page * pageSize);
  }, [items, page, pageSize]);

  const hasMore = paginatedItems.length < items.length;

  const loadMore = useCallback(() => {
    if (hasMore) {
      setPage(p => p + 1);
    }
  }, [hasMore]);

  const reset = useCallback(() => {
    setPage(initialPage);
  }, [initialPage]);

  return {
    items: paginatedItems,
    hasMore,
    loadMore,
    reset,
    totalItems: items.length,
    loadedItems: paginatedItems.length,
  };
}

/**
 * Prefetch data on hover
 */
export function usePrefetch<T>(
  fetcher: () => Promise<T>,
  options: { delay?: number } = {}
) {
  const { delay = 150 } = options;
  const timeoutRef = useRef<NodeJS.Timeout>();
  const dataRef = useRef<T | null>(null);
  const [isPrefetched, setIsPrefetched] = useState(false);

  const prefetch = useCallback(() => {
    if (isPrefetched) return;

    timeoutRef.current = setTimeout(async () => {
      try {
        dataRef.current = await fetcher();
        setIsPrefetched(true);
      } catch (error) {
        log.error('Prefetch failed:', error);
      }
    }, delay);
  }, [fetcher, delay, isPrefetched]);

  const cancelPrefetch = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  const getData = useCallback(() => dataRef.current, []);

  return {
    prefetch,
    cancelPrefetch,
    getData,
    isPrefetched,
  };
}

/**
 * Resource preloading
 */
export function usePreloadResources(resources: Array<{ type: 'image' | 'script' | 'style'; url: string }>) {
  useEffect(() => {
    const links: HTMLLinkElement[] = [];

    resources.forEach(({ type, url }) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = url;
      
      switch (type) {
        case 'image':
          link.as = 'image';
          break;
        case 'script':
          link.as = 'script';
          break;
        case 'style':
          link.as = 'style';
          break;
      }

      document.head.appendChild(link);
      links.push(link);
    });

    return () => {
      links.forEach(link => link.remove());
    };
  }, [resources]);
}
