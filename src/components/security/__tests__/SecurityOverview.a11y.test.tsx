import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * Y18-1 / SHELL-13 — barra de progresso da pontuação de segurança sem nome acessível.
 * Evidência da auditoria (docs/audits/AUDITORIA_A11Y_MOBILE_CONFIG_ADMIN_SHELL_2026-10-07.md:180):
 * axe `aria-progressbar-name` [serious], 1 nó em todos os 6 combos
 * (`role="progressbar"` sem `aria-label`/`aria-labelledby`).
 */

interface FactorsState {
  data?: Array<{ id: string; factor_type: string; status: string }>;
  isLoading: boolean;
  isError: boolean;
}

const mfaState: { current: FactorsState } = {
  current: { data: [], isLoading: false, isError: false },
};
const devicesState: {
  devices: Array<{
    id: string;
    is_trusted: boolean;
    device_name?: string;
    browser?: string;
    os?: string;
    ip_address?: string;
    last_seen_at?: string;
  }>;
  sessions: Array<{ id: string }>;
  loading: boolean;
} = { devices: [], sessions: [], loading: false };
const authState: { user: { id: string } | null } = { user: { id: 'u-1' } };

vi.mock('@/hooks/auth/useMFA', () => ({ useMfaFactors: () => mfaState.current }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/ui/useDeviceDetection', () => ({ useDeviceDetection: () => devicesState }));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ hasRole: () => false }) }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
      }),
    }),
  },
}));

import { SecurityOverview } from '../SecurityOverview';

describe('a11y: barra de progresso da pontuação (SHELL-13)', () => {
  beforeEach(() => {
    mfaState.current = { data: [], isLoading: false, isError: false };
    devicesState.devices = [];
    devicesState.sessions = [];
    devicesState.loading = false;
    authState.user = { id: 'u-1' };
  });

  it('a barra tem nome acessível nas duas situações de pontuação (medida e indisponível)', () => {
    const { unmount } = render(<SecurityOverview />);
    expect(screen.getByRole('progressbar', { name: 'Pontuação de segurança' })).toBeInTheDocument();

    // Sem medição válida a barra continua na tela (valor 0): o nome não pode depender do valor.
    unmount();
    mfaState.current = { data: undefined, isLoading: false, isError: true };
    render(<SecurityOverview />);
    expect(screen.getByRole('progressbar', { name: 'Pontuação de segurança' })).toBeInTheDocument();
  });

  it('axe não acusa progressbar sem nome (regra aria-progressbar-name)', async () => {
    const { container } = render(<SecurityOverview />);

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.filter((v) => v.id === 'aria-progressbar-name')).toEqual([]);
  });
});
