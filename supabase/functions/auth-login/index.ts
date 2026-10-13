import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  handleCors,
  errorResponse,
  jsonResponse,
  requireEnv,
  Logger,
  enforceRateLimit,
  getClientIP,
  sanitizeString,
} from "../_shared/validation.ts";
import {
  resolveNetworkPolicy,
  networkPolicyDenialResponse,
  type NetworkPolicyRpcClient,
} from "../_shared/request-policy.ts";

// Login server-side (ADR-006): o lockout e decidido aqui, para qualquer cliente.
// 1. politica de rede (R2-AUTH-022) antes de qualquer efeito;
// 2. conta travada -> 423 sem tocar no GoTrue;
// 3. GoTrue recusa credenciais (4xx != 429) -> a falha e registrada -> 401;
// 4. GoTrue indisponivel (5xx, 429, transporte, sem sessao sem erro) -> 503 SEM
//    registrar tentativa (R2-AUTH-021): outage do provedor nao conta no lockout;
// 5. GoTrue aceita -> tentativas zeradas -> 200 com a sessao; o front faz setSession.
// verify_jwt = false: ainda nao existe sessao. Rate limit por IP e por e-mail.
//
// MODOS (body.mode):
// - ausente/`login`: fluxo acima, devolve a sessao (nao mudou).
// - `verify` (reautenticacao, ADR-006): mesma ordem e MESMOS codigos de recusa
//   que o login (403/503 de rede, 429, 423 de lock, 401/503 do GoTrue); quando a
//   senha e aceita, REVOGA a sessao temporaria que o GoTrue criou para conferir a
//   senha (escopo `local`: so ela, sem derrubar a sessao real do usuario — que
//   pode estar em AAL2) e responde `{ok:true}` SEM tokens. Assim o chamador
//   valida a senha sem trocar a propria sessao (era o defeito: a reautenticacao
//   substituia a sessao AAL2 por uma AAL1, mandava ao /2fa e deixava sessao orfa).

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@.]{2,63}$/;

type LoginMode = "login" | "verify";

/** `mode` ausente/vazio = login; valor desconhecido = null (400, falha fechada). */
function parseLoginMode(raw: unknown): LoginMode | null {
  if (raw === undefined || raw === null || raw === "") return "login";
  return raw === "login" || raw === "verify" ? raw : null;
}

type LockRow = { is_locked: boolean; locked_until: string | null; attempts: number };

function lockPayload(row: LockRow | null | undefined) {
  if (!row) return { isLocked: false, lockedUntil: null, attempts: 0, remainingTime: 0 };
  const lockedUntil = row.locked_until ? new Date(row.locked_until) : null;
  const remainingTime = lockedUntil
    ? Math.max(0, Math.floor((lockedUntil.getTime() - Date.now()) / 1000))
    : 0;
  return {
    isLocked: row.is_locked,
    lockedUntil: lockedUntil?.toISOString() ?? null,
    attempts: row.attempts,
    remainingTime,
  };
}

// ── Seams de injeção (R2-AUTH-022 / 27.4) ──────────────────────────────────
// O login é público e não passa por requireAuth, então o handler recebe as
// dependências que fazem efeito (RPC service_role, signIn anônimo e rate limit)
// para que o teste prove, sem tocar banco, que a negação da política acontece
// ANTES de ler credenciais, consultar usuário, registrar tentativa ou autenticar.

export interface LoginSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number | null;
  token_type: string;
}

export interface LoginAnonClient {
  auth: {
    signInWithPassword: (creds: { email: string; password: string }) => PromiseLike<{
      data: { session: LoginSession | null; user: { id: string } | null };
      error: { status?: number; name?: string } | null;
    }>;
  };
}

/**
 * Client service_role do login: RPC de política/lockout e, no modo `verify`,
 * `auth.admin.signOut` para encerrar a sessão temporária criada pelo GoTrue.
 * O tipo é estrutural (não acopla a uma versão de `@supabase/supabase-js`), mas
 * exige as duas formas que o handler realmente usa.
 */
export interface LoginAdminClient extends NetworkPolicyRpcClient {
  auth: {
    admin: {
      signOut: (
        jwt: string,
        scope?: "local" | "global" | "others",
      ) => PromiseLike<{ error: { message?: string } | null }>;
    };
  };
}

export interface AuthLoginDeps {
  admin: LoginAdminClient;
  anon: LoginAnonClient;
  enforceRateLimit: (
    key: string,
    maxRequests: number,
    windowMs: number,
  ) => PromiseLike<{ allowed: boolean }>;
}

// Limites hardcoded atuais (fallback quando não há regra ativa de rate limit).
const IP_LIMIT_DEFAULT_MAX = 10; // requisições por IP
const IP_LIMIT_DEFAULT_WINDOW_SECONDS = 60; // 60_000 ms
const EMAIL_LIMIT_MAX = 20; // requisições por e-mail (guarda de lockout por conta)
const EMAIL_LIMIT_WINDOW_MS = 60_000;

// R2-AUTH-021: tentativa so conta quando ha PROVA de recusa de credenciais —
// erro 4xx que nao seja 429. Todo o resto (5xx, 429, status ausente/0,
// AuthRetryableFetchError, erro nulo sem sessao) e indisponibilidade do
// provedor e nao pode alimentar o lockout.
function isCredentialRefusal(err: { status?: number; name?: string } | null): boolean {
  if (!err || err.name === "AuthRetryableFetchError") return false;
  const status = err.status;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 429;
}

/** Código do erro da RPC para log (o `error` é `unknown` por contrato). */
function rpcErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code?: unknown }).code as string | undefined;
  }
  return undefined;
}

export async function handleLogin(req: Request, deps: AuthLoginDeps): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("auth-login");

  try {
    if (req.method !== "POST") return errorResponse("Method not allowed", 405, req);

    // Política de rede (R2-AUTH-022 / 27.4): depois de CORS/método e ANTES de
    // ler/processar credenciais, consultar usuário, registrar tentativa ou
    // autenticar. A negação (403/503) responde sem tocar body, rate limit,
    // GoTrue ou qualquer efeito.
    const policy = await resolveNetworkPolicy(req, "auth-login", {
      rpc: deps.admin,
      defaultMaxRequests: IP_LIMIT_DEFAULT_MAX,
      defaultWindowSeconds: IP_LIMIT_DEFAULT_WINDOW_SECONDS,
    });
    if (!policy.allowed) {
      log.done(policy.status, policy.status === 403 ? { reason: policy.reason } : {});
      return networkPolicyDenialResponse(policy, req);
    }

    const ip = getClientIP(req);
    // Limite configurável de `auth-login` prevalece; fallback mantém os limites
    // hardcoded atuais (via defaults passados à RPC).
    const ipRl = await deps.enforceRateLimit(
      `auth-login:${ip}`,
      policy.rateLimitMaxRequests,
      policy.rateLimitWindowSeconds * 1000,
    );
    if (!ipRl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON", 400, req);
    }
    const rec = (body ?? {}) as Record<string, unknown>;

    const mode = parseLoginMode(rec.mode);
    if (mode === null) return errorResponse("invalid mode", 400, req);

    const email = sanitizeString(rec.email, 254)?.toLowerCase();
    if (!email || !EMAIL_RE.test(email)) return errorResponse("invalid email", 400, req);
    const password = typeof rec.password === "string" ? rec.password : "";
    if (!password || password.length > 256) return errorResponse("invalid password", 400, req);
    const userAgent = sanitizeString(rec.userAgent ?? req.headers.get("user-agent"), 512) ?? null;

    const emailRl = await deps.enforceRateLimit(`auth-login-email:${email}`, EMAIL_LIMIT_MAX, EMAIL_LIMIT_WINDOW_MS);
    if (!emailRl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    const { data: lockData, error: lockError } = await deps.admin.rpc("is_account_locked", { check_email: email });
    if (lockError) {
      log.error("is_account_locked failed", { code: rpcErrorCode(lockError) });
      return errorResponse("Internal error", 500, req);
    }
    const lockRow = (Array.isArray(lockData) ? lockData[0] : lockData) as LockRow | null;
    if (lockRow?.is_locked) {
      log.done(423, { attempts: lockRow.attempts });
      return jsonResponse({ error: "Account locked", ...lockPayload(lockRow) }, 423, req);
    }

    // Falha de transporte que LANCA (rejeita a promise) vira 503 aqui, sem
    // registrar tentativa; o catch externo segue para o resto.
    let signIn: { session: LoginSession | null; user: { id: string } | null };
    let signInError: { status?: number; name?: string } | null;
    try {
      ({ data: signIn, error: signInError } = await deps.anon.auth.signInWithPassword({ email, password }));
    } catch {
      log.warn("auth unavailable", { reason: "transport" });
      log.done(503, { reason: "transport" });
      return errorResponse("Auth service unavailable", 503, req);
    }

    if (signInError || !signIn?.session) {
      if (!isCredentialRefusal(signInError)) {
        log.warn("auth unavailable", { status: signInError?.status, name: signInError?.name });
        log.done(503, { status: signInError?.status });
        return errorResponse("Auth service unavailable", 503, req);
      }
      const { data: recData, error: recError } = await deps.admin.rpc("record_failed_login", {
        p_email: email,
        p_ip_address: ip === "unknown" ? null : ip,
        p_user_agent: userAgent,
      });
      if (recError) log.error("record_failed_login failed", { code: rpcErrorCode(recError) });
      const recRow = (Array.isArray(recData) ? recData[0] : recData) as LockRow | null;
      const lock = recRow ? lockPayload(recRow) : { isLocked: false, lockedUntil: null, attempts: 1, remainingTime: 0 };
      log.done(401, { isLocked: lock.isLocked, attempts: lock.attempts, status: signInError?.status });
      return jsonResponse({ error: "Invalid login credentials", ...lock }, 401, req);
    }

    const s = signIn.session;

    // Modo `verify` (reautenticação): a senha foi aceita, mas a sessão que o
    // GoTrue criou só serviu para conferir a senha — o chamador JÁ tem sessão
    // (possivelmente AAL2) e não pode receber nem trocar por estes tokens.
    // Revoga a sessão temporária no escopo `local` (só ela; NÃO derruba a sessão
    // real do usuário, ao contrário de `global`). Falha ao revogar = 503: sem
    // tokens e sem deixar sessão órfã viva (falha fechada).
    if (mode === "verify") {
      const { error: outError } = await deps.admin.auth.admin.signOut(s.access_token, "local");
      if (outError) {
        log.error("verify signOut failed", {});
        log.done(503, { reason: "signout" });
        return errorResponse("Auth service unavailable", 503, req);
      }
    }

    const { error: clearError } = await deps.admin.rpc("clear_login_attempts", { p_email: email });
    if (clearError) log.error("clear_login_attempts failed", { code: rpcErrorCode(clearError) });

    if (mode === "verify") {
      log.done(200, { mode: "verify", userId: signIn.user?.id });
      return jsonResponse({ ok: true }, 200, req);
    }

    log.done(200, { userId: signIn.user?.id });
    return jsonResponse(
      {
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_in: s.expires_in,
        expires_at: s.expires_at ?? null,
        token_type: s.token_type,
      },
      200,
      req,
    );
  } catch (err) {
    log.error("unhandled", { err: String(err) });
    return errorResponse("Internal server error", 500, req);
  }
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const admin = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const anon = createClient(supabaseUrl, requireEnv("SUPABASE_ANON_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return handleLogin(req, { admin, anon, enforceRateLimit });
  });
}
