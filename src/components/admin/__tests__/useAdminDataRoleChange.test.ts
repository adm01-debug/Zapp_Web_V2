import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// R2-AUTH-008 (item 74): a troca de papel tem que ser a RPC atômica
// `admin_set_role` (SECURITY DEFINER, protege auto-rebaixamento e o último
// admin). O caminho antigo delete+insert em `user_roles` era não-transacional:
// se o DELETE concluía e o INSERT falhava, o usuário ficava SEM role.
const { mockRpc, mockFrom, mockDelete, mockInsert } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockDelete: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    // `select` retorna um thenable: fetchData faz `await .select('*')` em
    // user_roles e `.select('*').order(...)` em profiles.
    from: mockFrom.mockImplementation(() => ({
      select: vi.fn(() => Object.assign(
        Promise.resolve({ data: [], error: null }),
        {
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        },
      )),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      insert: mockInsert.mockResolvedValue({ data: null, error: null }),
      delete: mockDelete.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    })),
    rpc: mockRpc,
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { useAdminData } from '@/components/admin/useAdminData';
import { toast } from 'sonner';

describe('useAdminData.handleRoleChange — RPC atômica admin_set_role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({
      data: [{ out_user_id: 'auth-1', out_old_role: 'agent', out_new_role: 'admin' }],
      error: null,
    });
  });

  it('chama admin_set_role uma única vez e NÃO usa delete+insert em user_roles', async () => {
    const { result } = renderHook(() => useAdminData('users'));
    await act(async () => {
      await result.current.handleRoleChange('auth-1', 'admin');
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('admin_set_role', {
      _user_id: 'auth-1',
      _role: 'admin',
    });
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('em erro da RPC anuncia erro, não anuncia sucesso e não refaz o fetch', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'cannot_demote_last_admin' } });

    const { result } = renderHook(() => useAdminData('users'));
    await act(async () => {
      await result.current.handleRoleChange('auth-1', 'agent');
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('em erro da RPC traduz o código para mensagem clara', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'cannot_demote_self' } });

    const { result } = renderHook(() => useAdminData('users'));
    await act(async () => {
      await result.current.handleRoleChange('auth-1', 'agent');
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Você não pode remover o próprio papel de administrador.'
      )
    );
  });

  it('em sucesso anuncia o novo papel e refaz o fetch', async () => {
    const { result } = renderHook(() => useAdminData('users'));
    await act(async () => {
      await result.current.handleRoleChange('auth-1', 'admin');
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockFrom).toHaveBeenCalledWith('user_roles');
  });
});
