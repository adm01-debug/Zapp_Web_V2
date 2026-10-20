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
    from: (...args: unknown[]) => mockFrom(...args),
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

const toastSpy = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
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

  // R2-QUE-005 (#452): o erro da gravacao era engolido no catch e `saveGoal`
  // resolvia normalmente, entao o consumidor nao tinha como saber que a
  // gravacao falhou e fechava o formulario assim mesmo.
  it('saveGoal devolve false e avisa o erro quando a gravacao e recusada', async () => {
    const denied = { message: 'permission denied for table queue_goals', code: '42501' };
    const eq = vi.fn().mockResolvedValue({ error: denied });
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockResolvedValue({ data: mockGoals, error: null }),
      update: vi.fn().mockReturnValue({ eq }),
      insert: vi.fn().mockResolvedValue({ error: denied }),
    }));

    const { result } = renderHook(() => useQueueGoals());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const saved = await result.current.saveGoal('q1', { max_waiting_contacts: 25 });

    expect(saved).toBe(false);
    expect(eq).toHaveBeenCalledWith('queue_id', 'q1');
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    expect(toastSpy).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Metas salvas' }));
  });

  it('saveGoal devolve false quando o INSERT de uma fila sem meta e recusado', async () => {
    const denied = { message: 'permission denied for table queue_goals', code: '42501' };
    const insert = vi.fn().mockResolvedValue({ error: denied });
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockResolvedValue({ data: mockGoals, error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn() }),
      insert,
    }));

    const { result } = renderHook(() => useQueueGoals());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const saved = await result.current.saveGoal('q-sem-meta', { max_waiting_contacts: 25 });

    expect(saved).toBe(false);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ queue_id: 'q-sem-meta', max_waiting_contacts: 25 })
    );
  });

  it('saveGoal devolve true quando a gravacao e confirmada (nao pode regredir)', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockResolvedValue({ data: mockGoals, error: null }),
      update: vi.fn().mockReturnValue({ eq }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useQueueGoals());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const saved = await result.current.saveGoal('q1', { max_waiting_contacts: 25 });

    expect(saved).toBe(true);
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Metas salvas' }));
  });
});
