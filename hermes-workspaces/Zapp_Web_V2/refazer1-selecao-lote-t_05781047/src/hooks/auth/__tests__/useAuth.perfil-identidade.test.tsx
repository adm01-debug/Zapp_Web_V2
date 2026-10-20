import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAuth, AuthProvider } from '../useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { Profile } from '@/types';

/**
 * R2-AUTH-005 — item 239: "Resposta atrasada de perfil repoe identidade antiga
 * apos logout ou troca de usuario".
 *
 * O AuthProvider mantinha so um booleano (`fetchingRef`) como guarda da busca de
 * perfil: nao vinculava a resposta a identidade/geracao vigentes. Uma consulta
 * disparada antes do SIGNED_OUT (ou da troca A->B) resolvia depois da limpeza e
 * escrevia o perfil antigo de volta no estado.
 *
 * Estes testes controlam a resolucao da consulta de perfil no ponto exato
 * (`maybeSingle`), de forma a provar:
 *   1. resposta tardia depois do logout nao reaplica o perfil;
 *   2. nas duas ordens de resolucao A/B o perfil vigente e o do usuario atual;
 *   3. ao iniciar outra identidade o perfil anterior e zerado na hora.
 */

type ResolverPerfil = (value: { data: unknown; error: unknown }) => void;

const harness = vi.hoisted(() => ({
  /** Resolvers das consultas de perfil em voo, por `user_id`. */
  consultas: new Map<string, ResolverPerfil>(),
  /** Callbacks registrados em `supabase.auth.onAuthStateChange`. */
  assinantes: [] as Array<(event: string, session: unknown) => void>,
}));

vi.mock('@/integrations/supabase/client', () => {
  interface ConstrutorPerfil {
    select: () => ConstrutorPerfil;
    eq: (coluna: string, valor: string) => ConstrutorPerfil;
    maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  }

  const criarConstrutor = (): ConstrutorPerfil => {
    let userId = '';
    const construtor: ConstrutorPerfil = {
      select: () => construtor,
      eq: (_coluna: string, valor: string) => {
        userId = valor;
        return construtor;
      },
      maybeSingle: () =>
        new Promise((resolve) => {
          harness.consultas.set(userId, resolve);
        }),
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

const sessao = (userId: string) =>
  ({ user: { id: userId }, access_token: `token-${userId}` }) as never;

const perfil = (userId: string, nome: string) =>
  ({ user_id: userId, id: userId, display_name: nome }) as unknown as Profile;

const respostaOk = (userId: string, nome: string) => ({
  data: perfil(userId, nome),
  error: null,
});

describe('AuthProvider — identidade vigente x resposta atrasada de perfil (R2-AUTH-005)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    harness.consultas.clear();
    harness.assinantes.length = 0;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );

  it('descarta a resposta de perfil que chega depois do logout', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: sessao('user-a') },
      error: null,
    } as never);

    const { result } = renderHook(() => useAuth(), { wrapper });

    // A busca do perfil de user-a fica em voo (promise controlada pelo teste).
    await waitFor(() => expect(harness.consultas.has('user-a')).toBe(true));

    // Logout: o Supabase emite SIGNED_OUT antes de a consulta responder.
    await act(async () => {
      harness.assinantes.forEach((cb) => cb('SIGNED_OUT', null));
    });
    expect(result.current.profile).toBeNull();
    expect(result.current.user).toBeNull();

    // A resposta atrasada do perfil antigo resolve DEPOIS da limpeza do logout.
    await act(async () => {
      harness.consultas.get('user-a')!(respostaOk('user-a', 'Alice'));
      await Promise.resolve();
    });

    expect(result.current.profile).toBeNull();
  });

  it.each([
    ['A resolve antes de B', 'A-primeiro'],
    ['B resolve antes de A', 'B-primeiro'],
  ])('mantém o perfil do usuário vigente na troca A→B (%s)', async (_rotulo, ordem) => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: sessao('user-a') },
      error: null,
    } as never);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(harness.consultas.has('user-a')).toBe(true));

    // Troca de usuário: SIGNED_IN de B chega com a consulta de A ainda em voo.
    await act(async () => {
      harness.assinantes.forEach((cb) => cb('SIGNED_IN', sessao('user-b')));
    });
    await waitFor(() => expect(harness.consultas.has('user-b')).toBe(true));

    const resolverA = harness.consultas.get('user-a')!;
    const resolverB = harness.consultas.get('user-b')!;
    const respostaA = respostaOk('user-a', 'Alice');
    const respostaB = respostaOk('user-b', 'Bruno');

    await act(async () => {
      if (ordem === 'A-primeiro') {
        resolverA(respostaA);
        resolverB(respostaB);
      } else {
        resolverB(respostaB);
        resolverA(respostaA);
      }
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.profile).not.toBeNull());
    expect(result.current.profile?.user_id).toBe('user-b');
    expect(result.current.profile?.user_id).not.toBe('user-a');
  });

  it('zera o perfil vigente ao iniciar outra identidade', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: sessao('user-a') },
      error: null,
    } as never);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(harness.consultas.has('user-a')).toBe(true));
    await act(async () => {
      harness.consultas.get('user-a')!(respostaOk('user-a', 'Alice'));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.profile?.user_id).toBe('user-a'));

    // Troca de identidade: o perfil anterior nao pode continuar na tela.
    await act(async () => {
      harness.assinantes.forEach((cb) => cb('SIGNED_IN', sessao('user-b')));
    });

    expect(result.current.profile).toBeNull();
  });
});
