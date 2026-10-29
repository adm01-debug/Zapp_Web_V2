import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  from: vi.fn(),
  user: { id: 'u1' } as { id: string } | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => h.from(...args) },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: h.user }),
}));

import { usePermissions } from '@/hooks/system/usePermissions';

/** Cadeia thenable: select/eq/in/order devolvem o próprio objeto, que resolve no resultado. */
function chain(result: { data: unknown; error: unknown }) {
  const node: Record<string, unknown> = {};
  node.select = vi.fn(() => node);
  node.eq = vi.fn(() => node);
  node.in = vi.fn(() => node);
  node.order = vi.fn(() => node);
  node.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled);
  return node;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { id: 'u1' };
  h.from.mockImplementation((name: string) => {
    if (name === 'permissions') return chain({ data: [{ id: 'p1', name: 'perm.a', description: null, category: 'geral' }], error: null });
    if (name === 'user_roles') return chain({ data: [{ role: 'admin' }], error: null });
    if (name === 'role_permissions') {
      return {
        select: (cols: string) =>
          cols.includes('permissions(name)')
            ? chain({ data: [{ permissions: { name: 'perm.a' } }, { permissions: { name: 'perm.b' } }], error: null })
            : chain({ data: [], error: null }),
      };
    }
    return chain({ data: [], error: null });
  });
});

describe('usePermissions', () => {
  it('carrega as permissões do usuário e libera hasPermission', async () => {
    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.userPermissions.sort()).toEqual(['perm.a', 'perm.b']);
    expect(result.current.hasPermission('perm.a')).toBe(true);
    expect(result.current.hasPermission('perm.z')).toBe(false);
  });

  it('falha persistente no user_roles tenta de novo e SINALIZA erro, negando por padrão', async () => {
    h.from.mockImplementation((name: string) => {
      if (name === 'user_roles') return chain({ data: null, error: { message: 'timeout' } });
      return chain({ data: [], error: null });
    });

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeTruthy();
    // Nega por padrão: sem permissões carregadas, nada é liberado.
    expect(result.current.userPermissions).toEqual([]);
    expect(result.current.hasPermission('perm.a')).toBe(false);
    // 3 tentativas na leitura que falha.
    expect(h.from.mock.calls.filter(([n]) => n === 'user_roles')).toHaveLength(3);
  });

  it('falha na lista de permissões por papel (2ª leitura) também é sinalizada', async () => {
    h.from.mockImplementation((name: string) => {
      if (name === 'permissions') return chain({ data: [], error: null });
      if (name === 'user_roles') return chain({ data: [{ role: 'agent' }], error: null });
      if (name === 'role_permissions') {
        return {
          select: (cols: string) =>
            cols.includes('permissions(name)')
              ? chain({ data: null, error: { message: 'permission denied' } })
              : chain({ data: [], error: null }),
        };
      }
      return chain({ data: [], error: null });
    });

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(result.current.userPermissions).toEqual([]);
  });

  it('sem usuário logado não consulta papéis e não marca erro', async () => {
    h.user = null;
    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(h.from.mock.calls.filter(([n]) => n === 'user_roles')).toHaveLength(0);
  });
});
