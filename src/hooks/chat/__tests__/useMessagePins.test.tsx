import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** A03 — fixar/desafixar (`useMessagePins`): lista ordenada, realtime por contato,
 *  otimismo com rollback e tradução do limite de 3 e da falta de permissão. */

const h = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  failReads: false,
  rpcResult: null as { data: unknown; error: { message: string; code?: string } | null } | null,
  gate: null as null | { release: () => void },
  rpcCalls: [] as Array<{ fn: string; args?: Record<string, unknown> }>,
  queries: [] as Array<{ table: string; eq: Array<[string, unknown]>; order: Array<{ col: string; opts?: unknown }> }>,
  channels: [] as string[],
  realtime: [] as Array<{ cfg: Record<string, unknown>; cb: () => void }>,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => {
  const makeChain = (table: string) => {
    const entry: { eq: Array<[string, unknown]>; order: Array<{ col: string; opts?: unknown }> } = { eq: [], order: [] };
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (col: string, val: unknown) => { entry.eq.push([col, val]); return chain; };
    chain.order = (col: string, opts?: unknown) => { entry.order.push({ col, opts }); return chain; };
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      h.queries.push({ table, eq: entry.eq, order: entry.order });
      const error = h.failReads ? { message: 'leitura_falhou' } : null;
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
      channel: (name: string) => {
        h.channels.push(name);
        const c: Record<string, unknown> = {};
        c.on = (_evt: string, cfg: Record<string, unknown>, cb: () => void) => { h.realtime.push({ cfg, cb }); return c; };
        c.subscribe = () => c;
        return c;
      },
      removeChannel: vi.fn(),
    },
  };
});

import { toast } from 'sonner';
import { useMessagePins, messagePinsKey, type MessagePin } from '@/hooks/chat/useMessagePins';

const PIN_A: MessagePin = { id: 'p-a', contact_id: 'contact-1', message_id: 'm1', pinned_by: 'u1', pinned_at: '2026-10-11T10:00:00.000Z' };
const PIN_B: MessagePin = { id: 'p-b', contact_id: 'contact-1', message_id: 'm2', pinned_by: 'u1', pinned_at: '2026-10-11T11:00:00.000Z' };

let queryClient: QueryClient;
const novoCliente = () => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

function montar(contactId = 'contact-1') {
  return renderHook(() => useMessagePins(contactId), { wrapper: novoCliente() });
}

beforeEach(() => {
  h.rows = {};
  h.failReads = false;
  h.rpcResult = null;
  h.gate = null;
  h.rpcCalls = [];
  h.queries = [];
  h.channels = [];
  h.realtime = [];
  vi.clearAllMocks();
});

describe('useMessagePins — leitura', () => {
  it('carrega as fixadas do contato com ordem determinística', async () => {
    h.rows.message_pins = [PIN_B, PIN_A];
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.pins.map((p) => p.message_id)).toEqual(['m2', 'm1']);
    expect(result.current.isPinned('m1')).toBe(true);

    const leitura = h.queries.find((q) => q.table === 'message_pins');
    expect(leitura?.eq).toEqual([['contact_id', 'contact-1']]);
    expect(leitura?.order).toEqual([
      { col: 'pinned_at', opts: { ascending: false } },
      { col: 'id', opts: { ascending: false } },
    ]);
  });

  it('assina o realtime da conversa e revalida a lista ao receber evento', async () => {
    h.rows.message_pins = [PIN_A];
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(h.channels).toContain('message-pins:contact-1');
    expect(h.realtime[0]?.cfg.table).toBe('message_pins');
    expect(h.realtime[0]?.cfg.filter).toBe('contact_id=eq.contact-1');

    const leiturasAntes = h.queries.filter((q) => q.table === 'message_pins').length;
    await act(async () => { h.realtime[0].cb(); });
    await waitFor(() =>
      expect(h.queries.filter((q) => q.table === 'message_pins').length).toBeGreaterThan(leiturasAntes),
    );
  });
});

describe('useMessagePins — escrita', () => {
  it('fixa de forma otimista (antes da RPC responder) e confirma depois', async () => {
    h.rows.message_pins = [];
    h.rpcResult = { data: 'p-nova', error: null };
    h.gate = { release: () => {} };
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let pendente!: Promise<unknown>;
    act(() => { pendente = result.current.pin('m9'); });

    await waitFor(() =>
      expect(queryClient.getQueryData<MessagePin[]>(messagePinsKey('contact-1'))?.some((p) => p.message_id === 'm9')).toBe(true),
    );
    expect(h.rpcCalls).toEqual([{ fn: 'pin_message', args: { p_message_id: 'm9' } }]);

    h.gate.release();
    await act(async () => { await pendente; });
  });

  it('desfaz o otimismo e traduz o limite de 3 fixadas', async () => {
    h.rows.message_pins = [PIN_A];
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    h.rpcResult = { data: null, error: { message: 'pin_limit_reached', code: '23514' } };
    h.failReads = true;

    await act(async () => {
      await expect(result.current.pin('m9')).rejects.toBeTruthy();
    });

    const cache = queryClient.getQueryData<MessagePin[]>(messagePinsKey('contact-1'));
    expect(cache?.some((p) => p.message_id === 'm9')).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Limite de 3 mensagens fixadas por conversa');
  });

  it('desafixa removendo da lista e traduz a falta de permissão', async () => {
    h.rows.message_pins = [PIN_A];
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    h.rpcResult = { data: null, error: { message: 'message_not_visible', code: '42501' } };
    h.failReads = true;

    await act(async () => {
      await expect(result.current.unpin('m1')).rejects.toBeTruthy();
    });

    expect(h.rpcCalls).toEqual([{ fn: 'unpin_message', args: { p_message_id: 'm1' } }]);
    const cache = queryClient.getQueryData<MessagePin[]>(messagePinsKey('contact-1'));
    expect(cache?.some((p) => p.message_id === 'm1')).toBe(true); // restaurado
    expect(toast.error).toHaveBeenCalledWith('Você não tem permissão para fixar esta mensagem');
  });
});
