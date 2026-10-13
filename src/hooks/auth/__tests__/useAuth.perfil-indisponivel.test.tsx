import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAuth, AuthProvider } from '../useAuth';
import type { Profile } from '@/types';

/**
 * Perfil indisponível por falha de rede — a tela precisa saber.
 *
 * Antes: `AuthService.fetchProfile` devolvia `null` em qualquer erro e o
 * AuthProvider só registrava no console. O usuário ficava sem nome/permissões
 * sem nenhuma explicação e sem caminho de recuperação.
 *
 * Aqui controlamos a resolução de `maybeSingle` e provamos:
 *   1. falha transitória esgotada → `profileUnavailable === true` (estado
 *      visível), com a tela utilizável;
 *   2. "Tentar de novo" (`refreshProfile`) limpa o estado e carrega o perfil;
 *   3. erro não transitório (400) NÃO vira estado de erro — é só ausência de
 *      perfil;
 *   4. o estado é por identidade: a falha da identidade anterior não marca a
 *      nova (mesma regra da resposta bem-sucedida).
 */

type Resposta = { data: unknown; error: unknown };

const harness = vi.hoisted(() => ({
  fila: [] as Array<() => Promise<Resposta>>,
  assinantes: [] as Array<(event: string, session: unknown) => void>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const criarConstrutor = () => {
    const construtor = {
      select: () => construtor,
      eq: () => construtor,
      maybeSingle: () => {
        const proxima = harness.fila.shift();
        return proxima ? proxima() : Promise.resolve({ data: null, error: null });
      },
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
        onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
          harness.assinantes.push(cb);
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
      },
      from: vi.fn(() => criarConstrutor()),
    },
  };
});

import { supabase } from '@/integrations/supabase/client';

const sessao = (userId: string) => ({ user: { id: userId }, access_token: `t-${userId}` }) as never;
const perfil = (userId: string) =>
  ({ user_id: userId, id: userId, display_name: 'Ana' }) as unknown as Profile;

const falhaDeRede = () => Promise.reject(new TypeError('Failed to fetch'));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
};

describe('useAuth — perfil indisponível', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.fila.length = 0;
    harness.assinantes.length = 0;
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: sessao('u1') },
      error: null,
    } as never);
  });

  it('marca profileUnavailable após esgotar as retentativas e limpa no "Tentar de novo"', async () => {
    harness.fila.push(falhaDeRede, falhaDeRede, falhaDeRede);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 5000 });
    await waitFor(() => expect(result.current.profileUnavailable).toBe(true), { timeout: 5000 });
    // Falha de rede não inventa perfil, mas a tela segue utilizável (loading concluiu).
    expect(result.current.profile).toBeNull();

    // "Tentar de novo": a próxima consulta funciona.
    harness.fila.push(() => Promise.resolve({ data: perfil('u1'), error: null }));
    await act(async () => {
      await result.current.refreshProfile();
    });

    expect(result.current.profileUnavailable).toBe(false);
    expect(result.current.profile).toMatchObject({ user_id: 'u1' });
  });

  it('erro não transitório (400) não vira estado de erro', async () => {
    harness.fila.push(() =>
      Promise.resolve({ data: null, error: { status: 400, message: 'bad request' } })
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 5000 });
    await waitFor(() => expect(supabase.from).toHaveBeenCalled());

    expect(result.current.profileUnavailable).toBe(false);
    expect(result.current.profile).toBeNull();
  });

  it('falha atrasada da identidade anterior não marca o perfil da identidade nova', async () => {
    // A consulta de `u1` fica pendente e só falha DEPOIS da troca para `u2`.
    let rejeitarU1!: (erro: unknown) => void;
    const consultaU1 = new Promise<Resposta>((_resolve, reject) => {
      rejeitarU1 = reject;
    });
    harness.fila.push(
      () => consultaU1,
      () => Promise.resolve({ data: perfil('u2'), error: null }),
      falhaDeRede,
      falhaDeRede
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Garante que a consulta de `u1` já está em voo antes da troca de usuário.
    await waitFor(() => expect(supabase.from).toHaveBeenCalled());

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: sessao('u2') },
      error: null,
    } as never);

    await act(async () => {
      harness.assinantes.forEach((cb) => cb('SIGNED_IN', sessao('u2')));
    });
    await waitFor(() => expect(result.current.profile).toMatchObject({ user_id: 'u2' }), {
      timeout: 5000,
    });
    expect(result.current.profileUnavailable).toBe(false);

    // A identidade antiga falha (e ainda repete 2x) depois que `u2` já está na tela.
    await act(async () => {
      rejeitarU1(new TypeError('Failed to fetch'));
    });
    await waitFor(() => expect(result.current.profile).toMatchObject({ user_id: 'u2' }), {
      timeout: 5000,
    });
    expect(result.current.profileUnavailable).toBe(false);
  });
});
