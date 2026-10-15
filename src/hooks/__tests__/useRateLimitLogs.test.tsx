import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

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

import { useRateLimitLogs } from '@/hooks/system/useRateLimitLogs';

const mockLogs = [
  { id: '1', ip_address: '1.2.3.4', endpoint: '/api/messages', user_id: null, request_count: 50, blocked: false, user_agent: 'Chrome', country: 'BR', city: 'SP', created_at: '2024-01-01' },
  { id: '2', ip_address: '5.6.7.8', endpoint: '/api/auth', user_id: 'u1', request_count: 200, blocked: true, user_agent: 'Bot', country: 'US', city: 'NY', created_at: '2024-01-01' },
  { id: '3', ip_address: '1.2.3.4', endpoint: '/api/messages', user_id: null, request_count: 30, blocked: false, user_agent: 'Chrome', country: 'BR', city: 'SP', created_at: '2024-01-02' },
];

/**
 * Cadeia do PostgREST no formato novo do hook: `select()` com filtros
 * opcionais (`ilike`/`eq`), ordem dupla e dois terminais — `range()` para a
 * página da listagem (com `count`) e `limit()` para a janela de estatística.
 */
function novaCadeia(
  dados: typeof mockLogs | null,
  contagem: number,
  erro: Error | null = null,
) {
  const resultado = Promise.resolve({ data: dados, count: contagem, error: erro });
  const terminal = { abortSignal: vi.fn(() => resultado) };
  const cadeia: Record<string, () => unknown> = {
    ilike: () => cadeia,
    eq: () => cadeia,
    order: () => cadeia,
    range: () => terminal,
    limit: () => terminal,
    abortSignal: () => resultado,
  };
  return { select: vi.fn(() => cadeia) };
}

describe('useRateLimitLogs', () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => novaCadeia(mockLogs, mockLogs.length));
  });

  it('fetches logs on mount', async () => {
    const { result } = renderHook(() => useRateLimitLogs());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.logs).toHaveLength(3);
  });

  it('calculates stats correctly', async () => {
    const { result } = renderHook(() => useRateLimitLogs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.stats).toBeDefined();
    expect(result.current.stats!.totalRequests).toBe(280); // 50+200+30
    expect(result.current.stats!.blockedRequests).toBe(1);
    expect(result.current.stats!.uniqueIPs).toBe(2);
  });

  it('calculates top endpoints', async () => {
    const { result } = renderHook(() => useRateLimitLogs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.stats!.topEndpoints.length).toBeGreaterThan(0);
  });

  it('calculates top IPs', async () => {
    const { result } = renderHook(() => useRateLimitLogs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.stats!.topIPs.length).toBe(2);
  });

  it('identifies blocked IPs correctly', async () => {
    const { result } = renderHook(() => useRateLimitLogs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const blockedIP = result.current.stats!.topIPs.find(ip => ip.blocked);
    expect(blockedIP?.ip).toBe('5.6.7.8');
  });

  it('handles empty logs', async () => {
    mockFrom.mockImplementation(() => novaCadeia([], 0));

    const { result } = renderHook(() => useRateLimitLogs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.logs).toEqual([]);
    expect(result.current.stats?.totalRequests).toBe(0);
  });

  it('handles fetch error', async () => {
    mockFrom.mockImplementation(() => novaCadeia(null, 0, new Error('fail')));

    const { result } = renderHook(() => useRateLimitLogs());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('fail');
  });

  it('refreshes logs without an unpublished realtime subscription', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRateLimitLogs());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.loading).toBe(false);
    // Cada ciclo faz 2 consultas: a página da listagem e a janela de estatística.
    expect(mockFrom).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(mockFrom).toHaveBeenCalledTimes(4);
    expect(mockChannel).not.toHaveBeenCalled();
  });

  it('stops refreshing after unmount', async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useRateLimitLogs());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('updates statistics together with refreshed rows', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRateLimitLogs());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const updated = [{ ...mockLogs[0], request_count: 900, blocked: true }];
    mockFrom.mockImplementation(() => novaCadeia(updated, updated.length));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(result.current.logs).toEqual(updated);
    expect(result.current.stats?.totalRequests).toBe(900);
    expect(result.current.stats?.blockedRequests).toBe(1);
  });

  it('does not query without the dashboard permission', async () => {
    vi.useFakeTimers();
    renderHook(() => useRateLimitLogs(false));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('exposes refetch function', async () => {
    const { result } = renderHook(() => useRateLimitLogs());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.refetch).toBe('function');
  });
});
