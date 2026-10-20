// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockFrom = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { useConnectionQueues } from '@/hooks/inbox/useConnectionQueues';

describe('useConnectionQueues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [
          { id: 'cq1', whatsapp_connection_id: 'conn1', queue_id: 'q1' },
        ], error: null }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });
  });

  it('fetches queues for a connection', async () => {
    const { result } = renderHook(() => useConnectionQueues('conn1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith('whatsapp_connection_queues');
  });

  it('does not fetch without connectionId', () => {
    const { result } = renderHook(() => useConnectionQueues());
    expect(result.current.connectionQueues).toEqual([]);
  });

  it('exposes addQueue and removeQueue', () => {
    const { result } = renderHook(() => useConnectionQueues('conn1'));
    expect(typeof result.current.addQueue).toBe('function');
    expect(typeof result.current.removeQueue).toBe('function');
  });
});
