import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUPABASE_FETCH_TIMEOUT_MS, boundedFetch, supabaseFetch } from '../client';

/**
 * Rede do cliente Supabase (PE-14): tempo limite, retry seletivo e abort.
 *
 * O comportamento protegido aqui é o do transporte, não o do postgrest: antes
 * da correção (a) nenhuma requisição tinha teto de tempo — um proxy travado
 * deixava a promessa pendente para sempre e `getSession` travava o bootstrap — e
 * (b) qualquer falha transitória virava erro definitivo, sem uma segunda
 * tentativa. Os testes abaixo chamam o fetch REAL do cliente (`boundedFetch` /
 * `supabaseFetch`), com o `fetch` global dublado na fronteira de rede.
 *
 * Os números esperados são independentes do código: o teto é o literal 12 s
 * (contrato do cartão, conferido contra a constante exportada) e a contagem de
 * tentativas é tabela do próprio caso, não uma cópia da regra.
 */

const REST = 'https://sb-testref.supabase.co';
const TIMEOUT_ESPERADO_MS = 12_000;

const fetchMock = vi.fn();

describe('rede do cliente Supabase — tempo limite, retry e abort', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('mantém o teto em 12 s (contrato do cartão)', () => {
    expect(SUPABASE_FETCH_TIMEOUT_MS).toBe(TIMEOUT_ESPERADO_MS);
  });

  it('boundedFetch aborta a requisição pendente no teto e rejeita com TimeoutError', async () => {
    const sinais: AbortSignal[] = [];
    fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal ?? undefined;
      if (signal) sinais.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason));
      });
    });

    const promessa = boundedFetch(`${REST}/rest/v1/profiles?select=*`, { method: 'GET' });
    const rejeicao = expect(promessa).rejects.toMatchObject({
      name: 'TimeoutError',
      message: 'Supabase request timed out',
    });

    // Um milissegundo antes do teto a requisição ainda está viva (não abortou
    // cedo demais) e o sinal entregue à rede é o do teto, não outro qualquer.
    await vi.advanceTimersByTimeAsync(TIMEOUT_ESPERADO_MS - 1);
    expect(sinais).toHaveLength(1);
    expect(sinais[0].aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(sinais[0].aborted).toBe(true);
    await rejeicao;

    // O teto NÃO é retentado: repetir um banco saturado dobraria a carga.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('GET repete um 503 e devolve a resposta da tentativa que funcionou', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('[]', { status: 200 }));

    const resposta = supabaseFetch(`${REST}/rest/v1/profiles?select=*`, { method: 'GET' });
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(resposta).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('GET repete uma falha de rede (TypeError) e devolve a resposta boa', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('[]', { status: 200 }));

    const resposta = supabaseFetch(`${REST}/rest/v1/profiles?select=*`, { method: 'GET' });
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(resposta).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('GET com 5xx em todas as tentativas devolve a última resposta, sem lançar (contrato do postgrest preservado)', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 502 }));

    const resposta = supabaseFetch(`${REST}/rest/v1/profiles?select=*`, { method: 'GET' });
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(resposta).resolves.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 tentativa + 2 retentativas
  });

  it('POST de escrita não repete: nem 503 nem falha de rede', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));

    await expect(
      supabaseFetch(`${REST}/rest/v1/messages`, { method: 'POST', body: '{"content":"oi"}' })
    ).resolves.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      supabaseFetch(`${REST}/rest/v1/messages`, { method: 'POST', body: '{"content":"oi"}' })
    ).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('/auth/v1/ passa direto: o refresh de token tem a própria temporização', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));

    await expect(
      supabaseFetch(`${REST}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        body: '{}',
      })
    ).resolves.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      supabaseFetch(`${REST}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        body: '{}',
      })
    ).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('abort do chamador chega à rede, rejeita com AbortError e não repete', async () => {
    const controller = new AbortController();
    const sinais: AbortSignal[] = [];
    fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal ?? undefined;
      if (signal) sinais.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason));
      });
    });

    const promessa = supabaseFetch(`${REST}/rest/v1/profiles?select=*`, {
      method: 'GET',
      signal: controller.signal,
    });
    const rejeicao = expect(promessa).rejects.toMatchObject({ name: 'AbortError' });

    // O sinal do chamador é ENCADEADO ao do cliente: abortar um aborta o outro.
    expect(sinais).toHaveLength(1);
    expect(sinais[0].aborted).toBe(false);
    controller.abort();
    expect(sinais[0].aborted).toBe(true);

    await rejeicao;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
