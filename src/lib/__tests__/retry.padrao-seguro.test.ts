import { describe, expect, it, vi } from 'vitest';
import { withRetry, withNetworkRetry } from '../retry';

/**
 * `withRetry` usava `shouldRetry = () => true`: repetia TUDO, inclusive
 * AbortError (page unload / navegacao), gerando cascata
 * "[RetryUtil] All N retries exhausted AbortError: Page unload".
 * O padrao agora e seguro (nao repete sem politica explicita) e a guarda de
 * aborto tem precedencia sobre qualquer `shouldRetry`.
 */

const FAST = { baseDelayMs: 0, maxDelayMs: 0 } as const;

describe('withRetry — padrao seguro nao repete sem politica', () => {
  it('erro permanente sem shouldRetry explicito roda a operacao 1x', async () => {
    const op = vi.fn(async () => {
      throw new Error('permanente');
    });
    await expect(withRetry(op, { ...FAST, maxRetries: 3 })).rejects.toThrow('permanente');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('erro real e retentavel com politica EXPLICITA ainda repete ate resolver', async () => {
    let tentativas = 0;
    const resultado = await withRetry(
      async () => {
        tentativas += 1;
        if (tentativas < 3) throw new Error('falha de rede');
        return 'ok';
      },
      {
        ...FAST,
        maxRetries: 3,
        shouldRetry: (error) => error instanceof Error && error.message.includes('rede'),
      }
    );
    expect(resultado).toBe('ok');
    expect(tentativas).toBe(3);
  });
});

describe('withRetry — cancelamento nunca repete', () => {
  it('AbortError (page unload) roda 1x mesmo com shouldRetry que repete tudo', async () => {
    const abortErr = new DOMException('Page unload', 'AbortError');
    const op = vi.fn(async () => {
      throw abortErr;
    });
    await expect(
      withRetry(op, { ...FAST, maxRetries: 3, shouldRetry: () => true })
    ).rejects.toBe(abortErr);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('Error com name=AbortError tambem nunca repete', async () => {
    const abortErr = new Error('The operation was aborted.');
    abortErr.name = 'AbortError';
    const op = vi.fn(async () => {
      throw abortErr;
    });
    await expect(
      withRetry(op, { ...FAST, maxRetries: 3, shouldRetry: () => true })
    ).rejects.toBe(abortErr);
    expect(op).toHaveBeenCalledTimes(1);
  });
});

describe('withNetworkRetry — aborto nunca repete, rede sim', () => {
  it('erro de rede repete ate resolver', async () => {
    let tentativas = 0;
    const resultado = await withNetworkRetry(async () => {
      tentativas += 1;
      if (tentativas < 3) throw new TypeError('Failed to fetch');
      return 'recuperado';
    }, 3);
    expect(resultado).toBe('recuperado');
    expect(tentativas).toBe(3);
  });

  it('AbortError nao repete nem quando a mensagem parece rede', async () => {
    const abortErr = new DOMException('Page unload', 'AbortError');
    const op = vi.fn(async () => {
      throw abortErr;
    });
    await expect(withNetworkRetry(op, 3)).rejects.toBe(abortErr);
    expect(op).toHaveBeenCalledTimes(1);
  });
});
