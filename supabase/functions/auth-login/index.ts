import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  handleCors,
  errorResponse,
  jsonResponse,
  requireEnv,
  Logger,
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
// 2. gate unico consume_login_gate: bloqueio ANTES de consumir contadores,
//    rate limit por IP e por e-mail na mesma transacao -> 423/429;
// 3. GoTrue recusa -> a falha e registrada (comprovada pelo proprio GoTrue) -> 401;
// 4. GoTrue aceita -> tentativas zeradas -> 200 com a sessao; o front faz setSession.
// verify_jwt = false: ainda nao existe sessao. Rate limit por IP e por e-mail.

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@.]{2,63}$/;

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
      error: { status?: number } | null;
    }>;
  };
}

export interface AuthLoginDeps {
  admin: NetworkPolicyRpcClient;
  anon: LoginAnonClient;
}

// Limites hardcoded atuais (fallback quando não há regra ativa de rate limit).
const IP_LIMIT_DEFAULT_MAX = 10; // requisições por IP
const IP_LIMIT_DEFAULT_WINDOW_SECONDS = 60; // 60_000 ms
const EMAIL_LIMIT_MAX = 20; // requisições por e-mail (guarda de lockout por conta)
const EMAIL_LIMIT_WINDOW_SECONDS = 60;

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

    let email: string | null = null;
    if (!invalidBody) {
      email = sanitizeString(rec.email, 254)?.toLowerCase() ?? null;
      if (!email || !EMAIL_RE.test(email)) invalidBody = "invalid email";
    }
    const password = !invalidBody && typeof rec.password === "string" ? rec.password : "";
    if (!invalidBody && (!password || password.length > 256)) invalidBody = "invalid password";
    const userAgent = sanitizeString(rec.userAgent ?? req.headers.get("user-agent"), 512) ?? null;

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

    const { data: signIn, error: signInError } = await deps.anon.auth.signInWithPassword({ email, password });

    if (signInError || !signIn.session) {
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

    const { error: clearError } = await deps.admin.rpc("clear_login_attempts", { p_email: email });
    if (clearError) log.error("clear_login_attempts failed", { code: rpcErrorCode(clearError) });

    const s = signIn.session;
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
    return handleLogin(req, { admin, anon });
  });
}
