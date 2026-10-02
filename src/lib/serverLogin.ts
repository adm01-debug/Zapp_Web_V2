import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/integrations/supabase/client';

export interface ServerLoginLock {
  isLocked: boolean;
  lockedUntil: Date | null;
  attempts: number;
  remainingTime: number;
}

export type ServerLoginResult =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; unavailable: false; error: string; lock: ServerLoginLock }
  | { ok: false; unavailable: true; error: string };

const NO_LOCK: ServerLoginLock = { isLocked: false, lockedUntil: null, attempts: 1, remainingTime: 0 };

/**
 * Regiao da invocacao da edge `auth-login` (T06).
 *
 * A edge faz ~5 round-trips ao banco/GoTrue (2x consume_rate_limit,
 * is_account_locked, signInWithPassword, clear_login_attempts) e o projeto esta
 * em us-west-2. Por padrao o Supabase executa a funcao na regiao mais proxima do
 * USUARIO: um login brasileiro roda em sa-east-1 e cada salto cruza o continente.
 * Medido nas ultimas 24h: p50 de 925ms em sa-east-1 contra 101ms em us-east-1
 * (perto do banco). Fixar a regiao elimina ~4 saltos transcontinentais.
 *
 * Usamos o query param `forceFunctionRegion` e NAO o header `x-region` porque
 * esta chamada sai do browser: o header cairia no preflight CORS, e a lista
 * `Access-Control-Allow-Headers` do _shared/validation.ts nao o inclui. O query
 * param e o caminho documentado pelo Supabase para chamadas de browser/webhook.
 *
 * Trade-off documentado: uma invocacao com regiao fixada NAO e re-roteada
 * automaticamente em caso de indisponibilidade da regiao.
 */
const AUTH_LOGIN_REGION = 'us-west-2';

function parseLock(body: Record<string, unknown>): ServerLoginLock {
  if (typeof body.isLocked !== 'boolean') return NO_LOCK;
  return {
    isLocked: body.isLocked,
    lockedUntil: typeof body.lockedUntil === 'string' ? new Date(body.lockedUntil) : null,
    attempts: typeof body.attempts === 'number' ? body.attempts : 1,
    remainingTime: typeof body.remainingTime === 'number' ? body.remainingTime : 0,
  };
}

/**
 * Login pela edge `auth-login` (ADR-006): o lockout e decidido no servidor.
 * 200 -> tokens para `supabase.auth.setSession`; 401/423 -> recusa com estado do lock.
 * Qualquer outra resposta (edge fora, 5xx, 429, corpo invalido) vira `unavailable`.
 * O chamador deve falhar fechado e nunca recorrer ao GoTrue diretamente, para que
 * o lockout continue sendo aplicado pela Edge.
 */
export async function serverLogin(email: string, password: string): Promise<ServerLoginResult> {
  let response: Response;
  try {
    response = await fetch(
      `${SUPABASE_URL}/functions/v1/auth-login?forceFunctionRegion=${AUTH_LOGIN_REGION}`,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ email, password, userAgent: navigator.userAgent }),
    });
  } catch (err) {
    return { ok: false, unavailable: true, error: err instanceof Error ? err.message : String(err) };
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }

  if (response.ok) {
    if (body && typeof body.access_token === 'string' && typeof body.refresh_token === 'string') {
      return { ok: true, accessToken: body.access_token, refreshToken: body.refresh_token };
    }
    return { ok: false, unavailable: true, error: 'auth-login: resposta sem sessao' };
  }

  if ((response.status === 401 || response.status === 423) && body) {
    return {
      ok: false,
      unavailable: false,
      error: typeof body.error === 'string' ? body.error : 'Invalid login credentials',
      lock: parseLock(body),
    };
  }

  return { ok: false, unavailable: true, error: `auth-login: HTTP ${response.status}` };
}
