/**
 * Shared guards for AI edge functions:
 *  - Per-user rate limiting (in-memory, per-isolate)
 *  - Daily quota check based on ai_usage_logs (per user × function)
 *
 * Returns a Response on rejection (401/429), or null when allowed.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { checkRateLimit, errorResponse, requireEnv } from "./validation.ts";

export interface AiGuardOptions {
  functionName: string;
  userId: string | null | undefined;
  /** Max requests per user per minute (in-memory). Default 30. */
  perUserPerMinute?: number;
  /** Max successful calls per user per 24h (DB-backed). Default 500. */
  dailyQuota?: number;
  req: Request;
}

const DEFAULT_PER_USER_PER_MIN = 30;
const DEFAULT_DAILY_QUOTA = 500;

export async function enforceAiGuards(opts: AiGuardOptions): Promise<Response | null> {
  const { functionName, userId, req } = opts;
  if (!userId) return errorResponse("Unauthenticated", 401, req);

  // 1) Per-user, in-memory rate limit
  const perMin = opts.perUserPerMinute ?? DEFAULT_PER_USER_PER_MIN;
  const rl = checkRateLimit(`ai:user:${functionName}:${userId}`, perMin, 60_000);
  if (!rl.allowed) {
    return errorResponse(`Per-user rate limit exceeded (${perMin}/min)`, 429, req);
  }

  // 2) Daily quota via ai_usage_logs (service role)
  const quota = opts.dailyQuota ?? DEFAULT_DAILY_QUOTA;
  try {
    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("ai_usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("function_name", functionName)
      .gte("created_at", since);
    if (error) {
      // Fail open on infra error (do not block users)
      return null;
    }
    if ((count ?? 0) >= quota) {
      return errorResponse(`Daily AI quota exceeded (${quota}/day)`, 429, req);
    }
  } catch (_e) {
    // Fail open
    return null;
  }
  return null;
}