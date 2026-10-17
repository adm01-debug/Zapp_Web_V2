/**
 * A11Y: Hierarquia de títulos em SecurityOverview.
 * "Pontuação de Segurança" estava em h3 sem h2 antes (SHELL-14).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SecurityOverview } from '../SecurityOverview';

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1' } }),
}));

vi.mock('@/hooks/auth/useMFA', () => ({
  useMfaFactors: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock('@/hooks/ui/useDeviceDetection', () => ({
  useDeviceDetection: () => ({ devices: [], sessions: [], loading: false }),
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ hasRole: () => false }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() =>
        Object.assign(Promise.resolve({ count: 0, error: null }), {
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
          })),
        }),
      ),
    })),
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

describe('a11y: hierarquia de títulos em SecurityOverview', () => {
  it('Pontuação de Segurança está em h2 (não h3)', () => {
    render(<SecurityOverview />);
    const heading = screen.getByRole('heading', { name: /Pontuação de Segurança/i });
    expect(heading.tagName).toBe('H2');
  });
});