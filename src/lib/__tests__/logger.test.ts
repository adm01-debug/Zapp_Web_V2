import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('imports without error', async () => {
    const logger = await import('@/lib/logger');
    expect(logger).toBeDefined();
  });

  it('log object has error method', async () => {
    const { log } = await import('@/lib/logger');
    expect(typeof log.error).toBe('function');
  });

  it('log object has debug method', async () => {
    const { log } = await import('@/lib/logger');
    expect(typeof log.debug).toBe('function');
  });

  it('log object has info method', async () => {
    const { log } = await import('@/lib/logger');
    expect(typeof log.info).toBe('function');
  });

  it('log.error does not throw', async () => {
    const { log } = await import('@/lib/logger');
    expect(() => log.error('test error')).not.toThrow();
  });

  it('log.debug does not throw', async () => {
    const { log } = await import('@/lib/logger');
    expect(() => log.debug('test debug')).not.toThrow();
  });

  it('log.info does not throw', async () => {
    const { log } = await import('@/lib/logger');
    expect(() => log.info('test info')).not.toThrow();
  });

  it('getLogger creates named logger', async () => {
    const { getLogger } = await import('@/lib/logger');
    if (getLogger) {
      const namedLog = getLogger('TestModule');
      expect(namedLog).toBeDefined();
    }
  });

  it('redige PII e segredo antes de imprimir no console', async () => {
    const { log } = await import('@/lib/logger');
    const spy = vi.mocked(console.error);
    log.error('falha para maria.souza@example.com tel (11) 91234-5678', {
      token: 'segredo-super-secreto',
      nota: 'ok',
    });

    const [first, second] = spy.mock.calls[spy.mock.calls.length - 1] as unknown[];
    expect(first as string).not.toContain('maria.souza@example.com');
    expect(first as string).not.toContain('91234-5678');
    expect(first as string).toContain('[EMAIL_REDACTED]');
    expect(first as string).toContain('[TELEFONE_REDACTED]');
    const argObj = second as Record<string, unknown>;
    expect(argObj.token).toBe('[SEGREDO_REDACTED]');
    expect(argObj.nota).toBe('ok');
  });
});
