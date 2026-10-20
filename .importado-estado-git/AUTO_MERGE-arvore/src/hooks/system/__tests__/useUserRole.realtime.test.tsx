/**
 * `useUserRole` — papel alterado chega à UI ao vivo.
 *
 * O servidor aplica uma mudança de papel na hora, mas o hook só lia a lista de
 * papéis uma vez (staleTime de 5 min): o alvo continuava com o papel antigo na
 * tela. Agora um ÚNICO canal Realtime escuta `user_roles` e `profiles`
 * filtrados pelo próprio `user_id` e invalida o cache de papéis / revalida o
 * perfil assim que a linha muda.
 */
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUserRole } from '@/hooks/system/useUserRole';

interface Assinatura {
  tabela: string;
  filter: string | undefined;
  cb: () => void;
}

const harness = vi.hoisted(() => ({
  assinaturas: [] as Assinatura[],
  canais: 0,
  removeChannel: vi.fn(),
  refreshProfile: vi.fn(async () => {}),
  usuario: { id: 'u-1' } as { id: string } | null,
}));

vi.mock('@/integrations/supabase/client', () => {
  const supabase = {
    channel: vi.fn(() => {
      harness.canais += 1;
      const canal = {
        on: vi.fn(
          (_evento: string, config: { table: string; filter?: string }, cb: () => void) => {
            harness.assinaturas.push({ tabela: config.table, filter: config.filter, cb });
            return canal;
          },
        ),
        subscribe: vi.fn(() => canal),
      };
      return canal;
    }),
    removeChannel: harness.removeChannel,
  };
  return { supabase };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: harness.usuario, refreshProfile: harness.refreshProfile }),
}));

vi.mock('@/services/navigation.service', () => ({
  NavigationService: { getRequiredPermissions: () => [] },
}));

vi.mock('@/services/role.service', () => ({
  RoleService: {
    fetchUserRoles: vi.fn(async () => []),
    checkPermission: vi.fn(async () => true),
  },
}));

function cenario() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useUserRole(), { wrapper });
  return { ...view, invalidate };
}

beforeEach(() => {
  harness.assinaturas.length = 0;
  harness.canais = 0;
  harness.refreshProfile.mockClear();
  harness.removeChannel.mockClear();
  harness.usuario = { id: 'u-1' };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useUserRole — papel e perfil ao vivo (Realtime)', () => {
  it('assina user_roles e profiles filtrados pelo user_id em UM canal', async () => {
    const { result } = cenario();

    await waitFor(() => expect(harness.assinaturas.length).toBe(2));

    expect(harness.canais).toBe(1);
    const tabelas = harness.assinaturas.map((a) => a.tabela).sort();
    expect(tabelas).toEqual(['profiles', 'user_roles']);
    for (const assinatura of harness.assinaturas) {
      expect(assinatura.filter).toBe('user_id=eq.u-1');
    }
    // A consulta de papéis continua existindo.
    expect(result.current.roles).toEqual([]);
  });

  it('invalida o cache de papéis quando a linha de user_roles muda', async () => {
    const { invalidate } = cenario();
    await waitFor(() => expect(harness.assinaturas.length).toBe(2));

    const dePapeis = harness.assinaturas.find((a) => a.tabela === 'user_roles')!;
    dePapeis.cb();

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['user-roles', 'u-1'] });
    expect(harness.refreshProfile).not.toHaveBeenCalled();
  });

  it('revalida o perfil quando a linha de profiles muda', async () => {
    cenario();
    await waitFor(() => expect(harness.assinaturas.length).toBe(2));

    const dePerfil = harness.assinaturas.find((a) => a.tabela === 'profiles')!;
    dePerfil.cb();

    expect(harness.refreshProfile).toHaveBeenCalledTimes(1);
  });

  it('encerra o canal no cleanup e não assina sem usuário', async () => {
    const { rerender, unmount } = cenario();
    await waitFor(() => expect(harness.assinaturas.length).toBe(2));

    // Logout: o canal do usuário que saiu tem de sair junto.
    harness.usuario = null;
    rerender();
    await waitFor(() => expect(harness.removeChannel).toHaveBeenCalledTimes(1));

    unmount();
  });

  it('duas telas ao mesmo tempo dividem UM canal e só fecham quando a última sai', async () => {
    const primeira = cenario();
    const segunda = cenario();

    await waitFor(() => expect(harness.assinaturas.length).toBe(2));
    // Tópico igual não pode virar dois canais nem dois conjuntos de callbacks.
    expect(harness.canais).toBe(1);

    primeira.unmount();
    await Promise.resolve();
    expect(harness.removeChannel).not.toHaveBeenCalled();

    segunda.unmount();
    await waitFor(() => expect(harness.removeChannel).toHaveBeenCalledTimes(1));
  });
});
