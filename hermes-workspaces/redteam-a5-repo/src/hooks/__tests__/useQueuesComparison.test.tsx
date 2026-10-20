// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { useQueuesComparison } from '@/hooks/business/useQueuesComparison';

const dateRange = {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31'),
};

describe('useQueuesComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'queues') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { id: 'q1', name: 'Suporte', color: '#3B82F6' },
                { id: 'q2', name: 'Vendas', color: '#10B981' },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'contacts') {
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({
              data: [
                { id: 'c1', queue_id: 'q1', assigned_to: 'p1', created_at: '2024-01-15' },
                { id: 'c2', queue_id: 'q1', assigned_to: null, created_at: '2024-01-16' },
                { id: 'c3', queue_id: 'q2', assigned_to: 'p2', created_at: '2024-01-15' },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'queue_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { queue_id: 'q1', profile_id: 'p1' },
                { queue_id: 'q2', profile_id: 'p2' },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'messages') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                { id: 'm1', contact_id: 'c1' },
                { id: 'm2', contact_id: 'c1' },
                { id: 'm3', contact_id: 'c3' },
              ],
              error: null,
            }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });
  });

  it('fetches and compares queues', async () => {
    const { result } = renderHook(() => useQueuesComparison(dateRange));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('handles empty queues', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'queues') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const { result } = renderHook(() => useQueuesComparison(dateRange));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.queuesPerformance).toEqual([]);
  });

  it('handles fetch error gracefully', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockRejectedValue(new Error('DB error')),
      }),
    });

    const { result } = renderHook(() => useQueuesComparison(dateRange));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('initializes with loading true', () => {
    const { result } = renderHook(() => useQueuesComparison(dateRange));
    expect(result.current.loading).toBe(true);
  });
});
