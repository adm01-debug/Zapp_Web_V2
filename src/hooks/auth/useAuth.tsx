import { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clearOfflineCache } from '@/hooks/system/useOfflineCache';
import { User, Session } from '@supabase/supabase-js';
import { AuthService, type SignInResult } from '@/services/auth.service';
import { Profile } from '@/types';
import { log } from '@/lib/logger';
import { clearEmailDraftSessions } from '@/lib/emailDraftSession';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /**
   * R2-AUTH-004: estado de erro explícito quando o perfil não pôde ser
   * confirmado (consulta falhou) ou está inativo — o conteúdo protegido fica
   * fechado (fail-closed) e a sessão local é encerrada.
   */
  error: string | null;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  /**
   * Sequência monotônica para descartar respostas atrasadas de perfil.
   * Quando o usuário troca (signIn/signOut) ou uma sessão nova assume, o
   * resultado de um fetch anterior não pode repor o perfil de outro usuário.
   */
  const requestSeqRef = useRef(0);

  const clearAuthState = useCallback(() => {
    // Invalida qualquer consulta de perfil em voo e zera o estado publicado.
    requestSeqRef.current += 1;
    setProfile(null);
    setSession(null);
    setUser(null);
    setError(null);
  }, []);

  const clearCaches = useCallback(() => {
    // O QueryClient é singleton e o app roda com refetchOnMount desligado:
    // sem limpar, o próximo login na mesma aba lê dados em cache do usuário
    // anterior (contatos, mensagens, galeria) antes de qualquer consulta nova.
    queryClient.clear();
    clearOfflineCache();
    clearEmailDraftSessions();
  }, [queryClient]);

  /**
   * R2-AUTH-004 (item 6): o estado autenticado só é publicado depois de
   * carregar o perfil atual e confirmar `is_active === true`. Perfil inativo,
   * ausente ou consulta que falhou encerram a sessão local (fail-closed) e
   * limpam os caches — defesa durante a janela do JWT stateless até `exp`,
   * sem substituir a revogação Auth do cartão backend.
   */
  const applySession = useCallback(async (next: Session | null) => {
    if (!next?.user) {
      clearAuthState();
      return;
    }

    const userId = next.user.id;
    const token = ++requestSeqRef.current;

    let fetched: Profile | null = null;
    try {
      fetched = await AuthService.fetchProfile(userId);
    } catch (err) {
      log.error('[AuthProvider] Failed to fetch profile:', err);
      fetched = null;
    }

    // Resposta atrasada de outra sessão/usuário: descarta sem efeitos.
    if (token !== requestSeqRef.current) return;

    if (fetched && fetched.is_active === true) {
      setProfile(fetched);
      setSession(next);
      setUser(next.user);
      setError(null);
      return;
    }

    // Perfil inativo, ausente ou consulta que falhou → fail-closed.
    clearAuthState();
    setError(
      fetched === null
        ? 'Não foi possível carregar seu perfil. Entre novamente.'
        : 'Sua conta está inativa.',
    );
    clearCaches();
    // Best-effort: revoga a sessão no servidor. A limpeza local já ocorreu;
    // se o signOut falhar, o listener de Auth reconcilia quando possível.
    try {
      await AuthService.signOut();
    } catch (err) {
      log.error('[AuthProvider] signOut after inactive profile failed:', err);
    }
  }, [clearAuthState, clearCaches]);

  useEffect(() => {
    let mounted = true;
    log.info('[BOOT] AuthProvider initialized, starting session check');

    // Safety timeout to prevent infinite loading if Supabase doesn't respond
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        log.warn('[BOOT] Auth session check timed out, forcing loading to false');
        setLoading(false);
      }
    }, 10000);

    // Initial fetch
    const initSession = async () => {
      try {
        const current = await AuthService.getSession();
        if (!mounted) return;

        log.info('[BOOT] Initial session retrieved:', current ? 'User Found' : 'No User');
        await applySession(current);
      } catch (err) {
        log.error('[BOOT] Error fetching session:', err);
        clearAuthState();
        setError('Não foi possível carregar sua sessão.');
      } finally {
        if (mounted) {
          setLoading(false);
          clearTimeout(safetyTimeout);
          log.info('[BOOT] Auth initial load finished');
        }
      }
    };

    void initSession();

    const subscription = AuthService.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      log.info('[BOOT] Auth state change:', event, session ? 'Authenticated' : 'Unauthenticated');

      if (event === 'SIGNED_OUT') {
        clearAuthState();
        clearCaches();
        return;
      }

      if (session?.user) {
        await applySession(session);
      } else {
        clearAuthState();
      }
    });

    const recoverAfterSuspension = async () => {
      if (!mounted || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return;
      try {
        const current = await AuthService.getSession();
        if (!current?.expires_at) return;
        const expiresWithinOneMinute = current.expires_at * 1000 <= Date.now() + 60_000;
        if (expiresWithinOneMinute) await AuthService.refreshSession();
      } catch (err) {
        // Auth's own state listener will reconcile a terminal refresh failure.
        // This guard only prevents requests and Realtime channels from racing a
        // stale token when a suspended tab becomes active again.
        log.warn('[AuthProvider] Session recovery after suspension failed', err);
      }
    };
    const handleVisibility = () => { if (document.visibilityState === 'visible') void recoverAfterSuspension(); };
    const handleOnline = () => { void recoverAfterSuspension(); };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [applySession, clearAuthState, clearCaches]);

  const refreshProfile = useCallback(async () => {
    try {
      const current = await AuthService.getSession();
      if (current?.user) {
        await applySession(current);
      }
    } catch (err) {
      log.error('[AuthProvider] refreshProfile failed:', err);
    }
  }, [applySession]);

  const signIn = async (email: string, password: string) => AuthService.signIn(email, password);

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await AuthService.signUp(email, password, name);
    return { error };
  };

  const signOut = async () => {
    // Invalida qualquer perfil em voo antes do signOut para que uma resposta
    // atrasada não reponha o usuário que acabou de sair.
    clearAuthState();
    try {
      await AuthService.signOut();
    } catch (err) {
      // BUG-F1 FIX: log but do not rethrow — ensure local state is always
      // cleared so the UI never shows a stale profile after a sign-out
      // attempt (e.g. network failure). The next onAuthStateChange will
      // reconcile if the server-side sign-out actually succeeded.
      log.error('[AuthProvider] signOut failed, clearing local state anyway:', err);
    } finally {
      clearCaches();
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, error, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
