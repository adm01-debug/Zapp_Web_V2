import { supabase } from '@/integrations/supabase/client';
import { serverLogin, type ServerLoginLock } from '@/lib/serverLogin';
import { Session } from '@supabase/supabase-js';
import { log } from '@/lib/logger';
import { Profile } from '@/types';

export interface SignInResult {
  error: Error | null;
  /** Login e lockout sao sempre decididos pelo endpoint server-side. */
  via: 'edge';
  lock: ServerLoginLock | null;
  /** A Edge ou a persistencia local da sessao falhou; nao confundir com senha invalida. */
  unavailable: boolean;
}

/**
 * Falha transitória de leitura: SÓ erro de rede e tempo limite. A Fetch API
 * resolve 500 como resposta (não rejeita) e o PostgREST entrega 4xx/5xx como
 * `{ error }` — nenhum status é "transitório por padrão": repetir um banco
 * saturado dobraria a carga em vez de aliviar. O resto sobe na hora, sem
 * repetir. `AbortError` (abort do chamador/descarregamento) também não repete.
 */
export const isTransientProfileFailure = (err: unknown): boolean => {
  if (err instanceof TypeError) return true;
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: string }).name === 'TimeoutError'
  );
};

/** Falha de autenticação (token expirado/negado) que justifica refresh da sessão. */
const isProfileAuthFailure = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (
    (err as { status?: number }).status === 401 ||
    (err as { code?: string }).code === 'PGRST301' ||
    /jwt|unauthorized|token.*expired/i.test((err as { message?: string }).message || '')
  );

/**
 * Retry curto do perfil: 1 tentativa + no máximo 2 retentativas, backoff de
 * 300ms/600ms. Só falha transitória repete — erro de negócio e falha de auth
 * sobem na hora, para não mascarar o problema real.
 */
const PERFIL_RETRY_MAX_RETRIES = 2;
const PERFIL_RETRY_BASE_DELAY_MS = 300;
const PERFIL_RETRY_MAX_DELAY_MS = 900;

const atrasoPerfilMs = (tentativa: number): number =>
  Math.min(PERFIL_RETRY_BASE_DELAY_MS * 2 ** tentativa, PERFIL_RETRY_MAX_DELAY_MS);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

    // Uma leitura do perfil não pode ser perdida por um blip de rede: repete só
    // falha transitória (rede/timeout), com backoff curto. As retentativas
    // ficam aqui (além do retry de transporte do cliente) porque o perfil
    // define identidade e permissões na tela — o custo de repetir é baixo e o
    // de desistir é alto. 4xx/5xx do PostgREST sobem na hora, sem repetir.
    const buscarComRetentativa = async (): Promise<Profile | null> => {
      for (let tentativa = 0; ; tentativa += 1) {
        try {
          return await fetchOnce();
        } catch (err) {
          if (!isTransientProfileFailure(err) || tentativa >= PERFIL_RETRY_MAX_RETRIES) throw err;
          await sleep(atrasoPerfilMs(tentativa));
        }
      }
    };

    try {
      return await buscarComRetentativa();
    } catch (err) {
      if (isProfileAuthFailure(err)) {
        try {
          const session = await this.refreshSession();
          if (session) return await buscarComRetentativa();
        } catch (refreshError) {
          // Falha transitória na recuperação precisa chegar à tela como erro,
          // não virar "usuário sem perfil".
          if (isTransientProfileFailure(refreshError)) throw refreshError;
          log.warn('[AuthService] Session recovery failed', refreshError);
        }
        // Recuperação de sessão (401/PGRST301/jwt) esgotada sem sessão nova:
        // `null` continua significando "não existe perfil", como antes.
        return null;
      }
      log.warn('[AuthService] Failed to fetch profile', err);
      // Falha transitória esgotada: lança para o chamador marcar o perfil como
      // indisponível. Erro do PostgREST (4xx/5xx) também sobe — sem repetir —
      // e quem decide se vira estado de erro é o chamador (só transitório vira
      // `profileUnavailable`). Só `{ data: null, error: null }` (perfil
      // inexistente) devolve `null`.
      throw err;
    }
  }

  /**
   * Login pela edge `auth-login` (lockout server-side, ADR-006). Se a edge nao
   * responder, falha fechado. Um fallback direto permitiria contornar o
   * lockout por qualquer cliente que chame GoTrue sem passar pela Edge.
   */
  static async signIn(email: string, password: string): Promise<SignInResult> {
    const result = await serverLogin(email, password);
    if (result.ok) {
      const { error } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      return { error, via: 'edge', lock: null, unavailable: error !== null };
    }
    if (!result.unavailable) {
      return { error: new Error(result.error), via: 'edge', lock: result.lock, unavailable: false };
    }
    log.warn('[AuthService] auth-login indisponivel; login bloqueado para preservar o lockout', result.error);
    return {
      error: new Error('Login temporariamente indisponível. Tente novamente em instantes.'),
      via: 'edge',
      lock: null,
      unavailable: true,
    };
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

  /**
   * R2-AUTH-003: nível de garantia (AAL) da sessão para o gate de MFA nas rotas.
   * Retorna os dados crus do Supabase; null em erro — quem decide trata null
   * como falha fechada, nunca como liberação.
   */
  static async getMfaAssurance() {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error || !data) throw error ?? new Error('sem dados de assurance');
      return data;
    } catch (err) {
      log.error('[AuthService] Erro ao ler nível de garantia MFA:', err);
      return null;
    }
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
