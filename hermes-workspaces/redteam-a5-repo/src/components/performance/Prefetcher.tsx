import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { getLogger } from '@/lib/logger';
const log = getLogger('Prefetcher');

// Route prefetch configuration
const routePrefetchConfig: Record<string, () => Promise<unknown>> = {
  dashboard: () => import('@/components/dashboard/DashboardView'),
  contacts: () => import('@/components/contacts/ContactsView'),
  agents: () => import('@/components/agents/AgentsView'),
  queues: () => import('@/components/queues/QueuesView'),
  settings: () => import('@/components/settings/SettingsView'),
  reports: () => import('@/components/reports/AdvancedReportsView'),
};

// Prefetch routes on hover
export function usePrefetchRoute() {
  const prefetch = useCallback((route: string) => {
    const prefetchFn = routePrefetchConfig[route];
    if (prefetchFn) {
      prefetchFn().catch(() => {
        // Silently fail - this is just a performance optimization
      });
    }
  }, []);

  return { prefetch };
}

// Prefetch data queries
export function usePrefetchData() {
  const queryClient = useQueryClient();

  const prefetchQuery = useCallback(
    async (queryKey: string[], queryFn: () => Promise<unknown>) => {
      await queryClient.prefetchQuery({
        queryKey,
        queryFn,
        staleTime: 5 * 60 * 1000, // 5 minutes
      });
    },
    [queryClient]
  );

  return { prefetchQuery };
}

// Prefetch on link hover component
interface PrefetchLinkProps {
  route: string;
  children: React.ReactNode;
  onHover?: () => void;
  className?: string;
}

export function PrefetchLink({ route, children, onHover, className }: PrefetchLinkProps) {
  const { prefetch } = usePrefetchRoute();

  const handleMouseEnter = () => {
    prefetch(route);
    onHover?.();
  };

  return (
    <div onMouseEnter={handleMouseEnter} className={className}>
      {children}
    </div>
  );
}

// Intersection Observer based prefetching
export function useIntersectionPrefetch(routes: string[]) {
  const { prefetch } = usePrefetchRoute();

  useEffect(() => {
    // Prefetch routes when user is idle
    const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));

    idleCallback(() => {
      routes.forEach((route) => {
        prefetch(route);
      });
    });
  }, [routes, prefetch]);
}

// Network-aware prefetching
export function useNetworkAwarePrefetch() {
  const { prefetch } = usePrefetchRoute();

  const smartPrefetch = useCallback(
    (route: string) => {
      // Check if user is on a fast connection
      const nav = navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } };
      const connection = nav.connection;
      
      if (connection) {
        const { effectiveType, saveData } = connection;
        
        // Don't prefetch on slow connections or when data saver is enabled
        if (saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
          return;
        }
      }

      prefetch(route);
    },
    [prefetch]
  );

  return { smartPrefetch };
}

// Prefetch critical routes on app load
export function CriticalRoutePrefetcher() {
  useEffect(() => {
    const prefetchCritical = async () => {
      // Wait for main content to load
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Prefetch critical routes
      const criticalRoutes = ['dashboard', 'contacts', 'settings'];
      
      for (const route of criticalRoutes) {
        const prefetchFn = routePrefetchConfig[route];
        if (prefetchFn) {
          try {
            await prefetchFn();
            // Small delay between prefetches to not block main thread
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (err) { log.error('Unexpected error in Prefetcher:', err); }
        }
      }
    };

    // Use requestIdleCallback if available
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => prefetchCritical());
    } else {
      prefetchCritical();
    }
  }, []);

  return null;
}

// Resource hints component
export function ResourceHints() {
  useEffect(() => {
    // Add preconnect hints for external resources
    const preconnects = [
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
    ];

    preconnects.forEach((url) => {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = url;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });

    // Cleanup
    return () => {
      preconnects.forEach((url) => {
        const link = document.querySelector(`link[href="${url}"]`);
        if (link) {
          document.head.removeChild(link);
        }
      });
    };
  }, []);

  return null;
}

// Preload critical images
export function usePreloadImages(images: string[]) {
  useEffect(() => {
    images.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [images]);
}
