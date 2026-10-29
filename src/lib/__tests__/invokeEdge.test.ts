/**
 * PE-16 — o id de correlação do navegador chega à Edge Function.
 *
 * O CRITÉRIO DE PRONTO é "erro do cliente e log da Edge compartilham o mesmo id".
 * Como a Edge (`_shared/observability.ts`) só aceita `x-request-id` no formato
 * `^[A-Za-z0-9._-]{8,64}$` e loga esse valor como `rid`, o teste prova três coisas:
 *   1. o id vai no cabeçalho que a Edge lê, no formato que ela valida (senão ela
 *      geraria OUTRO id e a correlação não existiria);
 *   2. o log de erro do cliente carrega esse MESMO id;
 *   3. o log não vaza corpo/telefone/token.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { supabase } from '@/integrations/supabase/client';
import { invokeEdge, makeTraceparent, CORRELATION_HEADER, REQUEST_ID_HEADER } from '../invokeEdge';

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

/** Mesmo formato que `REQUEST_ID_RE` de `_shared/observability.ts`. */
const EDGE_REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

function headersOf(callIndex = 0): Record<string, string> {
  const options = invoke.mock.calls[callIndex][1] as { headers?: Record<string, string> };
  return options.headers ?? {};
}

describe('invokeEdge — correlação front → Edge', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    invoke.mockReset();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('manda o MESMO id em x-request-id e x-correlation-id, no formato que a Edge aceita', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await invokeEdge('message-delivery', { body: { messageId: 'm1' } });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe('message-delivery');

    const headers = headersOf();
    const requestId = headers[REQUEST_ID_HEADER];
    expect(requestId).toBeDefined();
    expect(EDGE_REQUEST_ID_RE.test(requestId)).toBe(true);
    expect(headers[CORRELATION_HEADER]).toBe(requestId);
    // o corpo do chamador é repassado sem alteração
    expect((invoke.mock.calls[0][1] as { body?: unknown }).body).toEqual({ messageId: 'm1' });
  });

  it('gera um traceparent W3C v0 válido', async () => {
    invoke.mockResolvedValue({ data: null, error: null });

    await invokeEdge('status');

    expect(headersOf().traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(makeTraceparent()).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it('cabeçalho do chamador tem precedência (trace externo continua o mesmo id)', async () => {
    invoke.mockResolvedValue({ data: null, error: null });

    await invokeEdge('status', { headers: { [REQUEST_ID_HEADER]: 'edge-abc-1234' } });

    const headers = headersOf();
    expect(headers[REQUEST_ID_HEADER]).toBe('edge-abc-1234');
    expect(headers[CORRELATION_HEADER]).toBe('edge-abc-1234');
  });

  it('erro: o log do cliente carrega o mesmo id que foi no cabeçalho', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        name: 'FunctionsHttpError',
        context: { status: 422 },
      }),
    });

    const result = await invokeEdge('message-delivery', {
      body: { messageId: 'm1', telefone: '5511999999999' },
    });

    expect(result.error).toBeTruthy();
    const requestId = headersOf()[REQUEST_ID_HEADER];
    const logged = errorSpy.mock.calls
      .flat()
      .map((arg: unknown) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join('\n');
    expect(logged).toContain(requestId);
    expect(logged).toContain('message-delivery');
    expect(logged).toContain('422');
    // sem dado pessoal: o corpo do chamador nunca vai para o log
    expect(logged).not.toContain('5511999999999');
  });

  it('sucesso: nenhuma linha de erro', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await invokeEdge('status');

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('cada chamada tem o seu próprio id', async () => {
    invoke.mockResolvedValue({ data: null, error: null });

    await invokeEdge('status');
    await invokeEdge('status');

    expect(headersOf(0)[REQUEST_ID_HEADER]).not.toBe(headersOf(1)[REQUEST_ID_HEADER]);
  });
});
