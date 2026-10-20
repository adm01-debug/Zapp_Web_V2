import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { RateLimitAlertSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { timingSafeEqual } from "../_shared/hmac-validation.ts";

/**
 * R2-API-022 (P1) — gate de autorização do send-rate-limit-alert.
 *
 * Defeito fechado: a rotina de alerta de rate limit é uma integração interna
 * que escreve em `security_alerts`/`blocked_ips`/`notifications` com a service
 * role. Antes desta correção o segredo `INTERNAL_ALERT_SECRET` era conferido
 * SÓ quando configurado (`if (internalSecret)`), com comparação direta — ou
 * seja, com o segredo ausente/vazio a chamada passava SEM gate (fail-open) e
 * qualquer identidade admitida pelo gateway escrevia no banco.
 *
 * Regra agora (fixada na decomposição do achado):
 *   - preflight CORS continua livre;
 *   - exige `INTERNAL_ALERT_SECRET` configurado e NÃO vazio, enviado no header
 *     dedicado `X-Internal-Secret`, comparado em tempo constante;
 *   - ausente/vazio/incorreto → 401, ANTES de criar o cliente service-role e
 *     ANTES de confiar em ip_address/request_count/blocked ou escrever;
 *   - sem fallback permissivo.
 *
 * R2-API-057 (P2) — alerta/notificação não afirmam bloqueio que não persistiu.
 *
 * Defeito fechado: o `security_alert` (e a `notification` aos admins) era
 * montado a partir do `blocked` RECEBIDO, antes de gravar em `blocked_ips`.
 * Quando o upsert em `blocked_ips` falhava, o erro só era registrado em log e
 * as duas mensagens ainda afirmavam que o IP tinha sido bloqueado — o IP
 * seguia liberado.
 *
 * Regra agora: a gravação em `blocked_ips` roda antes de montar as mensagens e
 * o único estado que autoriza o texto a dizer "bloqueado" é `blockedPersisted`
 * (sem erro nas escritas de blocked_ips). Falha de gravação → o alerta/notificação
 * registram o evento sem afirmar o bloqueio e marcam `blocked_persisted: false` no metadata.
 */

export interface RateLimitAlertDeps {
  /**
   * Cliente service-role usado SÓ depois da autorização (grava security_alerts,
   * blocked_ips e notifications). Injetado nos testes.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  /** Override do INTERNAL_ALERT_SECRET (facilita o teste sem tocar no env). */
  internalSecret?: string;
}

export async function handleRateLimitAlert(
  req: Request,
  deps: RateLimitAlertDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("send-rate-limit-alert");

  try {
    // ── Autorização (ANTES de cliente service-role e ANTES de confiar no corpo) ──
    const internalSecret = deps.internalSecret !== undefined
      ? deps.internalSecret
      : (Deno.env.get("INTERNAL_ALERT_SECRET") ?? "");
    const provided = req.headers.get("X-Internal-Secret") ?? "";
    // Fail-closed: segredo ausente/vazio não autoriza nada; comparação em
    // tempo constante para não vazar o prefixo comum pelo tempo de resposta.
    if (!internalSecret || !provided || !timingSafeEqual(provided, internalSecret)) {
      log.warn("Unauthorized call to send-rate-limit-alert");
      return errorResponse("Unauthorized", 401, req);
    }

    const supabaseClient = deps.supabase ?? createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY")
    );

    const parsed = parseBody(RateLimitAlertSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { ip_address, endpoint, request_count, blocked } = parsed.data;

    // ── R2-API-057: só afirmamos bloqueio quando ele de fato persistiu ──
    // A gravação em `blocked_ips` roda ANTES de montar o alerta e a notificação.
    // `blockedPersisted` é o único estado que autoriza o texto a dizer "bloqueado";
    // se o upsert falhar, o IP segue liberado e o texto não pode afirmar o contrário.
    let blockedPersisted = false;
    if (blocked) {
      const blockDuration = 15;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + blockDuration * 60 * 1000);
      const reason = `Rate limit exceeded: ${request_count} requests to ${endpoint}`;

      // R2-API-056: duas operações com semântica no banco (compare-and-swap),
      // em vez de upsert incondicional que sobrescrevia até bloqueio
      // administrativo permanente (is_permanent=true, expires_at=null).
      // (1) ON CONFLICT DO NOTHING: cria o bloqueio temporário só se o IP
      //     ainda não tem linha; nunca toca numa linha existente.
      const { error: insertError } = await supabaseClient
        .from("blocked_ips")
        .upsert({
          ip_address,
          reason,
          blocked_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          is_permanent: false,
          request_count,
          last_attempt_at: now.toISOString(),
        }, { onConflict: "ip_address", ignoreDuplicates: true });

      if (insertError) log.error("Error blocking IP", { error: insertError.message });

      // (2) Estende o prazo SÓ de linha temporária e mais curta:
      //     is_permanent=false exclui bloqueio permanente e lt nunca reduz
      //     prazo administrativo mais longo (expires_at NULL não casa lt).
      const { error: blockError } = await supabaseClient
        .from("blocked_ips")
        .update({
          expires_at: expiresAt.toISOString(),
          reason,
          request_count,
          last_attempt_at: now.toISOString(),
        })
        .eq("ip_address", ip_address)
        .eq("is_permanent", false)
        .lt("expires_at", expiresAt.toISOString());

      if (blockError) {
        log.error("Error blocking IP", { error: blockError.message });
      }
      if (!insertError && !blockError) {
        blockedPersisted = true;
      }
    }

    log.info(`Rate limit alert: IP ${ip_address} hit ${endpoint} ${request_count} times. Blocked: ${blockedPersisted}`);

    const outcome = blockedPersisted
      ? "O IP foi bloqueado."
      : blocked
        ? "Falha ao gravar o bloqueio; o IP segue liberado."
        : "Limite próximo.";

    const { error: alertError } = await supabaseClient
      .from("security_alerts")
      .insert({
        alert_type: blockedPersisted ? "rate_limit_blocked" : "rate_limit_warning",
        severity: blockedPersisted ? "high" : "medium",
        title: blockedPersisted
          ? `IP ${ip_address} bloqueado por Rate Limit`
          : `Alerta de Rate Limit para IP ${ip_address}`,
        description: `O IP ${ip_address} fez ${request_count} requisições para ${endpoint}. ${outcome}`,
        ip_address,
        metadata: { endpoint, request_count, blocked, blocked_persisted: blockedPersisted, timestamp: new Date().toISOString() },
      });

    if (alertError) {
      log.error("Error creating alert", { error: alertError.message });
      throw alertError;
    }

    const { data: admins } = await supabaseClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (admins && admins.length > 0) {
      const notifications = admins.map((admin: { user_id: string }) => ({
        user_id: admin.user_id,
        type: "security",
        title: blockedPersisted ? "IP Bloqueado" : "Alerta de Rate Limit",
        message: `IP ${ip_address} - ${request_count} requisições para ${endpoint}`,
        metadata: { ip_address, endpoint, request_count, blocked, blocked_persisted: blockedPersisted },
      }));

      await supabaseClient.from("notifications").insert(notifications);
    }

    log.done(200);
    return jsonResponse({ success: true, message: "Alert processed" }, 200, req);
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : "Internal error", 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleRateLimitAlert(req));
}
