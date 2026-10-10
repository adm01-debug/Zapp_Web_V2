import { describe, it, expect, beforeEach } from 'vitest';

// ─── Test the rate limiter logic (extracted from evolution-webhook) ───

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_EVENTS = 300;

class RateLimiter {
  private map = new Map<string, { count: number; windowStart: number }>();

  isRateLimited(instance: string, now: number = Date.now()): boolean {
    const entry = this.map.get(instance);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      this.map.set(instance, { count: 1, windowStart: now });
      return false;
    }

    entry.count++;
    return entry.count > RATE_LIMIT_MAX_EVENTS;
  }

  getCount(instance: string): number {
    return this.map.get(instance)?.count ?? 0;
  }

  cleanup(now: number = Date.now()) {
    for (const [key, val] of this.map) {
      if (now - val.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
        this.map.delete(key);
      }
    }
  }

  get size() {
    return this.map.size;
  }
}

describe('Rate Limiter', () => {
  let limiter: RateLimiter;
  const now = 1700000000000;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  describe('Basic Behavior', () => {
    it('allows first request', () => {
      expect(limiter.isRateLimited('inst-1', now)).toBe(false);
    });

    it('allows up to 300 requests in a window', () => {
      for (let i = 0; i < 300; i++) {
        expect(limiter.isRateLimited('inst-1', now)).toBe(false);
      }
    });

    it('blocks the 301st request', () => {
      for (let i = 0; i < 300; i++) {
        limiter.isRateLimited('inst-1', now);
      }
      expect(limiter.isRateLimited('inst-1', now)).toBe(true);
    });

    it('continues blocking after limit exceeded', () => {
      for (let i = 0; i < 350; i++) {
        limiter.isRateLimited('inst-1', now);
      }
      expect(limiter.isRateLimited('inst-1', now)).toBe(true);
    });
  });

  describe('Window Reset', () => {
    it('resets after window expires', () => {
      for (let i = 0; i < 300; i++) {
        limiter.isRateLimited('inst-1', now);
      }
      expect(limiter.isRateLimited('inst-1', now)).toBe(true);

      // After window expires
      expect(limiter.isRateLimited('inst-1', now + 61_000)).toBe(false);
    });

    it('counter resets to 1 after window expiry', () => {
      for (let i = 0; i < 300; i++) {
        limiter.isRateLimited('inst-1', now);
      }
      limiter.isRateLimited('inst-1', now + 61_000);
      expect(limiter.getCount('inst-1')).toBe(1);
    });
  });

  describe('Multi-Instance Isolation', () => {
    it('tracks instances independently', () => {
      for (let i = 0; i < 300; i++) {
        limiter.isRateLimited('inst-1', now);
      }
      expect(limiter.isRateLimited('inst-1', now)).toBe(true);
      expect(limiter.isRateLimited('inst-2', now)).toBe(false);
    });

    it('can rate limit multiple instances independently', () => {
      for (let i = 0; i < 301; i++) {
        limiter.isRateLimited('inst-A', now);
        limiter.isRateLimited('inst-B', now);
      }
      expect(limiter.isRateLimited('inst-A', now)).toBe(true);
      expect(limiter.isRateLimited('inst-B', now)).toBe(true);
      expect(limiter.isRateLimited('inst-C', now)).toBe(false);
    });

    it('one instance reset does not affect others', () => {
      for (let i = 0; i < 300; i++) {
        limiter.isRateLimited('inst-1', now);
        limiter.isRateLimited('inst-2', now);
      }

      // inst-1 window expires, inst-2 still blocked
      expect(limiter.isRateLimited('inst-1', now + 61_000)).toBe(false);
      expect(limiter.isRateLimited('inst-2', now)).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('removes expired entries on cleanup', () => {
      limiter.isRateLimited('inst-old', now);
      limiter.isRateLimited('inst-new', now + 130_000);

      limiter.cleanup(now + 130_000);

      expect(limiter.size).toBe(1); // only inst-new remains
    });

    it('does not remove recent entries', () => {
      limiter.isRateLimited('inst-1', now);
      limiter.isRateLimited('inst-2', now);
      limiter.cleanup(now);
      expect(limiter.size).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty instance name', () => {
      expect(limiter.isRateLimited('', now)).toBe(false);
    });

    it('handles special characters in instance name', () => {
      expect(limiter.isRateLimited('inst-with-特殊文字', now)).toBe(false);
    });

    it('getCount returns 0 for unknown instance', () => {
      expect(limiter.getCount('nonexistent')).toBe(0);
    });

    it('handles rapid sequential calls correctly', () => {
      let blocked = 0;
      for (let i = 0; i < 500; i++) {
        if (limiter.isRateLimited('inst-rapid', now)) blocked++;
      }
      expect(blocked).toBe(200); // 500 - 300 = 200 blocked
    });
  });

  describe('Boundary Conditions', () => {
    it('exactly at limit (300) is not blocked', () => {
      for (let i = 0; i < 299; i++) {
        limiter.isRateLimited('inst-1', now);
      }
      expect(limiter.isRateLimited('inst-1', now)).toBe(false); // 300th
    });

    it('at limit + 1 (301) is blocked', () => {
      for (let i = 0; i < 300; i++) {
        limiter.isRateLimited('inst-1', now);
      }
      expect(limiter.isRateLimited('inst-1', now)).toBe(true); // 301st
    });

    it('window boundary: exactly at 60 seconds still in window', () => {
      for (let i = 0; i < 300; i++) {
        limiter.isRateLimited('inst-1', now);
      }
      // Exactly at 60s — still same window
      expect(limiter.isRateLimited('inst-1', now + 60_000)).toBe(true);
    });

    it('window boundary: at 60001ms resets', () => {
      for (let i = 0; i < 300; i++) {
        limiter.isRateLimited('inst-1', now);
      }
      expect(limiter.isRateLimited('inst-1', now + 60_001)).toBe(false);
    });
  });
});
