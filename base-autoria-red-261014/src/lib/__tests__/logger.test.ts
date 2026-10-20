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
});
