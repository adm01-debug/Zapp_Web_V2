import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// E91: mock Supabase client
const mockGte = vi.fn().mockResolvedValue({
  data: [
    { id: '1', sender_id: 'user-a', created_at: new Date(Date.now() - 5000).toISOString() },
    { id: '2', sender_id: 'user-b', created_at: new Date(Date.now() - 10000).toISOString() },
    { id: '3', sender_id: 'user-a', created_at: new Date(Date.now() - 15000).toISOString() },
  ],
  error: null,
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: mockGte,
        }),
      }),
    }),
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
};

describe('useTeamPerformance', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('computes messageCount from returned rows', async () => {
    const { useTeamPerformance } = await import('../useTeamPerformance');
    const { result } = renderHook(() => useTeamPerformance('conv-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.messageCount).toBe(3);
  });

  it('counts unique activeParticipants', async () => {
    const { useTeamPerformance } = await import('../useTeamPerformance');
    const { result } = renderHook(() => useTeamPerformance('conv-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.activeParticipants).toBe(2);
  });

  it('E92: returns isLoading=true initially', async () => {
    const { useTeamPerformance } = await import('../useTeamPerformance');
    const { result } = renderHook(() => useTeamPerformance('conv-1'), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });

  it('E93: uses departmentChat queryKey namespace', async () => {
    const { useTeamPerformance } = await import('../useTeamPerformance');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const w = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => useTeamPerformance('conv-99'), { wrapper: w });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = qc.getQueryCache().getAll().map(q => q.queryKey);
    expect(keys.some(k => Array.isArray(k) && k[0] === 'departmentChat')).toBe(true);
  });
});
