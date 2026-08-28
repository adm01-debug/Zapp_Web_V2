import { useEffect, useCallback, useRef } from 'react';
import { log } from '@/lib/logger';

interface PrefetchOptions {
  /**
   * Prefetch on mount
   */
  onMount?: boolean;
  /**
   * Prefetch on hover
   */
  onHover?: boolean;
  /**
   * Delay before prefetching (ms)
   */
  delay?: number;
  /**
   * Cache duration (ms) - default 5 minutes
   */
  cacheDuration?: number;
}

// Global cache for prefetched resources
const prefetchCache = new Map<string, { data: unknown; timestamp: number }>();
const pendingPrefetches = new Map<string, Promise<unknown>>();

/**
 * Hook for prefetching resources
 */
export function usePrefetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: PrefetchOptions = {}
) {
  const {
    onMount = false,
    delay = 0,
    cacheDuration = 5 * 60 * 1000, // 5 minutes
  } = options;

  const timeoutRef = useRef<NodeJS.Timeout>();

  const prefetch = useCallback(async (): Promise<T | null> => {
    // Check cache
    const cached = prefetchCache.get(key);
    if (cached && Date.now() - cached.timestamp < cacheDuration) {
      return cached.data as T;
    }

    // Check if already prefetching
    const pending = pendingPrefetches.get(key);
    if (pending) {
      return pending as Promise<T>;
    }

    // Start prefetch
    const promise = fetcher();
    pendingPrefetches.set(key, promise);

    try {
      const data = await promise;
      prefetchCache.set(key, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      log.warn(`Prefetch failed for ${key}:`, error);
      return null;
    } finally {
      pendingPrefetches.delete(key);
    }
  }, [key, fetcher, cacheDuration]);

  const schedulePrefetch = useCallback(() => {
    if (delay > 0) {
      timeoutRef.current = setTimeout(prefetch, delay);
    } else {
      prefetch();
    }
  }, [prefetch, delay]);

  const cancelPrefetch = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  // Prefetch on mount if enabled
  useEffect(() => {
    if (onMount) {
      schedulePrefetch();
    }

    return () => {
      cancelPrefetch();
    };
  }, [onMount, schedulePrefetch, cancelPrefetch]);

  return {
    prefetch,
    schedulePrefetch,
    cancelPrefetch,
    getCached: () => prefetchCache.get(key)?.data as T | undefined,
    isCached: () => {
      const cached = prefetchCache.get(key);
      return cached ? Date.now() - cached.timestamp < cacheDuration : false;
    },
  };
}

/**
 * Hook for prefetching routes/components
 */
export function useRoutePrefetch() {
  const prefetchedRoutes = useRef(new Set<string>());

  const prefetchRoute = useCallback((routePath: string) => {
    if (prefetchedRoutes.current.has(routePath)) return;

    // Mark as prefetched
    prefetchedRoutes.current.add(routePath);

    // Use requestIdleCallback for non-critical prefetching
    const callback = () => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.as = 'document';
      link.href = routePath;
      document.head.appendChild(link);
    };

    if ('requestIdleCallback' in window) {
      (window as Window).requestIdleCallback(callback);
    } else {
      setTimeout(callback, 100);
    }
  }, []);

  return { prefetchRoute };
}

/**
 * Hook for image prefetching
 */
export function useImagePrefetch() {
  const prefetchedImages = useRef(new Set<string>());

  const prefetchImage = useCallback((src: string): Promise<void> => {
    if (prefetchedImages.current.has(src)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        prefetchedImages.current.add(src);
        resolve();
      };
      img.onerror = reject;
      img.src = src;
    });
  }, []);

  const prefetchImages = useCallback((srcs: string[]): Promise<void[]> => {
    return Promise.all(srcs.map(prefetchImage));
  }, [prefetchImage]);

  return { prefetchImage, prefetchImages };
}

/**
 * Hook for intersection-based prefetching
 */
export function useIntersectionPrefetch<T>(
  fetcher: () => Promise<T>,
  options: {
    threshold?: number;
    rootMargin?: string;
    enabled?: boolean;
  } = {}
) {
  const { threshold = 0.1, rootMargin = '100px', enabled = true } = options;
  const elementRef = useRef<HTMLElement>(null);
  const hasPrefetched = useRef(false);

  useEffect(() => {
    if (!enabled || hasPrefetched.current || !elementRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasPrefetched.current) {
            hasPrefetched.current = true;
            fetcher().catch((err) => log.warn('Intersection prefetch failed:', err));
            observer.disconnect();
          }
        });
      },
      { threshold, rootMargin }
    );

    observer.observe(elementRef.current);

    return () => observer.disconnect();
  }, [fetcher, threshold, rootMargin, enabled]);

  return elementRef;
}

/**
 * Prefetch critical app data on idle
 */
export function useCriticalDataPrefetch(
  fetchers: Array<{ key: string; fetch: () => Promise<unknown> }>
) {
  useEffect(() => {
    const prefetchAll = async () => {
      for (const { key, fetch } of fetchers) {
        if (!prefetchCache.has(key)) {
          try {
            const data = await fetch();
            prefetchCache.set(key, { data, timestamp: Date.now() });
          } catch (error) {
            log.warn(`Failed to prefetch ${key}:`, error);
          }
        }
      }
    };

    if ('requestIdleCallback' in window) {
      (window as Window).requestIdleCallback(() => prefetchAll());
    } else {
      setTimeout(prefetchAll, 1000);
    }
  }, [fetchers]);
}

/**
 * Clear all prefetch cache
 */
export function clearPrefetchCache() {
  prefetchCache.clear();
}

/**
 * Get cached data by key
 */
export function getPrefetchedData<T>(key: string): T | undefined {
  return prefetchCache.get(key)?.data as T | undefined;
}
