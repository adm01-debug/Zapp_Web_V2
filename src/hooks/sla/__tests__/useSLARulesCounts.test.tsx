import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useSLARulesCounts,
  countSLARulesByScope,
  emptySLARuleCounts,
  type SLARuleCountRow,
} from '@/hooks/sla/useSLARulesCounts';

const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  error: null as { message: string } | null,
  fromCalls: 0,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => {
      h.fromCalls += 1;
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve({ data: h.rows, error: h.error }).then(onFulfilled, onRejected);
      return builder;
    }),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const row = (over: Partial<SLARuleCountRow>): SLARuleCountRow => ({
  contact_id: null,
  company: null,
  job_title: null,
  contact_type: null,
  queue_id: null,
  agent_id: null,
  ...over,
});

describe('countSLARulesByScope — contagem coerente com o filtro de lista (HZ5-01)', () => {
  it('conta cada escopo pelo mesmo predicado de useSLARules, inclusive nas duas abas', () => {
    const rows: SLARuleCountRow[] = [
      // contato com fila: a lista de "Por Fila" não exclui contact_id, mas exige contact_id nulo
      row({ contact_id: 'c1', queue_id: 'q1' }),
      // MESMA regra em "Por Empresa" e "Por Fila": conta nas duas (era a divergência do `else if`)
      row({ company: 'ACME', queue_id: 'q1' }),
      row({ job_title: 'Dev' }),
      row({ contact_type: 'lead' }),
      row({ agent_id: 'a1' }),
      // company + job_title: a aba "Por Cargo" exige company nulo, então conta só em "Por Empresa"
      row({ company: 'ACME', job_title: 'Dev' }),
    ];

    const counts = countSLARulesByScope(rows);

    expect(counts).toEqual({
      contact: 1,
      company: 2,
      job_title: 1,
      contact_type: 1,
      queue: 1,
      agent: 1,
    });
    // A regra company+queue_id aparece nas duas abas: o selo de Fila não pode ficar em 0.
    expect(counts.queue).toBe(1);
  });

  it('sem regras devolve todos os escopos zerados', () => {
    expect(countSLARulesByScope([])).toEqual(emptySLARuleCounts());
  });
});

describe('useSLARulesCounts — hook extraído', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rows = [];
    h.error = null;
    h.fromCalls = 0;
  });

  it('busca só as colunas de escopo numa consulta e devolve os contadores', async () => {
    h.rows = [
      { contact_id: 'c1', company: null, job_title: null, contact_type: null, queue_id: null, agent_id: null },
      { contact_id: null, company: 'ACME', job_title: null, contact_type: null, queue_id: 'q1', agent_id: null },
    ];

    const { result } = renderHook(() => useSLARulesCounts(), { wrapper });

    await waitFor(() => expect(result.current.counts.contact).toBe(1));
    expect(result.current.counts.company).toBe(1);
    expect(result.current.counts.queue).toBe(1);
    expect(h.fromCalls).toBe(1);
  });

  it('erro do Supabase não vira contagem zerada silenciosa: a query fica em erro', async () => {
    h.error = { message: 'permission denied' };

    const { result } = renderHook(() => useSLARulesCounts(), { wrapper });

    await waitFor(() => expect(h.fromCalls).toBe(1));
    // Sem dados não inventa contagem: o padrão é zero e o erro é propagado pelo react-query.
    await waitFor(() => expect(result.current.counts).toEqual(emptySLARuleCounts()));
  });
});
