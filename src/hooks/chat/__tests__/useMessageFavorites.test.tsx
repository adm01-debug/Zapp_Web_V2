import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** A02 — favoritar mensagem (`useMessageFavorites` / `useToggleMessageFavorite`).
 *  Client simulado: leitura de `message_favorites` com filtro pelo contato e RPC
 *  `toggle_message_favorite`. O teste do rollback derruba a releitura seguinte para
 *  que o valor restaurado pelo `onError` seja observável sem o refetch mascará-lo. */

const h = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  readError: null as { message: string; code?: string } | null,
  failReads: false,
  rpcResult: null as { data: unknown; error: { message: string; code?: string } | null } | null,
  gate: null as null | { release: () => void },
  rpcCalls: [] as Array<{ fn: string; args?: Record<string, unknown> }>,
  queries: [] as Array<{ table: string; eq: Array<[string, unknown]> }>,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => {
  const makeChain = (table: string) => {
    const entry: { eq: Array<[string, unknown]> } = { eq: [] };
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (col: string, val: unknown) => { entry.eq.push([col, val]); return chain; };
    chain.order = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      h.queries.push({ table, eq: entry.eq });
      const error = h.failReads ? { message: 'leitura_falhou' } : h.readError;
      return Promise.resolve({ data: error ? null : (h.rows[table] ?? []), error }).then(resolve, reject);
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => makeChain(table),
      rpc: (fn: string, args?: Record<string, unknown>) => {
        h.rpcCalls.push({ fn, args });
        const resultado = h.rpcResult ?? { data: null, error: null };
        if (h.gate) return new Promise<typeof resultado>((resolve) => { h.gate!.release = () => resolve(resultado); });
        return Promise.resolve(resultado);
      },
      channel: () => { const c: Record<string, unknown> = {}; c.on = () => c; c.subscribe = () => c; return c; },
      removeChannel: vi.fn(),
    },
  };
});

import { toast } from 'sonner';
import {
  useMessageFavorites,
  useToggleMessageFavorite,
  messageFavoritesKey,
} from '@/hooks/chat/useMessageFavorites';

let queryClient: QueryClient;
const novoCliente = () => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

function montar(contactId = 'contact-1') {
  return renderHook(
    () => ({ fav: useMessageFavorites(contactId), toggle: useToggleMessageFavorite() }),
    { wrapper: novoCliente() },
  );
}

beforeEach(() => {
  h.rows = {};
  h.readError = null;
  h.failReads = false;
  h.rpcResult = null;
  h.gate = null;
  h.rpcCalls = [];
  h.queries = [];
  vi.clearAllMocks();
});

describe('useMessageFavorites — leitura', () => {
  it('carrega o conjunto de favoritas da conversa filtrando pelo contato', async () => {
    h.rows.message_favorites = [{ message_id: 'm1' }, { message_id: 'm2' }];
    const { result } = montar();
    await waitFor(() => expect(result.current.fav.isLoading).toBe(false));

    expect([...result.current.fav.favoriteIds].sort()).toEqual(['m1', 'm2']);
    expect(result.current.fav.isFavorite('m1')).toBe(true);
    expect(result.current.fav.isFavorite('m9')).toBe(false);

    const leitura = h.queries.find((q) => q.table === 'message_favorites');
    expect(leitura?.eq).toEqual([['messages.contact_id', 'contact-1']]);
  });

  it('não consulta o banco quando o contato é nulo', async () => {
    const { result } = montar(null as unknown as string);
    await waitFor(() => expect(result.current.fav.isLoading).toBe(false));
    expect(h.queries).toHaveLength(0);
    expect(result.current.fav.favoriteIds.size).toBe(0);
  });
});

describe('useToggleMessageFavorite — escrita', () => {
  it('favorita de forma otimista (antes da RPC responder) e confirma depois', async () => {
    h.rows.message_favorites = [];
    h.rpcResult = { data: true, error: null };
    h.gate = { release: () => {} }; // segura a RPC para observar o otimismo
    const { result } = montar();
    await waitFor(() => expect(result.current.fav.isLoading).toBe(false));

    let pendente!: Promise<unknown>;
    act(() => { pendente = result.current.toggle.toggleFavorite('m9'); });

    await waitFor(() =>
      expect(queryClient.getQueryData<Set<string>>(messageFavoritesKey('contact-1'))?.has('m9')).toBe(true),
    );
    expect(h.rpcCalls).toEqual([{ fn: 'toggle_message_favorite', args: { p_message_id: 'm9' } }]);

    h.gate.release();
    await act(async () => { await pendente; });
  });

  it('desfaz o otimismo e traduz o erro quando a RPC nega a mensagem', async () => {
    h.rows.message_favorites = [{ message_id: 'm1' }];
    const { result } = montar();
    await waitFor(() => expect(result.current.fav.isLoading).toBe(false));

    h.rpcResult = { data: null, error: { message: 'message_not_visible', code: '42501' } };
    h.failReads = true; // a releitura do onSettled falha: sobra só o valor restaurado

    await act(async () => {
      await expect(result.current.toggle.toggleFavorite('m1')).rejects.toBeTruthy();
    });

    const cache = queryClient.getQueryData<Set<string>>(messageFavoritesKey('contact-1'));
    expect(cache?.has('m1')).toBe(true); // estado original restaurado (não sumiu)
    expect(toast.error).toHaveBeenCalledWith('Você não tem permissão para esta ação nesta mensagem');
  });
});
