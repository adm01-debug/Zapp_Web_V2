import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const { mockReauthenticate, mockHandleRemoveRole, mockHandleAddRole } = vi.hoisted(() => ({
  mockReauthenticate: vi.fn(),
  mockHandleRemoveRole: vi.fn(),
  mockHandleAddRole: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isAdmin: true }) }));
vi.mock('@/components/permissions/PermissionMatrix', () => ({ PermissionMatrix: () => null }));
vi.mock('@/components/admin/VisibilityGrantsManager', () => ({
  VisibilityGrantsManager: () => null,
}));
vi.mock('@/hooks/auth/useReauthentication', () => ({
  useReauthentication: () => ({ reauthenticate: mockReauthenticate, isReauthenticating: false }),
}));
vi.mock('@/hooks/auth/useMFA', () => ({
  useMFA: () => ({ verifyTOTP: vi.fn(), loading: false }),
  useMfaFactors: () => ({ data: [], isLoading: false }),
}));

const agentUser = {
  id: 'p1',
  user_id: 'u1',
  role: 'agent',
  profile: { name: 'Ana Silva', email: 'ana@test.local' },
};

vi.mock('@/pages/admin/useRolesPageState', async () => {
  const ReactModule = await import('react');
  return {
    useRolesPageState: () => {
      const [userToRemove, setUserToRemove] = ReactModule.useState<null | typeof agentUser>(null);
      const [showAddDialog, setShowAddDialog] = ReactModule.useState(false);
      const [selectedUser, setSelectedUser] = ReactModule.useState('u9');
      return {
        loading: false,
        loadError: null,
        retryLoad: vi.fn(),
        search: '',
        setSearch: vi.fn(),
        showAddDialog,
        setShowAddDialog,
        selectedUser,
        setSelectedUser,
        selectedRole: 'agent',
        setSelectedRole: vi.fn(),
        availableUsers: [{ user_id: 'u9', name: 'Beto', email: 'beto@test.local' }],
        userToRemove,
        setUserToRemove,
        updating: false,
        handleAddRole: mockHandleAddRole,
        handleRemoveRole: mockHandleRemoveRole,
        groupedUsers: { admin: [], supervisor: [], agent: [agentUser], special_agent: [] },
      };
    },
  };
});

import RolesPage from '@/pages/admin/RolesPage';

async function submitReauth(value = 'segredo') {
  fireEvent.change(await screen.findByLabelText('Senha Atual'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
}

describe('RolesPage — remover papel exige re-autenticação (t_5e689954)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReauthenticate.mockResolvedValue({ success: true });
  });

  it('só executa a remoção depois de confirmar a identidade', async () => {
    render(<RolesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Remover role de Ana Silva' }));
    // O diálogo de confirmação abre, mas a remoção ainda não aconteceu.
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));

    expect(mockHandleRemoveRole).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Senha Atual')).toBeInTheDocument();

    await submitReauth();

    await waitFor(() => expect(mockHandleRemoveRole).toHaveBeenCalledTimes(1));
  });

  it('senha errada mantém o papel intacto', async () => {
    mockReauthenticate.mockResolvedValue({ success: false, error: 'Senha incorreta' });
    render(<RolesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Remover role de Ana Silva' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));
    await submitReauth('errada');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Senha incorreta');
    expect(mockHandleRemoveRole).not.toHaveBeenCalled();
  });
});

describe('RolesPage — atribuir papel só fecha o diálogo no sucesso (ponto 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReauthenticate.mockResolvedValue({ success: true });
  });

  async function armarAtribuicao() {
    render(<RolesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Atribuir Role' }));
    fireEvent.click(screen.getByRole('button', { name: /^Atribuir$/ }));
    await screen.findByLabelText('Senha Atual');
  }

  it('só atribui depois de confirmar a identidade', async () => {
    await armarAtribuicao();

    expect(mockHandleAddRole).not.toHaveBeenCalled();

    await submitReauth();

    await waitFor(() => expect(mockHandleAddRole).toHaveBeenCalledTimes(1));
    // O `run` não fecha o diálogo: quem fecha no sucesso é o `handleAddRole`
    // (o mock não fecha, então o botão interno continua montado — com o
    // código recusado, `setShowAddDialog(false)` o desmontava antes do
    // resultado).
    expect(screen.getByRole('button', { name: /^Atribuir$/ })).toBeInTheDocument();
  });

  it('falha na re-autenticação não atribui e mantém o diálogo aberto com a seleção', async () => {
    mockReauthenticate.mockResolvedValue({ success: false, error: 'Senha incorreta' });
    await armarAtribuicao();

    await submitReauth('errada');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Senha incorreta');
    expect(mockHandleAddRole).not.toHaveBeenCalled();
    // O diálogo de atribuir continua aberto (não fechou antes do resultado).
    // `hidden: true` porque o Radix marca o conteúdo de trás como
    // aria-hidden enquanto o guarda modal está por cima.
    expect(screen.getByRole('button', { name: /^Atribuir$/, hidden: true })).toBeInTheDocument();
  });
});
