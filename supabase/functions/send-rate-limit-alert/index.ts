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
 *
 * Deduplicação (achado de 13/10/2026, auditoria 05-features-admin).
 *
 * Defeito fechado: cada chamada criava um `security_alert` novo e um lote de
 * `notifications` para TODO admin, sem janela. Quando o RA1/PE-102 ligar a Edge,
 * a mesma rajada de um IP viraria uma notificação por chamada.
 *
 * Regra agora: alerta de rate limit ABERTO (`is_resolved = false`) do mesmo
 * `(ip_address, endpoint)` criado dentro da janela (padrão 30 min,
 * configurável) é atualizado no lugar — `request_count` e `last_seen_at` no
 * metadata — em vez de criar outro. A `notification` aos admins só sai na
 * CRIAÇÃO do alerta ou na ESCALADA de gravidade (warning/medium →
 * blocked/high), nunca na atualização de rotina.
 */

/** Janela padrão de deduplicação por (ip, endpoint), em minutos. */
export const DEDUPE_WINDOW_DEFAULT_MINUTES = 30;

export interface RateLimitAlertDeps {
  /**
   * Cliente service-role usado SÓ depois da autorização (grava security_alerts,
   * blocked_ips e notifications). Injetado nos testes.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  /** Override do INTERNAL_ALERT_SECRET (facilita o teste sem tocar no env). */
  internalSecret?: string;
  /** Janela de deduplicação (ip, endpoint) em minutos; padrão 30. */
  dedupeWindowMinutes?: number;
  /** Relógio injetável para testar janela e prazos sem esperar. */
  now?: () => Date;
}

/** 1 = alerta/aviso; 2 = bloqueio/high. Usado para detectar escalada. */
function severityRank(alertType: unknown, severity: unknown): 1 | 2 {
  if (alertType === "rate_limit_blocked" || severity === "high") return 2;
  return 1;
}

/**
 * Janela de deduplicação vinda do ambiente. Protegido: em ambiente sem
 * `--allow-env` (testes Deno) a leitura lança — devolve undefined e vale o
 * padrão de 30 min.
 */
function windowMinutesFromEnv(): number | undefined {
  try {
    const raw = Deno.env.get("RATE_LIMIT_ALERT_WINDOW_MINUTES");
    if (!raw) return undefined;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
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

    const now = deps.now ? deps.now() : new Date();

    // ── R2-API-057: só afirmamos bloqueio quando ele de fato persistiu ──
    // A gravação em `blocked_ips` roda ANTES de montar o alerta e a notificação.
    // `blockedPersisted` é o único estado que autoriza o texto a dizer "bloqueado";
    // se o upsert falhar, o IP segue liberado e o texto não pode afirmar o contrário.
    let blockedPersisted = false;
    if (blocked) {
      const blockDuration = 15;
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

    const alertType = blockedPersisted ? "rate_limit_blocked" : "rate_limit_warning";
    const severity = blockedPersisted ? "high" : "medium";
    const title = blockedPersisted
      ? `IP ${ip_address} bloqueado por Rate Limit`
      : `Alerta de Rate Limit para IP ${ip_address}`;
    const outcome = blockedPersisted
      ? "O IP foi bloqueado."
      : blocked
        ? "Falha ao gravar o bloqueio; o IP segue liberado."
        : "Limite próximo.";
    const description = `O IP ${ip_address} fez ${request_count} requisições para ${endpoint}. ${outcome}`;

    log.info(`Rate limit alert: IP ${ip_address} hit ${endpoint} ${request_count} times. Blocked: ${blockedPersisted}`);

    // ── Deduplicação por (ip, endpoint) numa janela configurável ──
    // Alerta aberto do mesmo par criado dentro da janela é ATUALIZADO no lugar.
    const configuredWindow = deps.dedupeWindowMinutes ?? windowMinutesFromEnv();
    const windowMinutes = configuredWindow && configuredWindow > 0
      ? configuredWindow
      : DEDUPE_WINDOW_DEFAULT_MINUTES;
    const windowStartIso = new Date(now.getTime() - windowMinutes * 60 * 1000).toISOString();

    // Busca por IP (sem filtrar endpoint no PostgREST — evita depender de
    // sintaxe jsonb no filtro) e casa o endpoint no metadata em memória.
    const { data: openAlerts, error: openError } = await supabaseClient
      .from("security_alerts")
      .select("id, alert_type, severity, metadata")
      .eq("ip_address", ip_address)
      .eq("is_resolved", false)
      .gte("created_at", windowStartIso)
      .order("created_at", { ascending: false })
      .limit(20);

    if (openError) log.error("Error reading open alerts", { error: openError.message });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = (openAlerts ?? []).find((row: any) => {
      const meta = row?.metadata ?? {};
      return typeof row?.alert_type === "string" &&
        row.alert_type.startsWith("rate_limit") &&
        meta.endpoint === endpoint;
    });

    // A notificação aos admins só sai na criação ou na escalada de gravidade.
    let shouldNotify = false;

    if (existing) {
      const escalating = severityRank(alertType, severity) >
        severityRank(existing.alert_type, existing.severity);
      shouldNotify = escalating;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = {
        description,
        metadata: {
          ...(existing.metadata ?? {}),
          endpoint,
          request_count,
          blocked,
          blocked_persisted: blockedPersisted,
          last_seen_at: now.toISOString(),
        },
      };
      if (escalating) {
        patch.alert_type = alertType;
        patch.severity = severity;
        patch.title = title;
      }

      const { error: updateError } = await supabaseClient
        .from("security_alerts")
        .update(patch)
        .eq("id", existing.id);
      if (updateError) {
        log.error("Error updating alert", { error: updateError.message });
        throw updateError;
      }
    } else {
      shouldNotify = true;
      const { error: alertError } = await supabaseClient
        .from("security_alerts")
        .insert({
          alert_type: alertType,
          severity,
          title,
          description,
          ip_address,
          metadata: {
            endpoint,
            request_count,
            blocked,
            blocked_persisted: blockedPersisted,
            timestamp: now.toISOString(),
            last_seen_at: now.toISOString(),
          },
        });

      if (alertError) {
        log.error("Error creating alert", { error: alertError.message });
        throw alertError;
      }
    }

    if (shouldNotify) {
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
