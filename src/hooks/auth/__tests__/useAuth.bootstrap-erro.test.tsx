/**
 * Boot sem conexão / servidor que não responde: `useAuth` tem de expor
 * `bootstrapError` e `retryBootstrap` em vez de apenas liberar o loading e
 * deixar a rota cair no /auth (como se o usuário não tivesse sessão).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAuth, AuthProvider } from '../useAuth';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => {
  interface ConstrutorPerfil {
    select: () => ConstrutorPerfil;
    eq: () => ConstrutorPerfil;
    maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  }
  const criarConstrutor = (): ConstrutorPerfil => {
    const construtor: ConstrutorPerfil = {
      select: () => construtor,
      eq: () => construtor,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return construtor;
  };

  return {
    supabase: {
      auth: {
        getSession: vi.fn(),
        refreshSession: vi.fn(),
        setSession: vi.fn(),
        signOut: vi.fn(),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
      },
      from: vi.fn(() => criarConstrutor()),
    },
  };
});

const sessao = (userId: string) => ({ user: { id: userId }, access_token: `t-${userId}` }) as never;

describe('AuthProvider — erro de boot e retry', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );

  it('marca bootstrapError quando a leitura da sessão falha', async () => {
    vi.mocked(supabase.auth.getSession).mockRejectedValue(new Error('rede fora'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bootstrapError).toBe(true);
    expect(result.current.user).toBeNull();
  });

  it('retryBootstrap refaz a leitura e limpa o erro quando o servidor responde', async () => {
    vi.mocked(supabase.auth.getSession)
      .mockRejectedValueOnce(new Error('rede fora'))
      .mockResolvedValue({ data: { session: sessao('user-a') }, error: null } as never);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.bootstrapError).toBe(true));

    act(() => result.current.retryBootstrap());

    await waitFor(() => expect(result.current.user?.id).toBe('user-a'));
    expect(result.current.bootstrapError).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(vi.mocked(supabase.auth.getSession)).toHaveBeenCalledTimes(2);
  });

  it('boot normal (sessão nula) não marca erro', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as never);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bootstrapError).toBe(false);
  });
});
