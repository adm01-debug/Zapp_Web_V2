import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { useCSAT, useSatisfactionBreakdown } from '@/hooks/business/useCSAT';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

type QueryResult = { data: unknown; error: unknown };
type RecordedCall = { method: string; args: unknown[] };

/**
 * Builder do PostgREST de mentira. Registra cada filtro chamado (para o teste
 * provar que o filtro saiu na consulta) e responde na ordem dada; a ultima
 * resposta se repete, e a pagina vazia que encerra o loop de paginacao.
 */
function makeQuery(results: QueryResult | QueryResult[]) {
  const pending = Array.isArray(results) ? [...results] : [results];
  const calls: RecordedCall[] = [];
  const builder: Record<string, unknown> = { calls };
  for (const method of ['select', 'not', 'gte', 'order', 'limit', 'or', 'eq', 'insert']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(pending.length > 1 ? pending.shift()! : pending[0]).then(onFulfilled, onRejected);
  return builder as { calls: RecordedCall[] };
}

/** Convite sem nota = rating nulo: a consulta precisa mandar `rating IS NOT NULL`. */
const ratingFilterSent = (q: { calls: RecordedCall[] }) =>
  q.calls.some(
    (c) => c.method === 'not' && c.args[0] === 'rating' && c.args[1] === 'is' && c.args[2] === null
  );

describe('useCSAT — convite sem nota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista e estatisticas ignoram convite enviado e nunca respondido', async () => {
    const now = new Date().toISOString();
    const rated = {
      id: 's1',
      contact_id: 'c1',
      agent_id: 'a1',
      rating: 5,
      feedback: null,
      created_at: now,
      conversation_resolved_at: null,
    };
    // So o convite respondido tem nota; o segundo foi enviado e ficou sem resposta.
    const unrated = { ...rated, id: 's2', contact_id: 'c2', rating: null };
    const query = makeQuery({ data: [rated, unrated], error: null });
    mockFrom.mockReturnValue(query);

    const { result } = renderHook(() => useCSAT(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(ratingFilterSent(query)).toBe(true);
    expect(result.current.surveys.map((s) => s.id)).toEqual(['s1']);
    expect(result.current.stats.total).toBe(1);
    expect(result.current.stats.average).toBe(5);
    expect(result.current.stats.distribution[5]).toBe(1);
  });

  it('submitSurvey grava avaliacao sem agente com agent_id nulo', async () => {
    const query = makeQuery({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    const { result } = renderHook(() => useCSAT(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.submitSurvey.mutateAsync({ contact_id: 'c9', rating: 4 });
    });

    const insert = query.calls.find((c) => c.method === 'insert');
    expect(insert?.args[0]).toMatchObject({ contact_id: 'c9', agent_id: null, rating: 4 });
  });

  it('janela do breakdown ignora convite sem nota no total, na taxa e por fila', async () => {
    const nowIso = new Date().toISOString();
    const rated = {
      id: 's1',
      agent_id: 'a1',
      rating: 5,
      created_at: nowIso,
      agent: { name: 'Ana' },
      contact: { queue_id: 'q1' },
    };
    const unrated = { ...rated, id: 's2', rating: null };
    const csat = makeQuery([
      { data: [rated, unrated], error: null },
      { data: [], error: null },
    ]);
    const queues = makeQuery({ data: [{ id: 'q1', name: 'Fila 1' }], error: null });
    mockFrom.mockImplementation((table: string) => (table === 'queues' ? queues : csat));

    const { result } = renderHook(() => useSatisfactionBreakdown(7), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(ratingFilterSent(csat)).toBe(true);
    const data = result.current.data!;
    expect(data.totalResponses).toBe(1);
    expect(data.csatPercent).toBe(100);
    expect(data.distribution.find((d) => d.rating === 5)?.count).toBe(1);
    expect(data.byAgent).toHaveLength(1);
    expect(data.byAgent[0].responses).toBe(1);
    expect(data.byQueue).toHaveLength(1);
    expect(data.byQueue[0].responses).toBe(1);
    expect(data.timeline[data.timeline.length - 1]).toMatchObject({ responses: 1, csatPercent: 100 });
  });
});
