/**
 * A11Y: Switch sem nome acessível em RateLimitConfigPanel.
 * Cada Switch de regra precisa de aria-label ligado ao nome da regra.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RateLimitConfigPanel } from '../RateLimitConfigPanel';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({
          data: [
            { id: 'r1', name: 'Regra de teste', is_active: true, action: 'block', endpoint_pattern: '/api/test', window_seconds: 60, max_requests: 100 },
          ],
          error: null,
        }),
      })),
      delete: vi.fn(() => ({
        neq: vi.fn().mockResolvedValue({ error: null }),
      })),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe('a11y: RateLimitConfigPanel Switch com nome acessível', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Switch de regra tem aria-label com o nome da regra', async () => {
    render(<RateLimitConfigPanel />);
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /Ativar Regra de teste/i })).toBeInTheDocument();
    });
  });
});