import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  DEGRADED_POLL_MS,
  DEGRADED_WINDOW_MS,
  fetchDegradedConnections,
  selectDegradedConnections,
  useDegradedConnections,
  type DegradedConnectionRow,
} from '@/hooks/connections/useDegradedConnections';

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { message: string } | null,
  calls: 0,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: async () => {
          h.calls += 1;
          return { data: h.rows, error: h.error };
        },
      }),
    }),
  },
}));

const AGORA = Date.parse('2026-10-12T18:00:00.000Z');

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function linha(over: Partial<DegradedConnectionRow> = {}): DegradedConnectionRow {
  return {
    id: 'c1',
    instance_id: 'VENDAS-01',
    health_status: 'degraded',
    last_health_check: new Date(AGORA - 60_000).toISOString(),
    ...over,
  };
}

describe('selectDegradedConnections (regra pura)', () => {
  it('health degradada com checagem recente entra, com rotulo e instante', () => {
    const out = selectDegradedConnections([linha()], AGORA);

    expect(out).toEqual([
      { id: 'c1', label: 'VENDAS-01', lastHealthCheck: AGORA - 60_000 },
    ]);
  });

  it('health degradada mas checagem FORA dos 10 min nao entra', () => {
    const velha = linha({
      last_health_check: new Date(AGORA - DEGRADED_WINDOW_MS - 1).toISOString(),
    });

    expect(selectDegradedConnections([velha], AGORA)).toEqual([]);
  });

  it('exatamente no fim da janela ainda entra', () => {
    const limite = linha({ last_health_check: new Date(AGORA - DEGRADED_WINDOW_MS).toISOString() });

    expect(selectDegradedConnections([limite], AGORA)).toHaveLength(1);
  });

  it('conexao saudavel, em erro ou sem checagem registrada fica de fora', () => {
    const rows = [
      linha({ id: 'ok', health_status: 'healthy' }),
      linha({ id: 'erro', health_status: 'error' }),
      linha({ id: 'sem-data', last_health_check: null }),
      linha({ id: 'data-invalida', last_health_check: 'nao-e-data' }),
    ];

    expect(selectDegradedConnections(rows, AGORA)).toEqual([]);
  });

  it('sem instance_id a faixa ainda nomeia a conexao', () => {
    const out = selectDegradedConnections([linha({ instance_id: null })], AGORA);

    expect(out[0].label).toBe('conexao');
  });
});

describe('fetchDegradedConnections', () => {
  beforeEach(() => {
    h.rows = [];
    h.error = null;
    h.calls = 0;
  });

  it('le so as degradadas e corta pela janela de 10 min', async () => {
    h.rows = [
      linha({ id: 'recente' }),
      linha({ id: 'antiga', last_health_check: new Date(AGORA - DEGRADED_WINDOW_MS - 1).toISOString() }),
    ];

    const out = await fetchDegradedConnections(AGORA);

    expect(h.calls).toBe(1);
    expect(out.map((c) => c.id)).toEqual(['recente']);
  });

  it('erro de leitura vira excecao (nao vira lista vazia silenciosa)', async () => {
    h.error = { message: 'permission denied' };

    await expect(fetchDegradedConnections(AGORA)).rejects.toThrow('permission denied');
  });
});

describe('useDegradedConnections (wiring do react-query)', () => {
  beforeEach(() => {
    h.rows = [linha()];
    h.error = null;
    h.calls = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('carrega na montagem e relê a cada minuto', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);

    const { result } = renderHook(() => useDegradedConnections(), { wrapper: createWrapper() });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.degraded.map((c) => c.label)).toEqual(['VENDAS-01']);
    expect(h.calls).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEGRADED_POLL_MS + 1);
    });
    expect(h.calls).toBeGreaterThan(1);
  });

  it('falha de leitura vira aviso, sem inventar conexao degradada', async () => {
    h.error = { message: 'offline' };
    const { result } = renderHook(() => useDegradedConnections(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.error).toBe('offline'));
    expect(result.current.degraded).toEqual([]);
  });
});
