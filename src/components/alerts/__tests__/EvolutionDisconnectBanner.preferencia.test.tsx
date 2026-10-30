import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * PD-38 — a faixa de conexão caída respeita a preferência do usuário.
 *
 * A tabela `connection_alert_preferences` (migration 20261013044440) guarda o TIPO do aviso
 * (`alert_on_degraded` / `alert_on_disconnected`) e o CANAL (push/e-mail). A faixa in-app é o
 * aviso de "conexão desconectada", então o interruptor que a governa é `alert_on_disconnected`;
 * desligado, ela não aparece mesmo com a conexão caída na lista.
 */
const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  preferencias: null as unknown,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () =>
        table === 'connection_alert_preferences'
          ? { maybeSingle: async () => ({ data: h.preferencias, error: null }) }
          : { eq: async () => ({ data: h.rows }) },
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => undefined,
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: null, profile: null, loading: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EvolutionDisconnectBanner } from '../EvolutionDisconnectBanner';

const desconectada = { id: 'c1', instance_id: 'PRINCIPAL', phone_number: null, status: 'disconnected' };

describe('EvolutionDisconnectBanner — preferência alert_on_disconnected (PD-38)', () => {
  beforeEach(() => {
    h.rows = [desconectada];
    h.preferencias = null;
  });

  it('com o tipo desligado, a conexão caída NAO vira faixa', async () => {
    h.preferencias = { alert_on_disconnected: false };
    const { container } = render(<EvolutionDisconnectBanner />, { wrapper: TestQueryWrapper });

    // dá tempo do SELECT de status e o de preferência assentarem
    await waitFor(() => expect(h.rows).toEqual([desconectada]));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[role="region"]')).toBeNull();
  });

  it('com o tipo ligado, a faixa aparece normalmente', async () => {
    h.preferencias = { alert_on_disconnected: true };
    const { container, findByText } = render(<EvolutionDisconnectBanner />, { wrapper: TestQueryWrapper });

    await findByText(/está desconectada/i);
    expect(container.querySelector('[role="region"]')).not.toBeNull();
  });

  it('sem linha salva (padrao do banco) a faixa aparece', async () => {
    h.preferencias = null;
    const { findByText } = render(<EvolutionDisconnectBanner />, { wrapper: TestQueryWrapper });
    await findByText(/está desconectada/i);
  });

  it('desligar só o tipo degradado NAO esconde o aviso de conexão caída', async () => {
    h.preferencias = { alert_on_degraded: false, alert_on_disconnected: true };
    const { findByText } = render(<EvolutionDisconnectBanner />, { wrapper: TestQueryWrapper });
    await findByText(/está desconectada/i);
  });
});
