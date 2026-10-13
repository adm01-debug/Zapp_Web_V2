import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, internalErrorResponse } from "../_shared/validation.ts";
import { ScheduledReportSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { EMAIL_FONT_STACK } from "../_shared/email-font-stack.ts";
import { timingSafeEqual } from "../_shared/hmac-validation.ts";

/**
 * R2-API-022 (P1) — gate de autorização do send-scheduled-report.
 *
 * Antes desta correção a função criava o cliente service-role na primeira linha
 * e lia/despachava o relatório sem verificar quem chamava: qualquer identidade
 * admitida pelo gateway obtinha `reportData` (agregados de terceiros) e podia
 * disparar o relatório.
 *
 * Regra agora (fixada na decomposição do achado):
 *   - preflight CORS continua livre;
 *   - autorização acontece ANTES de parsear `reportId` e ANTES de criar/usar o
 *     cliente service-role;
 *   - execução automática exige `CRON_SECRET` não vazio, enviado no header
 *     dedicado `x-cron-secret`, comparado em tempo constante;
 *   - execução manual exige JWT válido cujo usuário seja admin/supervisor pela
 *     RPC canônica `is_admin_or_supervisor` (mesma do migrate-media-storage);
 *   - falha fechada quando a credencial interna está ausente/vazia ou quando a
 *     RPC de papel falha.
 */

export interface ScheduledReportDeps {
  /**
   * Cliente de escopo usuário (anon key) usado SÓ no gate manual de autorização:
   * `auth.getUser` (valida o JWT) + `rpc("is_admin_or_supervisor")`. Injetado
   * nos testes para não depender de rede nem de env.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authClient?: any;
  /**
   * Cliente service-role usado SÓ depois da autorização (lookup do relatório,
   * envio e avanço do agendamento). Injetado nos testes.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  /** Override do CRON_SECRET (facilita o teste sem tocar no env do processo). */
  cronSecret?: string;
  /**
   * Override da lista de domínios confiáveis (facilita o teste sem tocar no env
   * do processo). Sem ele vale `TRUSTED_EMAIL_DOMAINS` e, na ausência desta, o
   * domínio da empresa. Nunca é uma lista vazia = "permite todos": o default é
   * fechado.
   */
  trustedDomains?: readonly string[];
}

/**
 * PD-23 / DD5 (docs 04–16): o relatório agendado só pode sair para o domínio da
 * empresa. Antes desta correção o handler mandava para qualquer string em
 * `recipients`, deixando dado do sistema vazar para fora.
 *
 * Mesma regra e MESMO default do allowlist de signup (GUC
 * `app.settings.trusted_domains`, migration 20260925140000, default
 * `promobrindes.com.br`, lista separada por vírgula, match exato de domínio e
 * falha fechada). PostgREST/Edge não leem GUC de banco e o cartão restringe os
 * arquivos a esta função (sem migration para expor a GUC por RPC), então a Edge
 * espelha a mesma convenção pelo env `TRUSTED_EMAIL_DOMAINS` — sem ela, vale o
 * domínio da empresa.
 */
const DEFAULT_TRUSTED_EMAIL_DOMAINS = "promobrindes.com.br";

/** Limite de destinatários por relatório: acima disso nada é enviado. */
const MAX_RECIPIENTS_PER_REPORT = 20;

/** Normaliza a lista de domínios: vírgula, trim, minúsculas, `@` inicial fora. */
export function resolveTrustedDomains(raw: string | null | undefined): string[] {
  const source = (raw ?? "").trim();
  const list = source === "" ? DEFAULT_TRUSTED_EMAIL_DOMAINS : source;
  return list
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter((domain) => domain.length > 0);
}

/** E-mail sintaticamente válido (um único `@`, parte local e domínio não vazios). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Destinatário aceito só quando é e-mail válido E o domínio é exatamente um da
 * lista confiável (mesma checagem do trigger de signup). Tudo o que não passa é
 * recusado.
 */
export function isTrustedRecipient(recipient: unknown, trustedDomains: readonly string[]): boolean {
  if (typeof recipient !== "string") return false;
  const value = recipient.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(value)) return false;
  const domain = value.split("@")[1] ?? "";
  return trustedDomains.includes(domain);
}

export async function handleScheduledReport(
  req: Request,
  deps: ScheduledReportDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("send-scheduled-report");

  try {
    // ── Autorização (ANTES de cliente service-role e ANTES de parsear o corpo) ──
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

    // ── Autorizado: cria cliente service-role e processa o relatório ──
    const supabase = deps.supabase ?? createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const trustedDomains = deps.trustedDomains
      ?? resolveTrustedDomains(Deno.env.get("TRUSTED_EMAIL_DOMAINS"));

    let rawBody: unknown = null;
    try {
      rawBody = await req.json();
    } catch {
      rawBody = null;
    }

    // PE-102 (modo lote): quem tem o `x-cron-secret` — o agendador do pg_cron —
    // chama sem `reportId` e pede o lote dos vencidos (corpo `{}` ou
    // `{ limit, dryRun }`). A chamada manual (front/admin) continua entrando pelo
    // caminho de relatório único: qualquer corpo com `reportId` é single, e sem o
    // segredo do cron o corpo é validado pelo schema de sempre (422 se inválido).
    if (isCron && !hasReportId(rawBody)) {
      return await handleBatch(req, supabase, rawBody, { resendApiKey, trustedDomains, log });
    }

    const parsed = parseBody(ScheduledReportSchema, rawBody);
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { reportId } = parsed.data;

    const { data: report, error: reportError } = await supabase
      .from("scheduled_reports")
      .select("*")
      .eq("id", reportId)
      .single();

    if (reportError || !report) {
      return errorResponse("Report not found", 404, req);
    }

    let reportData: Record<string, unknown> = {};
    const now = new Date();

    reportData = await buildReportData(supabase, report);

    const emailHtml = buildReportEmail(reportData);

    // R2-API-023 (P2): falha total não confirma o ciclo; parcial confirma o
    // ciclo com status próprio, para não reenviar a quem já recebeu no próximo
    // cron. A resposta registra só os destinatários recusados.
    //
    // PD-23 / DD5: antes de enviar, cada destinatário precisa ser e-mail válido
    // E de domínio confiável; os demais são RECUSADOS. A recusa é registrada só
    // em CONTAGEM (nunca o endereço, que é dado pessoal) no log e na resposta.
    // (A lista confiável foi resolvida no topo do handler e vale para single/lote.)
    const declaredRecipients: string[] = Array.isArray(report.recipients) ? report.recipients : [];

    // Limite por relatório: acima dele NADA é enviado (falha fechada).
    if (declaredRecipients.length > MAX_RECIPIENTS_PER_REPORT) {
      log.error("Relatório acima do limite de destinatários", {
        reportId,
        total: declaredRecipients.length,
        limit: MAX_RECIPIENTS_PER_REPORT,
      });
      log.done(422, { total: declaredRecipients.length, limit: MAX_RECIPIENTS_PER_REPORT });
      return jsonResponse({
        success: false,
        status: "failed",
        delivered: 0,
        failed: 0,
        total: declaredRecipients.length,
        rejected: 0,
        last_sent_advanced: false,
        error: "Relatório acima do limite de destinatários",
      }, 422, req);
    }

    const recipients = declaredRecipients.filter((recipient) => isTrustedRecipient(recipient, trustedDomains));
    const rejected = declaredRecipients.length - recipients.length;
    if (rejected > 0) {
      log.error("Destinatários recusados por domínio não confiável", {
        reportId,
        rejected,
        total: declaredRecipients.length,
      });
    }

    // Havia destinatários, mas nenhum é permitido: não há o que enviar. Não
    // avança o ciclo (nada saiu) para que a configuração seja corrigida.
    if (declaredRecipients.length > 0 && recipients.length === 0) {
      log.done(422, { rejected, total: declaredRecipients.length });
      return jsonResponse({
        success: false,
        status: "failed",
        delivered: 0,
        failed: 0,
        total: declaredRecipients.length,
        rejected,
        last_sent_advanced: false,
        error: "Nenhum destinatário permitido (domínio não confiável)",
      }, 422, req);
    }

    const delivered: string[] = [];
    const failed: string[] = [];
    const missingApiKey = recipients.length > 0 && !resendApiKey;

    if (missingApiKey) {
      log.error("Resend not configured: report not sent", { reportId, recipients: recipients.length });
    } else {
      for (const recipient of recipients) {
        // Sem log do endereço: destinatário é dado pessoal; o log diz só que houve falha.
        const ok = await sendReportEmail(resendApiKey, recipient, reportData, emailHtml);
        if (ok) {
          delivered.push(recipient);
        } else {
          failed.push(recipient);
          log.error("Falha no envio para destinatário do relatório agendado", { reportId });
        }
      }
    }

    const total = recipients.length;
    const deliveryStatus = delivered.length === total ? "sent" : delivered.length > 0 ? "partial" : "failed";

    if (deliveryStatus === "failed") {
      const httpStatus = missingApiKey ? 503 : 502;
      log.done(httpStatus, { deliveryStatus, delivered: delivered.length, failed: failed.length, total });
      return jsonResponse({
        success: false,
        status: deliveryStatus,
        delivered: delivered.length,
        failed: failed.length,
        total,
        rejected,
        failed_recipients: failed,
        last_sent_advanced: false,
        error: missingApiKey
          ? "Provedor de e-mail não configurado"
          : "Falha no envio para todos os destinatários",
      }, httpStatus, req);
    }

    const nextSendAt = calculateNextSend(report.frequency);
    const { data: updatedRows, error: scheduleError } = await supabase
      .from("scheduled_reports")
      .update({ last_sent_at: now.toISOString(), next_send_at: nextSendAt })
      .eq("id", reportId)
      .select("id");

    // R2-API-023: sem o UPDATE confirmado — erro OU zero linhas afetadas, que o
    // PostgREST devolve sem erro — o ciclo não está registrado; responder sucesso
    // aqui esconderia o envio e o próximo ciclo poderia repetir o lote.
    if (scheduleError || !Array.isArray(updatedRows) || updatedRows.length === 0) {
      log.error("Failed to advance scheduled report", {
        error: scheduleError ? (scheduleError as Error).message : "no rows updated",
      });
      log.done(500, { deliveryStatus, delivered: delivered.length, failed: failed.length, total });
      return jsonResponse({
        success: false,
        status: deliveryStatus,
        delivered: delivered.length,
        failed: failed.length,
        total,
        rejected,
        failed_recipients: failed,
        last_sent_advanced: false,
        error: "Falha ao registrar o envio do relatório",
      }, 500, req);
    }

    if (deliveryStatus === "partial") {
      log.done(207, { deliveryStatus, delivered: delivered.length, failed: failed.length, total });
      return jsonResponse({
        success: false,
        status: "partial",
        delivered: delivered.length,
        failed: failed.length,
        total,
        rejected,
        failed_recipients: failed,
        last_sent_advanced: true,
        error: "Falha no envio para um ou mais destinatários",
      }, 207, req);
    }

    log.done(200, { delivered: delivered.length, total });
    return jsonResponse({
      success: true,
      status: "sent",
      delivered: delivered.length,
      failed: 0,
      total,
      rejected,
      last_sent_advanced: true,
      reportData,
    }, 200, req);
  } catch (error) {
    log.error("Error sending report", { error: (error as Error).message });
    return internalErrorResponse(error, req);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PE-102 — modo lote do agendador (chamado pelo pg_cron via x-cron-secret).
//
// O cron manda `{}` (ou `{ limit, dryRun }`) e a função reivindica os
// `scheduled_reports` vencidos pela RPC `claim_due_scheduled_reports` (FOR UPDATE
// SKIP LOCKED, que já avança `next_send_at` no mesmo passo, ancorado no próprio
// vencimento — sem duplicar envio entre ticks). Cada relatório reivindicado é
// enviado só aos destinatários de domínio confiável (PD-23) e o resultado é
// registrado POR relatório:
//   - enviado/parcial → grava `last_sent_at` (o `next_send_at` já foi avançado
//     pela RPC; NÃO recalcula aqui para não pular um período inteiro);
//   - falha total (provedor fora, acima do limite ou nenhum destinatário
//     permitido) → devolve `next_send_at = now()` para a próxima rodada tentar de
//     novo: nada saiu, então o ciclo não pode ser confirmado.
// `dryRun: true` NÃO reivindica (reivindicar é escrita): lista os vencidos por
// SELECT e diz o que sairia, sem enviar e sem gravar nada.
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_DEFAULT_LIMIT = 50;

interface BatchContext {
  resendApiKey: string | undefined;
  trustedDomains: readonly string[];
  log: Logger;
}

interface BatchReportResult {
  id: string;
  name: string;
  status: "sent" | "partial" | "failed";
  delivered: number;
  failed: number;
  total: number;
  rejected: number;
  recorded?: boolean;
  error?: string;
}

/** Corpo com `reportId` é a chamada manual de relatório único (não é lote). */
function hasReportId(body: unknown): boolean {
  return Boolean(body && typeof body === "object" && "reportId" in (body as Record<string, unknown>));
}

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}

async function handleBatch(
  req: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rawBody: unknown,
  ctx: BatchContext,
): Promise<Response> {
  const body = asRecord(rawBody);

  let limit = BATCH_DEFAULT_LIMIT;
  if (body.limit !== undefined) {
    if (typeof body.limit !== "number" || !Number.isInteger(body.limit) || body.limit < 1 || body.limit > 200) {
      return validationErrorResponse(
        { issues: [{ path: "limit", message: "limit deve ser um inteiro entre 1 e 200", code: "custom" }] },
        req,
      );
    }
    limit = body.limit;
  }

  let dryRun = false;
  if (body.dryRun !== undefined) {
    if (typeof body.dryRun !== "boolean") {
      return validationErrorResponse(
        { issues: [{ path: "dryRun", message: "dryRun deve ser booleano", code: "custom" }] },
        req,
      );
    }
    dryRun = body.dryRun;
  }

  if (dryRun) return await runBatchDryRun(req, supabase, limit, ctx);

  const { data: claimed, error: claimError } = await supabase.rpc("claim_due_scheduled_reports", { p_limit: limit });
  if (claimError) {
    ctx.log.error("Falha ao reivindicar relatórios vencidos", { error: claimError.message ?? String(claimError) });
    return errorResponse("Falha ao reivindicar relatórios vencidos", 500, req);
  }
  const rows: Array<Record<string, unknown>> = Array.isArray(claimed) ? claimed : [];

  const results: BatchReportResult[] = [];
  for (const row of rows) {
    results.push(await processClaimedReport(supabase, row, ctx));
  }

  const sent = results.filter((r) => r.status === "sent").length;
  const partial = results.filter((r) => r.status === "partial").length;
  const failed = results.filter((r) => r.status === "failed").length;

  ctx.log.done(200, { mode: "batch", dryRun: false, claimed: rows.length, sent, partial, failed });
  return jsonResponse({
    success: failed === 0,
    mode: "batch",
    dryRun: false,
    limit,
    claimed: rows.length,
    sent,
    partial,
    failed,
    results,
  }, 200, req);
}

/** dryRun: só leitura — lista o que a próxima rodada enviaria, sem efeito. */
async function runBatchDryRun(
  req: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  limit: number,
  ctx: BatchContext,
): Promise<Response> {
  const { data: due, error } = await supabase
    .from("scheduled_reports")
    .select("id, name, report_type, frequency, recipients, next_send_at")
    .eq("is_active", true)
    .lte("next_send_at", new Date().toISOString())
    .order("next_send_at", { ascending: true })
    .limit(limit);

  if (error) {
    ctx.log.error("Falha ao listar relatórios vencidos (dryRun)", { error: error.message ?? String(error) });
    return errorResponse("Falha ao listar relatórios vencidos", 500, req);
  }

  const rows: Array<Record<string, unknown>> = Array.isArray(due) ? due : [];
  const results = rows.map((row) => {
    const declared: string[] = Array.isArray(row.recipients) ? row.recipients : [];
    const allowed = declared.filter((recipient) => isTrustedRecipient(recipient, ctx.trustedDomains));
    const wouldFail = declared.length > MAX_RECIPIENTS_PER_REPORT || (declared.length > 0 && allowed.length === 0);
    return {
      id: String(row.id),
      name: typeof row.name === "string" ? row.name : "",
      status: wouldFail ? "would_fail" : "would_send",
      total: allowed.length,
      rejected: declared.length - allowed.length,
    };
  });

  ctx.log.done(200, { mode: "batch", dryRun: true, due: results.length });
  return jsonResponse({ success: true, mode: "batch", dryRun: true, limit, claimed: results.length, results }, 200, req);
}

/** Processa um relatório reivindicado pela RPC: envia, registra e reagenda na falha. */
async function processClaimedReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  row: Record<string, unknown>,
  ctx: BatchContext,
): Promise<BatchReportResult> {
  const reportId = String(row.id);
  const name = typeof row.name === "string" ? row.name : "";
  const declared: string[] = Array.isArray(row.recipients) ? row.recipients : [];

  // Acima do limite: NADA é enviado (falha fechada) e o ciclo volta a vencer.
  if (declared.length > MAX_RECIPIENTS_PER_REPORT) {
    ctx.log.error("Relatório acima do limite de destinatários", {
      reportId,
      total: declared.length,
      limit: MAX_RECIPIENTS_PER_REPORT,
    });
    await rescheduleForRetry(supabase, reportId, ctx.log, "acima do limite de destinatários");
    return {
      id: reportId, name, status: "failed", delivered: 0, failed: 0, total: 0, rejected: 0,
      error: "Relatório acima do limite de destinatários",
    };
  }

  const allowed = declared.filter((recipient) => isTrustedRecipient(recipient, ctx.trustedDomains));
  const rejected = declared.length - allowed.length;
  if (rejected > 0) {
    ctx.log.error("Destinatários recusados por domínio não confiável", { reportId, rejected, total: declared.length });
  }

  // Havia destinatários, mas nenhum é permitido: não há o que enviar; deixa o
  // ciclo vencer de novo para a configuração ser corrigida.
  if (declared.length > 0 && allowed.length === 0) {
    await rescheduleForRetry(supabase, reportId, ctx.log, "nenhum destinatário permitido");
    return {
      id: reportId, name, status: "failed", delivered: 0, failed: 0, total: 0, rejected,
      error: "Nenhum destinatário permitido (domínio não confiável)",
    };
  }

  const reportData = await buildReportData(supabase, row);
  const emailHtml = buildReportEmail(reportData);

  let delivered = 0;
  if (allowed.length > 0 && !ctx.resendApiKey) {
    ctx.log.error("Resend not configured: report not sent", { reportId, recipients: allowed.length });
  } else {
    for (const recipient of allowed) {
      const ok = await sendReportEmail(ctx.resendApiKey, recipient, reportData, emailHtml);
      if (ok) delivered++;
      else ctx.log.error("Falha no envio para destinatário do relatório agendado", { reportId });
    }
  }

  const total = allowed.length;
  const failedCount = total - delivered;
  const status: BatchReportResult["status"] = delivered === total ? "sent" : delivered > 0 ? "partial" : "failed";

  if (status === "failed") {
    await rescheduleForRetry(supabase, reportId, ctx.log, "falha total de envio");
    return {
      id: reportId, name, status, delivered, failed: failedCount, total, rejected,
      error: "Falha no envio para todos os destinatários",
    };
  }

  // Enviado/parcial: o `next_send_at` já foi avançado pela RPC; aqui só se
  // confirma o ciclo com `last_sent_at`.
  const recorded = await recordSentAt(supabase, reportId, ctx.log);
  return { id: reportId, name, status, delivered, failed: failedCount, total, rejected, recorded };
}

/**
 * Falha total: nada saiu, então o ciclo não foi cumprido. Devolve `next_send_at`
 * para agora para a próxima rodada do cron tentar de novo, em vez de esperar um
 * período inteiro (daily/weekly/monthly).
 */
async function rescheduleForRetry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  reportId: string,
  log: Logger,
  reason: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("scheduled_reports")
    .update({ next_send_at: new Date().toISOString() })
    .eq("id", reportId)
    .select("id");
  if (error || !Array.isArray(data) || data.length === 0) {
    log.error("Falha ao reagendar o relatório para nova tentativa", {
      reportId,
      reason,
      error: error ? (error as Error).message : "no rows updated",
    });
  }
}

/** Confirma o ciclo gravando `last_sent_at`; devolve false se o UPDATE não pegou. */
async function recordSentAt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  reportId: string,
  log: Logger,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("scheduled_reports")
    .update({ last_sent_at: new Date().toISOString() })
    .eq("id", reportId)
    .select("id");
  if (error || !Array.isArray(data) || data.length === 0) {
    log.error("Falha ao registrar o envio do relatório agendado", {
      reportId,
      error: error ? (error as Error).message : "no rows updated",
    });
    return false;
  }
  return true;
}

/**
 * Monta o `reportData` de um relatório por `report_type`. Fonte única usada tanto
 * pela chamada manual de relatório único quanto pelo modo lote do cron.
 */
async function buildReportData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  report: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const period = `${weekAgo.toLocaleDateString("pt-BR")} - ${now.toLocaleDateString("pt-BR")}`;

  switch (report.report_type) {
    case "dashboard_summary": {
      const { data: messages } = await supabase.from("messages").select("id, sender, created_at, is_read").gte("created_at", weekAgo.toISOString());
      const { data: contacts } = await supabase.from("contacts").select("id").gte("created_at", weekAgo.toISOString());
      return {
        title: "Resumo do Dashboard",
        period,
        totalMessages: messages?.length || 0,
        messagesReceived: messages?.filter((m: { sender: string }) => m.sender === "contact").length || 0,
        messagesSent: messages?.filter((m: { sender: string }) => m.sender === "agent").length || 0,
        newContacts: contacts?.length || 0,
      };
    }
    case "agent_performance": {
      const { data: agents } = await supabase.from("agent_stats").select("*, profiles(name, email)").order("xp", { ascending: false });
      return {
        title: "Performance de Agentes",
        period,
        agents: (agents || []).map((a: Record<string, unknown>) => ({
          name: (a.profiles as Record<string, unknown>)?.name || "N/A",
          messagesHandled: (a.messages_sent as number) + (a.messages_received as number),
          resolved: a.conversations_resolved, avgResponseTime: a.avg_response_time_seconds,
          satisfaction: a.customer_satisfaction_score, level: a.level, xp: a.xp,
        })),
      };
    }
    case "conversation_analytics": {
      const { data: analyses } = await supabase.from("conversation_analyses").select("*").gte("created_at", weekAgo.toISOString());
      return {
        title: "Análise de Conversas",
        period,
        totalAnalyses: analyses?.length || 0,
        avgSentiment: analyses?.length ? Math.round(analyses.reduce((sum: number, a: Record<string, unknown>) => sum + ((a.sentiment_score as number) || 50), 0) / analyses.length) : 0,
        avgSatisfaction: analyses?.length ? (analyses.reduce((sum: number, a: Record<string, unknown>) => sum + ((a.customer_satisfaction as number) || 3), 0) / analyses.length).toFixed(1) : "N/A",
      };
    }
    case "sla_compliance": {
      const { data: sla } = await supabase.from("conversation_sla").select("*").gte("created_at", weekAgo.toISOString());
      // Mesma regra de elegibilidade do SLA de 1ª resposta do painel
      // (src/hooks/sla/slaFirstResponse.ts): AVALIADA = conversa com desfecho
      // (violada ou respondida no prazo); PENDENTE = sem desfecho, fora do
      // numerador E do denominador; a violação manda sobre o carimbo. Sem
      // nenhuma avaliada NÃO existe taxa (nunca 100%).
      const tally = tallyFirstResponse(sla || []);
      return {
        title: "Cumprimento de SLA",
        period,
        evaluatedConversations: tally.evaluated,
        onTimeResponses: tally.onTime,
        responseBreaches: tally.breached,
        pendingResponses: tally.pending,
        responseComplianceRate: tally.evaluated > 0
          ? `${Math.round((tally.onTime / tally.evaluated) * 100)}%`
          : "N/A",
      };
    }
    default:
      return {};
  }
}

/** POST único ao Resend; devolve se o provedor aceitou. Sem chave, não envia. */
async function sendReportEmail(
  apiKey: string | undefined,
  recipient: string,
  reportData: Record<string, unknown>,
  emailHtml: string,
): Promise<boolean> {
  if (!apiKey) return false;
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "ZAPP Relatórios <relatorios@promobrindes.com.br>", to: recipient,
      subject: `📊 ${reportData.title} - ${reportData.period}`, html: emailHtml,
    }),
  });
  return emailResponse.ok;
}

if (import.meta.main) {
  Deno.serve((req) => handleScheduledReport(req));
}

/**
 * Elegibilidade ÚNICA do SLA de 1ª resposta, espelhando
 * `src/hooks/sla/slaFirstResponse.ts` (R2-SLA-001 / #458): a violação manda sobre o
 * carimbo; sem violação, o carimbo da resposta = no prazo; sem nenhum dos dois =
 * pendente, fora do numerador E do denominador. O painel e o histórico usam a mesma
 * regra; o relatório agendado passa a usá-la também.
 */
function tallyFirstResponse(
  rows: Array<Record<string, unknown>>,
): { evaluated: number; onTime: number; breached: number; pending: number } {
  const tally = { evaluated: 0, onTime: 0, breached: 0, pending: 0 };
  for (const row of rows) {
    if (row.first_response_breached) {
      tally.breached++;
      tally.evaluated++;
    } else if (row.first_response_at) {
      tally.onTime++;
      tally.evaluated++;
    } else {
      tally.pending++;
    }
  }
  return tally;
}

function calculateNextSend(frequency: string): string {
  const next = new Date();
  switch (frequency) {
    case "daily": next.setDate(next.getDate() + 1); next.setHours(8, 0, 0, 0); break;
    case "weekly": next.setDate(next.getDate() + ((1 + 7 - next.getDay()) % 7 || 7)); next.setHours(8, 0, 0, 0); break;
    case "monthly": next.setMonth(next.getMonth() + 1, 1); next.setHours(8, 0, 0, 0); break;
  }
  return next.toISOString();
}

function buildReportEmail(data: Record<string, unknown>): string {
  const rows = Object.entries(data)
    .filter(([key]) => key !== "title" && key !== "period" && key !== "agents")
    .map(([key, value]) =>
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;color:#333;">${formatKey(key)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">${value}</td></tr>`
    ).join("");

  let agentsTable = "";
  if (data.agents && Array.isArray(data.agents)) {
    agentsTable = `<h3 style="margin-top:24px;color:#333;">Ranking de Agentes</h3>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <tr style="background:#f5f5f5;"><th style="padding:8px;text-align:left;">Agente</th><th style="padding:8px;text-align:center;">Mensagens</th><th style="padding:8px;text-align:center;">Resolvidas</th><th style="padding:8px;text-align:center;">Nível</th></tr>
        ${data.agents.map((a: Record<string, unknown>) => `<tr><td style="padding:8px;">${a.name}</td><td style="padding:8px;text-align:center;">${a.messagesHandled}</td><td style="padding:8px;text-align:center;">${a.resolved}</td><td style="padding:8px;text-align:center;">${a.level}</td></tr>`).join("")}
      </table>`;
  }

  return `<!DOCTYPE html><html><body style="font-family:${EMAIL_FONT_STACK};margin:0;padding:20px;background:#f9fafb;">
    <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <div style="background:linear-gradient(135deg,#25D366,#128C7E);padding:24px;color:white;"><h1 style="margin:0;font-size:20px;">📊 ${data.title}</h1><p style="margin:4px 0 0;opacity:0.9;font-size:14px;">${data.period}</p></div>
      <div style="padding:24px;"><table style="width:100%;border-collapse:collapse;">${rows}</table>${agentsTable}</div>
      <div style="padding:16px 24px;background:#f9fafb;text-align:center;font-size:12px;color:#999;">Relatório gerado automaticamente • ZAPP Web</div>
    </div></body></html>`;
}

function formatKey(key: string): string {
  const map: Record<string, string> = {
    totalMessages: "Total de Mensagens", messagesReceived: "Mensagens Recebidas", messagesSent: "Mensagens Enviadas",
    newContacts: "Novos Contatos", totalAnalyses: "Análises Realizadas", avgSentiment: "Sentimento Médio",
    avgSatisfaction: "Satisfação Média", evaluatedConversations: "Conversas Avaliadas",
    onTimeResponses: "Respostas no Prazo", pendingResponses: "Sem 1ª Resposta (pendentes)",
    responseComplianceRate: "Taxa de Resposta no Prazo",
    responseBreaches: "Violações de Resposta",
  };
  return map[key] || key;
}
