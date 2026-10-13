import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminUsersTable } from '../AdminUsersTable';
import type { UserWithRole } from '../useAdminData';
import type { AppRole } from '@/hooks/system/useUserRole';

/**
 * Cartão t_672cd537: `AdminUsersTable` não listava a role `special_agent`
 * (existe no enum `app_role` e é usada pelo VisibilityGrantsManager) — quem
 * tinha essa role ficava com o seletor vazio e não havia como promovê-la.
 */
function usuario(role: AppRole, over: Partial<UserWithRole> = {}): UserWithRole {
  return {
    id: 'p1',
    user_id: 'u1',
    name: 'Ana Silva',
    email: 'ana@test.local',
    avatar_url: null,
    nickname: null,
    signature: null,
    role,
    job_title: null,
    department: null,
    phone: null,
    access_level: 'basic',
    max_chats: null,
    can_download: false,
    is_active: true,
    created_at: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

const props = { onRoleChange: vi.fn(), onToggleActive: vi.fn(), onEditUser: vi.fn() };

function abrirSeletorDeRole() {
  fireEvent.keyDown(screen.getByRole('combobox', { name: /Alterar role de Ana Silva/i }), {
    key: 'ArrowDown',
  });
}

describe('AdminUsersTable — role special_agent', () => {
  it('nomeia a role special_agent na linha de quem a tem', () => {
    render(<AdminUsersTable users={[usuario('special_agent')]} isAdmin={false} {...props} />);

    expect(screen.getByText('Agente Especial')).toBeInTheDocument();
  });

  it('o seletor de role do admin oferece Agente Especial', () => {
    render(<AdminUsersTable users={[usuario('agent')]} isAdmin {...props} />);

    abrirSeletorDeRole();

    expect(screen.getByRole('option', { name: 'Agente Especial' })).toBeInTheDocument();
  });

  it('escolher Agente Especial entrega special_agent ao onRoleChange', () => {
    const onRoleChange = vi.fn();
    render(<AdminUsersTable users={[usuario('agent')]} isAdmin {...props} onRoleChange={onRoleChange} />);

    abrirSeletorDeRole();
    fireEvent.click(screen.getByRole('option', { name: 'Agente Especial' }));

    expect(onRoleChange).toHaveBeenCalledWith('u1', 'special_agent');
  });

  it('a coluna de nível de acesso se declara informativa', () => {
    render(<AdminUsersTable users={[usuario('agent', { access_level: 'full' })]} isAdmin {...props} />);

    expect(screen.getByRole('columnheader', { name: 'Acesso (informativo)' })).toBeInTheDocument();
  });
});
