import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mockRpc,
  },
}));

vi.mock('@/lib/logger', () => {
  const makeLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withCorrelation: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  });
  const logger = makeLogger();
  return {
    createLogger: vi.fn(() => makeLogger()),
    getLogger: vi.fn(() => makeLogger()),
    logger,
    log: logger,
    generateCorrelationId: vi.fn((prefix = 'req') => `${prefix}_mock_0`),
    getSessionId: vi.fn(() => 'mock-session-id'),
    logPerformance: vi.fn((_label, fn) => fn()),
    logAsyncPerformance: vi.fn(async (_label, fn) => fn()),
  };
});

import { clearLoginAttempts, formatLockTime } from '@/lib/loginAttempts';

describe('loginAttempts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('clearLoginAttempts', () => {
    it('clears login attempts for email', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      await clearLoginAttempts('test@test.com');
      expect(mockRpc).toHaveBeenCalledWith('clear_login_attempts', { p_email: 'test@test.com' });
    });

    it('handles error without throwing', async () => {
      mockRpc.mockResolvedValue({ data: null, error: new Error('Failed') });

      await expect(clearLoginAttempts('test@test.com')).resolves.not.toThrow();
    });
  });

  describe('formatLockTime', () => {
    it('formats seconds', () => {
      expect(formatLockTime(30)).toBe('30 segundos');
      expect(formatLockTime(1)).toBe('1 segundo');
    });

    it('formats minutes', () => {
      expect(formatLockTime(60)).toBe('1 minuto');
      expect(formatLockTime(120)).toBe('2 minutos');
      expect(formatLockTime(90)).toBe('2 minutos');
    });
  });
});
