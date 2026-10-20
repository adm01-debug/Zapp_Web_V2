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

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { useQueueGoals } from '@/hooks/business/useQueueGoals';

const mockGoals = [
  { id: 'g1', queue_id: 'q1', max_waiting_contacts: 10, max_avg_wait_minutes: 5, min_assignment_rate: 80, max_messages_pending: 50, alerts_enabled: true },
  { id: 'g2', queue_id: 'q2', max_waiting_contacts: 20, max_avg_wait_minutes: 10, min_assignment_rate: 70, max_messages_pending: 100, alerts_enabled: false },
];

describe('useQueueGoals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: mockGoals, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it('fetches goals on mount', async () => {
    const { result } = renderHook(() => useQueueGoals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Object.keys(result.current.goals)).toHaveLength(2);
  });

  it('maps goals by queue_id', async () => {
    const { result } = renderHook(() => useQueueGoals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.goals['q1']).toBeDefined();
    expect(result.current.goals['q1'].max_waiting_contacts).toBe(10);
  });

  it('handles fetch error gracefully', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
    });

    const { result } = renderHook(() => useQueueGoals());
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('exposes saveGoal function', async () => {
    const { result } = renderHook(() => useQueueGoals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.saveGoal).toBe('function');
  });

  it('exposes getDefaultGoal function', async () => {
    const { result } = renderHook(() => useQueueGoals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.getDefaultGoal).toBe('function');
  });

  it('getDefaultGoal returns sensible defaults', async () => {
    const { result } = renderHook(() => useQueueGoals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const defaults = result.current.getDefaultGoal();
    expect(defaults.max_waiting_contacts).toBeGreaterThan(0);
  });

  it('goals can be accessed by queue_id', async () => {
    const { result } = renderHook(() => useQueueGoals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.goals['q1']?.id).toBe('g1');
    expect(result.current.goals['unknown']).toBeUndefined();
  });

  it('subscribes to realtime changes', () => {
    renderHook(() => useQueueGoals());
    expect(mockChannel).toHaveBeenCalled();
  });

  it('cleans up channel on unmount', () => {
    const { unmount } = renderHook(() => useQueueGoals());
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it('handles empty goals', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const { result } = renderHook(() => useQueueGoals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Object.keys(result.current.goals)).toHaveLength(0);
  });
});
