import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * R2-AUTH-035 (P2): quando a consulta inicial de roles falha, o hook encerrava o
 * loading sem registrar erro e a página mostrava quatro listas vazias — ou seja,
 * anunciava "nenhum usuário" quando na verdade a consulta tinha quebrado.
 *
 * Aqui o carregador (`loadRolesWithProfiles`, a fronteira de rede) é substituído
 * por um controle do teste; o hook e a página são os REAIS. O primeiro caso prova
 * a falha explícita (sem contagem zero, sem "Nenhum usuário com esta role") e o
 * segundo prova a recuperação pela ação de nova tentativa.
 */

const { loadRoles } = vi.hoisted(() => ({ loadRoles: vi.fn() }));

vi.mock('@/pages/admin/loadRolesWithProfiles', () => ({
  loadRolesWithProfiles: (...args: unknown[]) => loadRoles(...args),
}));

// Fronteira de rede: nenhum teste fala com o Supabase. O carregador é mockado
// acima; este mock garante que o próprio hook também não escape para a rede.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      throw new Error('o teste não deve chamar o Supabase real');
    },
  },
}));

vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isAdmin: true }) }));

// Abas inativas não estão sob teste: viram stubs para não puxar as suas árvores.
vi.mock('@/components/permissions/PermissionMatrix', () => ({ PermissionMatrix: () => null }));
vi.mock('@/components/admin/VisibilityGrantsManager', () => ({ VisibilityGrantsManager: () => null }));

import RolesPage from '@/pages/admin/RolesPage';

const ERRO = 'Falha ao carregar roles (rede)';

const ROLES_OK = [
  { id: 'r1', user_id: 'u1', role: 'admin' as const, profile: { name: 'Ana Souza', email: 'ana@promo.test', avatar_url: null } },
  { id: 'r2', user_id: 'u2', role: 'agent' as const, profile: { name: 'Bruno Lima', email: 'bruno@promo.test', avatar_url: null } },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RolesPage — falha do carregador vira estado de erro (R2-AUTH-035)', () => {
  it('mostra mensagem de falha e botão de nova tentativa, nunca listas vazias', async () => {
    loadRoles.mockRejectedValueOnce(new Error(ERRO));

    render(<RolesPage />);

    // O erro aparece e o loading termina (sem ele a página ficaria no spinner).
    expect(await screen.findByText('Não foi possível carregar as roles')).toBeInTheDocument();
    expect(screen.getByText(ERRO)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();

    // O defeito antigo: falha disfarçada de "não há usuários".
    expect(screen.queryByText('Nenhum usuário com esta role')).not.toBeInTheDocument();
    expect(screen.queryByText(/^\d+ usuários?$/)).not.toBeInTheDocument();
    expect(loadRoles).toHaveBeenCalledTimes(1);
  });

  it('nova tentativa com sucesso remove o erro e renderiza as roles recebidas', async () => {
    loadRoles.mockRejectedValueOnce(new Error(ERRO)).mockResolvedValueOnce(ROLES_OK);

    render(<RolesPage />);
    expect(await screen.findByText('Não foi possível carregar as roles')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));

    // Roles recebidas na segunda chamada aparecem com os perfis juntados.
    expect(await screen.findByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('Bruno Lima')).toBeInTheDocument();

    // O estado de erro saiu de cena e os cartões voltaram (2 roles vazias + 2 cheias).
    expect(screen.queryByText('Não foi possível carregar as roles')).not.toBeInTheDocument();
    expect(screen.getAllByText('Nenhum usuário com esta role')).toHaveLength(2);
    expect(loadRoles).toHaveBeenCalledTimes(2);
  });
});
