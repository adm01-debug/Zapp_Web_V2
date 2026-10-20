import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { timingSafeEqual } from "../_shared/hmac-validation.ts";

/**
 * R2-API-022 (P1) — gate de autorização do cleanup-rate-limit-logs.
 *
 * Defeito fechado: a rotina de manutenção apagava registros de `rate_limit_logs`,
 * `blocked_ips` e `security_alerts` com a service role SEM nenhuma verificação
 * de quem chamava — qualquer identidade admitida pelo gateway disparava os
 * DELETEs.
 *
 * Regra agora (fixada na decomposição do achado):
 *   - preflight CORS continua livre;
 *   - autorização acontece ANTES de qualquer DELETE;
 *   - execução automática exige `CRON_SECRET` não vazio, enviado no header
 *     dedicado `x-cron-secret`, comparado em tempo constante;
 *   - execução manual exige JWT válido cujo usuário seja admin/supervisor pela
 *     RPC canônica `is_admin_or_supervisor` (mesma do migrate-media-storage);
 *   - falha fechada quando a credencial interna está ausente/vazia ou quando a
 *     RPC de papel falha.
 * Os predicados de retenção permanecem exatamente os anteriores: logs > 7 dias,
 * bloqueios temporários (is_permanent = false) com expires_at vencido e alertas
 * resolvidos (is_resolved = true) com mais de 30 dias.
 */

export interface CleanupRateLimitLogsDeps {
  /**
   * Cliente de escopo usuário (anon key) usado SÓ no gate manual de autorização:
   * `auth.getUser` (valida o JWT) + `rpc("is_admin_or_supervisor")`. Injetado
   * nos testes para não depender de rede nem de env.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authClient?: any;
  /**
   * Cliente service-role usado SÓ depois da autorização (executa os DELETEs).
   * Injetado nos testes.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  /** Override do CRON_SECRET (facilita o teste sem tocar no env do processo). */
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
    // ── Autorização (ANTES de criar cliente service-role e de qualquer DELETE) ──
    const cronSecret = deps.cronSecret !== undefined
      ? deps.cronSecret
      : (Deno.env.get("CRON_SECRET") ?? "");
    const cronHeader = req.headers.get("x-cron-secret");
    // Fail-closed: sem segredo interno não vazio, o header não autoriza nada.
    const isCron = Boolean(cronSecret && cronHeader && timingSafeEqual(cronHeader, cronSecret));

    if (!isCron) {
      const authHeader = req.headers.get("Authorization") || "";
      if (!authHeader.toLowerCase().startsWith("bearer ")) {
        return errorResponse("Unauthorized", 401, req);
      }
      const token = authHeader.slice(7);
      // Cliente de escopo usuário: o JWT é validado e o papel conferido SEM a
      // service-role key — a decisão de autorização não usa cliente privilegiado.
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
      // RPC de papel com erro não abre por falha: trata como não privilegiado.
      if (roleError || isPrivileged !== true) {
        return errorResponse("Forbidden", 403, req);
      }
    }

    // ── Autorizado: cria cliente service-role e executa a limpeza ──
    const supabaseClient = deps.supabase ?? createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

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
}

if (import.meta.main) {
  Deno.serve((req) => handleCleanupRateLimitLogs(req));
}
