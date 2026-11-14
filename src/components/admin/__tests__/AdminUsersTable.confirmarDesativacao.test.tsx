import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminUsersTable } from '../AdminUsersTable';
import type { UserWithRole } from '../useAdminData';

/**
 * QA sweep (módulo admin, item CRITICAL #2): o Switch de ativo chamava
 * `onToggleActive` direto no clique, sem confirmação — um duplo clique
 * acidental desativava o usuário na hora, revogando sessões ativas sem
 * chance de desfazer. Desativar agora exige confirmação explícita no mesmo
 * padrão (AlertDialog) que RolesPage já usa para remover role; reativar não
 * é destrutivo e continua direto.
 */
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function makeUser(overrides: Partial<UserWithRole> = {}): UserWithRole {
  return {
    id: 'p1',
    user_id: 'u1',
    name: 'Ana Silva',
    email: 'ana@test.local',
    avatar_url: null,
    nickname: null,
    signature: null,
    role: 'agent',
    job_title: null,
    department: null,
    phone: null,
    access_level: 'basic',
    max_chats: null,
    can_download: false,
    is_active: true,
    created_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AdminUsersTable — confirmação ao desativar usuário', () => {
  it('clicar no switch de um usuário ativo NÃO desativa direto: abre confirmação', () => {
    const onToggleActive = vi.fn();
    render(
      <AdminUsersTable
        users={[makeUser()]}
        isAdmin
        onRoleChange={vi.fn()}
        onToggleActive={onToggleActive}
        onEditUser={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Ativar/desativar Ana Silva' }));

    expect(onToggleActive).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog', { name: 'Desativar usuário?' });
    expect(dialog).toBeInTheDocument();
    expect(dialog.textContent).toContain('Ana Silva');
  });

  it('confirmar no diálogo chama onToggleActive uma única vez', () => {
    const onToggleActive = vi.fn();
    const usuario = makeUser();
    render(
      <AdminUsersTable
        users={[usuario]}
        isAdmin
        onRoleChange={vi.fn()}
        onToggleActive={onToggleActive}
        onEditUser={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Ativar/desativar Ana Silva' }));
    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }));

    expect(onToggleActive).toHaveBeenCalledTimes(1);
    expect(onToggleActive).toHaveBeenCalledWith(usuario);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('cancelar no diálogo fecha sem chamar onToggleActive', () => {
    const onToggleActive = vi.fn();
    render(
      <AdminUsersTable
        users={[makeUser()]}
        isAdmin
        onRoleChange={vi.fn()}
        onToggleActive={onToggleActive}
        onEditUser={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Ativar/desativar Ana Silva' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onToggleActive).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('reativar um usuário inativo chama onToggleActive direto, sem confirmação', () => {
    const onToggleActive = vi.fn();
    const inativo = makeUser({ is_active: false });
    render(
      <AdminUsersTable
        users={[inativo]}
        isAdmin
        onRoleChange={vi.fn()}
        onToggleActive={onToggleActive}
        onEditUser={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Ativar/desativar Ana Silva' }));

    expect(onToggleActive).toHaveBeenCalledTimes(1);
    expect(onToggleActive).toHaveBeenCalledWith(inativo);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
