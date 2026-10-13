import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

/**
 * R2-AUTH-036 (P2): a tela /admin/roles concedia/revogava papel escrevendo
 * `user_roles` direto pelo PostgREST (`from('user_roles').insert/delete`). O
 * INSERT/DELETE direto depende só da RLS e NÃO passa pelas travas das RPCs
 * (não impede zerar o último administrador, remover o próprio admin nem
 * conceder papel já existente), e a autoria do audit_logs fica sem garantia.
 *
 * Aqui o hook REAL é exercitado com o client Supabase mockado: os dois
 * mutadores precisam chamar `admin_add_role` / `admin_remove_role` e nunca
 * escrever `user_roles` direto. Os erros das travas viram mensagem em pt-BR,
 * não refazem a consulta (o cache de papéis fica intacto) e liberam `updating`;
 * no sucesso, o cache de papéis é invalidado pela recarga.
 */

const { loadRoles, rpc, from, toastError, toastSuccess } = vi.hoisted(() => ({
  loadRoles: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/pages/admin/loadRolesWithProfiles', () => ({
  loadRolesWithProfiles: (...args: unknown[]) => loadRoles(...args),
}));

// Fronteira de rede: nenhum teste fala com o Supabase. `rpc` é o caminho novo;
// `from` existe só para provar que a escrita direta saiu de cena.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError, info: vi.fn(), warning: vi.fn() },
}));

import { useRolesPageState } from '@/pages/admin/useRolesPageState';

const ROLE_REMOVIDA = { id: 'r9', user_id: 'u-2', role: 'admin' as const };

async function montar() {
  loadRoles.mockResolvedValue([]);
  const { result } = renderHook(() => useRolesPageState());
  await waitFor(() => expect(loadRoles).toHaveBeenCalledTimes(1));
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  // `profiles` ainda é lido direto (lista de usuários elegíveis do diálogo);
  // `user_roles` não pode mais ser tocado direto — a escrita saiu de cena.
  from.mockImplementation((table: string) => {
    if (table === 'user_roles') {
      throw new Error('a escrita direta em user_roles não deve mais acontecer');
    }
    return {
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
    };
  });
});

describe('useRolesPageState — mutações por RPC (R2-AUTH-036)', () => {
  it('concede papel por admin_add_role, nunca por INSERT direto, e invalida o cache', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const result = await montar();

    act(() => {
      result.current.setSelectedUser('u-1');
      result.current.setSelectedRole('agent');
      result.current.setShowAddDialog(true);
    });

    await act(async () => {
      await result.current.handleAddRole();
    });

    expect(rpc).toHaveBeenCalledWith('admin_add_role', { _user_id: 'u-1', _role: 'agent' });
    expect(from).not.toHaveBeenCalledWith('user_roles');

    // Sucesso: diálogo fecha, seleção limpa e o cache é invalidado pela recarga.
    expect(toastSuccess).toHaveBeenCalledWith('Role adicionada com sucesso');
    expect(result.current.showAddDialog).toBe(false);
    expect(result.current.selectedUser).toBe('');
    expect(loadRoles).toHaveBeenCalledTimes(2);
    expect(result.current.updating).toBe(false);
  });

  it('revoga papel por admin_remove_role, nunca por DELETE direto, e invalida o cache', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const result = await montar();

    act(() => {
      result.current.setUserToRemove(ROLE_REMOVIDA);
    });

    await act(async () => {
      await result.current.handleRemoveRole();
    });

    expect(rpc).toHaveBeenCalledWith('admin_remove_role', { _user_id: 'u-2', _role: 'admin' });
    expect(from).not.toHaveBeenCalledWith('user_roles');

    expect(toastSuccess).toHaveBeenCalledWith('Role removida com sucesso');
    expect(result.current.userToRemove).toBeNull();
    expect(loadRoles).toHaveBeenCalledTimes(2);
    expect(result.current.updating).toBe(false);
  });

  it('traduz cannot_demote_last_admin, mantém o diálogo aberto e não recarrega', async () => {
    rpc.mockResolvedValue({ error: { message: 'cannot_demote_last_admin', code: 'P0001' } });
    const result = await montar();

    act(() => {
      result.current.setUserToRemove(ROLE_REMOVIDA);
    });

    await act(async () => {
      await result.current.handleRemoveRole();
    });

    expect(toastError).toHaveBeenCalledWith('Não é possível remover o último administrador.');
    expect(toastSuccess).not.toHaveBeenCalled();
    // O cache NÃO foi invalidado: a lista continua a mesma.
    expect(loadRoles).toHaveBeenCalledTimes(1);
    expect(result.current.userToRemove).toEqual(ROLE_REMOVIDA);
    expect(result.current.updating).toBe(false);
  });

  it('traduz cannot_remove_own_admin na remoção do próprio administrador', async () => {
    rpc.mockResolvedValue({ error: { message: 'cannot_remove_own_admin' } });
    const result = await montar();

    act(() => {
      result.current.setUserToRemove(ROLE_REMOVIDA);
    });

    await act(async () => {
      await result.current.handleRemoveRole();
    });

    expect(toastError).toHaveBeenCalledWith('Você não pode remover a sua própria role de administrador.');
    expect(loadRoles).toHaveBeenCalledTimes(1);
    expect(result.current.updating).toBe(false);
  });

  it('traduz role_already_assigned e libera updating sem fechar o diálogo', async () => {
    rpc.mockResolvedValue({ error: { message: 'role_already_assigned' } });
    const result = await montar();

    act(() => {
      result.current.setSelectedUser('u-1');
      result.current.setSelectedRole('agent');
      result.current.setShowAddDialog(true);
    });

    await act(async () => {
      await result.current.handleAddRole();
    });

    expect(toastError).toHaveBeenCalledWith('Este usuário já possui esta role.');
    expect(result.current.showAddDialog).toBe(true);
    expect(loadRoles).toHaveBeenCalledTimes(1);
    expect(result.current.updating).toBe(false);
  });

  it('traduz role_not_assigned, admin_required e jwt_session_required', async () => {
    const casos: [string, string][] = [
      ['role_not_assigned', 'Este usuário não possui esta role.'],
      ['admin_required', 'Apenas administradores podem alterar roles.'],
      ['jwt_session_required', 'Sessão expirada. Entre novamente para alterar roles.'],
    ];

    for (const [codigo, texto] of casos) {
      vi.clearAllMocks();
      rpc.mockResolvedValue({ error: { message: codigo } });
      const result = await montar();

      act(() => {
        result.current.setUserToRemove(ROLE_REMOVIDA);
      });
      await act(async () => {
        await result.current.handleRemoveRole();
      });

      expect(toastError).toHaveBeenCalledWith(texto);
      expect(result.current.updating).toBe(false);
    }
  });

  it('código desconhecido cai na mensagem genérica sem vazar o erro cru', async () => {
    rpc.mockResolvedValue({ error: { message: 'permission_denied_for_role_x' } });
    const result = await montar();

    act(() => {
      result.current.setUserToRemove(ROLE_REMOVIDA);
    });
    await act(async () => {
      await result.current.handleRemoveRole();
    });

    expect(toastError).toHaveBeenCalledWith('Erro ao remover role');
    expect(result.current.updating).toBe(false);
  });

  it('exceção do client (rede) vira erro genérico e não deixa updating preso', async () => {
    rpc.mockRejectedValue(new Error('network down'));
    const result = await montar();

    act(() => {
      result.current.setUserToRemove(ROLE_REMOVIDA);
    });

    await act(async () => {
      await result.current.handleRemoveRole();
    });

    expect(toastError).toHaveBeenCalledWith('Erro ao remover role');
    expect(result.current.updating).toBe(false);
    expect(result.current.userToRemove).toEqual(ROLE_REMOVIDA);
    expect(loadRoles).toHaveBeenCalledTimes(1);
  });
});
