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

  const log = new Logger("check-account-lock");

  try {
    if (req.method !== "POST") return errorResponse("Method not allowed", 405, req);

    const ip = getClientIP(req);
    const rl = checkRateLimit(`check-lock:${ip}`, 20, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON", 400, req);
    }

    const email = sanitizeString((body as Record<string, unknown>)?.email, 254);
    if (!email) return errorResponse("email required", 400, req);

    // Additional per-email rate limit to prevent enumeration abuse
    const emailRl = checkRateLimit(`check-lock-email:${email.toLowerCase()}`, 10, 60_000);
    if (!emailRl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase.rpc("is_account_locked", {
      check_email: email,
    });

    if (error) {
      log.error("is_account_locked failed", { code: error.code });
      return errorResponse("Internal error", 500, req);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return jsonResponse({ isLocked: false, lockedUntil: null, attempts: 0, remainingTime: 0 }, 200, req);
    }

    const lockedUntil = row.locked_until ? new Date(row.locked_until) : null;
    const remainingTime = lockedUntil
      ? Math.max(0, Math.floor((lockedUntil.getTime() - Date.now()) / 1000))
      : 0;

    log.done(200, { isLocked: row.is_locked });
    return jsonResponse(
      {
        isLocked: row.is_locked,
        lockedUntil: lockedUntil?.toISOString() ?? null,
        attempts: row.attempts,
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
