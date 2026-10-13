/**
 * Retry do fluxo de voz (src/hooks/voice/retry.ts).
 *
 * O módulo decide o que PODE ser repetido (rede/timeout/429/5xx) e o que NUNCA
 * deve ser repetido (permissão negada, payload inválido, 401). Se a distinção
 * afrouxar, o app passa a insistir num erro definitivo; se a espera deixar de ser
 * exponencial, o retry vira enxurrada de chamadas.
 *
 * Aqui provo, chamando o módulo real:
 *  - isRetryableError aceita as falhas transitórias e recusa as definitivas
 *    (inclusive valor que não é Error);
 *  - withRetry repete até o teto (maxRetries + 1 tentativas), propaga o ÚLTIMO
 *    erro e devolve o sucesso assim que a função passa;
 *  - a espera é 100ms e depois 1000ms (backoff exponencial), medindo no relógio;
 *  - erro definitivo não agenda nenhuma espera (1 tentativa, 0 timers);
 *  - friendlyErrorMessage traduz cada causa para a mensagem exibida.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { friendlyErrorMessage, isRetryableError, withRetry } from '../retry';

describe('isRetryableError', () => {
  it.each([
    'network error',
    'Request timeout',
    'The operation was aborted',
    'Failed to fetch',
    'HTTP 500',
    'servico indisponivel 503',
    '429 Too Many Requests',
  ])('trata "%s" como transitório (pode repetir)', (mensagem) => {
    expect(isRetryableError(new Error(mensagem))).toBe(true);
  });

  it.each(['permission denied', 'microphone not allowed', 'payload invalido', '401 unauthorized'])(
    'não repete erro definitivo: "%s"',
    (mensagem) => {
      expect(isRetryableError(new Error(mensagem))).toBe(false);
    },
  );

  it('valor que não é Error nunca é retryável', () => {
    expect(isRetryableError('network error')).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError({ message: 'network error' })).toBe(false);
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('devolve o resultado assim que a função passa, repetindo uma vez', async () => {
    const fn = vi
      .fn(async () => 'ok')
      .mockRejectedValueOnce(new Error('network error'));

    const promessa = withRetry(fn, 2, 100);
    await vi.advanceTimersByTimeAsync(100);

    await expect(promessa).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('espera 100ms e depois 1000ms (backoff exponencial), não intervalo fixo', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('timeout'));
    const promessa = withRetry(fn, 2, 100);
    promessa.catch(() => {});

    // 1ª tentativa é imediata; falta 1ms para a espera de 100ms vencer.
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(99);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);

    // A espera seguinte é 200ms (base * 2^1), não 100ms de novo.
    await vi.advanceTimersByTimeAsync(199);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3);

    await expect(promessa).rejects.toThrow('timeout');
  });

  it('para no teto (maxRetries + 1 tentativas) e propaga o ÚLTIMO erro', async () => {
    const primeiro = new Error('network 1');
    const segundo = new Error('network 2');
    const terceiro = new Error('network 3');
    const fn = vi
      .fn()
      .mockRejectedValueOnce(primeiro)
      .mockRejectedValueOnce(segundo)
      .mockRejectedValueOnce(terceiro);

    const promessa = withRetry(fn, 2, 10);
    promessa.catch(() => {});
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);

    await expect(promessa).rejects.toBe(terceiro);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('erro definitivo não agenda espera: 1 tentativa só', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permission denied'));

    await expect(withRetry(fn, 3, 100)).rejects.toThrow('permission denied');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('maxRetries = 0 faz uma única tentativa', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(withRetry(fn, 0, 100)).rejects.toThrow('network error');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('friendlyErrorMessage', () => {
  it.each([
    ['Microphone permission denied', 'Permissão de microfone negada. Habilite nas configurações do navegador.'],
    ['NotAllowedError', 'Permissão de microfone negada. Habilite nas configurações do navegador.'],
    ['network error', 'Problema de conexão. Verifique sua internet.'],
    ['Failed to fetch', 'Problema de conexão. Verifique sua internet.'],
    ['Request timeout', 'A operação demorou demais. Tente novamente.'],
    ['The operation was aborted', 'A operação demorou demais. Tente novamente.'],
    ['429 Too Many Requests', 'Muitas solicitações. Aguarde um momento.'],
    ['rate limit reached', 'Muitas solicitações. Aguarde um momento.'],
    ['402 credits exhausted', 'Créditos de IA esgotados.'],
    ['401 unauthorized', 'Sessão expirada. Faça login novamente.'],
  ])('traduz "%s"', (mensagem, esperado) => {
    expect(friendlyErrorMessage(new Error(mensagem))).toBe(esperado);
  });

  it('erro desconhecido e valor que não é Error caem na mensagem genérica', () => {
    expect(friendlyErrorMessage(new Error('algo inesperado'))).toBe('Erro inesperado. Tente novamente.');
    expect(friendlyErrorMessage('network error')).toBe('Erro inesperado. Tente novamente.');
    expect(friendlyErrorMessage(undefined)).toBe('Erro inesperado. Tente novamente.');
  });
});
