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
  | {
      ok: false;
      unavailable: false;
      /** Rate limit da propria edge (muitas tentativas): nem servico fora nem lockout. */
      rateLimited: true;
      /** Espera que a resposta pediu (`Retry-After`), em segundos; null quando nao veio. */
      retryAfterSeconds: number | null;
      error: string;
      lock: ServerLoginLock;
    }
  | { ok: false; unavailable: true; error: string };

const NO_LOCK: ServerLoginLock = { isLocked: false, lockedUntil: null, attempts: 1, remainingTime: 0 };

/**
 * Estado de lock que acompanha o 429. Todo ramo `unavailable: false` traz `lock`
 * (o chamador le sempre), mas aqui NAO houve senha conferida: `attempts: 0`
 * mantem a tela de login sem o banner "N tentativas restantes antes do bloqueio"
 * (pages/Auth.tsx), que so vale quando a edge contou uma senha errada de fato.
 */
const NO_LOCK_RATE_LIMITED: ServerLoginLock = { isLocked: false, lockedUntil: null, attempts: 0, remainingTime: 0 };

/**
 * Mensagem propria de "muitas tentativas" (429 da edge `auth-login`, por IP ou
 * por e-mail). E a MESMA exista ou nao a conta e seja qual for o limite
 * estourado: nada aqui revela e-mail cadastrado, IP ou regra.
 */
export const RATE_LIMITED_MESSAGE = 'Muitas tentativas de login. Aguarde alguns minutos.';

/**
 * Mensagem de "muitas tentativas" com a espera pedida pela resposta, quando ela
 * e conhecida. Sem espera fica a mensagem generica acima — hoje e o caso: a edge
 * responde 429 sem `Retry-After` (errorResponse de _shared/validation.ts) e o
 * CORS nem expoe o header, entao o valor so aparece quando a Edge passar a envia-lo.
 */
export function rateLimitedMessage(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds === null || retryAfterSeconds <= 0) return RATE_LIMITED_MESSAGE;
  if (retryAfterSeconds < 60) {
    return `Muitas tentativas de login. Tente novamente em ${Math.ceil(retryAfterSeconds)}s.`;
  }
  return `Muitas tentativas de login. Tente novamente em ${Math.ceil(retryAfterSeconds / 60)} min.`;
}

/**
 * Le a espera que a resposta 429 pede: `Retry-After` em segundos ("45") ou em
 * data HTTP ("Wed, 21 Oct 2026 07:28:00 GMT"). Devolve os segundos a esperar, ou
 * null quando o header nao existe / nao da para ler (valor invalido ou data ja
 * no passado) — quem chama cai na mensagem sem contagem, nunca inventa espera.
 */
export function parseRetryAfterSeconds(headers: Headers, now: number = Date.now()): number | null {
  const raw = headers.get('retry-after');
  if (!raw) return null;
  const value = raw.trim();
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return seconds > 0 ? seconds : null;
  }
  const at = Date.parse(value);
  if (Number.isNaN(at)) return null;
  const seconds = Math.ceil((at - now) / 1000);
  return seconds > 0 ? seconds : null;
}

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

/**
 * Teto de espera da invocacao. A edge faz ~5 round-trips ao banco/GoTrue e sem
 * este limite um banco indisponivel deixa a promise pendurada para sempre: o
 * usuario fica no spinner ("Entrando...") sem erro e sem resposta.
 *
 * 12s e ~100x o p50 medido (101ms com a regiao fixada) — nao corta login
 * legitimo em rede ruim e ainda assim limita a espera. O resultado da expiracao
 * entra no caminho de `unavailable`, entao a falha continua FECHADA (nunca cai
 * no GoTrue direto) e o lockout segue sendo aplicado pela Edge.
 */
export const AUTH_LOGIN_TIMEOUT_MS = 12_000;

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
 * 429 -> `rateLimited`, com a mensagem propria de "muitas tentativas" (nunca
 * "login indisponivel"): o rate limit da edge e respondido ANTES de olhar a senha,
 * entao nao e senha errada, nao e lockout e nao revela se a conta existe.
 * Qualquer outra resposta (edge fora, 5xx, corpo invalido) vira `unavailable`.
 * O chamador deve falhar fechado e nunca recorrer ao GoTrue diretamente, para que
 * o lockout continue sendo aplicado pela Edge.
 */
export async function serverLogin(email: string, password: string): Promise<ServerLoginResult> {
  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_LOGIN_TIMEOUT_MS);
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
      signal: controller.signal,

    });
  } catch (err) {
    const timedOut = controller.signal.aborted;
    return {
      ok: false,
      unavailable: true,
      error: timedOut
        ? `auth-login: sem resposta em ${AUTH_LOGIN_TIMEOUT_MS}ms (timeout)`
        : err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeoutId);
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

  // Rate limit da propria edge (por IP ou por e-mail): ela responde 429 ANTES de
  // conferir a senha, entao isto nao e senha errada, nao e lockout de conta e nao
  // diz se o e-mail esta cadastrado. Estado proprio (`rateLimited`) para a pessoa
  // ler "muitas tentativas" no lugar de "login indisponivel".
  if (response.status === 429) {
    const retryAfterSeconds = parseRetryAfterSeconds(response.headers);
    return {
      ok: false,
      unavailable: false,
      rateLimited: true,
      retryAfterSeconds,
      error: rateLimitedMessage(retryAfterSeconds),
      lock: NO_LOCK_RATE_LIMITED,
    };
  }

  return { ok: false, unavailable: true, error: `auth-login: HTTP ${response.status}` };
}
