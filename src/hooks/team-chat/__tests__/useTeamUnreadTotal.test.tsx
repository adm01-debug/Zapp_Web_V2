import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F83 — Badge "Teams" (total de não lidas da sidebar).
 *
 * A lacuna: existia só `useTeamUnreadCount` (contador por conversa gravado em
 * `localStorage`), que nenhum consumidor importava e que contava apenas os
 * INSERTs vistos no canal aberto — não servia de total do módulo. O total tem
 * de sair da lista do inbox JÁ em cache, sem consulta nova e sem localStorage.
 */
const f = vi.hoisted(() => ({
  supabaseCalls: [] as string[],
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, {
    get: (_target, prop: string) => (..._args: unknown[]) => {
      f.supabaseCalls.push(prop);
      throw new Error(`o badge não pode tocar o Supabase (${prop}); o total vem do cache do inbox`);
    },
  }),
}));

import { useTeamUnreadTotal, teamUnreadTotalQueryKey } from '@/hooks/team-chat/useTeamUnreadTotal';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useTeamUnreadTotal (badge Teams)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.supabaseCalls.length = 0;
    localStorage.clear();
  });

  it('soma o unread_count das conversas em cache, sem consulta nova', async () => {
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(teamUnreadTotalQueryKey('profile-1'), [
      { id: 'c1', unread_count: 3 },
      { id: 'c2', unread_count: 0 },
      { id: 'c3', unread_count: 5 },
    ]);

    const { result } = renderHook(() => useTeamUnreadTotal(), { wrapper });

    await waitFor(() => expect(result.current).toBe(8));
    expect(f.supabaseCalls).toEqual([]);
    expect(queryClient.getQueryState(teamUnreadTotalQueryKey('profile-1'))?.fetchStatus)
      .toBe('idle');
  });

  it('não lê o localStorage do hook antigo (contador por conversa)', async () => {
    // valor que o useTeamUnreadCount deixaria gravado
    localStorage.setItem('team-chat-unread-c1', '99');
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(teamUnreadTotalQueryKey('profile-1'), [{ id: 'c1', unread_count: 2 }]);

    const { result } = renderHook(() => useTeamUnreadTotal(), { wrapper });

    await waitFor(() => expect(result.current).toBe(2));
  });

  it('cache vazio vira 0 (módulo fechado, nada a somar)', async () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useTeamUnreadTotal(), { wrapper });

    await waitFor(() => expect(result.current).toBe(0));
  });

  it('acompanha o cache: marcar como lida zera o badge', async () => {
    const { queryClient, wrapper } = createWrapper();
    const key = teamUnreadTotalQueryKey('profile-1');
    queryClient.setQueryData(key, [{ id: 'c1', unread_count: 4 }, { id: 'c2', unread_count: 1 }]);

    const { result } = renderHook(() => useTeamUnreadTotal(), { wrapper });
    await waitFor(() => expect(result.current).toBe(5));

    // é o que o refetch/invalidação do inbox faz depois de ler
    queryClient.setQueryData(key, [{ id: 'c1', unread_count: 0 }, { id: 'c2', unread_count: 0 }]);

    await waitFor(() => expect(result.current).toBe(0));
  });

  it('conversa sem unread_count não quebra a soma', async () => {
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(teamUnreadTotalQueryKey('profile-1'), [
      { id: 'c1', unread_count: 2 },
      { id: 'c2' },
    ]);

    const { result } = renderHook(() => useTeamUnreadTotal(), { wrapper });

    await waitFor(() => expect(result.current).toBe(2));
  });
});
