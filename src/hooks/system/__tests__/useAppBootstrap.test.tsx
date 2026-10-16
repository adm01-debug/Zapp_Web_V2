import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Boot em uma chamada (cartao t_ddfcb3da / PK-20): o RPC `app_bootstrap`
 * hidrata o cache dos hooks existentes e o boot deixa de pedir `user_roles`.
 * O que este arquivo prova:
 *  1. uma chamada ao RPC abastece papeis e perfil, com ZERO idas a user_roles;
 *  2. a medicao antes/depois das requisicoes do boot;
 *  3. boot falhando NAO vira papel vazio (leitura direta assume; o erro aparece);
 *  4. matriz de permissoes do boot dispensa as N checagens nomeadas (staff);
 *  5. agente (RLS nao entrega a matriz) segue na checagem nomeada, e o erro dela
 *     vira permissionsLoadError em vez de lista vazia silenciosa (PE-96).
 */

function createHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children?: import('react').ReactNode }) => children,
}));

import { useUserRole } from '@/hooks/system/useUserRole';
import {
  fetchAppBootstrap,
  myProfileQueryKey,
  userRolesQueryKey,
  AppBootstrapError,
} from '@/hooks/system/useAppBootstrap';
import { NavigationService } from '@/services/navigation.service';
import type { AppRole } from '@/services/role.service';

const PERMISSOES_DA_NAV = NavigationService.getRequiredPermissions();

const perm = (name: string) => ({ id: `perm-${name}`, name, description: null, category: 'geral' });

function bootPayload(roles: AppRole[], permissions: string[]) {
  return {
    profile: { id: 'p1', name: 'Ana' },
    roles,
    permissions: permissions.map(perm),
    role_permissions: roles.flatMap((role) =>
      permissions.map((name) => ({ role, permission_id: `perm-${name}`, permission: perm(name) })),
    ),
    global_settings: [],
    user_settings: null,
    departments: [],
    unread_notifications: 3,
    fetched_at: '2026-10-15T00:00:00Z',
  };
}

/** Cadeia thenable da leitura direta de user_roles (padrao dos testes da casa). */
function rolesChain(result: { data: unknown; error: unknown }) {
  const node: Record<string, unknown> = {};
  node.select = vi.fn(() => node);
  node.eq = vi.fn(() => node);
  node.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled);
  return node;
}

function chamadasDe(nome: string) {
  return mockRpc.mock.calls.filter(([fn]) => fn === nome).length;
}

describe('useAppBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, session: {}, profile: null, loading: false });
    mockFrom.mockReturnValue(rolesChain({ data: [], error: null }));
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  it('uma chamada ao boot abastece papeis e perfil, sem pedir user_roles', async () => {
    mockRpc.mockImplementation((fn: string) =>
      fn === 'app_bootstrap'
        ? Promise.resolve({ data: bootPayload(['admin'], PERMISSOES_DA_NAV), error: null })
        : Promise.resolve({ data: null, error: null }),
    );

    const { qc, wrapper } = createHarness();
    const { result } = renderHook(() => useUserRole(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.roles).toEqual(['admin']);
    expect(result.current.isAdmin).toBe(true);
    // O cache dos hooks existentes e o que foi hidratado (mesma chave).
    expect(qc.getQueryData(userRolesQueryKey('u1'))).toEqual(['admin']);
    expect(qc.getQueryData(myProfileQueryKey('u1'))).toEqual({ id: 'p1', name: 'Ana' });
    // E o boot nao pediu user_roles para o banco.
    expect(mockFrom).not.toHaveBeenCalled();
    expect(chamadasDe('app_bootstrap')).toBe(1);
  });

  it('mede as requisicoes do boot: 1 com o bootstrap, 1 + N sem ele', async () => {
    // DEPOIS: o boot responde e a matriz poupa as checagens nomeadas.
    mockRpc.mockImplementation((fn: string) =>
      fn === 'app_bootstrap'
        ? Promise.resolve({ data: bootPayload(['admin'], PERMISSOES_DA_NAV), error: null })
        : Promise.resolve({ data: null, error: null }),
    );
    const comBootstrap = createHarness();
    const primeiro = renderHook(() => useUserRole(), { wrapper: comBootstrap.wrapper });
    await waitFor(() => expect(primeiro.result.current.loading).toBe(false));
    const depois =
      chamadasDe('app_bootstrap') + mockFrom.mock.calls.length + chamadasDe('user_has_permission');

    // ANTES: sem bootstrap = o caminho antigo, leitura direta de user_roles +
    // uma checagem nomeada por permissao exigida pela nav.
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, session: {}, profile: null, loading: false });
    mockFrom.mockReturnValue(rolesChain({ data: [{ role: 'admin' }], error: null }));
    mockRpc.mockImplementation((fn: string) =>
      fn === 'app_bootstrap'
        ? Promise.resolve({ data: null, error: { message: 'sem bootstrap' } })
        : Promise.resolve({ data: true, error: null }),
    );
    const semBootstrap = createHarness();
    const segundo = renderHook(() => useUserRole(), { wrapper: semBootstrap.wrapper });
    await waitFor(() => expect(segundo.result.current.loading).toBe(false));
    await waitFor(() => expect(segundo.result.current.permissions.length).toBeGreaterThan(0));
    const antes = mockFrom.mock.calls.length + chamadasDe('user_has_permission');

    expect(PERMISSOES_DA_NAV.length).toBeGreaterThan(0);
    expect(depois).toBe(1);
    expect(antes).toBe(1 + PERMISSOES_DA_NAV.length);
    expect(depois).toBeLessThan(antes);
    expect({ antes, depois }).toMatchInlineSnapshot(`
      {
        "antes": 2,
        "depois": 1,
      }
    `);
  });

  it('boot recusado nao vira papel vazio: leitura direta assume e o erro fica exposto', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    mockFrom.mockReturnValue(rolesChain({ data: [{ role: 'supervisor' }], error: null }));

    const { wrapper } = createHarness();
    const { result } = renderHook(() => useUserRole(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.roles).toEqual(['supervisor']);
    expect(result.current.isSupervisor).toBe(true);
    expect(result.current.rolesLoadError).toBe(false);
    expect(result.current.bootstrapError).toBeInstanceOf(AppBootstrapError);
  });

  it('boot e leitura direta falhando: rolesLoadError true, nunca lista vazia silenciosa', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rede fora' } });
    mockFrom.mockReturnValue(rolesChain({ data: null, error: { message: 'rede fora' } }));

    const { wrapper } = createHarness();
    const { result } = renderHook(() => useUserRole(), { wrapper });

    await waitFor(() => expect(result.current.rolesLoadError).toBe(true));
    expect(result.current.roles).toEqual([]);
  });

  it('resposta coja do RPC (200 com {error} ou corpo invalido) e recusada, nao entra no cache', async () => {
    mockRpc.mockResolvedValue({ data: { error: 'not_authenticated' }, error: null });
    await expect(fetchAppBootstrap()).rejects.toBeInstanceOf(AppBootstrapError);

    mockRpc.mockResolvedValue({ data: true, error: null });
    await expect(fetchAppBootstrap()).rejects.toBeInstanceOf(AppBootstrapError);

    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(fetchAppBootstrap()).rejects.toBeInstanceOf(AppBootstrapError);
  });

  it('matriz de permissoes do boot dispensa as checagens nomeadas (staff)', async () => {
    mockRpc.mockImplementation((fn: string) =>
      fn === 'app_bootstrap'
        ? Promise.resolve({ data: bootPayload(['admin'], PERMISSOES_DA_NAV), error: null })
        : Promise.resolve({ data: null, error: null }),
    );

    const { wrapper } = createHarness();
    const { result } = renderHook(() => useUserRole(), { wrapper });

    await waitFor(() => expect(result.current.permissionsLoading).toBe(false));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.permissions).toEqual(PERMISSOES_DA_NAV);
    expect(chamadasDe('user_has_permission')).toBe(0);
  });

  it('a concessao vem dos papeis DO usuario: linha de outro papel nao concede', async () => {
    const payload = bootPayload(['agent'], PERMISSOES_DA_NAV); // matriz existe, mas e de 'agent'
    payload.roles = ['supervisor'];
    mockRpc.mockImplementation((fn: string) =>
      fn === 'app_bootstrap'
        ? Promise.resolve({ data: payload, error: null })
        : Promise.resolve({ data: false, error: null }),
    );

    const { wrapper } = createHarness();
    const { result } = renderHook(() => useUserRole(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roles).toEqual(['supervisor']);
    expect(result.current.permissions).toEqual([]);
  });

  it('agente sem matriz segue na checagem nomeada; erro dela vira permissionsLoadError (PE-96)', async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'app_bootstrap') {
        return Promise.resolve({ data: bootPayload(['agent'], []), error: null });
      }
      return Promise.resolve({ data: null, error: { message: 'falha de leitura' } });
    });
    mockFrom.mockReturnValue(rolesChain({ data: [{ role: 'agent' }], error: null }));

    const { wrapper } = createHarness();
    const { result } = renderHook(() => useUserRole(), { wrapper });

    await waitFor(() => expect(result.current.permissionsLoadError).toBe(true));
    expect(result.current.roles).toEqual(['agent']);
    expect(result.current.permissions).toEqual([]);
    expect(chamadasDe('user_has_permission')).toBe(PERMISSOES_DA_NAV.length);
  });
});
