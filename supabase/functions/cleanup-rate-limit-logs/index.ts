import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("cleanup-rate-limit-logs");

  try {
    const supabaseClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

    log.info("Starting rate limit logs cleanup");

    // Delete logs older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: deletedLogs, error: logsError } = await supabaseClient
      .from("rate_limit_logs").delete().lt("created_at", sevenDaysAgo).select("id");
    if (logsError) throw logsError;

    // Delete expired blocked IPs (non-permanent)
    const now = new Date().toISOString();
    const { data: unblockedIps, error: blockedError } = await supabaseClient
      .from("blocked_ips").delete().eq("is_permanent", false).lt("expires_at", now).select("ip_address");
    if (blockedError) throw blockedError;

    // Delete old security alerts (older than 30 days, resolved only)
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
    return errorResponse(msg, 500, req);
  }
});
