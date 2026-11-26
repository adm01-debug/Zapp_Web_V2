import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** A04 — reportar mensagem (`useReportMessage`): sucesso, motivo inválido e a
 *  guarda local de "já reportada" (o RPC é idempotente; sem a guarda o usuário
 *  não receberia feedback). */

const h = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  rpcResult: null as { data: unknown; error: { message: string; code?: string } | null } | null,
  rpcCalls: [] as Array<{ fn: string; args?: Record<string, unknown> }>,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => {
  const makeChain = (table: string) => {
    const entry: { eq: Array<[string, unknown]> } = { eq: [] };
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (col: string, val: unknown) => { entry.eq.push([col, val]); return chain; };
    chain.order = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: h.rows[table] ?? [], error: null }).then(resolve, reject);
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => makeChain(table),
      rpc: (fn: string, args?: Record<string, unknown>) => {
        h.rpcCalls.push({ fn, args });
        return Promise.resolve(h.rpcResult ?? { data: null, error: null });
      },
      channel: () => { const c: Record<string, unknown> = {}; c.on = () => c; c.subscribe = () => c; return c; },
      removeChannel: vi.fn(),
    },
  };
});

import { toast } from 'sonner';
import { useReportMessage } from '@/hooks/chat/useReportMessage';

let queryClient: QueryClient;
const novoCliente = () => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

function montar(contactId = 'contact-1') {
  return renderHook(() => useReportMessage(contactId), { wrapper: novoCliente() });
}

beforeEach(() => {
  h.rows = {};
  h.rpcResult = null;
  h.rpcCalls = [];
  vi.clearAllMocks();
});

describe('useReportMessage', () => {
  it('reporta passando motivo e nota para a RPC e marca como reportada', async () => {
    h.rows.message_reports = [];
    h.rpcResult = { data: 'rep-1', error: null };
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.report('m1', 'improprio', 'linguagem ofensiva'); });

    expect(h.rpcCalls).toEqual([
      { fn: 'report_message', args: { p_message_id: 'm1', p_reason: 'improprio', p_note: 'linguagem ofensiva' } },
    ]);
    await waitFor(() => expect(result.current.isReported('m1')).toBe(true));
  });

  it('barra a mensagem já reportada sem chamar a RPC de novo', async () => {
    h.rows.message_reports = [{ message_id: 'm1' }];
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isReported('m1')).toBe(true);

    await act(async () => {
      await expect(result.current.report('m1', 'spam')).rejects.toBeTruthy();
    });

    expect(h.rpcCalls).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith('Você já reportou esta mensagem');
  });

  it('traduz o motivo inválido devolvido pelo banco', async () => {
    h.rows.message_reports = [];
    h.rpcResult = { data: null, error: { message: 'invalid_report_reason', code: '22023' } };
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.report('m1', 'improprio')).rejects.toBeTruthy();
    });

    expect(toast.error).toHaveBeenCalledWith('Motivo de denúncia inválido');
  });
});
