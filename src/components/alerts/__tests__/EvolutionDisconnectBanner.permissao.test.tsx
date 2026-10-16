import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { EvolutionDisconnectBanner } from '../EvolutionDisconnectBanner';

/**
 * PM-37: o botão "Reconectar" da faixa de queda chama a ação `connect` da edge
 * `evolution-api`, que é de CONTROLE (admin/supervisor). Antes ele era oferecido
 * a qualquer usuário e o agente só descobria a recusa depois do clique (403).
 * O teste renderiza o banner REAL e muda só o papel do usuário.
 */
const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  invoke: vi.fn(),
  role: { isAdmin: false, isSupervisor: false },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: async () => ({ data: h.rows }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => undefined,
    functions: { invoke: h.invoke },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ ...h.role, roles: h.role.isAdmin ? ['admin'] : ['agent'], loading: false }),
}));

const desconectada = { id: 'c1', instance_id: 'PRINCIPAL', phone_number: null, status: 'disconnected' };

describe('EvolutionDisconnectBanner — Reconectar só aparece com permissão (PM-37)', () => {
  beforeEach(() => {
    h.rows = [desconectada];
    h.invoke.mockReset();
  });

  it('admin vê o aviso de queda e o botão Reconectar', async () => {
    h.role = { isAdmin: true, isSupervisor: true };
    render(<EvolutionDisconnectBanner />);

    expect(await screen.findByText(/não serão enviadas/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /reconectar/i })).toBeTruthy();
  });

  it('agente vê o aviso de queda mas não vê o botão Reconectar (e nada é chamado)', async () => {
    h.role = { isAdmin: false, isSupervisor: false };
    render(<EvolutionDisconnectBanner />);

    expect(await screen.findByText(/não serão enviadas/)).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /reconectar/i })).toBeNull();
    });
    expect(h.invoke).not.toHaveBeenCalled();
  });
});
