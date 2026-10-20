import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Mapping from view IDs to their primary query keys.
 * When user hovers a nav item, we prefetch the data for that view
 * so the transition feels instant.
 */
const VIEW_QUERY_KEYS: Record<string, string[][]> = {
  inbox: [['contacts'], ['messages']],
  contacts: [['contacts']],
  dashboard: [['dashboard-stats'], ['contacts']],
  campaigns: [['campaigns']],
  'knowledge-base': [['knowledge-base-articles']],
  automations: [['automations']],
  agents: [['team-members']],
  queues: [['queues']],
  tags: [['tags']],
};

/**
 * Returns an onMouseEnter handler that triggers query prefetch
 * for a given view, making the view transition feel instant.
 *
 * Only prefetches if data is stale (respects staleTime).
 */
export function usePrefetchOnHover() {
  const queryClient = useQueryClient();

  const prefetch = useCallback(
    (viewId: string) => {
      const keys = VIEW_QUERY_KEYS[viewId];
      if (!keys) return;

      keys.forEach((key) => {
        // Only triggers if data is stale — no wasted requests
        queryClient.prefetchQuery({
          queryKey: key,
          staleTime: 1000 * 60 * 5, // 5 min
        });
      });
    },
    [queryClient]
  );

  return { prefetch };
}
