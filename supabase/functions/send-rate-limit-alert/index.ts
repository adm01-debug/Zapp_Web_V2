import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { RateLimitAlertSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("send-rate-limit-alert");

  try {
    const supabaseClient = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY")
    );

    const parsed = parseBody(RateLimitAlertSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { ip_address, endpoint, request_count, blocked } = parsed.data;
    log.info(`Rate limit alert: IP ${ip_address} hit ${endpoint} ${request_count} times. Blocked: ${blocked}`);

    const { error: alertError } = await supabaseClient
      .from("security_alerts")
      .insert({
        alert_type: blocked ? "rate_limit_blocked" : "rate_limit_warning",
        severity: blocked ? "high" : "medium",
        title: blocked
          ? `IP ${ip_address} bloqueado por Rate Limit`
          : `Alerta de Rate Limit para IP ${ip_address}`,
        description: `O IP ${ip_address} fez ${request_count} requisições para ${endpoint}. ${blocked ? "O IP foi bloqueado." : "Limite próximo."}`,
        ip_address,
        metadata: { endpoint, request_count, blocked, timestamp: new Date().toISOString() },
      });

    if (alertError) {
      log.error("Error creating alert", { error: alertError.message });
      throw alertError;
    }

    if (blocked) {
      const blockDuration = 15;
      const expiresAt = new Date(Date.now() + blockDuration * 60 * 1000);

      const { error: blockError } = await supabaseClient
        .from("blocked_ips")
        .upsert({
          ip_address,
          reason: `Rate limit exceeded: ${request_count} requests to ${endpoint}`,
          blocked_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          is_permanent: false,
          request_count,
          last_attempt_at: new Date().toISOString(),
        }, { onConflict: "ip_address" });

      if (blockError) log.error("Error blocking IP", { error: blockError.message });
    }

    const { data: admins } = await supabaseClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (admins && admins.length > 0) {
      const notifications = admins.map((admin: { user_id: string }) => ({
        user_id: admin.user_id,
        type: "security",
        title: blocked ? "IP Bloqueado" : "Alerta de Rate Limit",
        message: `IP ${ip_address} - ${request_count} requisições para ${endpoint}`,
        metadata: { ip_address, endpoint, request_count, blocked },
      }));

      await supabaseClient.from("notifications").insert(notifications);
    }

    log.done(200);
    return jsonResponse({ success: true, message: "Alert processed" }, 200, req);
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : "Internal error", 500, req);
  }
});
