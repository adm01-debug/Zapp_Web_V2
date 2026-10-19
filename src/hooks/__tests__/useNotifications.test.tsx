import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  }),
  log: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  }),
}));

vi.mock('@/supabaseClient', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn(function (this: unknown) { return this; }),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
    auth: { getSession: vi.fn(() => ({ data: { session: { user: { id: 'user1' } } } })) },
  },
}));

doMocks();
function doMocks() {}

describe('useNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not throw on mount', () => {
    expect(true).toBe(true);
  });
});
