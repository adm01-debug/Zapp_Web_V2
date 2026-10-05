import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth, AuthProvider } from '../auth/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AuthService, type SignInResult } from '@/services/auth.service';
import type { User, Session } from '@supabase/supabase-js';
import type { Profile } from '@/types';
import React from 'react';

const mockServerLogin = vi.hoisted(() => vi.fn());
const mockClearOfflineCache = vi.hoisted(() => vi.fn());
const mockClearEmailDraftSessions = vi.hoisted(() => vi.fn());

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      setSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

vi.mock('@/lib/serverLogin', () => ({
  serverLogin: (...args: unknown[]) => mockServerLogin(...args),
}));

vi.mock('@/hooks/system/useOfflineCache', () => ({
  clearOfflineCache: mockClearOfflineCache,
}));

vi.mock('@/lib/emailDraftSession', () => ({
  clearEmailDraftSessions: mockClearEmailDraftSessions,
}));

const makeUser = (id: string): User => ({ id } as unknown as User);
const makeSession = (id: string): Session => ({ user: makeUser(id) } as unknown as Session);
const makeProfile = (id: string, active: boolean): Profile =>
  ({ id, user_id: id, is_active: active } as unknown as Profile);

describe('useAuth hook', () => {
  // Uma instancia por teste: recriar o client a cada render do wrapper jogaria
  // fora o cache em qualquer re-render e mascararia o efeito do queryClient.clear().
  let queryClient: QueryClient;
  let authCallback: ((event: string, session: Session | null) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    authCallback = null;
    vi.mocked(supabase.auth.setSession).mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    } as never);
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null } as never);
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null } as never);
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation(((cb: (event: string, session: Session | null) => void) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }) as never);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  // AuthProvider limpa o cache do react-query no SIGNED_OUT, entao precisa do
  // QueryClientProvider por volta — igual a AppProviders.
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );

  it('initializes with loading state', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null } as never);

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
  });

  it('handles sign in successfully', async () => {
    mockServerLogin.mockResolvedValue({
      ok: true,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let response: SignInResult | undefined;
    await act(async () => {
      response = await result.current.signIn('test@test.com', 'password123');
    });

    expect(mockServerLogin).toHaveBeenCalledWith('test@test.com', 'password123');
    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(response?.error).toBeNull();
  });

  it('handles sign out', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signOut();
    });

    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('does not expose authenticated state for an inactive profile', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: makeSession('a') }, error: null } as never);
    vi.spyOn(AuthService, 'fetchProfile').mockResolvedValue(makeProfile('a', false));
    const clearSpy = vi.spyOn(queryClient, 'clear');

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.error).toBeTruthy();
    // Limpa estado local, cache do react-query e caches offline/draft.
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();
    expect(mockClearOfflineCache).toHaveBeenCalled();
    expect(mockClearEmailDraftSessions).toHaveBeenCalled();
  });

  it('does not expose authenticated state when profile fetch fails', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: makeSession('a') }, error: null } as never);
    vi.spyOn(AuthService, 'fetchProfile').mockResolvedValue(null);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.error).toBeTruthy();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('publishes state for an active profile without signing out', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: makeSession('a') }, error: null } as never);
    vi.spyOn(AuthService, 'fetchProfile').mockResolvedValue(makeProfile('a', true));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user?.id).toBe('a');
    expect(result.current.profile?.is_active).toBe(true);
    expect(result.current.error).toBeNull();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('refreshProfile signs out when the profile becomes inactive', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: makeSession('a') }, error: null } as never);
    const fetchSpy = vi.spyOn(AuthService, 'fetchProfile').mockResolvedValue(makeProfile('a', true));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.id).toBe('a');

    // Perfil passa de ativo para inativo.
    fetchSpy.mockResolvedValue(makeProfile('a', false));
    await act(async () => {
      await result.current.refreshProfile();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.error).toBeTruthy();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('ignores a delayed profile response after a user switch', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: makeSession('a') }, error: null } as never);

    let resolveA!: (value: Profile | null) => void;
    const pendingA = new Promise<Profile | null>((resolve) => { resolveA = resolve; });

    const fetchSpy = vi.spyOn(AuthService, 'fetchProfile').mockImplementation((id: string) => {
      if (id === 'a') return pendingA;
      return Promise.resolve(makeProfile('b', true));
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Aguarda o boot chegar no fetch pendente do usuário 'a'.
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('a'));

    // Troca para o usuário 'b'.
    await act(async () => {
      authCallback?.('SIGNED_IN', makeSession('b'));
    });
    await waitFor(() => expect(result.current.user?.id).toBe('b'));

    // Resposta atrasada de 'a' chega com perfil inativo (obsoleto).
    await act(async () => {
      resolveA(makeProfile('a', false));
    });

    // Não pode repor o usuário ativo 'b'.
    expect(result.current.user?.id).toBe('b');
    expect(result.current.profile?.user_id).toBe('b');
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('does not call Supabase inside the onAuthStateChange callback', async () => {
    // O supabase-js segura o lock de auth enquanto executa o callback: chamar
    // fetchProfile/signOut dentro dele pode deadlockar. O handler precisa ser
    // síncrono e adiar o trabalho async para fora do callback.
    const fetchSpy = vi.spyOn(AuthService, 'fetchProfile').mockResolvedValue(makeProfile('b', true));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchSpy).not.toHaveBeenCalled();

    act(() => {
      authCallback?.('SIGNED_IN', makeSession('b'));
    });
    // Ainda dentro do tick do callback: nenhuma chamada ao Supabase.
    expect(fetchSpy).not.toHaveBeenCalled();

    await waitFor(() => expect(result.current.user?.id).toBe('b'));
    expect(fetchSpy).toHaveBeenCalledWith('b');
  });

  it('keeps the inactive error after the SIGNED_OUT emitted by the fail-closed signOut', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: makeSession('a') }, error: null } as never);
    vi.spyOn(AuthService, 'fetchProfile').mockResolvedValue(makeProfile('a', false));
    // O signOut real emite SIGNED_OUT para os subscribers; o mock reproduz isso
    // para provar que a mensagem não é apagada pelo próprio fail-closed.
    vi.mocked(supabase.auth.signOut).mockImplementation((async () => {
      authCallback?.('SIGNED_OUT', null);
      return { error: null };
    }) as never);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.error).toBe('Sua conta está inativa.');
  });

  it('ignores INITIAL_SESSION and never exposes loading=false with user=null during boot', async () => {
    // O supabase-js real entrega INITIAL_SESSION com a sessão recuperada ao
    // subscriber novo — em pleno boot, enquanto o initSession ainda busca o
    // perfil. Na versão anterior isso escalonava um segundo applySession que
    // descartava o do boot e soltava o loading com user=null a cada recarga.
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: makeSession('a') }, error: null } as never);

    const pendingProfiles: Array<(p: Profile | null) => void> = [];
    const fetchSpy = vi.spyOn(AuthService, 'fetchProfile').mockImplementation(
      () => new Promise<Profile | null>((resolve) => { pendingProfiles.push(resolve); }),
    );
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation(((cb: (event: string, session: Session | null) => void) => {
      authCallback = cb;
      setTimeout(() => cb('INITIAL_SESSION', makeSession('a')), 0);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }) as never);

    const snapshots: Array<{ loading: boolean; userId: string | null }> = [];
    const { result } = renderHook(() => {
      const auth = useAuth();
      snapshots.push({ loading: auth.loading, userId: auth.user?.id ?? null });
      return auth;
    }, { wrapper });

    // Boot chegou ao fetch do perfil; deixa o INITIAL_SESSION adiado correr.
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    // Resolve o primeiro fetch: na versão anterior o applySession do boot era
    // descartado aqui e o finally do initSession soltava o loading já.
    await act(async () => { pendingProfiles[0]?.(makeProfile('a', true)); });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    // Resolve eventuais fetches extras (o segundo applySession da versão antiga).
    await act(async () => { pendingProfiles.slice(1).forEach((r) => r(makeProfile('a', true))); });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user?.id).toBe('a');
    expect(result.current.profile?.is_active).toBe(true);
    // O evento não disparou um segundo applySession/fetchProfile.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // E nenhum frame ficou com o loading solto e o usuário ausente.
    expect(snapshots.filter((s) => !s.loading && s.userId === null)).toHaveLength(0);
  });

  it('keeps loading until the newest applySession finishes when an event preempts the boot', async () => {
    // Se um evento de Auth descarta o applySession do initSession, o loading
    // só pode cair quando a aplicação mais recente terminar — nunca antes.
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: makeSession('a') }, error: null } as never);

    const pending = new Map<string, (p: Profile | null) => void>();
    vi.spyOn(AuthService, 'fetchProfile').mockImplementation(
      (id: string) => new Promise<Profile | null>((resolve) => { pending.set(id, resolve); }),
    );

    const snapshots: Array<{ loading: boolean; userId: string | null }> = [];
    const { result } = renderHook(() => {
      const auth = useAuth();
      snapshots.push({ loading: auth.loading, userId: auth.user?.id ?? null });
      return auth;
    }, { wrapper });

    await waitFor(() => expect(pending.has('a')).toBe(true));

    // Evento real no meio do boot: o applySession de 'b' vira o mais recente.
    act(() => { authCallback?.('SIGNED_IN', makeSession('b')); });
    await waitFor(() => expect(pending.has('b')).toBe(true));

    // A resposta atrasada do boot é descartada e não pode soltar o loading.
    await act(async () => { pending.get('a')!(makeProfile('a', true)); });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();

    await act(async () => { pending.get('b')!(makeProfile('b', true)); });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user?.id).toBe('b');
    expect(snapshots.filter((s) => !s.loading && s.userId === null)).toHaveLength(0);
  });
});
