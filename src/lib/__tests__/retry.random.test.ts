import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O jitter do backoff (`base * 2^attempt + aleatorio * 500`, limitado por
 * `maxDelayMs`) existe para espalhar tentativas simultaneas que falharam junto.
 * O valor so entra no `setTimeout`: nao e gravado, nao e comparado por regex nem
 * vai para o banco. O que nao pode mudar e a formula — este teste fixa a fonte
 * segura e le o atraso de fato agendado.
 */
vi.mock('@/lib/secureRandom', () => ({
  secureRandomFloat: vi.fn(),
}));

import { secureRandomFloat } from '@/lib/secureRandom';
import { withRetry } from '../retry';

const mockFloat = vi.mocked(secureRandomFloat);

describe('withRetry — jitter do backoff', () => {
  beforeEach(() => {
    mockFloat.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sorteia o jitter da fonte segura e mantem a formula do atraso', async () => {
    mockFloat.mockReturnValue(0.5);
    const agendamentos = vi.spyOn(globalThis, 'setTimeout');

    let chamadas = 0;
    const operacao = vi.fn(() => {
      chamadas += 1;
      if (chamadas < 2) return Promise.reject(new Error('falha de rede'));
      return Promise.resolve('ok');
    });

    const promessa = withRetry(operacao, {
      maxRetries: 2,
      baseDelayMs: 1000,
      maxDelayMs: 10_000,
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(mockFloat).toHaveBeenCalledTimes(1);
    // 1000 * 2^0 + 0.5 * 500 = 1250ms
    expect(agendamentos.mock.calls[0]?.[1]).toBe(1250);

    await vi.advanceTimersByTimeAsync(1250);

    await expect(promessa).resolves.toBe('ok');
    expect(operacao).toHaveBeenCalledTimes(2);
  });

  it('o teto de maxDelayMs continua valendo sobre o jitter', async () => {
    mockFloat.mockReturnValue(0.99);
    const agendamentos = vi.spyOn(globalThis, 'setTimeout');

    let chamadas = 0;
    const operacao = vi.fn(() => {
      chamadas += 1;
      if (chamadas < 2) return Promise.reject(new Error('falha de rede'));
      return Promise.resolve('ok');
    });

    const promessa = withRetry(operacao, {
      maxRetries: 2,
      baseDelayMs: 1000,
      maxDelayMs: 1_100,
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(mockFloat).toHaveBeenCalled();
    // 1000 + 0.99 * 500 = 1495 -> limitado por maxDelayMs = 1100
    expect(agendamentos.mock.calls[0]?.[1]).toBe(1100);

    await vi.advanceTimersByTimeAsync(1100);

    await expect(promessa).resolves.toBe('ok');
  });
});
