/**
 * Prova do FIO em `useSLAMetrics`: as linhas com `resolution_breached` /
 * `resolved_at` geram `overall.resolution` e `byAgent[].resolution`.
 *
 * Até aqui só `slaResolution` (regra pura) e `useSLAHistory` tinham teste de
 * cálculo; o hook de métricas era coberto só por mock de 1ª resposta. Este
 * teste chama o hook REAL com o PostgREST simulado e confere o desfecho de
 * resolução ponta a ponta — inclusive a pendente fora da taxa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = vi.fn(chain);
      builder.gte = vi.fn(chain);
      builder.order = vi.fn(chain);
      builder.range = vi.fn((from: number, to: number) => {
        void from;
        void to;
        return builder;
      });
      builder.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
        const base = table === 'conversation_sla' ? h.rows : h.profiles;
        return Promise.resolve({ data: base, error: null }).then(onFulfilled, onRejected);
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

const agora = new Date().toISOString();

const slaRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 's1',
  contact_id: 'c1',
  created_at: agora,
  first_response_breached: false,
  first_response_at: agora,
  resolution_breached: false,
  resolved_at: null,
  contacts: { assigned_to: 'a1' },
  ...overrides,
});

describe('useSLAMetrics — fio de resolução', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rows = [];
    h.profiles = [
      { id: 'a1', name: 'Ana', avatar_url: null },
      { id: 'a2', name: 'Beto', avatar_url: null },
    ];
  });

  it('overall.resolution sai dos campos resolution_* da mesma linha', async () => {
    h.rows = [
      // No prazo na resolução (carimbo resolved_at, sem violação).
      slaRow({ id: 's1', resolved_at: agora }),
      // Violada na resolução (a violação manda, mesmo sem carimbo).
      slaRow({ id: 's2', resolution_breached: true, resolved_at: null }),
      // Pendente de resolução: sem violação e sem carimbo — fora da taxa.
      slaRow({ id: 's3', contacts: { assigned_to: 'a2' } }),
      // Sem agente: conta no overall, não entra em byAgent.
      slaRow({ id: 's4', contacts: { assigned_to: null }, resolved_at: agora }),
    ];

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const resolution = result.current.data?.overall.resolution;
    expect(resolution?.total).toBe(3);
    expect(resolution?.onTime).toBe(2);
    expect(resolution?.breached).toBe(1);
    expect(resolution?.pending).toBe(1);
    // 2 no prazo / 3 avaliadas — a pendente não entra no denominador.
    expect(resolution?.rate).toBeCloseTo((2 / 3) * 100, 5);
  });

  it('byAgent[].resolution separa por agente com a pendente fora da taxa', async () => {
    h.rows = [
      slaRow({ id: 's1', contacts: { assigned_to: 'a1' }, resolved_at: agora }),
      slaRow({
        id: 's2',
        contacts: { assigned_to: 'a1' },
        resolution_breached: true,
        resolved_at: null,
      }),
      slaRow({ id: 's3', contacts: { assigned_to: 'a2' } }),
    ];

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const byAgent = result.current.data?.byAgent ?? [];
    const a1 = byAgent.find((a) => a.agentId === 'a1');
    const a2 = byAgent.find((a) => a.agentId === 'a2');

    expect(a1?.resolution.total).toBe(2);
    expect(a1?.resolution.onTime).toBe(1);
    expect(a1?.resolution.breached).toBe(1);
    expect(a1?.resolution.pending).toBe(0);
    expect(a1?.resolution.rate).toBe(50);

    // a2 só tem pendente: sem amostra, taxa 0 — nunca 100.
    expect(a2?.resolution.total).toBe(0);
    expect(a2?.resolution.pending).toBe(1);
    expect(a2?.resolution.rate).toBe(0);
  });
});
