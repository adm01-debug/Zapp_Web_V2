import { describe, it, expect, vi } from 'vitest';

import { isRetryableError, withRetry, friendlyErrorMessage } from '@/hooks/voice/retry';

function comNome(message: string, name: string) {
  const erro = new Error(message);
  erro.name = name;
  return erro;
}

/**
 * #347 — o defeito herdado: `isRetryableError` retentava `aborted` (quem aborta é o
 * próprio app: comando substituído / timeout de 15 s) e `429` (insistir agrava o
 * limite de taxa); e `friendlyErrorMessage` classificava QUALQUER erro com
 * 'permission' como microfone negado — um 403 `permission denied` do servidor
 * mandava o operador mexer nas configurações do navegador à toa.
 */
describe('hooks/voice/retry — o que pode ser retentado (#347)', () => {
  it('não retenta erro abortado (o app é quem aborta)', () => {
    expect(isRetryableError(comNome('This operation was aborted', 'AbortError'))).toBe(false);
    expect(isRetryableError(new Error('Aborted'))).toBe(false);
  });

  it('não retenta 429 (a repetição agrava o limite de taxa)', () => {
    expect(isRetryableError(new Error('Voice agent error: 429 Too Many Requests'))).toBe(false);
  });

  it('continua retentando queda de rede, timeout e 5xx', () => {
    expect(isRetryableError(new Error('network error'))).toBe(true);
    expect(isRetryableError(new Error('timeout'))).toBe(true);
    expect(isRetryableError(new Error('Voice agent error: 503 Service Unavailable'))).toBe(true);
    expect(isRetryableError(new Error('Failed to fetch'))).toBe(true);
  });

  it('withRetry sobe o erro abortado na primeira tentativa, sem gastar timers', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('Aborted')));

    await expect(withRetry(fn)).rejects.toThrow('Aborted');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('withRetry continua tentando erro de rede e devolve o sucesso', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce('ok');

    await expect(withRetry(fn, 2, 1)).resolves.toBe('ok');

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("um 403 'permission denied' do servidor NÃO vira 'microfone negado'", () => {
    const msg = friendlyErrorMessage(new Error('Voice agent error: 403 permission denied'));

    expect(msg).not.toContain('microfone');
    expect(msg).toContain('Erro inesperado');
  });

  it('o erro real da captura (NotAllowedError) vira a orientação de permissão', () => {
    const msg = friendlyErrorMessage(comNome('Permission denied', 'NotAllowedError'));

    expect(msg).toContain('microfone');
  });
});
