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
// F44: a criacao passou para a edge de dominio `multiplix-dispatch`; do modulo
// irma o hook importa apenas o erro nomeado do teto (F17) — o mock preserva os
// exports reais e neutraliza o `createMultiplixDraft`, que nao e mais usado.
vi.mock('../useMultiplixAudience', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useMultiplixAudience')>()),
  createMultiplixDraft: vi.fn(),
}));

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
  useConfirmMultiplixDispatch,
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

function recipientRow(id: string): MultiplixRecipientRow {
  return {
    id,
    company_name_snapshot: `Empresa ${id}`,
    destino_e164: '+5511999999999',
    status: 'pending',
    sent_at: null,
    error_message: null,
    personalized_message: null,
  } as unknown as MultiplixRecipientRow;
}

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

  it('useMultiplixDispatch pede o disparo por id na edge (dispatch_id no payload)', async () => {
    functionsInvoke.mockResolvedValue({ data: { data: { dispatches: [DISPATCH_A, DISPATCH_B], total: 2 } }, error: null });

    const { result } = renderHook(() => useMultiplixDispatch('d2'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(DISPATCH_B);
    expect(functionsInvoke).toHaveBeenCalledWith('multiplix-dispatch', expect.objectContaining({
      body: { action: 'dispatch.list', payload: { limit: 50, offset: 0, dispatch_id: 'd2' } },
    }));
  });

  it('useMultiplixDispatch acha um disparo FORA dos 50 mais recentes (recorte por id)', async () => {
    // A edge so devolve o alvo quando o `dispatch_id` viaja no payload: o
    // recorte por id entra no MESMO WHERE do escopo de dono. Sem o filtro a
    // resposta e a pagina dos 50 mais recentes, onde o alvo (antigo) nao esta.
    const TARGET = { ...DISPATCH_A, id: 'd-antigo', name: 'Disparo antigo' } as MultiplixDispatch;
    functionsInvoke.mockImplementation((_fn: string, options: { body: { payload: { dispatch_id?: string } } }) =>
      Promise.resolve(
        options.body.payload.dispatch_id === TARGET.id
          ? { data: { data: { dispatches: [TARGET], total: 1 } }, error: null }
          : { data: { data: { dispatches: [DISPATCH_A, DISPATCH_B], total: 50 } }, error: null },
      ));

    const { result } = renderHook(() => useMultiplixDispatch('d-antigo'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(TARGET);
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
    expect(result.current.data?.rows).toEqual([RECIPIENT_1]);
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

  // R2-MOD-022: a edge responde `{ data: rows, meta: { limit, offset, total } }` —
  // o `total` (a continuacao) mora no `meta`. Se o hook so olhar o array, ele
  // descarta o tamanho exato da lista e nao sabe se ha mais paginas.
  it('readMultiplixList le o total do envelope meta da edge', () => {
    expect(readMultiplixList({ data: [1], meta: { limit: 500, offset: 0, total: 42 } }))
      .toEqual({ rows: [1], total: 42 });
    // total explicito dentro de `data` vence o do `meta` (nao sobrescreve com lixo)
    expect(readMultiplixList({ data: { recipients: [1], total: 7 }, meta: { total: 9 } }))
      .toEqual({ rows: [1], total: 7 });
    // sem total em lugar nenhum continua sendo null (nao se inventa contagem)
    expect(readMultiplixList({ data: [1], meta: { limit: 500, offset: 0 } }))
      .toEqual({ rows: [1], total: null });
  });

  // R2-MOD-022, aceite 1: "destinatario 501 e alcancavel e o total corresponde ao
  // servidor". O hook pede a pagina 1 (offset 0, limite 500); como ela veio cheia e
  // o total do servidor e 501, ele PEDE A PAGINA 2 em vez de devolver so o primeiro lote.
  it('useMultiplixRecipients pagina ate o total e alcanca o destinatario 501', async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => recipientRow(`r${i + 1}`));
    functionsInvoke
      .mockResolvedValueOnce({ data: { data: page1, meta: { limit: 500, offset: 0, total: 501 } }, error: null })
      .mockResolvedValueOnce({ data: { data: [recipientRow('r501')], meta: { limit: 500, offset: 500, total: 501 } }, error: null });

    const { result } = renderHook(() => useMultiplixRecipients('d1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.total).toBe(501);
    const rows = result.current.data?.rows ?? [];
    expect(rows).toHaveLength(501);
    expect(rows[rows.length - 1]?.id).toBe('r501');
    expect(functionsInvoke).toHaveBeenCalledTimes(2);
    expect(functionsInvoke).toHaveBeenNthCalledWith(2, 'multiplix-dispatch', {
      body: { action: 'recipients.list', payload: { dispatch_id: 'd1', limit: 500, offset: 500 } },
      headers: { Authorization: 'Bearer tok-123' },
    });
  });

  // Guarda do outro lado: quando a pagina cheia JA fecha o total do servidor, nao
  // se pede uma pagina a mais (e nao se mostra "carregando" sem fim).
  it('useMultiplixRecipients nao pede pagina extra quando o total ja foi alcancado', async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => recipientRow(`r${i + 1}`));
    functionsInvoke.mockResolvedValue({ data: { data: page1, meta: { limit: 500, offset: 0, total: 500 } }, error: null });

    const { result } = renderHook(() => useMultiplixRecipients('d1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(functionsInvoke).toHaveBeenCalledTimes(1);
    expect(result.current.data?.rows).toHaveLength(500);
    expect(result.current.data?.truncated).toBe(false);
  });

  // A lista por status continua paginando pelo TOTAL do proprio status.
  it('useMultiplixRecipients mantem o filtro de status em todas as paginas', async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => recipientRow(`f${i + 1}`));
    functionsInvoke
      .mockResolvedValueOnce({ data: { data: page1, meta: { limit: 500, offset: 0, total: 700 } }, error: null })
      .mockResolvedValueOnce({ data: { data: [recipientRow('f501')], meta: { limit: 500, offset: 500, total: 700 } }, error: null });

    const { result } = renderHook(() => useMultiplixRecipients('d1', 'failed'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(functionsInvoke).toHaveBeenNthCalledWith(2, 'multiplix-dispatch', {
      body: { action: 'recipients.list', payload: { dispatch_id: 'd1', limit: 500, offset: 500, status: 'failed' } },
      headers: { Authorization: 'Bearer tok-123' },
    });
    expect(result.current.data?.rows).toHaveLength(501);
  });
});

/**
 * F51 — `confirm` (o front NAO materializa a fila): a transacao vive na edge/RPC.
 * O que o front tem de garantir e (a) mandar a versao REVISADA e (b) tratar o
 * clique repetido (`created: false`) como sucesso, para 5 cliques = 1 execucao.
 */
describe('F51 — confirm pela edge `multiplix-dispatch`', () => {
  function confirmPayload(over: Record<string, unknown> = {}) {
    return {
      dispatch_id: 'd1',
      dispatch_version: 4,
      status: 'sending',
      scheduled_at: null,
      recipient_count: 10,
      block_count: 2,
      items_created: 20,
      items_total: 20,
      message_count: 20,
      created: true,
      ...over,
    };
  }

  it('useConfirmMultiplixDispatch manda dispatch_version revisada e devolve o que foi congelado', async () => {
    functionsInvoke.mockResolvedValue({ data: { data: confirmPayload() }, error: null });

    const { result } = renderHook(() => useConfirmMultiplixDispatch(), { wrapper: createWrapper() });
    const out = await result.current.mutateAsync({ dispatchId: 'd1', dispatchVersion: 3 });

    expect(functionsInvoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: { action: 'confirm', payload: { dispatch_id: 'd1', dispatch_version: 3 } },
      headers: { Authorization: 'Bearer tok-123' },
    });
    expect(out).toMatchObject({ dispatch_version: 4, items_created: 20, created: true });
  });

  it('clique repetido com a MESMA versao nao vira erro (created:false = 1 execucao)', async () => {
    functionsInvoke
      .mockResolvedValueOnce({ data: { data: confirmPayload() }, error: null })
      .mockResolvedValueOnce({
        data: { data: confirmPayload({ created: false, items_created: 0 }) },
        error: null,
      });

    const { result } = renderHook(() => useConfirmMultiplixDispatch(), { wrapper: createWrapper() });
    const first = await result.current.mutateAsync({ dispatchId: 'd1', dispatchVersion: 3 });
    const second = await result.current.mutateAsync({ dispatchId: 'd1', dispatchVersion: 3 });

    expect(first.created).toBe(true);
    expect(second).toMatchObject({ created: false, items_created: 0 });
    expect(functionsInvoke).toHaveBeenNthCalledWith(2, 'multiplix-dispatch', {
      body: { action: 'confirm', payload: { dispatch_id: 'd1', dispatch_version: 3 } },
      headers: { Authorization: 'Bearer tok-123' },
    });
  });

  it('recusa da revalidacao (F49) sobe o codigo nomeado em vez de sucesso silencioso', async () => {
    const context = new Response(JSON.stringify({ error: 'multiplix_confirm_no_eligible_recipients' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
    functionsInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context },
    });

    const { result } = renderHook(() => useConfirmMultiplixDispatch(), { wrapper: createWrapper() });
    await expect(
      result.current.mutateAsync({ dispatchId: 'd1', dispatchVersion: 3 }),
    ).rejects.toMatchObject({
      name: 'MultiplixDispatchEdgeError',
      code: 'multiplix_confirm_no_eligible_recipients',
    });
  });

  it('resposta fora do envelope do confirm falha alto (nada de confirmar em silencio)', async () => {
    functionsInvoke.mockResolvedValue({ data: { nope: true }, error: null });

    const { result } = renderHook(() => useConfirmMultiplixDispatch(), { wrapper: createWrapper() });
    await expect(
      result.current.mutateAsync({ dispatchId: 'd1', dispatchVersion: 3 }),
    ).rejects.toMatchObject({ code: 'multiplix_confirm_shape' });
  });
});
