import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  handleCors,
  errorResponse,
  jsonResponse,
  requireEnv,
  Logger,
  getClientIP,
  sanitizeString,
  enforceRateLimit,
} from "../_shared/validation.ts";
import {
  resolveNetworkPolicy,
  networkPolicyDenialResponse,
  extractCountryCode,
  type NetworkPolicyRpcClient,
} from "../_shared/request-policy.ts";

// Login server-side (ADR-006): o lockout e decidido aqui, para qualquer cliente.
// 1. politica de rede (R2-AUTH-022) antes de qualquer efeito;
// 2. gate unico consume_login_gate: bloqueio ANTES de consumir contadores,
//    rate limit por IP e por e-mail na mesma transacao -> 423/429;
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
type GateRow = LockRow & { allowed: boolean; remaining: number };

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

// Leitura do perfil do usuário autenticado (service_role), por `user_id`:
// igualdade EXATA num índice UNIQUE (`profiles.user_id` é UNIQUE NOT NULL, FK
// para `auth.users`), nunca por `profiles.email` (nullable, sem UNIQUE
// garantido). O `admin` fica tipado só como `NetworkPolicyRpcClient` porque
// expor o builder `from/select/eq` do supabase-js estoura a instanciação de
// tipos (TS2589); o cast para o builder fica isolado em `profileLookupFrom`.
export type ProfileLookup = (
  userId: string,
) => PromiseLike<{ data: { is_active: boolean | null } | null; error: unknown }>;

export interface LoginAdminClient extends NetworkPolicyRpcClient {
  auth: {
    admin: {
      signOut: (
        jwt: string,
        scope: "global" | "local" | "others",
      ) => PromiseLike<{ error: { message?: string } | null }>;
    };
  };
}

export interface AuthLoginDeps {
  admin: LoginAdminClient;
  anon: LoginAnonClient;
  // Opcional: o gate `consume_login_gate` já aplica IP+e-mail. Quando injetado
  // (produção usa `enforceRateLimit`), uma indisponibilidade do contador
  // persistente falha FECHADO antes do gate — o contador em memória zera no
  // cold start e não pode ser a única guarda por conta.
  enforceRateLimit?: (
    key: string,
    maxRequests: number,
    windowMs: number,
  ) => PromiseLike<{ allowed: boolean; unavailable?: boolean }>;
  // Injetável para o teste; o default de produção é `profileLookupFrom(admin)`.
  getProfileActive?: ProfileLookup;
}

// Limites hardcoded atuais (fallback quando não há regra ativa de rate limit).
const IP_LIMIT_DEFAULT_MAX = 10; // requisições por IP
const IP_LIMIT_DEFAULT_WINDOW_SECONDS = 60; // 60_000 ms
const EMAIL_LIMIT_MAX = 20; // requisições por e-mail (guarda de lockout por conta)
const EMAIL_LIMIT_WINDOW_SECONDS = 60;
const EMAIL_LIMIT_WINDOW_MS = EMAIL_LIMIT_WINDOW_SECONDS * 1000;

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

/**
 * Registra a tentativa falha e devolve o MESMO 401 do caminho de senha errada.
 * Usado pela recusa de credencial E pelo perfil inativo/ausente: os dois ramos
 * precisam ser indistinguíveis (status, corpo e contadores do lockout), senão a
 * resposta vira oráculo de enumeração de contas.
 */
async function recordFailure(
  deps: AuthLoginDeps,
  log: Logger,
  req: Request,
  args: { email: string; ip: string; userAgent: string | null; status?: number | undefined },
): Promise<Response> {
  const { data: recData, error: recError } = await deps.admin.rpc("record_failed_login", {
    p_email: args.email,
    p_ip_address: args.ip === "unknown" ? null : args.ip,
    p_user_agent: args.userAgent,
  });
  if (recError) log.error("record_failed_login failed", { code: rpcErrorCode(recError) });
  const recRow = (Array.isArray(recData) ? recData[0] : recData) as LockRow | null;
  const lock = recRow ? lockPayload(recRow) : { isLocked: false, lockedUntil: null, attempts: 1, remainingTime: 0 };
  log.done(401, { isLocked: lock.isLocked, attempts: lock.attempts, status: args.status });
  return jsonResponse({ error: "Invalid login credentials", ...lock }, 401, req);
}

/**
 * Revoga TODAS as sessões Auth do usuário via a primitiva SQL service_role-only
 * `revoke_auth_sessions` (a mesma usada pelo trigger de desativação de perfil e
 * pela Edge `revoke-auth-sessions`). Chamado quando a credencial foi aceita mas
 * o perfil não pode entrar: a sessão recém-emitida não pode sobreviver.
 */
async function revokeUserSessions(deps: AuthLoginDeps, log: Logger, userId: string): Promise<void> {
  const { error } = await deps.admin.rpc("revoke_auth_sessions", {
    p_scope: "global",
    p_actor_user_id: null,
    p_target_user_id: userId,
    p_target_session_id: null,
    p_preserve_session_id: null,
  });
  if (error) log.error("revoke_auth_sessions failed", { code: rpcErrorCode(error) });
}

/**
 * Default de produção: resolve `profiles.is_active` pelo `user_id` (igualdade
 * exata). O cast para o builder do supabase-js é local e intencional: expor esse
 * builder na assinatura de `admin` estoura a instanciação de tipos (TS2589).
 */
function profileLookupFrom(admin: NetworkPolicyRpcClient): ProfileLookup {
  const client = admin as unknown as {
    from(table: string): {
      select(columns: string): {
        eq(column: string, value: string): {
          maybeSingle(): PromiseLike<{
            data: { is_active: boolean | null } | null;
            error: unknown;
          }>;
        };
      };
    };
  };
  return (userId: string) =>
    client.from("profiles").select("is_active").eq("user_id", userId).maybeSingle();
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
      // Log visível do bloqueio (cartão log-bloqueio-login): a RPC de política nega
      // mas não grava nada. Gravamos em audit_logs (action='login_blocked') para o
      // painel "Bloqueios de login". Só a negação por política (403) loga; o 503 de
      // decisão não. Best-effort: falha de log não muda a resposta ao cliente.
      if (policy.status === 403) {
        const blockIp = getClientIP(req);
        const { error: logBlockError } = await deps.admin.rpc("log_login_block", {
          p_email: null,
          p_ip: blockIp === "unknown" ? null : blockIp,
          p_country_code: extractCountryCode(req),
          p_reason: policy.reason,
          p_user_agent: sanitizeString(req.headers.get("user-agent"), 512) ?? null,
        });
        if (logBlockError) log.error("log_login_block failed", { code: rpcErrorCode(logBlockError) });
      }
      return networkPolicyDenialResponse(policy, req);
    }

    const ip = getClientIP(req);

    // Corpo lido depois da política e antes do gate: corpo inválido conta só o
    // IP (p_email=null), como o rate limit por IP que já corria antes do parse.
    let body: unknown;
    let invalidBody: string | null = null;
    try {
      body = await req.json();
    } catch {
      invalidBody = "Invalid JSON";
    }
    const rec = (body ?? {}) as Record<string, unknown>;

    // `mode` inválido é recusa fechada antes de qualquer efeito (não há como
    // decidir o fluxo); o resto do corpo inválido segue o padrão deste handler:
    // acumula em `invalidBody` e só responde 400 DEPOIS do gate, para que o
    // corpo inválido conte apenas o teto por IP (p_email=null).
    const mode = parseLoginMode(rec.mode);
    if (mode === null) return errorResponse("invalid mode", 400, req);

    let email: string | null = null;
    if (!invalidBody) {
      email = sanitizeString(rec.email, 254)?.toLowerCase() ?? null;
      if (!email || !EMAIL_RE.test(email)) invalidBody = "invalid email";
    }
    const password = !invalidBody && typeof rec.password === "string" ? rec.password : "";
    if (!invalidBody && (!password || password.length > 256)) invalidBody = "invalid password";
    const userAgent = sanitizeString(rec.userAgent ?? req.headers.get("user-agent"), 512) ?? null;

    // Guarda extra do contador persistente, ANTES do gate: se o RPC de rate
    // limit não respondeu, o login por e-mail não pode seguir só com o contador
    // em memória. Testes offline que não injetam o limiter ficam no gate único.
    const limit = deps.enforceRateLimit;
    if (limit) {
      const ipRl = await limit(
        `auth-login:${ip}`,
        policy.rateLimitMaxRequests,
        policy.rateLimitWindowSeconds * 1000,
      );
      if (ipRl.unavailable) {
        log.error("rate limit persistente indisponivel; negando login por IP");
        log.done(503, { reason: "rate_limit_unavailable" });
        return errorResponse("Serviço de autenticação indisponível", 503, req);
      }
      if (!ipRl.allowed) return errorResponse("Rate limit exceeded", 429, req);

      if (email) {
        const emailRl = await limit(`auth-login-email:${email}`, EMAIL_LIMIT_MAX, EMAIL_LIMIT_WINDOW_MS);
        // Fail-CLOSED na guarda por conta: se o contador persistente nao respondeu
        // (RPC fora do ar ou contrato invalido), o limite por e-mail passaria apenas com
        // o contador em memoria, que zera a cada cold start. Num login isso e a guarda de
        // forca bruta por conta — na duvida, nega com indisponibilidade (503) em vez de
        // aceitar. O login legitimo segue normal quando o banco responde.
        if (emailRl.unavailable) {
          log.error("rate limit persistente indisponivel; negando login por e-mail");
          log.done(503, { reason: "rate_limit_unavailable" });
          return errorResponse("Serviço de autenticação indisponível", 503, req);
        }
        if (!emailRl.allowed) return errorResponse("Rate limit exceeded", 429, req);
      }
    }

    // Uma ida ao banco: a RPC decide bloqueio da conta ANTES de consumir
    // contadores, depois aplica o teto de IP e o de e-mail na mesma transação.
    // O limite configurável de `auth-login` prevalece; os defaults passados à
    // política (10/60s) e o hardcoded de e-mail (20/60s) são os parâmetros.
    const { data: gateData, error: gateError } = await deps.admin.rpc("consume_login_gate", {
      p_email: invalidBody ? null : email,
      p_ip: ip,
      p_ip_max: policy.rateLimitMaxRequests,
      p_ip_window_seconds: policy.rateLimitWindowSeconds,
      p_email_max: EMAIL_LIMIT_MAX,
      p_email_window_seconds: EMAIL_LIMIT_WINDOW_SECONDS,
    });
    if (gateError) {
      log.error("consume_login_gate failed", { code: rpcErrorCode(gateError) });
      return errorResponse("Internal error", 500, req);
    }

    const gateRow = (Array.isArray(gateData) ? gateData[0] : gateData) as GateRow | null;
    if (!gateRow || typeof gateRow.allowed !== "boolean") {
      log.error("consume_login_gate returned no row");
      return errorResponse("Internal error", 500, req);
    }
    if (gateRow.is_locked) {
      log.done(423, { attempts: gateRow.attempts });
      return jsonResponse({ error: "Account locked", ...lockPayload(gateRow) }, 423, req);
    }
    if (!gateRow.allowed) {
      log.done(429, {});
      return errorResponse("Rate limit exceeded", 429, req);
    }
    if (invalidBody || !email) return errorResponse(invalidBody ?? "invalid email", 400, req);

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
      return recordFailure(deps, log, req, { email, ip, userAgent, status: signInError?.status });
    }

    const userId = signIn.user?.id;
    if (!userId) {
      // Sessão emitida sem usuário não deveria acontecer; fail-closed como
      // indisponibilidade (não é recusa de credencial e não dá para revogar).
      log.warn("auth unavailable", { reason: "session_without_user" });
      log.done(503, { reason: "session_without_user" });
      return errorResponse("Auth service unavailable", 503, req);
    }

    // R2-AUTH-004 (item 6): credencial válida NÃO basta — perfil inativo não
    // entra. A consulta vem DEPOIS do GoTrue (o bcrypt já rodou), então inativo
    // e senha errada têm custo de tempo comparável; e o perfil é resolvido por
    // `profiles.user_id = signIn.user.id` (UNIQUE NOT NULL, o MESMO id de
    // auth.users) — igualdade exata, nunca `profiles.email` (nullable, sem
    // UNIQUE garantido) nem ilike (curinga do PostgREST).
    const getProfile = deps.getProfileActive ?? profileLookupFrom(deps.admin);
    const profileRes = await getProfile(userId);
    if (profileRes.error) {
      log.error("profile lookup failed", { code: rpcErrorCode(profileRes.error) });
      // Fail-closed: consulta que falhou não pode deixar a sessão recém-emitida viva.
      await revokeUserSessions(deps, log, userId);
      return errorResponse("Internal error", 500, req);
    }
    // Ausente, inativo (`false`) ou `is_active` nulo: mesma porta de saída da
    // credencial recusada — revoga a sessão, registra a tentativa e devolve o
    // MESMO 401/corpo (sem oráculo de enumeração). `!== true` cobre `false` e `null`.
    if (!profileRes.data || profileRes.data.is_active !== true) {
      await revokeUserSessions(deps, log, userId);
      return recordFailure(deps, log, req, { email, ip, userAgent });
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
