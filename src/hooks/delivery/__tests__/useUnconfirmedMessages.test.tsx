import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// C110: o front publica antes do db-migrate. Enquanto a migration 20261111160000
// não chega, `messages.delivery_post_started_at`/`manually_resolved_at` não existem
// e o PostgREST devolve 42703: o painel tem de ficar vazio, sem erro e sem polling.
const state = vi.hoisted(() => ({
  result: { data: [] as unknown[] | null, error: null as { code?: string; message?: string } | null },
  calls: [] as Array<[string, ...unknown[]]>,
  froms: 0,
}));

vi.mock('@/integrations/supabase/client', () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'not', 'is', 'lt', 'order']) {
      chain[m] = (...args: unknown[]) => { state.calls.push([m, ...args]); return chain; };
    }
    chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(state.result).then(res, rej);
    return chain;
  };
  return {
    supabase: {
      from: () => { state.froms += 1; return makeChain(); },
      rpc: vi.fn(),
    },
  };
});
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

import { useUnconfirmedMessages, isSchemaNotReadyError, unconfirmedRefetchInterval } from '../useUnconfirmedMessages';

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  // retry padrão do app ligado (3): o caso pré-DDL não pode depender de retry:false.
  client = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 1 } } });
  state.result = { data: [], error: null };
  state.calls = [];
  state.froms = 0;
});

describe('useUnconfirmedMessages', () => {
  it('pré-DDL (42703): lista vazia, sem erro, sem retry e polling lento de 5 min', async () => {
    state.result = { data: null, error: { code: '42703', message: 'column messages.delivery_post_started_at does not exist' } };
    const { result } = renderHook(() => useUnconfirmedMessages('contact-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.messages).toEqual([]);
    expect(state.froms).toBe(1);
    const query = client.getQueryCache().find({ queryKey: ['unconfirmed-messages', 'contact-1', null] });
    const interval = (query?.options as { refetchInterval?: unknown }).refetchInterval;
    expect(typeof interval === 'function' ? (interval as (q: unknown) => unknown)(query) : interval).toBe(300_000);
  });

  it('PGRST202 também é tratado como schema ainda não pronto', () => {
    expect(isSchemaNotReadyError({ code: 'PGRST202' })).toBe(true);
    expect(isSchemaNotReadyError({ code: '42703' })).toBe(true);
    expect(isSchemaNotReadyError({ code: '42501' })).toBe(false);
    expect(isSchemaNotReadyError(null)).toBe(false);
  });

  it('pós-DDL: só lista status=sending (failed com carimbo foi recusa definitiva) e mantém o polling de 30 s', async () => {
    state.result = { data: [{ id: 'm1', content: 'oi', created_at: '2026-11-11T00:00:00Z', delivery_post_started_at: '2026-11-11T00:00:00Z', status: 'sending', contact_id: 'contact-1', agent_id: 'a1' }], error: null };
    const { result } = renderHook(() => useUnconfirmedMessages('contact-1'), { wrapper });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(state.calls).toContainEqual(['eq', 'status', 'sending']);
    expect(state.calls.some(([m, col]) => m === 'not' && col === 'status')).toBe(false);
    const query = client.getQueryCache().find({ queryKey: ['unconfirmed-messages', 'contact-1', null] });
    const interval = (query?.options as { refetchInterval?: unknown }).refetchInterval;
    expect(typeof interval === 'function' ? (interval as (q: unknown) => unknown)(query) : interval).toBe(30_000);
  });

  it('outro erro (ex.: permissão) continua sendo erro', async () => {
    state.result = { data: null, error: { code: '42501', message: 'permission denied' } };
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useUnconfirmedMessages('contact-1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    // Depois do erro o polling de 30 s vira espera crescente (medido antes: 11 requisições com erro em 5 min).
    const query = client.getQueryCache().find({ queryKey: ['unconfirmed-messages', 'contact-1', null] });
    const interval = (query?.options as { refetchInterval?: unknown }).refetchInterval;
    expect(typeof interval === 'function' ? (interval as (q: unknown) => unknown)(query) : interval).toBe(60_000);
  });

  it('espera crescente depois de erro: 1, 2, 4, 8 e teto de 10 min; volta a 30 s quando recupera', () => {
    const erro = (n: number) => unconfirmedRefetchInterval({ state: { status: 'error', errorUpdateCount: n } });
    expect([1, 2, 3, 4, 5, 9].map(erro)).toEqual([60_000, 120_000, 240_000, 480_000, 600_000, 600_000]);
    expect(unconfirmedRefetchInterval({ state: { status: 'error' } })).toBe(60_000);
    expect(unconfirmedRefetchInterval({ state: { status: 'success', data: { rows: [], schemaReady: true }, errorUpdateCount: 7 } })).toBe(30_000);
    expect(unconfirmedRefetchInterval({ state: { status: 'success', data: { rows: [], schemaReady: false } } })).toBe(300_000);
  });

  it('ignora o cache global de 5 min: revalida ao montar e ao voltar à aba', async () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000, refetchOnMount: false, refetchOnWindowFocus: false } } });
    const primeiro = renderHook(() => useUnconfirmedMessages('contact-1'), { wrapper });
    await waitFor(() => expect(primeiro.result.current.isLoading).toBe(false));
    primeiro.unmount();
    const antes = state.froms;
    const segundo = renderHook(() => useUnconfirmedMessages('contact-1'), { wrapper });
    await waitFor(() => expect(state.froms).toBe(antes + 1));
    segundo.unmount();
    const query = client.getQueryCache().find({ queryKey: ['unconfirmed-messages', 'contact-1', null] });
    const opts = query?.options as { refetchOnWindowFocus?: unknown; staleTime?: unknown };
    expect(opts.refetchOnWindowFocus).toBe(true);
    expect(opts.staleTime).toBe(0);
  });
});
