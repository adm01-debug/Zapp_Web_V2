import { useEffect, useState, useCallback, useRef } from 'react';

import { getLogger } from '@/lib/logger';
const log = getLogger('usePerformanceOptimizations');

// Performance monitoring hook
interface PerformanceMetrics {
  lcp: number | null;
  fid: number | null;
  cls: number | null;
  fcp: number | null;
  ttfb: number | null;
}

export function usePerformanceMetrics() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    lcp: null,
    fid: null,
    cls: null,
    fcp: null,
    ttfb: null,
  });

  useEffect(() => {
    // Largest Contentful Paint
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1] as PerformanceEntry;
      setMetrics((prev) => ({ ...prev, lcp: lastEntry.startTime }));
    });

    // First Input Delay
    const fidObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries() as PerformanceEventTiming[];
      const firstEntry = entries[0];
      if (firstEntry) {
        setMetrics((prev) => ({ 
          ...prev, 
          fid: firstEntry.processingStart - firstEntry.startTime 
        }));
      }
    });

    // Cumulative Layout Shift
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
          setMetrics((prev) => ({ ...prev, cls: clsValue }));
        }
      }
    });

    // First Contentful Paint
    const fcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const fcpEntry = entries.find((e) => e.name === 'first-contentful-paint');
      if (fcpEntry) {
        setMetrics((prev) => ({ ...prev, fcp: fcpEntry.startTime }));
      }
    });

    try {
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      fidObserver.observe({ type: 'first-input', buffered: true });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      fcpObserver.observe({ type: 'paint', buffered: true });
    } catch (err) { log.error('Unexpected error in usePerformanceOptimizations:', err); }

    // Time to First Byte
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navEntry) {
      setMetrics((prev) => ({ ...prev, ttfb: navEntry.responseStart }));
    }

    return () => {
      lcpObserver.disconnect();
      fidObserver.disconnect();
      clsObserver.disconnect();
      fcpObserver.disconnect();
    };
  }, []);

  return metrics;
}

// Re-export from usePerformance for backwards compatibility
export { useDebounce } from '../system/useDebounce';
export { useThrottle } from '../performance/useTimingHooks';

// Throttled callback hook (different signature - for callbacks)
type AnyFunction = (...args: unknown[]) => unknown;

export function useThrottledCallback<T extends AnyFunction>(
  callback: T,
  delay: number
): T {
  const lastCall = useRef(0);
  const lastCallTimer = useRef<ReturnType<typeof setTimeout>>();

  return useCallback(
    ((...args) => {
      const now = Date.now();
      
      if (now - lastCall.current >= delay) {
        lastCall.current = now;
        callback(...args);
      } else {
        clearTimeout(lastCallTimer.current);
        lastCallTimer.current = setTimeout(() => {
          lastCall.current = Date.now();
          callback(...args);
        }, delay - (now - lastCall.current));
      }
    }) as T,
    [callback, delay]
  );
}

// Request idle callback hook
export function useIdleCallback(callback: () => void, timeout = 1000) {
  useEffect(() => {
    const id = 'requestIdleCallback' in window
      ? window.requestIdleCallback(callback, { timeout })
      : setTimeout(callback, timeout);

    return () => {
      if ('cancelIdleCallback' in window && typeof id === 'number') {
        window.cancelIdleCallback(id);
      } else {
        clearTimeout(id as ReturnType<typeof setTimeout>);
      }
    };
  }, [callback, timeout]);
}

// Intersection observer hook
export function useIntersectionObserver(
  options: IntersectionObserverInit = {}
): [(node: Element | null) => void, boolean, IntersectionObserverEntry | null] {
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = useCallback(
    (node: Element | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }

      if (node) {
        observerRef.current = new IntersectionObserver(
          ([entry]) => {
            setEntry(entry);
            setIsIntersecting(entry.isIntersecting);
          },
          { threshold: 0.1, ...options }
        );
        observerRef.current.observe(node);
      }
    },
    [options.threshold, options.root, options.rootMargin]
  );

  return [ref, isIntersecting, entry];
}

// Memory pressure detection
export function useMemoryPressure() {
  const [isLowMemory, setIsLowMemory] = useState(false);

  useEffect(() => {
    if ('deviceMemory' in navigator) {
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
      setIsLowMemory(memory < 4);
    }

    // Listen for memory pressure events
    const handleMemoryPressure = () => setIsLowMemory(true);
    
    // devicememory event is experimental - no standard types exist
    const nav = navigator as unknown as EventTarget;
    if ('ondevicememory' in navigator) {
      nav.addEventListener('devicememory', handleMemoryPressure);
    }

    return () => {
      if ('ondevicememory' in navigator) {
        nav.removeEventListener('devicememory', handleMemoryPressure);
      }
    };
  }, []);

  return isLowMemory;
}

// Network status hook
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [connectionType, setConnectionType] = useState<string>('unknown');
  const [isSlowConnection, setIsSlowConnection] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Connection API
    const connection = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean; addEventListener?: Function; removeEventListener?: Function } }).connection;
    if (connection) {
      setConnectionType(connection.effectiveType);
      setIsSlowConnection(
        connection.saveData || 
        connection.effectiveType === 'slow-2g' || 
        connection.effectiveType === '2g'
      );

      const handleChange = () => {
        setConnectionType(connection.effectiveType);
        setIsSlowConnection(
          connection.saveData || 
          connection.effectiveType === 'slow-2g' || 
          connection.effectiveType === '2g'
        );
      };

      connection.addEventListener('change', handleChange);
      
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        connection.removeEventListener('change', handleChange);
      };
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, connectionType, isSlowConnection };
}

// Reduced motion preference
export function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}
