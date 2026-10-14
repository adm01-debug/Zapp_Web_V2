import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

/**
 * PD (auditoria admin): o `fetchData` do painel de visibilidade descartava o `error`
 * das consultas e o componente não tinha estado de falha — quando a rede caía, a tela
 * mostrava o cartão "Nenhum Agente Especial", ou seja, uma consulta quebrada parecia
 * uma lista vazia. E o botão da lixeira removia o acesso do agente na hora, sem
 * confirmação. Aqui o componente é o REAL; só a fronteira de rede (Supabase) é mockada.
 */

const { estado } = vi.hoisted(() => ({
  estado: {
    profiles: [] as { id: string; user_id: string; name: string; email: string | null }[],
    profilesError: null as null | { message: string },
    specialRoles: [] as { user_id: string }[],
    grants: [] as { id: string; agent_id: string; can_see_agent_id: string }[],
    grantsError: null as null | { message: string },
    deleteCalls: [] as string[],
    deleteError: null as null | { message: string },
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      const resultado =
        tabela === 'user_roles'
          ? { data: estado.specialRoles, error: null }
          : tabela === 'profiles'
            ? { data: estado.profiles, error: estado.profilesError }
            : { data: estado.grants, error: estado.grantsError };
      return {
        select: () => ({
          eq: () => Promise.resolve(resultado),
          order: () => Promise.resolve(resultado),
          // a consulta de grants é aguardada sem encadear eq/order
          then: (resolve: (v: typeof resultado) => unknown) => resolve(resultado),
        }),
        delete: () => ({
          eq: (_coluna: string, valor: string) => {
            estado.deleteCalls.push(valor);
            return Promise.resolve({ error: estado.deleteError });
          },
        }),
      };
    },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { VisibilityGrantsManager } from '@/components/admin/VisibilityGrantsManager';
import { toast } from 'sonner';

const PERFIS = [
  { id: 'p1', user_id: 'u1', name: 'Ana Especial', email: 'ana@test.local' },
  { id: 'p2', user_id: 'u2', name: 'Bruno Lima', email: 'bruno@test.local' },
];

beforeEach(() => {
  estado.profiles = [];
  estado.profilesError = null;
  estado.specialRoles = [];
  estado.grants = [];
  estado.grantsError = null;
  estado.deleteCalls = [];
  estado.deleteError = null;
  vi.clearAllMocks();
});

describe('VisibilityGrantsManager — falha não vira tela vazia', () => {
  it('mostra erro com "Tentar de novo" e nunca o cartão de nenhum agente especial', async () => {
    estado.profiles = [];
    estado.specialRoles = [{ user_id: 'u1' }];
    estado.profilesError = { message: 'rede caiu' };

    render(<VisibilityGrantsManager />);

    expect(await screen.findByText('Não foi possível carregar as permissões de visibilidade')).toBeInTheDocument();
    expect(screen.getByText('rede caiu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();

    // O defeito antigo: consulta quebrada disfarçada de "nenhum agente especial".
    expect(screen.queryByText('Nenhum Agente Especial')).not.toBeInTheDocument();
  });

  it('nova tentativa com sucesso volta a renderizar os agentes especiais', async () => {
    estado.profiles = [];
    estado.specialRoles = [{ user_id: 'u1' }];
    estado.profilesError = { message: 'rede caiu' };

    render(<VisibilityGrantsManager />);
    expect(await screen.findByText('Não foi possível carregar as permissões de visibilidade')).toBeInTheDocument();

    estado.profilesError = null;
    estado.profiles = PERFIS;
    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));

    expect(await screen.findByText('Ana Especial')).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível carregar as permissões de visibilidade')).not.toBeInTheDocument();
  });
});

describe('VisibilityGrantsManager — remoção de concessão confirma antes de apagar', () => {
  const semear = () => {
    estado.profiles = PERFIS;
    estado.specialRoles = [{ user_id: 'u1' }];
    estado.grants = [{ id: 'g1', agent_id: 'p1', can_see_agent_id: 'p2' }];
  };

  it('a lixeira tem nome acessível e nada é apagado antes da confirmação', async () => {
    semear();
    render(<VisibilityGrantsManager />);

    const lixeira = await screen.findByRole('button', { name: 'Remover visibilidade de Bruno Lima' });
    fireEvent.click(lixeira);

    // Abre a confirmação com quem perde o acesso e quem deixa de ser visto.
    expect(await screen.findByText('Remover visibilidade?')).toBeInTheDocument();
    expect(within(screen.getByRole('alertdialog')).getByText('Ana Especial')).toBeInTheDocument();
    expect(within(screen.getByRole('alertdialog')).getByText('Bruno Lima')).toBeInTheDocument();

    // Antes de confirmar, o DELETE não rodou.
    expect(estado.deleteCalls).toEqual([]);
  });

  it('cancelar não apaga; confirmar apaga a concessão pelo id', async () => {
    semear();
    render(<VisibilityGrantsManager />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remover visibilidade de Bruno Lima' }));
    await screen.findByText('Remover visibilidade?');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(estado.deleteCalls).toEqual([]);

    fireEvent.click(await screen.findByRole('button', { name: 'Remover visibilidade de Bruno Lima' }));
    await screen.findByText('Remover visibilidade?');
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(estado.deleteCalls).toEqual(['g1']));
    expect(toast.success).toHaveBeenCalledWith('Permissão removida');
  });
});
