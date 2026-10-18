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

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

describe('a11y: hierarquia de títulos em SecurityOverview', () => {
  it('Pontuação de Segurança está em h2 (não h3)', () => {
    render(<SecurityOverview />);
    const heading = screen.getByRole('heading', { name: /Pontuação de Segurança/i });
    expect(heading.tagName).toBe('H2');
  });
});