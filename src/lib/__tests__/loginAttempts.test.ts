import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();
const mockInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mockRpc,
    functions: {
      invoke: mockInvoke,
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { checkAccountLock, recordFailedLogin, clearLoginAttempts, formatLockTime } from '@/lib/loginAttempts';

describe('loginAttempts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkAccountLock', () => {
    it('returns not locked for unknown email', async () => {
      mockInvoke.mockResolvedValue({
        data: { isLocked: false, lockedUntil: null, attempts: 0, remainingTime: 0 },
        error: null,
      });

      const result = await checkAccountLock('unknown@test.com');
      expect(result.isLocked).toBe(false);
    });

    it('returns locked with expiry time', async () => {
      const futureDate = new Date(Date.now() + 60000).toISOString();
      mockInvoke.mockResolvedValue({
        data: { isLocked: true, lockedUntil: futureDate, attempts: 5, remainingTime: 60 },
        error: null,
      });

      const result = await checkAccountLock('locked@test.com');
      expect(result.isLocked).toBe(true);
      expect(result.lockedUntil).toBeTruthy();
    });

    it('handles RPC error gracefully', async () => {
      mockInvoke.mockResolvedValue({
        data: null,
        error: new Error('Network failure'),
      });

      const result = await checkAccountLock('test@test.com');
      expect(result.isLocked).toBe(false);
    });

    it('handles empty result data', async () => {
      mockInvoke.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await checkAccountLock('test@test.com');
      expect(result.isLocked).toBe(false);
      expect(result.attempts).toBe(0);
    });
  });

  describe('recordFailedLogin', () => {
    it('records first failed attempt', async () => {
      mockRpc.mockResolvedValue({
        data: [{ is_locked: false, locked_until: null, attempts: 1 }],
        error: null,
      });

      const result = await recordFailedLogin('test@test.com');
      expect(mockRpc).toHaveBeenCalledWith('record_failed_login', expect.objectContaining({
        p_email: 'test@test.com',
      }));
      expect(result.isLocked).toBe(false);
    });

    it('returns locked after max attempts', async () => {
      const futureDate = new Date(Date.now() + 60000).toISOString();
      mockRpc.mockResolvedValue({
        data: [{ is_locked: true, locked_until: futureDate, attempts: 5 }],
        error: null,
      });

      const result = await recordFailedLogin('test@test.com');
      expect(result.isLocked).toBe(true);
    });

    it('handles error gracefully', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: new Error('DB error'),
      });

      const result = await recordFailedLogin('test@test.com');
      expect(result.isLocked).toBe(false);
    });
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
