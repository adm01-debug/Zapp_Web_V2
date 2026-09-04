import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  handleCors,
  errorResponse,
  jsonResponse,
  requireEnv,
  Logger,
  checkRateLimit,
  getClientIP,
  sanitizeString,
} from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("record-failed-login");

  try {
    if (req.method !== "POST") return errorResponse("Method not allowed", 405, req);

    const ip = getClientIP(req);

    // Strict IP rate limit: failed logins are high-risk — 10 per minute per IP
    const ipRl = checkRateLimit(`record-failed:${ip}`, 10, 60_000);
    if (!ipRl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON", 400, req);
    }

    const email = sanitizeString((body as Record<string, unknown>)?.email, 254);
    if (!email) return errorResponse("email required", 400, req);

    // Per-email rate limit: prevents burst-locking a single account from multiple IPs
    const emailRl = checkRateLimit(`record-failed-email:${email.toLowerCase()}`, 20, 60_000);
    if (!emailRl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    const userAgent = sanitizeString((body as Record<string, unknown>)?.userAgent, 512) ?? null;

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase.rpc("record_failed_login", {
      p_email: email,
      p_ip_address: ip === "unknown" ? null : ip,
      p_user_agent: userAgent,
    });

    if (error) {
      log.error("record_failed_login failed", { code: error.code });
      return errorResponse("Internal error", 500, req);
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result) {
      return jsonResponse({ isLocked: false, lockedUntil: null, attempts: 1, remainingTime: 0 }, 200, req);
    }

    const lockedUntil = result.locked_until ? new Date(result.locked_until) : null;
    const remainingTime = lockedUntil
      ? Math.max(0, Math.floor((lockedUntil.getTime() - Date.now()) / 1000))
      : 0;

    log.done(200, { isLocked: result.is_locked, attempts: result.attempts });
    return jsonResponse(
      {
        isLocked: result.is_locked,
        lockedUntil: lockedUntil?.toISOString() ?? null,
        attempts: result.attempts,
        remainingTime,
      },
      200,
      req
    );
  } catch (err) {
    log.error("unhandled", { err: String(err) });
    return errorResponse("Internal server error", 500, req);
  }
});
