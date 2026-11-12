import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// PD-79/C110: o painel só lista mensagens AMBÍGUAS (status 'sending' com POST carimbado).
// 'failed' com carimbo é recusa definitiva e não pode ser oferecida como "entregue".
const state = vi.hoisted(() => ({
  result: { data: [] as unknown[] | null, error: null as { code?: string; message?: string } | null },
  calls: [] as Array<[string, ...unknown[]]>,
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
  return { supabase: { from: () => makeChain(), rpc: vi.fn() } };
});
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

import { useUnconfirmedMessages } from '../useUnconfirmedMessages';

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.result = { data: [], error: null };
  state.calls = [];
});

describe('useUnconfirmedMessages', () => {
  it('filtra só status=sending, carimbado, não resolvido e do contato', async () => {
    state.result = {
      data: [{ id: 'm1', content: 'oi', created_at: '2026-11-11T00:00:00Z', delivery_post_started_at: '2026-11-11T00:00:00Z', status: 'sending', contact_id: 'contact-1', agent_id: 'a1' }],
      error: null,
    };
    const { result } = renderHook(() => useUnconfirmedMessages('contact-1'), { wrapper });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(state.calls).toContainEqual(['eq', 'status', 'sending']);
    expect(state.calls.some(([m, col]) => m === 'not' && col === 'status')).toBe(false);
    expect(state.calls).toContainEqual(['not', 'delivery_post_started_at', 'is', null]);
    expect(state.calls).toContainEqual(['is', 'manually_resolved_at', null]);
    expect(state.calls).toContainEqual(['eq', 'contact_id', 'contact-1']);
  });

  it('grupo: mesmo filtro de status, por whatsapp_group_id', async () => {
    const { result } = renderHook(() => useUnconfirmedMessages(null, 'g1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(state.calls).toContainEqual(['eq', 'status', 'sending']);
    expect(state.calls).toContainEqual(['eq', 'whatsapp_group_id', 'g1']);
    expect(state.calls).toContainEqual(['is', 'contact_id', null]);
  });

  it('erro do PostgREST continua sendo erro', async () => {
    state.result = { data: null, error: { code: '42501', message: 'permission denied' } };
    const { result } = renderHook(() => useUnconfirmedMessages('contact-1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.messages).toEqual([]);
  });
});
