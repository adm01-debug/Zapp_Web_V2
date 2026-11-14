import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * QA sweep (módulo admin, item CRITICAL #1): a tela de Papéis atribuía/removia
 * role gravando direto em `user_roles` (insert/delete), sem passar pela RPC
 * atômica `admin_set_role` que `useAdminData.handleRoleChange` já usa. Essa
 * RPC tem o piso de "não pode zerar o último administrador" e "não pode se
 * auto-rebaixar" — o caminho direto não tinha nenhum dos dois, então dava pra
 * remover o último admin do sistema pela UI de Papéis.
 *
 * Fronteira de rede: `loadRolesWithProfiles` é mockado; o hook real
 * (`useRolesPageState`) é exercitado de ponta a ponta.
 */
const { mockRpc, mockFrom, mockInsert, mockDelete } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockInsert: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      insert: mockInsert.mockResolvedValue({ data: null, error: null }),
      delete: mockDelete.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    })),
    rpc: mockRpc,
  },
}));

vi.mock('@/pages/admin/loadRolesWithProfiles', () => ({
  loadRolesWithProfiles: vi.fn().mockResolvedValue([]),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { useRolesPageState, type UserWithRole } from '@/pages/admin/useRolesPageState';
import { toast } from 'sonner';

function makeRole(overrides: Partial<UserWithRole> = {}): UserWithRole {
  return { id: 'role-1', user_id: 'auth-2', role: 'admin', ...overrides };
}

describe('useRolesPageState — atribuir/remover role pela RPC admin_set_role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it('handleAddRole chama admin_set_role e NÃO insere direto em user_roles', async () => {
    const { result } = renderHook(() => useRolesPageState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setSelectedUser('auth-1');
      result.current.setSelectedRole('supervisor');
    });

    await act(async () => {
      await result.current.handleAddRole();
    });

    expect(mockRpc).toHaveBeenCalledWith('admin_set_role', { _user_id: 'auth-1', _role: 'supervisor' });
    expect(mockInsert).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('handleRemoveRole chama admin_set_role (rebaixa para agent) e NÃO deleta direto a row', async () => {
    const { result } = renderHook(() => useRolesPageState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setUserToRemove(makeRole());
    });

    await act(async () => {
      await result.current.handleRemoveRole();
    });

    expect(mockRpc).toHaveBeenCalledWith('admin_set_role', { _user_id: 'auth-2', _role: 'agent' });
    expect(mockDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('handleRemoveRole propaga o piso de "último admin" da RPC em vez de remover de qualquer jeito (bug original)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'cannot_demote_last_admin' } });

    const { result } = renderHook(() => useRolesPageState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setUserToRemove(makeRole());
    });

    await act(async () => {
      await result.current.handleRemoveRole();
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('A instalação precisa de pelo menos um administrador.')
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    // userToRemove só é limpo em sucesso: a falha tem que ficar visível, não
    // pode "parecer" que a remoção funcionou.
    expect(result.current.userToRemove).not.toBeNull();
  });
});
