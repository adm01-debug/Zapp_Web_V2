import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUPABASE_FETCH_TIMEOUT_MS, supabaseFetch } from '../client';

/**
 * Rede do cliente Supabase: tempo limite e retry seletivo.
 *
 * Antes não havia limite nem repetição: um proxy travado deixava o request
 * pendente para sempre, e um blip de rede virava erro definitivo. Aqui provamos
 * o recorte do cartão:
 *   1. nenhuma requisição fica pendente além de 12s;
 *   2. `GET` de leitura repete falha transitória (rede, 429, 5xx) com backoff;
 *   3. `POST` de ESCRITA nunca é repetido automaticamente;
 *   4. `POST` de RPC de LEITURA (allowlist) repete; RPC de escrita não;
 *   5. `/auth/v1/` e corpo em stream passam direto;
 *   6. esgotadas as tentativas, a resposta 5xx volta como veio (o postgrest
 *      continua decidindo o erro — o contrato de quem lê `{ error }` não muda).
 */

const REST = 'https://sb-testref.supabase.co';
const fetchMock = vi.fn();

/** fetch que nunca resolve por conta própria: só rejeita quando abortado. */
const fetchQuePendura = () =>
  new Promise<Response>((_resolve, reject) => {
    const init = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1] as RequestInit;
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });

describe('supabaseFetch — tempo limite e retry seletivo', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('aborta em 12s e não deixa a requisição pendente', async () => {
    fetchMock.mockImplementation(() => fetchQuePendura());

    const pendente = supabaseFetch(`${REST}/rest/v1/profiles?select=*`, { method: 'GET' });
    const rejeicao = expect(pendente).rejects.toMatchObject({ name: 'TimeoutError' });

    await vi.advanceTimersByTimeAsync(SUPABASE_FETCH_TIMEOUT_MS + 1);
    await rejeicao;

    // Timeout não é repetido: repetir um banco saturado dobraria a carga.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('GET repete falha de rede e devolve a resposta da tentativa que funcionou', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('', { status: 200 }));

    const resposta = supabaseFetch(`${REST}/rest/v1/profiles?select=*`, { method: 'GET' });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(resposta).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('GET repete 429/5xx e, esgotadas as tentativas, devolve a resposta final sem lançar', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));

    const resposta = supabaseFetch(`${REST}/rest/v1/profiles?select=*`, { method: 'GET' });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(resposta).resolves.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 retentativas
  });

  it('POST de ESCRITA nunca é repetido', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      supabaseFetch(`${REST}/rest/v1/messages`, { method: 'POST', body: '{"content":"oi"}' })
    ).rejects.toBeInstanceOf(TypeError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('POST de RPC de leitura (allowlist) repete; RPC de escrita não', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('', { status: 200 }));

    const leitura = supabaseFetch(`${REST}/rest/v1/rpc/search_contacts`, {
      method: 'POST',
      body: '{"term":"ana"}',
    });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(leitura).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      supabaseFetch(`${REST}/rest/v1/rpc/enqueue_outbound_message`, {
        method: 'POST',
        body: '{"client_message_id":"x"}',
      })
    ).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('/auth/v1/ passa direto (o refresh tem temporização própria)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      supabaseFetch(`${REST}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        body: '{}',
      })
    ).rejects.toBeInstanceOf(TypeError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('corpo em stream não é reenviado', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      supabaseFetch(`${REST}/rest/v1/rpc/search_contacts`, {
        method: 'POST',
        body: new ReadableStream(),
      })
    ).rejects.toBeInstanceOf(TypeError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('respeita o abort do chamador e não repete', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(() => fetchQuePendura());

    const promessa = supabaseFetch(`${REST}/rest/v1/profiles?select=*`, {
      method: 'GET',
      signal: controller.signal,
    });
    const rejeicao = expect(promessa).rejects.toMatchObject({ name: 'AbortError' });

    controller.abort();
    await rejeicao;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
