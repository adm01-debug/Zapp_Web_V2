/**
 * Bloco E (API de dominio) — as LEITURAS do front saem do PostgREST e passam a
 * chamar a edge `multiplix-dispatch` com o JWT da sessao.
 *
 * O objetivo deste teste e provar, com o mock de `supabase.functions.invoke`:
 *  - a edge e chamada com `{ action, payload }` e header `Authorization`;
 *  - `supabase.from` NAO e usado (o cliente mockado nem o expoe — se qualquer
 *    hook voltasse a ler a tabela direto, o teste quebraria);
 *  - a forma do dado entregue aos componentes e a mesma de antes;
 *  - o erro nomeado da edge (`{ error: <codigo> }` em `error.context`) vira a
 *    mensagem do Error lancado.
 */
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authGetSession = vi.fn();
const functionsInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => authGetSession(...args) },
    functions: { invoke: (...args: unknown[]) => functionsInvoke(...args) },
    // Sem `from`: qualquer leitura direta de tabela falharia aqui.
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../useMultiplixAudience', () => ({ createMultiplixDraft: vi.fn() }));

import { supabase } from '@/integrations/supabase/client';
import {
  invokeMultiplixDispatch,
  readMultiplixList,
  fetchMultiplixRecipientsTotal,
  useMultiplixDispatchesList,
  useMultiplixDispatch,
  useMultiplixRecipients,
  MultiplixDispatchEdgeError,
  type MultiplixDispatch,
  type MultiplixRecipientRow,
} from '@/hooks/integrations/useMultiplixDispatches';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const DISPATCH_A = {
  id: 'd1', name: 'Disparo A', message_template: 'oi', status: 'sending',
  total_recipients: 10, sent_count: 3, failed_count: 0, delivered_count: 2,
  outcome_unknown_count: 0, started_at: null, paused_at: null, pause_reason: null,
  completed_at: null, created_at: '2026-10-02T00:00:00Z',
} as unknown as MultiplixDispatch;

const DISPATCH_B = { ...DISPATCH_A, id: 'd2', name: 'Disparo B' } as MultiplixDispatch;

const RECIPIENT_1 = {
  id: 'r1', company_name_snapshot: 'Empresa 1', destino_e164: '+5511999998888',
  status: 'sent', sent_at: '2026-10-02T00:00:01Z', error_message: null,
  personalized_message: null,
} as unknown as MultiplixRecipientRow;

beforeEach(() => {
  vi.clearAllMocks();
  authGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
});

describe('useMultiplixDispatches — leituras via edge `multiplix-dispatch`', () => {
  it('useMultiplixDispatchesList chama dispatch.list com JWT e entrega as linhas', async () => {
    functionsInvoke.mockResolvedValue({ data: { data: { rows: [DISPATCH_A, DISPATCH_B], total: 2 } }, error: null });

    const { result } = renderHook(() => useMultiplixDispatchesList(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(functionsInvoke).toHaveBeenCalledTimes(1);
    expect(functionsInvoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: { action: 'dispatch.list', payload: { limit: 50, offset: 0 } },
      headers: { Authorization: 'Bearer tok-123' },
    });
    expect(result.current.data).toEqual([DISPATCH_A, DISPATCH_B]);
    expect((supabase as unknown as { from?: unknown }).from).toBeUndefined();
  });

  it('useMultiplixDispatchesList aceita a lista direta em data', async () => {
    functionsInvoke.mockResolvedValue({ data: { data: [DISPATCH_A] }, error: null });

    const { result } = renderHook(() => useMultiplixDispatchesList(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([DISPATCH_A]);
  });

  it('useMultiplixDispatch localiza o disparo pelo id na lista da edge', async () => {
    functionsInvoke.mockResolvedValue({ data: { data: { dispatches: [DISPATCH_A, DISPATCH_B], total: 2 } }, error: null });

    const { result } = renderHook(() => useMultiplixDispatch('d2'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(DISPATCH_B);
    expect(functionsInvoke).toHaveBeenCalledWith('multiplix-dispatch', expect.objectContaining({
      body: { action: 'dispatch.list', payload: { limit: 50, offset: 0 } },
    }));
  });

  it('useMultiplixDispatch falha com erro nomeado quando o id nao esta na lista', async () => {
    functionsInvoke.mockResolvedValue({ data: { data: [DISPATCH_A] }, error: null });

    const { result } = renderHook(() => useMultiplixDispatch('d2'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const err = result.current.error as MultiplixDispatchEdgeError;
    expect(err).toBeInstanceOf(MultiplixDispatchEdgeError);
    expect(err.code).toBe('multiplix_dispatch_not_found');
  });

  it('useMultiplixRecipients chama recipients.list com dispatch_id e status', async () => {
    functionsInvoke.mockResolvedValue({ data: { data: { recipients: [RECIPIENT_1], total: 1 } }, error: null });

    const { result } = renderHook(() => useMultiplixRecipients('d1', 'sent'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(functionsInvoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: { action: 'recipients.list', payload: { dispatch_id: 'd1', limit: 500, offset: 0, status: 'sent' } },
      headers: { Authorization: 'Bearer tok-123' },
    });
    expect(result.current.data).toEqual([RECIPIENT_1]);
  });

  it("useMultiplixRecipients nao envia status quando o filtro e 'all'", async () => {
    functionsInvoke.mockResolvedValue({ data: { data: [] }, error: null });

    const { result } = renderHook(() => useMultiplixRecipients('d1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(functionsInvoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: { action: 'recipients.list', payload: { dispatch_id: 'd1', limit: 500, offset: 0 } },
      headers: { Authorization: 'Bearer tok-123' },
    });
  });

  it('fetchMultiplixRecipientsTotal usa o total exato devolvido pela edge', async () => {
    functionsInvoke.mockResolvedValue({ data: { data: { rows: [RECIPIENT_1], total: 7 } }, error: null });

    await expect(fetchMultiplixRecipientsTotal('d1', 'skipped')).resolves.toBe(7);
    expect(functionsInvoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: { action: 'recipients.list', payload: { dispatch_id: 'd1', status: 'skipped', limit: 1000, offset: 0 } },
      headers: { Authorization: 'Bearer tok-123' },
    });
  });

  it('fetchMultiplixRecipientsTotal cai para o tamanho da pagina quando nao ha total', async () => {
    functionsInvoke.mockResolvedValue({ data: { data: [RECIPIENT_1] }, error: null });
    await expect(fetchMultiplixRecipientsTotal('d1', 'skipped')).resolves.toBe(1);
  });

  it('erro nomeado da edge em error.context vira a mensagem do Error lancado', async () => {
    const context = new Response(JSON.stringify({ error: 'multiplix_dispatch_not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
    functionsInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context },
    });

    await expect(invokeMultiplixDispatch('dispatch.list', {})).rejects.toMatchObject({
      name: 'MultiplixDispatchEdgeError',
      code: 'multiplix_dispatch_not_found',
    });
  });

  it('readMultiplixList nao inventa total e falha alto num formato desconhecido', () => {
    expect(readMultiplixList([])).toEqual({ rows: [], total: null });
    expect(readMultiplixList({ rows: [1], total: 9 })).toEqual({ rows: [1], total: 9 });
    expect(() => readMultiplixList({ nope: true })).toThrow(/formato inesperado/);
  });
});
