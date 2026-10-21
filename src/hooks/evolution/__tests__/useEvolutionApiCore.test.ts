/**
 * Testes de `src/hooks/evolution/useEvolutionApiCore.ts`.
 *
 * Escopo: o NÚCLEO do hook — dedupe de leitura (GET), mapa de erro do corpo
 * `{ error: true }` (HTTP 200), tempo limite de 45 s com `AbortController` e
 * desmontagem. Nenhum outro arquivo de produção foi alterado.
 *
 * Como se prova aqui: os testes montam o hook REAL e dublam só a FRONTEIRA de
 * rede (`supabase.functions.invoke`), com a mesma forma que o supabase-js usa
 * de verdade — ele devolve `{ data, error }` e, quando o `AbortSignal` é
 * abortado, `error` é o `AbortError` do fetch (ver
 * `node_modules/@supabase/functions-js/dist/module/FunctionsClient.js`).
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: h.invoke } },
}));
vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import {
  EVOLUTION_API_TIMEOUT_MS,
  parseRetryAfter,
  useEvolutionApiCore,
} from '@/hooks/evolution/useEvolutionApiCore';

const instanceName = 'zap-01';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** `error` no formato que o supabase-js devolve quando o fetch é abortado. */
function abortedError() {
  return Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
}

/**
 * `invoke` que nunca responde por conta própria: só resolve quando o
 * `AbortSignal` recebido é abortado, igual ao fetch real. Devolve os signals
 * entregues ao supabase para o teste conferir quem abortou e quando.
 */
function invokeThatHangsUntilAbort() {
  const signals: AbortSignal[] = [];
  h.invoke.mockImplementation((_path: string, options: { signal?: AbortSignal }) => {
    const signal = options.signal!;
    signals.push(signal);
    return new Promise((resolve) => {
      signal.addEventListener('abort', () => resolve({ data: null, error: abortedError() }));
    });
  });
  return signals;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.invoke.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('tempo limite: 45 s com AbortController', () => {
  it('aborta a chamada pendurada e sobe erro em pt-BR com `timedOut`', async () => {
    vi.useFakeTimers();
    const signals = invokeThatHangsUntilAbort();
    const { result } = renderHook(() => useEvolutionApiCore());

    let failure!: Error;
    await act(async () => {
      result.current.callApi('list-instances', { instanceName }, 'GET').catch((error: Error) => {
        failure = error;
      });
      await vi.advanceTimersByTimeAsync(EVOLUTION_API_TIMEOUT_MS);
    });

    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(signals[0].aborted).toBe(true);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toBe('A Evolution não respondeu em 45 segundos. Tente novamente.');
    expect((failure as { timedOut?: boolean }).timedOut).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('não aborta antes da hora: em 44,999 s a chamada continua em voo e o signal segue vivo', async () => {
    vi.useFakeTimers();
    const signals = invokeThatHangsUntilAbort();
    const { result } = renderHook(() => useEvolutionApiCore());

    let settled = false;
    let failure: Error | undefined;
    const inFlight = result.current
      .callApi('list-instances', { instanceName }, 'GET')
      .catch((error: Error) => { failure = error; })
      .finally(() => { settled = true; });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EVOLUTION_API_TIMEOUT_MS - 1);
    });

    expect(signals[0].aborted).toBe(false);
    expect(settled).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await inFlight;
    });

    expect(failure?.message).toBe('A Evolution não respondeu em 45 segundos. Tente novamente.');
  });

  it('resposta que chega antes do limite não é abortada depois: o timer não sobra', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    h.invoke.mockImplementation((_path: string, options: { signal?: AbortSignal }) => {
      capturedSignal = options.signal;
      return Promise.resolve({ data: { ok: true }, error: null });
    });
    const { result } = renderHook(() => useEvolutionApiCore());

    let out: unknown;
    await act(async () => {
      out = await result.current.callApi('list-instances', { instanceName }, 'GET');
    });

    expect(out).toEqual({ ok: true });
    expect(capturedSignal?.aborted).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EVOLUTION_API_TIMEOUT_MS * 2);
    });

    expect(capturedSignal?.aborted).toBe(false);
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(false);
  });

  it('mantém o contrato visível (`method` + `body`) e entrega o `signal` ao supabase sem sujar o payload', async () => {
    const { result } = renderHook(() => useEvolutionApiCore());

    await act(async () => {
      await result.current.callApi('fetch-profile', { instanceName }, 'GET');
    });

    const [path, options] = h.invoke.mock.calls[0] as [
      string,
      { method: string; body: unknown; signal?: AbortSignal },
    ];
    expect(path).toBe('evolution-api/fetch-profile');
    // É o contrato que os testes de `useEvolutionGroups`/`useEvolutionMessaging` travam:
    // o objeto de opções continua exatamente `{ method, body }`.
    expect(Object.keys(options)).toEqual(['method', 'body']);
    expect(options).toEqual({ method: 'POST', body: { instanceName } });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect((options as { signal: AbortSignal }).signal.aborted).toBe(false);
  });
});

describe('dedupe só em leitura (method GET)', () => {
  it('duas leituras iguais em voo viram UMA viagem e recebem o mesmo resultado', async () => {
    const gate = deferred<{ data: unknown; error: unknown }>();
    h.invoke.mockReturnValueOnce(gate.promise);
    const { result } = renderHook(() => useEvolutionApiCore());

    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    await act(async () => {
      p1 = result.current.callApi('list-instances', { instanceName }, 'GET');
      p2 = result.current.callApi('list-instances', { instanceName }, 'GET');
    });

    expect(h.invoke).toHaveBeenCalledTimes(1);

    const payload = [{ name: instanceName }];
    let r1: unknown;
    let r2: unknown;
    await act(async () => {
      gate.resolve({ data: payload, error: null });
      [r1, r2] = await Promise.all([p1, p2]);
    });

    expect(r1).toBe(payload);
    expect(r2).toBe(payload);
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it('leituras com corpos diferentes NÃO se juntam', async () => {
    const { result } = renderHook(() => useEvolutionApiCore());

    await act(async () => {
      await Promise.all([
        result.current.callApi('find-contacts', { instanceName, page: 1 }, 'GET'),
        result.current.callApi('find-contacts', { instanceName, page: 2 }, 'GET'),
      ]);
    });

    expect(h.invoke).toHaveBeenCalledTimes(2);
  });

  it('a chave é liberada ao terminar e ao falhar: a próxima leitura igual viaja de novo', async () => {
    h.invoke
      .mockResolvedValueOnce({ data: null, error: new Error('rede caiu') })
      .mockResolvedValueOnce({ data: [{ name: instanceName }], error: null });
    const { result } = renderHook(() => useEvolutionApiCore());

    await act(async () => {
      await expect(result.current.callApi('list-instances', { instanceName }, 'GET')).rejects.toThrow('rede caiu');
      await expect(result.current.callApi('list-instances', { instanceName }, 'GET')).resolves.toEqual([
        { name: instanceName },
      ]);
    });

    expect(h.invoke).toHaveBeenCalledTimes(2);
  });

  it('mutação (POST) nunca deduplica: o mesmo envio em voo vira duas viagens', async () => {
    const gate = deferred<{ data: unknown; error: unknown }>();
    h.invoke.mockReturnValueOnce(gate.promise).mockReturnValueOnce(gate.promise);
    const { result } = renderHook(() => useEvolutionApiCore());

    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    await act(async () => {
      p1 = result.current.callApi('send-text', { instanceName, number: '5511999999999', text: 'oi' });
      p2 = result.current.callApi('send-text', { instanceName, number: '5511999999999', text: 'oi' });
    });

    expect(h.invoke).toHaveBeenCalledTimes(2);

    await act(async () => {
      gate.resolve({ data: null, error: null });
      await Promise.all([p1, p2]);
    });
  });
});

describe('mapa de erro do corpo { error: true } (HTTP 200)', () => {
  it('sobe a mensagem do servidor com apiStatus, retries e retryAfterMs', async () => {
    h.invoke.mockResolvedValue({
      data: {
        error: true,
        message: 'Evolution API temporariamente indisponível (circuit breaker aberto).',
        status: 503,
        retries: 2,
        retryAfter: 30,
        details: { code: 'CIRCUIT_OPEN' },
      },
      error: null,
    });
    const { result } = renderHook(() => useEvolutionApiCore());

    let failure!: Error & { apiStatus?: number; retries?: number; retryAfterMs?: number; details?: unknown; timedOut?: boolean };
    await act(async () => {
      await result.current
        .callApi('list-instances', { instanceName }, 'GET')
        .catch((error: unknown) => { failure = error as typeof failure; });
    });

    expect(failure.message).toBe('Evolution API temporariamente indisponível (circuit breaker aberto).');
    expect(failure.apiStatus).toBe(503);
    expect(failure.retries).toBe(2);
    expect(failure.retryAfterMs).toBe(30_000);
    expect(failure.details).toEqual({ code: 'CIRCUIT_OPEN' });
    expect(failure.timedOut).toBeUndefined();
  });

  it('aceita `retry_after` (snake_case) e devolve undefined quando o campo não vem', async () => {
    h.invoke
      .mockResolvedValueOnce({ data: { error: true, message: 'ocupado', retry_after: '1.5' }, error: null })
      .mockResolvedValueOnce({ data: { error: true }, error: null });
    const { result } = renderHook(() => useEvolutionApiCore());

    let first!: Error & { retryAfterMs?: number };
    let second!: Error & { retryAfterMs?: number };
    await act(async () => {
      await result.current.callApi('list-instances', { instanceName }, 'GET').catch((e: unknown) => { first = e as typeof first; });
      await result.current.callApi('list-instances', { a: 1 }, 'GET').catch((e: unknown) => { second = e as typeof second; });
    });

    expect(first.retryAfterMs).toBe(1500);
    expect(second.message).toBe('Erro na API Evolution');
    expect(second.retryAfterMs).toBeUndefined();
  });

  it('com withToast, o texto que o usuário vê é o do servidor (pt-BR), não o técnico', async () => {
    h.invoke.mockResolvedValue({
      data: { error: true, message: 'Número não encontrado no WhatsApp. Verifique se o número está correto e registrado.' },
      error: null,
    });
    const { result } = renderHook(() => useEvolutionApiCore());

    await act(async () => {
      await expect(
        result.current.withToast('send-text', { instanceName }, 'Enviado', 'Erro ao enviar')
      ).rejects.toThrow('Número não encontrado no WhatsApp. Verifique se o número está correto e registrado.');
    });

    expect(h.toast.error).toHaveBeenCalledWith(
      'Número não encontrado no WhatsApp. Verifique se o número está correto e registrado.'
    );
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it('no tempo limite, o toast mostra o texto de espera (não o AbortError do fetch)', async () => {
    vi.useFakeTimers();
    invokeThatHangsUntilAbort();
    const { result } = renderHook(() => useEvolutionApiCore());

    await act(async () => {
      result.current
        .withToast('list-instances', { instanceName }, 'Ok', 'Erro ao listar', 'GET')
        .catch(() => undefined);
      await vi.advanceTimersByTimeAsync(EVOLUTION_API_TIMEOUT_MS);
    });

    expect(h.toast.error).toHaveBeenCalledWith('A Evolution não respondeu em 45 segundos. Tente novamente.');
    expect(h.toast.success).not.toHaveBeenCalled();
  });
});

describe('desmontagem', () => {
  it('promessa que volta depois da desmontagem não estoura, não avisa e não re-renderiza nada', async () => {
    const gate = deferred<{ data: unknown; error: unknown }>();
    h.invoke.mockReturnValueOnce(gate.promise);
    let renders = 0;
    const { result, unmount } = renderHook(() => {
      renders += 1;
      return useEvolutionApiCore();
    });

    let inFlight!: Promise<unknown>;
    await act(async () => {
      inFlight = result.current.callApi('list-instances', { instanceName }, 'GET');
    });
    expect(result.current.isLoading).toBe(true);

    unmount();
    const rendersAoDesmontar = renders;

    let out: unknown;
    await act(async () => {
      gate.resolve({ data: [{ name: instanceName }], error: null });
      out = await inFlight;
    });

    expect(out).toEqual([{ name: instanceName }]);
    expect(renders).toBe(rendersAoDesmontar);
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it('desmontar não deixa o tempo limite armado: a chamada já resolvida não é abortada depois', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    h.invoke.mockImplementation((_path: string, options: { signal?: AbortSignal }) => {
      capturedSignal = options.signal;
      return Promise.resolve({ data: { ok: true }, error: null });
    });
    const { result, unmount } = renderHook(() => useEvolutionApiCore());

    await act(async () => {
      await result.current.callApi('list-instances', { instanceName }, 'GET');
    });
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EVOLUTION_API_TIMEOUT_MS * 2);
    });

    expect(capturedSignal?.aborted).toBe(false);
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });
});

describe('parseRetryAfter', () => {
  it('converte segundos em milissegundos', () => {
    expect(parseRetryAfter(30)).toBe(30_000);
    expect(parseRetryAfter('1.5')).toBe(1500);
    expect(parseRetryAfter(0)).toBe(0);
  });

  it('aceita data HTTP e nunca devolve valor negativo', () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfter(past)).toBe(0);
    const future = new Date(Date.now() + 5_000).toUTCString();
    const ms = parseRetryAfter(future)!;
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(5_000);
  });

  it('devolve undefined para ausente, vazio ou ilegível', () => {
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
    expect(parseRetryAfter('   ')).toBeUndefined();
    expect(parseRetryAfter('sem prazo')).toBeUndefined();
    expect(parseRetryAfter(-5)).toBeUndefined();
  });
});
