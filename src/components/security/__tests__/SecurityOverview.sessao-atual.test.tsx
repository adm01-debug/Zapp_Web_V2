/**
 * R2-AUTH-005 — o item "Sessões Ativas" do overview mede as sessões que NÃO são
 * a atual. A sessão atual vem do JWT (`is_current`), não do device_id: dois
 * logins no mesmo aparelho compartilham o device_id e a contagem antiga (pelo
 * tamanho do array de sessões vivas) punia o dono pela própria sessão.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface SessaoFixture {
  id: string;
  is_current: boolean;
}

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
  sessions: SessaoFixture[];
  loading: boolean;
} = { devices: [], sessions: [], loading: false };

vi.mock('@/hooks/auth/useMFA', () => ({
  useMfaFactors: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/ui/useDeviceDetection', () => ({ useDeviceDetection: () => devicesState }));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ hasRole: () => false }) }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}));

import { SecurityOverview } from '../SecurityOverview';

describe('SecurityOverview — sessões medidas pelo JWT', () => {
  beforeEach(() => {
    devicesState.devices = [];
    devicesState.sessions = [];
    devicesState.loading = false;
  });

  it('duas sessões no mesmo aparelho: só a outra conta — a atual não é risco', async () => {
    devicesState.sessions = [
      { id: 's1', is_current: true },
      { id: 's2', is_current: false },
    ];

    render(<SecurityOverview />);

    expect(await screen.findByText('2 sessão(ões) ativa(s), 1 além desta')).toBeInTheDocument();
    expect(screen.getByText('25/25')).toBeInTheDocument();
  });

  it('quatro sessões alheias: o item sai do verde e cai para 15', async () => {
    devicesState.sessions = [
      { id: 's1', is_current: true },
      { id: 's2', is_current: false },
      { id: 's3', is_current: false },
      { id: 's4', is_current: false },
      { id: 's5', is_current: false },
    ];

    render(<SecurityOverview />);

    expect(await screen.findByText('5 sessão(ões) ativa(s), 4 além desta')).toBeInTheDocument();
    // O item de sessões deixou de valer o teto: 15 no lugar de 25.
    expect(screen.getAllByText('15/25').length).toBeGreaterThan(0);
  });

  it('lista vazia: nenhum dado de sessão é inventado', async () => {
    render(<SecurityOverview />);

    expect(await screen.findByText('0 sessão(ões) ativa(s), 0 além desta')).toBeInTheDocument();
  });
});
