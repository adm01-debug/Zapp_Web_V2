import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { format } from 'date-fns';

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

interface PaginatedBuilderOptions {
  pages: Array<Array<Record<string, unknown>>>;
  ranges?: Array<{ from: number; to: number }>;
  filters?: Array<{ method: string; column: string; value: unknown }>;
  error?: { message: string } | null;
}

/** Builder thenable compatível com o supabase-js: sem `.range` simula o teto da primeira página. */
function paginatedBuilder({ pages, ranges, filters, error = null }: PaginatedBuilderOptions) {
  const chain: Record<string, unknown> = {};
  const addFilter = (method: string) => (column: string, value: unknown) => {
    filters?.push({ method, column, value });
    return chain;
  };
  chain.eq = addFilter('eq');
  chain.in = addFilter('in');
  chain.gte = addFilter('gte');
  chain.lte = addFilter('lte');
  chain.order = (column: string, value: unknown) => {
    filters?.push({ method: 'order', column, value });
    return chain;
  };
  chain.range = (from: number, to: number) => {
    ranges?.push({ from, to });
    const pageSize = to - from + 1;
    const page = Math.floor(from / pageSize);
    return Promise.resolve({ data: pages[page] ?? [], error });
  };
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve({ data: pages[0] ?? [], error }).then(resolve, reject);
  return chain;
}

describe('useQueueAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'contacts') {
        return {
          select: vi.fn(() => paginatedBuilder({ pages: [[
            { id: 'c1', assigned_to: 'p1', created_at: '2024-01-03' },
            { id: 'c2', assigned_to: null, created_at: '2024-01-04' },
          ]] })),
        };
      }
      if (table === 'messages') {
        return {
          select: vi.fn(() => paginatedBuilder({ pages: [[
            { id: 'm1', contact_id: 'c1', sender: 'agent', created_at: '2024-01-03T10:00:00Z' },
            { id: 'm2', contact_id: 'c1', sender: 'contact', created_at: '2024-01-03T11:00:00Z' },
          ]] })),
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
          select: vi.fn(() => paginatedBuilder({ pages: [[]] })),
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
      select: vi.fn(() => {
        const chain = paginatedBuilder({ pages: [[]] });
        chain.range = vi.fn().mockRejectedValue(new Error('DB error'));
        chain.then = (_resolve: unknown, reject: (reason: unknown) => unknown) => reject(new Error('DB error'));
        return chain;
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
          select: vi.fn(() => paginatedBuilder({ pages: [[]] })),
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
        select: vi.fn(() => paginatedBuilder({ pages: [contacts] })),
      };
    }
    if (table === 'messages') {
      return { select: vi.fn(() => paginatedBuilder({ pages: [messages] })) };
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

describe('useQueueAnalytics — paginação integral', () => {
  it('inclui nos gráficos dados que só existem depois da primeira página de contacts e messages', async () => {
    const pageSize = 1000;
    const contactsRanges: Array<{ from: number; to: number }> = [];
    const messagesRanges: Array<{ from: number; to: number }> = [];
    const messagesFilters: Array<{ method: string; column: string; value: unknown }> = [];
    const messagesSelect = vi.fn();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const rangeEnd = new Date(tomorrow);
    rangeEnd.setHours(23, 59, 59, 999);
    const at = (day: Date, hour: number) => {
      const value = new Date(day);
      value.setHours(hour, 0, 0, 0);
      return value.toISOString();
    };

    const waitingPage = Array.from({ length: pageSize }, (_, i) => ({
      id: `waiting-${i}`,
      assigned_to: null,
      created_at: at(today, 8),
      conversation_status: 'open',
      conversation_status_changed_at: null,
    }));
    const resolvedSecondPage = Array.from({ length: pageSize }, (_, i) => ({
      id: `resolved-${i}`,
      assigned_to: 'agent-1',
      created_at: at(today, 8),
      conversation_status: 'resolved',
      conversation_status_changed_at: at(today, 12),
    }));
    const firstMessagePage = Array.from({ length: pageSize }, (_, i) => ({
      id: `message-${i}`,
      contact_id: `waiting-${i}`,
      sender: 'contact',
      agent_id: null,
      created_at: at(today, 9),
    }));
    const secondMessagePage = [
      { id: 'message-after-page-today', contact_id: 'resolved-0', sender: 'contact', agent_id: null, created_at: at(today, 10) },
      { id: 'message-after-page-tomorrow', contact_id: 'resolved-1', sender: 'contact', agent_id: null, created_at: at(tomorrow, 11) },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'contacts') {
        return {
          select: () => paginatedBuilder({
            pages: [waitingPage, resolvedSecondPage, []],
            ranges: contactsRanges,
          }),
        };
      }
      if (table === 'messages') {
        return {
          select: (columns: string) => {
            messagesSelect(columns);
            return paginatedBuilder({
              pages: [firstMessagePage, secondMessagePage],
              ranges: messagesRanges,
              filters: messagesFilters,
            });
          },
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const analyticsRange = { from: today, to: rangeEnd };
    const { result } = renderHook(() => useQueueAnalytics('queue-all', analyticsRange));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const todayKey = format(today, 'yyyy-MM-dd');
    const tomorrowKey = format(tomorrow, 'yyyy-MM-dd');
    expect(result.current.dailyData.find((day) => day.date === todayKey)).toMatchObject({
      mensagens: pageSize + 1,
      resolvidos: pageSize,
    });
    expect(result.current.dailyData.find((day) => day.date === tomorrowKey)?.mensagens).toBe(1);
    expect(result.current.hourlyData.find((hour) => hour.hora === '10h')?.atendimentos).toBe(1);
    expect(result.current.statusData).toEqual([
      expect.objectContaining({ name: 'Resolvidos', value: 50 }),
      expect.objectContaining({ name: 'Em Atendimento', value: 0 }),
      expect.objectContaining({ name: 'Aguardando', value: 50 }),
    ]);

    expect(contactsRanges).toEqual([
      { from: 0, to: pageSize - 1 },
      { from: pageSize, to: 2 * pageSize - 1 },
      { from: 2 * pageSize, to: 3 * pageSize - 1 },
    ]);
    expect(messagesRanges).toEqual([
      { from: 0, to: pageSize - 1 },
      { from: pageSize, to: 2 * pageSize - 1 },
    ]);
    expect(messagesSelect).toHaveBeenCalledWith(expect.stringContaining('contacts!inner(queue_id)'));
    expect(messagesFilters).toContainEqual({ method: 'eq', column: 'contacts.queue_id', value: 'queue-all' });
    expect(messagesFilters.some((filter) => filter.method === 'in')).toBe(false);
  });
});
