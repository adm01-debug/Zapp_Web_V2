import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// jsdom não implementa APIs que o Radix Select usa ao abrir o menu.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

const { mockReauthenticate } = vi.hoisted(() => ({ mockReauthenticate: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/auth/useReauthentication', () => ({
  useReauthentication: () => ({ reauthenticate: mockReauthenticate, isReauthenticating: false }),
}));
vi.mock('@/hooks/auth/useMFA', () => ({
  useMFA: () => ({ verifyTOTP: vi.fn(), loading: false }),
  useMfaFactors: () => ({ data: [], isLoading: false }),
}));

import { AdminUsersTable } from '@/components/admin/AdminUsersTable';
import type { UserWithRole } from '@/components/admin/useAdminData';

const user = {
  id: 'p1',
  user_id: 'u1',
  name: 'Ana Silva',
  email: 'ana@test.local',
  role: 'agent',
  is_active: true,
  access_level: 'basic',
} as unknown as UserWithRole;

describe('AdminUsersTable — ações destrutivas exigem re-autenticação (t_5e689954)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReauthenticate.mockResolvedValue({ success: true });
  });

  it('desativar usuário espera a re-autenticação antes de chamar onToggleActive', async () => {
    const props = {
      users: [user],
      isAdmin: true,
      onRoleChange: vi.fn(),
      onToggleActive: vi.fn(),
      onEditUser: vi.fn(),
    };
    render(<AdminUsersTable {...props} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Ativar/desativar Ana Silva' }));

    // A ação foi armada, mas nada acontece antes da identidade confirmada.
    expect(props.onToggleActive).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Senha Atual')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'segredo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(props.onToggleActive).toHaveBeenCalledTimes(1));
    expect(props.onToggleActive).toHaveBeenCalledWith(user);
  });

  it('senha errada bloqueia a ação destrutiva', async () => {
    mockReauthenticate.mockResolvedValue({ success: false, error: 'Senha incorreta' });
    const props = {
      users: [user],
      isAdmin: true,
      onRoleChange: vi.fn(),
      onToggleActive: vi.fn(),
      onEditUser: vi.fn(),
    };
    render(<AdminUsersTable {...props} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Ativar/desativar Ana Silva' }));
    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await screen.findByRole('alert');
    expect(props.onToggleActive).not.toHaveBeenCalled();
  });

  it('trocar papel pela Select também passa pela re-autenticação', async () => {
    const onRoleChange = vi.fn();
    render(
      <AdminUsersTable
        users={[user]}
        isAdmin
        onRoleChange={onRoleChange}
        onToggleActive={vi.fn()}
        onEditUser={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Alterar role de Ana Silva' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Supervisor' }));

    expect(onRoleChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Senha Atual')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'segredo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(onRoleChange).toHaveBeenCalledWith('u1', 'supervisor'));
  });
});
