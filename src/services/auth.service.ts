import { supabase } from '@/integrations/supabase/client';
import { serverLogin, type ServerLoginLock } from '@/lib/serverLogin';
import { Session } from '@supabase/supabase-js';
import { log } from '@/lib/logger';
import { Profile } from '@/types';

export interface SignInResult {
  error: Error | null;
  /** 'edge' = lockout ja tratado no servidor; 'direct' = fallback, o cliente registra a falha. */
  via: 'edge' | 'direct';
  lock: ServerLoginLock | null;
}

export class AuthService {
  private static sessionPromise: Promise<Session | null> | null = null;
  private static refreshPromise: Promise<Session | null> | null = null;

  static async getSession() {
    if (this.sessionPromise) return this.sessionPromise;

    const pending = supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      return data.session;
    });
    this.sessionPromise = pending;
    try {
      return await pending;
    } finally {
      // Deduplicate only concurrent reads. Keeping a resolved Session forever
      // returns an expired token after a long-lived/suspended browser tab.
      if (this.sessionPromise === pending) this.sessionPromise = null;
    }
  }

  static async refreshSession() {
    if (this.refreshPromise) return this.refreshPromise;
    const pending = supabase.auth.refreshSession().then(({ data, error }) => {
      if (error) throw error;
      return data.session;
    });
    this.refreshPromise = pending;
    try {
      return await pending;
    } finally {
      if (this.refreshPromise === pending) this.refreshPromise = null;
    }
  }

  static async fetchProfile(userId: string): Promise<Profile | null> {
    const fetchOnce = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    };

    try {
      return await fetchOnce();
    } catch (err) {
      const authFailure = typeof err === 'object' && err !== null && (
        (err as { status?: number }).status === 401 ||
        (err as { code?: string }).code === 'PGRST301' ||
        /jwt|unauthorized|token.*expired/i.test((err as { message?: string }).message || '')
      );
      if (authFailure) {
        try {
          const session = await this.refreshSession();
          if (session) return await fetchOnce();
        } catch (refreshError) {
          log.warn('[AuthService] Session recovery failed', refreshError);
        }
      }
      log.warn('[AuthService] Failed to fetch profile', err);
      return null;
    }
  }

  /**
   * Login pela edge `auth-login` (lockout server-side, ADR-006). Se a edge nao
   * responder (fora do ar, 5xx, 429), cai no signInWithPassword direto — o
   * comportamento anterior — e o chamador registra a falha pelo cliente.
   */
  static async signIn(email: string, password: string): Promise<SignInResult> {
    const result = await serverLogin(email, password);
    if (result.ok) {
      const { error } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      return { error, via: 'edge', lock: null };
    }
    if (!result.unavailable) {
      return { error: new Error(result.error), via: 'edge', lock: result.lock };
    }
    log.warn('[AuthService] auth-login indisponivel, usando signInWithPassword direto', result.error);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error, via: 'direct', lock: null };
  }

  static async signUp(email: string, password: string, name: string) {
    const redirectUrl = `${window.location.origin}/`;
    return supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { name }
      }
    });
  }

  static async signOut() {
    return supabase.auth.signOut();
  }

  static onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Clear session promise on auth change to ensure next getSession is fresh
      this.sessionPromise = null;
      callback(event, session);
    });
    return subscription;
  }
}
