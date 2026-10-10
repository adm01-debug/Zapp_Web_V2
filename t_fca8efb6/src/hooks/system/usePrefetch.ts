import { useCallback } from 'react';

/**
 * Prefetch route chunks on hover/intent to eliminate loading delay.
 * Uses dynamic import to trigger Vite's code-splitting loader.
 */
const routeModules: Record<string, () => Promise<unknown>> = {
  '/': () => import('@/pages/Index'),
  '/auth': () => import('@/pages/Auth'),
  '/sla': () => import('@/pages/SLADashboard'),
  '/sla/history': () => import('@/pages/SLAHistory'),
  '/admin/roles': () => import('@/pages/admin/RolesPage'),
  '/admin/rate-limit': () => import('@/pages/admin/RateLimitDashboard'),
  '/install': () => import('@/pages/Install'),
};

const prefetchedRoutes = new Set<string>();

export function prefetchRoute(path: string): void {
  if (prefetchedRoutes.has(path)) return;
  
  const loader = routeModules[path];
  if (loader) {
    prefetchedRoutes.add(path);
    // Use requestIdleCallback to avoid blocking main thread
    const schedule = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 100));
    schedule(() => {
      loader().catch(() => {
        // Remove from set so it can be retried
        prefetchedRoutes.delete(path);
      });
    });
  }
}

/**
 * Hook that returns event handlers for prefetching on hover/focus.
 * Usage: <Link {...prefetchHandlers('/sla')} to="/sla">SLA</Link>
 */
export function usePrefetch(path: string) {
  const onMouseEnter = useCallback(() => prefetchRoute(path), [path]);
  const onFocus = useCallback(() => prefetchRoute(path), [path]);
  
  return { onMouseEnter, onFocus };
}
