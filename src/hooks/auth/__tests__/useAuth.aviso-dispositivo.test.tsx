import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAuth, AuthProvider } from '../useAuth';

/**
 * R2-AUTH-004 (item 6): o AuthProvider é quem sabe que houve login. O aviso de
 * dispositivo novo (`detect-new-device`) tem de sair no `SIGNED_IN` — e não
 * dentro do callback do Supabase, que roda sob o lock de auth e trava
 * getSession/signOut se alguém esperar (`await`) por ele. Por isso o disparo é
 * agendado: aqui provamos que ele NÃO acontece durante o callback e sim depois
 * (com o lock livre), e que `SIGNED_OUT`/eventos que não são de login não o
 * disparam.
 */

const harness = vi.hoisted(() => ({
  assinantes: [] as Array<(event: string, session: unknown) => void>,
  notify: vi.fn(),
}));

vi.mock('@/hooks/ui/useDeviceDetection', () => ({
  notifyNewDeviceOnLogin: (...a: unknown[]) => harness.notify(...a),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        harness.assinantes.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    })),
  },
}));

const sessao = (userId: string) =>
  ({ user: { id: userId }, access_token: `token-${userId}` }) as never;

/** Deixa a fila de macrotarefas rodar (é onde o setTimeout(0) do disparo cai). */
const liberaLockDeAuth = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AuthProvider — aviso de dispositivo novo no login (R2-AUTH-004)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    harness.assinantes.length = 0;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );

  it('SIGNED_IN agenda o aviso fora do callback de auth (uma vez, sem await)', async () => {
    renderHook(() => useAuth(), { wrapper });

    act(() => {
      harness.assinantes.forEach((cb) => cb('SIGNED_IN', sessao('user-a')));
    });

    // Durante o callback nada foi enviado: o lock de auth ainda está preso.
    expect(harness.notify).not.toHaveBeenCalled();

    await act(async () => {
      await liberaLockDeAuth();
    });

    expect(harness.notify).toHaveBeenCalledTimes(1);
  });

  it('MFA_CHALLENGE_VERIFIED (sessão virou aal2) também agenda o aviso', async () => {
    renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      harness.assinantes.forEach((cb) => cb('MFA_CHALLENGE_VERIFIED', sessao('user-a')));
      await liberaLockDeAuth();
    });

    expect(harness.notify).toHaveBeenCalledTimes(1);
  });

  it('SIGNED_OUT não dispara o aviso', async () => {
    renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      harness.assinantes.forEach((cb) => cb('SIGNED_OUT', null));
      await liberaLockDeAuth();
    });

    expect(harness.notify).not.toHaveBeenCalled();
  });

  it('evento que não é de login (TOKEN_REFRESHED) não dispara o aviso', async () => {
    renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      harness.assinantes.forEach((cb) => cb('TOKEN_REFRESHED', sessao('user-a')));
      await liberaLockDeAuth();
    });

    expect(harness.notify).not.toHaveBeenCalled();
  });
});
