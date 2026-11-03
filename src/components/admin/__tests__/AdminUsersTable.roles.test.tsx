import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminUsersTable } from '../AdminUsersTable';
import type { UserWithRole } from '../useAdminData';
import type { AppRole } from '@/hooks/system/useUserRole';

/**
 * Papel "agente especial" excluído por decisão do dono (2026-11-03): o seletor
 * de role oferece só admin, supervisor e agent.
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

describe('AdminUsersTable — roles', () => {
  it('o seletor de role do admin não oferece Agente Especial', () => {
    render(<AdminUsersTable users={[usuario('agent')]} isAdmin {...props} />);

    abrirSeletorDeRole();

    expect(screen.getByRole('option', { name: 'Atendente' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Agente Especial' })).toBeNull();
  });

  it('a coluna de nível de acesso se declara informativa', () => {
    render(<AdminUsersTable users={[usuario('agent', { access_level: 'full' })]} isAdmin {...props} />);

    expect(screen.getByRole('columnheader', { name: 'Acesso (informativo)' })).toBeInTheDocument();
  });
});
