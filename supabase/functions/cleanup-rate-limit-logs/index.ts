import { createClient } from "npm:@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, internalErrorResponse } from "../_shared/validation.ts";
import { timingSafeEqual } from "../_shared/hmac-validation.ts";

/**
 * R2-API-022 (P1) - gate de autorizacao do cleanup-rate-limit-logs.
 */

export interface CleanupRateLimitLogsDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authClient?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  cronSecret?: string;
}

export async function handleCleanupRateLimitLogs(
  req: Request,
  deps: CleanupRateLimitLogsDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("cleanup-rate-limit-logs");

  try {
    const cronSecret = deps.cronSecret !== undefined
      ? deps.cronSecret
      : (Deno.env.get("CRON_SECRET") ?? "");
    const cronHeader = req.headers.get("x-cron-secret");
    const isCron = Boolean(cronSecret && cronHeader && timingSafeEqual(cronHeader, cronSecret));

    if (!isCron) {
      const authHeader = req.headers.get("Authorization") || "";
      if (!authHeader.toLowerCase().startsWith("bearer ")) {
        return errorResponse("Unauthorized", 401, req);
      }
      const token = authHeader.slice(7);
      const authClient = deps.authClient ?? createClient(
        requireEnv("SUPABASE_URL"),
        Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
        {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false },
        },
      );
      const { data: { user }, error: authError } = await authClient.auth.getUser(token);
      if (authError || !user) {
        return errorResponse("Unauthorized", 401, req);
      }
      const { data: isPrivileged, error: roleError } = await authClient.rpc(
        "is_admin_or_supervisor",
        { _user_id: user.id },
      );
      if (roleError || isPrivileged !== true) {
        return errorResponse("Forbidden", 403, req);
      }
    }

    const supabaseClient = deps.supabase ?? createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    log.info("Starting rate limit logs cleanup");

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: deletedLogs, error: logsError } = await supabaseClient
      .from("rate_limit_logs").delete().lt("created_at", sevenDaysAgo).select("id");
    if (logsError) throw logsError;

    const now = new Date().toISOString();
    const { data: unblockedIps, error: blockedError } = await supabaseClient
      .from("blocked_ips").delete().eq("is_permanent", false).lt("expires_at", now).select("ip_address");
    if (blockedError) throw blockedError;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: deletedAlerts, error: alertsError } = await supabaseClient
      .from("security_alerts").delete().eq("is_resolved", true).lt("created_at", thirtyDaysAgo).select("id");
    if (alertsError) log.warn("Error deleting old security alerts", { error: alertsError.message });

    const summary = {
      deleted_logs: deletedLogs?.length || 0,
      unblocked_ips: unblockedIps?.length || 0,
      deleted_alerts: deletedAlerts?.length || 0,
      timestamp: new Date().toISOString(),
    };

    log.done(200, summary);
    return jsonResponse({ success: true, ...summary }, 200, req);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log.error("Cleanup error", { error: msg });
    return internalErrorResponse(error, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleCleanupRateLimitLogs(req));
}
