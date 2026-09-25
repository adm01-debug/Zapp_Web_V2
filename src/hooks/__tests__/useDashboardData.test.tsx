// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => {
  function makeChainable(table: string): any {
    const handler: ProxyHandler<any> = {
      get(_, prop) {
        if (prop === 'then') {
          return (resolve: any) => {
            if (table === 'profiles') {
              return Promise.resolve({
                data: [{ id: 'p1', name: 'Agent 1', is_active: true, role: 'agent' }],
                error: null,
              }).then(resolve);
            }
            if (table === 'contacts') {
              return Promise.resolve({
                data: [{ id: 'c1', name: 'Contact 1', assigned_to: 'p1', queue_id: 'q1' }],
                error: null,
              }).then(resolve);
            }
            if (table === 'queues') {
              return Promise.resolve({
                data: [{ id: 'q1', name: 'Support', color: '#3B82F6' }],
                error: null,
              }).then(resolve);
            }
            if (table === 'queue_members') {
              return Promise.resolve({
                data: [{ queue_id: 'q1', profile_id: 'p1', profile: { is_active: true } }],
                error: null,
              }).then(resolve);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          };
        }
        return vi.fn().mockReturnValue(new Proxy({}, handler));
      },
    };
    return new Proxy({}, handler);
  }

  return {
    supabase: {
      from: vi.fn().mockImplementation((table: string) => makeChainable(table)),
      // E24/E25: useDashboardStats agora chama a RPC dashboard_contact_counts
      // em vez de select() cru em `contacts`.
      rpc: vi.fn().mockResolvedValue({
        data: { total: 1, open: 1, pending: 0, myActive: 0, queues: [{ queueId: 'q1', waiting: 0, inService: 1, avgResponse: null, slaRate: null }] },
        error: null,
      }),
    },
  };
});

import { useDashboardData, DashboardFilters } from '@/hooks/analytics/useDashboardData';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns dashboard stats with default filters', async () => {
    const { result } = renderHook(() => useDashboardData(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stats).toBeDefined();
  });

  it('accepts custom filters', async () => {
    const customFilters: DashboardFilters = {
      queueId: 'q1',
      agentId: 'p1',
    };

    const { result } = renderHook(
      () => useDashboardData(customFilters),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stats).toBeDefined();
  });

  it('provides refetch function', async () => {
    const { result } = renderHook(() => useDashboardData(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.refetch).toBeDefined();
    expect(typeof result.current.refetch).toBe('function');
  });
});
