/**
 * Leitor único do corpo de erro das Edge Functions.
 *
 * CRITÉRIO DE PRONTO deste cartão: o erro do cliente carrega o código do
 * servidor em vez do genérico "Edge Function returned a non-2xx status code", e
 * existe UMA só cópia do parser. Este teste prova as duas pontas:
 *   1. `parseEdgeError` reconhece o envelope canônico, o código plano e a falha
 *      de rede, extraindo código/mensagem/erros-por-campo;
 *   2. `invokeEdge` devolve um `EdgeFunctionError` com esse `code` — junto com
 *      `fieldErrors` — mesmo com o SDK entregando só "non-2xx".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { supabase } from '@/integrations/supabase/client';
import {
  EDGE_ERROR_NETWORK,
  EdgeFunctionError,
  invokeEdge,
  parseEdgeError,
  readEdgeErrorBody,
} from '../invokeEdge';

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

/** Response falsa, como o supabase-js entrega em `error.context` (só `clone().json()`). */
function httpError(status: number, body: unknown) {
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: { status, clone: () => ({ json: async () => body }) },
  };
}

describe('parseEdgeError — código do servidor em vez de "non-2xx"', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { errorSpy.mockRestore(); });

  it('lê o envelope canônico `{ error: { code, message, fields } }`', async () => {
    const parsed = await parseEdgeError(httpError(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Payload inválido',
        fields: [
          { path: 'phone', message: 'telefone inválido' },
          { path: 'name', message: 'nome obrigatório' },
        ],
      },
    }));

    expect(parsed.code).toBe('VALIDATION_ERROR');
    expect(parsed.message).toBe('Payload inválido');
    expect(parsed.fieldErrors).toEqual({ phone: 'telefone inválido', name: 'nome obrigatório' });
    expect(parsed.status).toBe(400);
  });

  it('lê o código plano `{ error, message }` que as edges de domínio devolvem', async () => {
    const parsed = await parseEdgeError(httpError(403, {
      error: 'forbidden',
      message: 'Você não tem permissão para esta ação',
    }));

    expect(parsed.code).toBe('forbidden');
    expect(parsed.message).toBe('Você não tem permissão para esta ação');
  });

  it('usa o próprio código como mensagem quando o corpo não traz `message`', async () => {
    const parsed = await parseEdgeError(httpError(400, { error: 'multiplix_nao_autenticado' }));
    expect(parsed.code).toBe('multiplix_nao_autenticado');
    expect(parsed.message).toBe('multiplix_nao_autenticado');
  });

  it('marca como rede quando não há corpo (nem status) para ler', async () => {
    const parsed = await parseEdgeError({ name: 'FunctionsFetchError', message: 'Failed to fetch' }, 'Falha de rede');
    expect(parsed.code).toBe(EDGE_ERROR_NETWORK);
    expect(parsed.message).toBe('Failed to fetch');
    expect(parsed.status).toBeNull();
  });

  it('não inventa texto: corpo sem JSON cai na mensagem do SDK', async () => {
    const semJson = {
      message: 'Edge Function returned a non-2xx status code',
      context: { status: 502, clone: () => ({ json: async () => { throw new Error('not json'); } }) },
    };
    const parsed = await parseEdgeError(semJson, 'fallback');
    expect(parsed.message).toBe('Edge Function returned a non-2xx status code');
  });

  it('readEdgeErrorBody devolve o corpo cru (e null quando não há como ler)', async () => {
    expect(await readEdgeErrorBody(httpError(400, { error: 'x' }))).toEqual({ error: 'x' });
    expect(await readEdgeErrorBody({ message: 'sem context' })).toBeNull();
    expect(await readEdgeErrorBody({ context: {} })).toBeNull();
  });
});

describe('invokeEdge — o erro carrega o código do servidor', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    invoke.mockReset();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { errorSpy.mockRestore(); });

  it('devolve EdgeFunctionError com code e fieldErrors do corpo da Edge', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(422, {
        error: { code: 'VALIDATION_ERROR', message: 'Campo obrigatório', fields: [{ path: 'email', message: 'informe o e-mail' }] },
      }),
    });

    const { data, error } = await invokeEdge('approve-password-reset', { body: { requestId: 'r1' } });

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(EdgeFunctionError);
    expect(error?.code).toBe('VALIDATION_ERROR');
    expect(error?.message).toBe('Campo obrigatório');
    expect(error?.fieldErrors).toEqual({ email: 'informe o e-mail' });
    expect(error?.status).toBe(422);
    // Nunca lança: o chamador decide. E o `Error` continua podendo ser `throw`ado.
    expect(error?.functionName).toBe('approve-password-reset');
  });

  it('sucesso devolve data e error null', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const { data, error } = await invokeEdge<{ ok: boolean }>('x');
    expect(data).toEqual({ ok: true });
    expect(error).toBeNull();
  });
});
