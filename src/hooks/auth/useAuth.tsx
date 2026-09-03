 import { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
 import { useQueryClient } from '@tanstack/react-query';
import { clearOfflineCache } from '@/hooks/system/useOfflineCache';
 import { User, Session } from '@supabase/supabase-js';
 import { AuthService } from '@/services/auth.service';
 import { Profile } from '@/types';
 import { log } from '@/lib/logger';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
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
  const fetchingRef = useRef(false);
  const queryClient = useQueryClient();

  /**
   * BUG-6 FIX: wrap fetchProfile in try/catch so errors don't leave
   * fetchingRef.current stuck at `true` (causing all subsequent fetches to
   * silently no-op, leaving profile as null indefinitely).
   */
   const fetchProfile = useCallback(async (userId: string) => {
     if (fetchingRef.current) return;
     fetchingRef.current = true;
     try {
       const data = await AuthService.fetchProfile(userId);
       if (data) setProfile(data);
     } catch (err) {
       log.error('[AuthProvider] Failed to fetch profile:', err);
     } finally {
       fetchingRef.current = false;
     }
   }, []);

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
        const session = await AuthService.getSession();
        if (!mounted) return;

        log.info('[BOOT] Initial session retrieved:', session ? 'User Found' : 'No User');
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          void fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
      } catch (err) {
        log.error('[BOOT] Error fetching session:', err);
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

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        /**
         * BUG-7 FIX: Reset the guard when auth state changes so a new user
         * session always triggers a fresh profile fetch.
         */
        fetchingRef.current = false;
        void fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }

      if (event === 'SIGNED_IN') {
        log.info('[AUTH] User signed in');
      } else if (event === 'SIGNED_OUT') {
        log.info('[AUTH] User signed out');
        // O QueryClient e singleton e o app roda com refetchOnMount desligado:
        // sem limpar, o proximo login na mesma aba le dados em cache do usuario
        // anterior (contatos, mensagens, galeria) antes de qualquer consulta nova.
        queryClient.clear();
        clearOfflineCache();
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
  }, [fetchProfile, queryClient]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      fetchingRef.current = false; // Reset guard to allow re-fetch
      await fetchProfile(user.id);
    }
  }, [user, fetchProfile]);

   const signIn = async (email: string, password: string) => {
     const { error } = await AuthService.signIn(email, password);
     return { error };
   };

   const signUp = async (email: string, password: string, name: string) => {
     const { error } = await AuthService.signUp(email, password, name);
     return { error };
   };

   const signOut = async () => {
     try {
       await AuthService.signOut();
     } catch (err) {
       // BUG-F1 FIX: log but do not rethrow — ensure local state is always
       // cleared so the UI never shows a stale profile after a sign-out
       // attempt (e.g. network failure). The next onAuthStateChange will
       // reconcile if the server-side sign-out actually succeeded.
       log.error('[AuthProvider] signOut failed, clearing local state anyway:', err);
     } finally {
       setProfile(null);
       setSession(null);
       setUser(null);
       // Quando o sign-out do Supabase falha ele nao emite SIGNED_OUT, entao a
       // limpeza do listener nunca roda — repetida aqui para que nenhum caminho
       // deixe dados do usuario anterior para tras.
       queryClient.clear();
       clearOfflineCache();
     }
   };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut, refreshProfile }}>
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
