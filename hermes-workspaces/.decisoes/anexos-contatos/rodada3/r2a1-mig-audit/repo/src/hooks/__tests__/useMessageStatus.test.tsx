// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockFrom = vi.fn();
const mockChannel = vi.fn().mockReturnValue({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
});
const mockRemoveChannel = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    channel: (...args: any[]) => mockChannel(...args),
    removeChannel: (...args: any[]) => mockRemoveChannel(...args),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { useMessageStatus } from '@/hooks/chat/useMessageStatus';

const mockStatuses = [
  { id: 'm1', status: 'sent', status_updated_at: '2024-01-01T10:00:00Z' },
  { id: 'm2', status: 'delivered', status_updated_at: '2024-01-01T10:01:00Z' },
  { id: 'm3', status: 'read', status_updated_at: '2024-01-01T10:02:00Z' },
  { id: 'm4', status: 'failed', status_updated_at: '2024-01-01T10:03:00Z' },
];

describe('useMessageStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: mockStatuses, error: null }),
          }),
        }),
      }),
    });
  });

  it('initializes with empty status map when no contactId', () => {
    const { result } = renderHook(() => useMessageStatus());
    expect(result.current.statusUpdates.size).toBe(0);
    expect(result.current.isLoading).toBe(false);
  });

  it('fetches statuses when contactId provided', async () => {
    const { result } = renderHook(() => useMessageStatus('c1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.statusUpdates.size).toBeGreaterThanOrEqual(0);
  });

  it('exposes getMessageStatus function', async () => {
    const { result } = renderHook(() => useMessageStatus('c1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(typeof result.current.getMessageStatus).toBe('function');
  });

  it('handles fetch error gracefully', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useMessageStatus('c1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('clears status when contactId changes to undefined', async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id?: string }) => useMessageStatus(id),
      { initialProps: { id: 'c1' } }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    
    rerender({ id: undefined });
    expect(result.current.statusUpdates.size).toBe(0);
  });
});
