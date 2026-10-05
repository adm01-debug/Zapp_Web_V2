import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { useQueueAnalytics } from '@/hooks/business/useQueueAnalytics';

const dateRange = {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-07'),
};

describe('useQueueAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'contacts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { id: 'c1', assigned_to: 'p1', created_at: '2024-01-03' },
                { id: 'c2', assigned_to: null, created_at: '2024-01-04' },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'messages') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'm1', contact_id: 'c1', sender: 'agent', created_at: '2024-01-03T10:00:00Z' },
                    { id: 'm2', contact_id: 'c1', sender: 'contact', created_at: '2024-01-03T11:00:00Z' },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'p1', name: 'Agent 1' }],
              error: null,
            }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });
  });

  it('fetches analytics data', async () => {
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('returns daily data array', async () => {
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Array.isArray(result.current.dailyData)).toBe(true);
  });

  it('returns hourly data array', async () => {
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Array.isArray(result.current.hourlyData)).toBe(true);
  });

  it('returns status data', async () => {
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Array.isArray(result.current.statusData)).toBe(true);
  });

  it('returns agent performance', async () => {
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Array.isArray(result.current.agentPerformance)).toBe(true);
  });

  it('handles empty queue (no contacts)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'contacts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dailyData.length).toBeGreaterThan(0); // empty daily placeholders
  });

  it('handles fetch error', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockRejectedValue(new Error('DB error')),
      }),
    });

    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('initializes with loading true', () => {
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange));
    expect(result.current.loading).toBe(true);
  });

  it('status data uses semantic HSL colors', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'contacts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange));
    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.statusData.forEach(s => {
      // Colors are now semantic HSL tokens like 'hsl(var(--primary))'
      expect(s.color).toContain('hsl(var(--');
      expect(s.name).toBeTruthy();
    });
  });
});

// R2-QUE-001 (item 105) — Analytics de filas não podem apresentar estimativa fixa como medida.
function mockQueueData(contacts: Array<Record<string, unknown>>, messages: Array<Record<string, unknown>> = []) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'contacts') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: contacts, error: null }),
        }),
      };
    }
    if (table === 'messages') {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.in = vi.fn(() => chain);
      chain.gte = vi.fn(() => chain);
      chain.lte = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve({ data: messages, error: null }).then(res, rej);
      return chain;
    }
    if (table === 'profiles') {
      return { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
    }
    return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
  });
}

describe('useQueueAnalytics — R2-QUE-001 não fabrica resultados', () => {
  it('Resolvidos vem do status canônico, não de 70% dos atribuídos', async () => {
    const dezAtribuidosAbertos = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      assigned_to: 'p1',
      created_at: '2024-01-03T09:00:00Z',
      conversation_status: 'open',
      conversation_status_changed_at: null,
    }));
    mockQueueData(dezAtribuidosAbertos);

    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const resolvidos = result.current.statusData.find((s) => s.name === 'Resolvidos');
    // antes do conserto: floor(10 * 0.7) = 7 → 70%
    expect(resolvidos?.value).toBe(0);
  });

  it('conta resolvido pelo timestamp canônico, não pela data de criação', async () => {
    mockQueueData([
      // resolvido em 04/01, mas criado fora do período
      { id: 'c1', assigned_to: 'p1', created_at: '2023-12-20T09:00:00Z', conversation_status: 'resolved', conversation_status_changed_at: '2024-01-04T10:00:00Z' },
      // criado em 03/01 e apenas atribuído/aberto: não é resolução
      { id: 'c2', assigned_to: 'p1', created_at: '2024-01-03T08:00:00Z', conversation_status: 'open', conversation_status_changed_at: null },
    ]);

    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const dia03 = result.current.dailyData.find((d) => d.date === '2024-01-03');
    const dia04 = result.current.dailyData.find((d) => d.date === '2024-01-04');
    expect(dia03?.resolvidos).toBe(0);
    expect(dia04?.resolvidos).toBe(1);
  });
});
