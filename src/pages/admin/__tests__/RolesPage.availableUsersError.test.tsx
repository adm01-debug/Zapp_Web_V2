import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * PD (auditoria admin): em RolesPage o botão da lixeira (que chama `setUserToRemove`)
 * não tinha nome acessível e o `fetchAvailableUsers` descartava o `error` — um diálogo
 * "Atribuir Role" com a consulta quebrada pareceria não ter nenhum usuário.
 * Aqui o hook `useRolesPageState` e a página são os REAIS; a fronteira de rede é mockada.
 */

const { loadRoles, perfisQuery } = vi.hoisted(() => ({
  loadRoles: vi.fn(),
  perfisQuery: vi.fn(),
}));

vi.mock('@/pages/admin/loadRolesWithProfiles', () => ({
  loadRolesWithProfiles: (...args: unknown[]) => loadRoles(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => perfisQuery() }),
    }),
  },
}));

vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isAdmin: true }) }));
vi.mock('@/components/permissions/PermissionMatrix', () => ({ PermissionMatrix: () => null }));
vi.mock('@/components/admin/VisibilityGrantsManager', () => ({ VisibilityGrantsManager: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import RolesPage from '@/pages/admin/RolesPage';

const ROLES = [
  { id: 'r1', user_id: 'u1', role: 'agent' as const, profile: { name: 'Ana Souza', email: 'ana@test.local', avatar_url: null } },
];

beforeEach(() => {
  vi.clearAllMocks();
  loadRoles.mockResolvedValue(ROLES);
  perfisQuery.mockResolvedValue({ data: [], error: null });
});

describe('RolesPage — lixeira com nome acessível e erro de usuários visível', () => {
  it('o botão de remover role da lista anuncia de quem é a role', async () => {
    render(<RolesPage />);

    const lixeira = await screen.findByRole('button', { name: 'Remover role de Ana Souza' });
    fireEvent.click(lixeira);

    // A confirmação existente continua sendo o caminho da remoção.
    expect(await screen.findByText('Remover Role?')).toBeInTheDocument();
  });

  it('falha ao carregar usuários aparece no diálogo, não como lista vazia, e permite tentar de novo', async () => {
    perfisQuery.mockResolvedValue({ data: null, error: { message: 'rede caiu' } });

    render(<RolesPage />);
    await screen.findByText('Ana Souza');

    fireEvent.click(screen.getByRole('button', { name: /atribuir role/i }));

    expect(await screen.findByText('Não foi possível carregar os usuários')).toBeInTheDocument();
    expect(screen.getByText('rede caiu')).toBeInTheDocument();
    const tentar = screen.getByRole('button', { name: /tentar de novo/i });

    // A nova tentativa volta a consultar os usuários disponíveis.
    fireEvent.click(tentar);
    await screen.findByText('Não foi possível carregar os usuários');
    expect(perfisQuery).toHaveBeenCalledTimes(2);
  });
});
