import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

// Login server-side (ADR-006): o lockout e decidido aqui, para qualquer cliente.
// 1. conta travada -> 423 sem tocar no GoTrue;
// 2. GoTrue recusa -> a falha e registrada (comprovada pelo proprio GoTrue) -> 401;
// 3. GoTrue aceita -> tentativas zeradas -> 200 com a sessao; o front faz setSession.
// verify_jwt = false: ainda nao existe sessao. Rate limit por IP e por e-mail.

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@.]{2,63}$/;

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

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("auth-login");

  try {
    if (req.method !== "POST") return errorResponse("Method not allowed", 405, req);

    const ip = getClientIP(req);
    const ipRl = await enforceRateLimit(`auth-login:${ip}`, 10, 60_000);
    if (!ipRl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON", 400, req);
    }
    const rec = (body ?? {}) as Record<string, unknown>;

    const email = sanitizeString(rec.email, 254)?.toLowerCase();
    if (!email || !EMAIL_RE.test(email)) return errorResponse("invalid email", 400, req);
    const password = typeof rec.password === "string" ? rec.password : "";
    if (!password || password.length > 256) return errorResponse("invalid password", 400, req);
    const userAgent = sanitizeString(rec.userAgent ?? req.headers.get("user-agent"), 512) ?? null;

    const emailRl = await enforceRateLimit(`auth-login-email:${email}`, 20, 60_000);
    if (!emailRl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const admin = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const { data: lockData, error: lockError } = await admin.rpc("is_account_locked", { check_email: email });
    if (lockError) {
      log.error("is_account_locked failed", { code: lockError.code });
      return errorResponse("Internal error", 500, req);
    }
    const lockRow = (Array.isArray(lockData) ? lockData[0] : lockData) as LockRow | null;
    if (lockRow?.is_locked) {
      log.done(423, { attempts: lockRow.attempts });
      return jsonResponse({ error: "Account locked", ...lockPayload(lockRow) }, 423, req);
    }

    const anon = createClient(supabaseUrl, requireEnv("SUPABASE_ANON_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });

    if (signInError || !signIn.session) {
      const { data: recData, error: recError } = await admin.rpc("record_failed_login", {
        p_email: email,
        p_ip_address: ip === "unknown" ? null : ip,
        p_user_agent: userAgent,
      });
      if (recError) log.error("record_failed_login failed", { code: recError.code });
      const recRow = (Array.isArray(recData) ? recData[0] : recData) as LockRow | null;
      const lock = recRow ? lockPayload(recRow) : { isLocked: false, lockedUntil: null, attempts: 1, remainingTime: 0 };
      log.done(401, { isLocked: lock.isLocked, attempts: lock.attempts, status: signInError?.status });
      return jsonResponse({ error: "Invalid login credentials", ...lock }, 401, req);
    }

    const { error: clearError } = await admin.rpc("clear_login_attempts", { p_email: email });
    if (clearError) log.error("clear_login_attempts failed", { code: clearError.code });

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
});
