import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cobertura da POLÍTICA do `withRetry` / `withNetworkRetry` que os testes de
 * `retry.random.test.ts` (jitter) e `retry.padrao-seguro.test.ts` (padrão e
 * aborto) não exercitam: número de tentativas, teto do backoff, `onRetry`,
 * `maxRetries` padrão e a CLASSIFICAÇÃO de erro do `withNetworkRetry`.
 *
 * O módulo é o de produção (`../retry`), sem `vi.mock` do SUT — só a fonte de
 * aleatoriedade do jitter é mockada, para o atraso ser determinístico.
 */
vi.mock('@/lib/secureRandom', () => ({
  secureRandomFloat: vi.fn(),
}));

import { secureRandomFloat } from '@/lib/secureRandom';
import { withRetry, withNetworkRetry } from '../retry';

const mockFloat = vi.mocked(secureRandomFloat);

// Sem espera real: atrasos zerados (o teto do backoff é testado com fake timers).
const INSTANT = { baseDelayMs: 0, maxDelayMs: 0 } as const;

describe('withRetry — número de tentativas e resultado', () => {
  it('resolve na primeira tentativa sem repetir', async () => {
    const op = vi.fn(async () => 'valor');
    await expect(withRetry(op, INSTANT)).resolves.toBe('valor');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('repetindo com política explícita, para ao resolver', async () => {
    let n = 0;
    const op = vi.fn(async () => {
      n += 1;
      if (n < 2) throw new Error('rede');
      return 'ok';
    });
    await expect(
      withRetry(op, { ...INSTANT, maxRetries: 3, shouldRetry: () => true })
    ).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('usa maxRetries=3 por padrão (4 tentativas) e repassa o ÚLTIMO erro', async () => {
    const erros = [new Error('e0'), new Error('e1'), new Error('e2'), new Error('e3')];
    let i = 0;
    const op = vi.fn(async () => {
      throw erros[i++];
    });
    await expect(
      withRetry(op, { ...INSTANT, shouldRetry: () => true })
    ).rejects.toBe(erros[3]);
    expect(op).toHaveBeenCalledTimes(4);
  });

  it('esgota maxRetries e lança o último erro quando shouldRetry sempre permite', async () => {
    let n = 0;
    const op = vi.fn(async () => {
      n += 1;
      throw new Error(`falha ${n}`);
    });
    await expect(
      withRetry(op, { ...INSTANT, maxRetries: 2, shouldRetry: () => true })
    ).rejects.toThrow('falha 3');
    expect(op).toHaveBeenCalledTimes(3);
  });
});

describe('withRetry — onRetry recebe o número da tentativa', () => {
  it('chama onRetry com 1..N (a tentativa que falhou, base 1)', async () => {
    const onRetry = vi.fn();
    let n = 0;
    await withRetry(
      async () => {
        n += 1;
        if (n <= 2) throw new Error('rede');
        return 'ok';
      },
      { ...INSTANT, maxRetries: 5, shouldRetry: () => true, onRetry }
    );
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls.map((c) => c[1])).toEqual([1, 2]);
    expect(onRetry.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('não chama onRetry quando não há repetição', async () => {
    const onRetry = vi.fn();
    await withRetry(async () => 'ok', { ...INSTANT, onRetry });
    expect(onRetry).not.toHaveBeenCalled();
  });
});

describe('withRetry — backoff exponencial com teto', () => {
  beforeEach(() => {
    mockFloat.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('dobra o atraso a cada tentativa (base * 2^attempt + jitter)', async () => {
    mockFloat.mockReturnValue(0);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    let n = 0;
    const p = withRetry(
      async () => {
        n += 1;
        if (n <= 3) throw new Error('rede');
        return 'ok';
      },
      { baseDelayMs: 100, maxDelayMs: 100000, maxRetries: 5, shouldRetry: () => true }
    );
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe('ok');
    const delays = setTimeoutSpy.mock.calls.map((c) => c[1]);
    expect(delays).toEqual([100, 200, 400]);
  });

  it('respeita maxDelayMs como teto do atraso', async () => {
    mockFloat.mockReturnValue(0.5);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    let n = 0;
    const p = withRetry(
      async () => {
        n += 1;
        if (n <= 2) throw new Error('rede');
        return 'ok';
      },
      { baseDelayMs: 10000, maxDelayMs: 12000, maxRetries: 5, shouldRetry: () => true }
    );
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe('ok');
    const delays = setTimeoutSpy.mock.calls.map((c) => c[1]);
    // 10000 + 0.5*500 = 10250 (< teto); 20000 + 250 seria > 12000 → teto 12000
    expect(delays[0]).toBe(10250);
    expect(delays[1]).toBe(12000);
  });
});

describe('withNetworkRetry — classificação do erro', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function run(op: () => Promise<unknown>, maxRetries = 3) {
    const p = withNetworkRetry(op, maxRetries);
    const settled = p.then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e })
    );
    await vi.runAllTimersAsync();
    return settled;
  }

  it('repete em TypeError "Failed to fetch"', async () => {
    let n = 0;
    const r = await run(async () => {
      n += 1;
      if (n < 3) throw new TypeError('Failed to fetch');
      return 'ok';
    });
    expect(r).toEqual({ ok: true, v: 'ok' });
    expect(n).toBe(3);
  });

  it('repete quando status >= 500', async () => {
    let n = 0;
    const r = await run(async () => {
      n += 1;
      if (n < 2) {
        const e = new Error('Internal Server Error') as Error & { status: number };
        e.status = 500;
        throw e;
      }
      return 'ok';
    });
    expect(r).toEqual({ ok: true, v: 'ok' });
    expect(n).toBe(2);
  });

  it('repete em mensagem de rede/timeout', async () => {
    for (const msg of ['network error', 'request timeout', 'GET /x 503']) {
      let n = 0;
      const r = await run(async () => {
        n += 1;
        if (n < 2) throw new Error(msg);
        return 'ok';
      });
      expect(r.ok, `mensagem: ${msg}`).toBe(true);
      expect(n, `mensagem: ${msg}`).toBe(2);
    }
  });

  it('NÃO repete em 4xx (erro de cliente)', async () => {
    const op = vi.fn(async () => {
      const e = new Error('400 Bad Request') as Error & { status: number };
      e.status = 400;
      throw e;
    });
    const r = await run(op);
    expect(r.ok).toBe(false);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('NÃO casa 502 dentro de 5024 (fronteira de palavra)', async () => {
    const op = vi.fn(async () => {
      throw new Error('erro 5024');
    });
    const r = await run(op);
    expect(r.ok).toBe(false);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('NÃO repete erro que não é Error', async () => {
    const op = vi.fn(async () => {
      throw 'falha crua';
    });
    const r = await run(op);
    expect(r.ok).toBe(false);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('NÃO repete aborto mesmo com mensagem parecida com rede', async () => {
    const op = vi.fn(async () => {
      throw new DOMException('network aborted', 'AbortError');
    });
    const r = await run(op);
    expect(r.ok).toBe(false);
    expect(op).toHaveBeenCalledTimes(1);
  });
});
