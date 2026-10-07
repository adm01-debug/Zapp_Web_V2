import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { startOfDay, startOfMonth, startOfWeek, subDays } from 'date-fns';

/**
 * Dublê do PostgREST que reproduz o que importa para estes testes:
 * (1) cada filtro aplicado é registrado (`.gte`, `.order`, `.range`), para a prova poder olhar
 *     QUAL janela foi pedida; e
 * (2) SEM `.range()` a leitura para no teto de linhas do projeto (1000) — é o comportamento real
 *     que faz um total ser calculado sobre amostra.
 */
const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
  error: null as { message: string } | null,
  pending: false,
  gte: [] as Array<{ table: string; column: string; value: string }>,
  orders: [] as Array<{ table: string; column: string }>,
  ranges: [] as Array<{ table: string; from: number; to: number }>,
}));

/** Teto de linhas do PostgREST no projeto (achado A6/A11). */
const TETO_POSTGREST = 1000;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = vi.fn(chain);
      builder.gte = vi.fn((column: string, value: string) => {
        h.gte.push({ table, column, value });
        return builder;
      });
      builder.order = vi.fn((column: string) => {
        h.orders.push({ table, column });
        return builder;
      });
      builder.range = vi.fn((from: number, to: number) => {
        h.ranges.push({ table, from, to });
        return builder;
      });
      builder.then = (
        onFulfilled?: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown
      ) => {
        if (h.pending) return new Promise(() => {});
        if (h.error) {
          return Promise.resolve({ data: null, error: h.error }).then(onFulfilled, onRejected);
        }
        const base = table === 'conversation_sla' ? h.rows : h.profiles;
        const filtros = h.gte.filter((f) => f.table === table);
        const filtradas = base.filter((row) =>
          filtros.every((f) => {
            const valor = row[f.column];
            return typeof valor === 'string' && valor >= f.value;
          })
        );
        const range = [...h.ranges].reverse().find((r) => r.table === table);
        const pagina = range
          ? filtradas.slice(range.from, range.to + 1)
          : filtradas.slice(0, TETO_POSTGREST);
        return Promise.resolve({ data: pagina, error: null }).then(onFulfilled, onRejected);
      };
      return builder;
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { useSLAMetrics } from '@/hooks/sla/useSLAMetrics';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const slaRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 's1',
  contact_id: 'c1',
  created_at: new Date().toISOString(),
  first_response_breached: false,
  resolution_breached: false,
  first_response_at: new Date().toISOString(),
  contacts: { assigned_to: 'a1' },
  ...overrides,
});

const gteDeSla = () => h.gte.filter((f) => f.table === 'conversation_sla');

describe('useSLAMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rows = [];
    h.profiles = [];
    h.error = null;
    h.pending = false;
    h.gte = [];
    h.orders = [];
    h.ranges = [];
  });

  it('fetches SLA metrics', async () => {
    h.rows = [
      slaRow(),
      slaRow({
        id: 's2',
        first_response_breached: true,
        first_response_at: null,
      }),
    ];

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeDefined();
  });

  it('handles loading state correctly', () => {
    h.pending = true;

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });
    expect(result.current.loading).toBe(true);
  });

  it('handles empty SLA data', async () => {
    h.rows = [];

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data?.overall.totalConversations).toBe(0);
    expect(result.current.data?.byAgent).toEqual([]);
  });

  it('handles fetch errors gracefully', async () => {
    h.error = { message: 'DB error' };

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
  });

  // ------------------------------------------------------------------
  // R2-SLA-002 — o rótulo "Todos" promete tudo, não os últimos 365 dias
  // ------------------------------------------------------------------

  it('"Todos" não aplica limite inferior: registro de mais de um ano atrás entra no total', async () => {
    h.rows = [
      slaRow({
        id: 's-antigo',
        created_at: subDays(new Date(), 400).toISOString(),
        first_response_at: null,
        first_response_breached: true,
      }),
      slaRow({ id: 's-recente' }),
    ];

    const { result } = renderHook(() => useSLAMetrics('all'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Vermelho antes: `all` mandava `.gte('created_at', agora - 365 dias)` e o registro antigo
    // desaparecia do total anunciado.
    expect(gteDeSla()).toHaveLength(0);
    expect(result.current.data?.overall.totalConversations).toBe(2);
    expect(result.current.data?.overall.firstResponse.breached).toBe(1);
  });

  it('conta o período inteiro mesmo acima do teto de linhas do PostgREST', async () => {
    h.rows = Array.from({ length: 1500 }, (_, i) => slaRow({ id: `s${i}` }));

    const { result } = renderHook(() => useSLAMetrics('today'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Vermelho antes: sem `.range()` o servidor devolvia só a primeira página (1000 linhas) e o
    // total anunciado era 1000 — a métrica calculada sobre amostra.
    expect(result.current.data?.overall.totalConversations).toBe(1500);
    expect(h.ranges.some((r) => r.table === 'conversation_sla' && r.from === 1000)).toBe(true);
    expect(h.orders.some((o) => o.table === 'conversation_sla' && o.column === 'id')).toBe(true);
  });

  it.each([
    ['today', () => startOfDay(new Date())],
    ['week', () => startOfWeek(new Date(), { weekStartsOn: 1 })],
    ['month', () => startOfMonth(new Date())],
  ])('período "%s" mantém o recorte anterior (Hoje/Esta Semana/Este Mês)', async (periodo, esperado) => {
    h.rows = [slaRow()];

    const { result } = renderHook(() => useSLAMetrics(periodo as 'today' | 'week' | 'month'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const filtros = gteDeSla();
    expect(filtros).toHaveLength(1);
    expect(filtros[0].column).toBe('created_at');
    expect(filtros[0].value).toBe(esperado().toISOString());
  });
});
