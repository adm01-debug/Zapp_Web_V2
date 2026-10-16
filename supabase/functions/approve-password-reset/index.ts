import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  handleCors,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  requireEnv,
  isAllowedOrigin,
  Logger,
  enforceRateLimit,
  getClientIP,
} from "../_shared/validation.ts";
import { ApprovePasswordResetSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

/** Endereço canônico do app — MESMA lista exata do CORS em `_shared/validation.ts`. */
const CANONICAL_APP_ORIGIN = "https://zapp-web-v2.vercel.app";
const RESET_PATH = "/reset-password";

export interface ApproveResetCallerClient {
  auth: {
    getUser: () => PromiseLike<{
      data: { user: { id: string } | null } | null;
      error: unknown;
    }>;
  };
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

export interface ApproveResetAdminClient {
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

export interface ApproveResetEmailClient {
  auth: {
    resetPasswordForEmail: (
      email: string,
      options: { redirectTo: string },
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
}

export interface ApproveResetDeps {
  env?: (name: string) => string;
  // Rate limit persistente (edge_rate_limits) em vez do contador em memoria.
  enforceRateLimit?: (key: string, maxRequests: number, windowMs: number) => PromiseLike<{ allowed: boolean }>;
  caller?: ApproveResetCallerClient;
  admin?: ApproveResetAdminClient;
  emailClient?: ApproveResetEmailClient;
}

interface ResetRequestRow {
  id: string;
  user_id: string | null;
  email: string;
  status: string;
}

type AuditResult = "approved" | "approved_email_failed" | "rejected";

/** Trilha de auditoria (service role): quem decidiu, qual solicitação e o resultado.
 *  Sem e-mail em claro — o alvo é referido por `target_user_id` (uuid). */
async function recordAudit(
  adminClient: ApproveResetAdminClient,
  input: { userId: string; requestId: string; result: AuditResult; targetUserId: string | null; ip: string },
): Promise<unknown | null> {
  const { error } = await adminClient.from("audit_logs").insert({
    user_id: input.userId,
    action: input.result === "rejected" ? "password_reset_reject" : "password_reset_approve",
    entity_type: "password_reset_request",
    entity_id: input.requestId,
    details: { result: input.result, target_user_id: input.targetUserId },
    ip_address: input.ip,
  });
  return error ?? null;
}

export async function handleApprovePasswordResetRequest(
  req: Request,
  deps: ApproveResetDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("approve-password-reset");
  const env = deps.env ?? requireEnv;
  const rateLimit = deps.enforceRateLimit ?? enforceRateLimit;

  // Pre-auth: protege a funcao de quem ainda nao se autenticou (chave por IP).
  const ip = getClientIP(req);
  const rl = await rateLimit(`approve-reset:${ip}`, 10, 60_000);
  if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      log.warn("Missing auth header");
      return errorResponse("Authorization header required", 401, req);
    }

    const supabaseUrl = env("SUPABASE_URL");
    const anonKey = env("SUPABASE_ANON_KEY");

    const supabaseUser: ApproveResetCallerClient = deps.caller ?? createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    const caller = userData?.user ?? null;
    if (userError || !caller) {
      log.warn("Invalid auth token");
      return errorResponse("Unauthorized", 401, req);
    }

    // Pos-auth: chave por USUARIO. Sem isso, um admin comprometido que troca de IP
    // passa so pelo contador por IP — e o contador em memoria zerava a cada isolate.
    const userRl = await rateLimit(`approve-reset:user:${caller.id}`, 10, 60_000);
    if (!userRl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    // Só ADMIN aprova. O fluxo redefine a senha da conta alvo (eleva privilégio);
    // supervisor NÃO pode fazer isso por esta via — era `is_admin_or_supervisor`.
    const { data: isAdmin, error: roleError } = await supabaseUser.rpc("is_admin", { _user_id: caller.id });
    if (roleError) {
      log.error("Role check failed", { error: roleError instanceof Error ? roleError.message : String(roleError) });
      return internalErrorResponse(roleError, req);
    }
    if (isAdmin !== true) {
      log.warn("Non-admin attempted password-reset decision", { callerId: caller.id });
      return errorResponse("Only admins can approve password resets", 403, req);
    }

    const parsed = parseBody(ApprovePasswordResetSchema, await req.json());
    if (!parsed.success) {
      log.warn("Invalid body", { error: parsed.error });
      return validationErrorResponse(parsed, req);
    }

    const { requestId, action, rejectionReason } = parsed.data;
    const supabaseAdmin: ApproveResetAdminClient =
      deps.admin ?? createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY"));

    log.info(`Processing ${action} for request ${requestId}`);

    const { data: resetRequest, error: fetchError } = await supabaseAdmin
      .from("password_reset_requests")
      .select("id, user_id, email, status")
      .eq("id", requestId)
      .single();

    if (fetchError || !resetRequest) return errorResponse("Reset request not found", 404, req);

    const row = resetRequest as ResetRequestRow;
    if (row.status !== "pending") return errorResponse("Request already processed", 409, req);

    // Um admin não aprova a redefinição da PRÓPRIA conta por esta via.
    if (action === "approve" && row.user_id === caller.id) {
      log.warn("Self-approval blocked", { requestId });
      return errorResponse("Você não pode aprovar a redefinição da própria conta", 403, req);
    }

    const now = new Date().toISOString();

    if (action === "reject") {
      // CAS: so troca quem ainda esta 'pending'. Se outro pedido (aprovacao
      // concorrente) ja decidiu, nenhuma linha e afetada e respondemos 409 —
      // antes, o UPDATE cego sobrescrevia a decisao do outro admin.
      const { data: rejectedRows, error: updateError } = await supabaseAdmin
        .from("password_reset_requests")
        .update({
          status: "rejected",
          reviewed_by: caller.id,
          reviewed_at: now,
          rejection_reason: rejectionReason || "Solicitação rejeitada pelo administrador",
          updated_at: now,
        })
        .eq("id", requestId)
        .eq("status", "pending")
        .select("id");

      if (updateError) {
        log.error("Reject update failed", { error: updateError.message });
        return internalErrorResponse(updateError, req);
      }
      if (!Array.isArray(rejectedRows) || rejectedRows.length === 0) {
        log.warn("Request changed state before reject", { requestId });
        return errorResponse("Request already processed", 409, req);
      }

      const auditError = await recordAudit(supabaseAdmin, {
        userId: caller.id,
        requestId,
        result: "rejected",
        targetUserId: row.user_id,
        ip,
      });
      if (auditError) {
        log.error("Audit insert failed", { error: String(auditError) });
        return internalErrorResponse(auditError, req);
      }

      log.done(200, { action: "rejected" });
      return jsonResponse({ success: true, message: "Solicitação rejeitada" }, 200, req);
    }

    // Approve: o GoTrue envia o e-mail de recuperação com o link. O LINK NUNCA sai
    // nesta resposta — antes a função devolvia `resetLink` (action_link com o token),
    // era o único caminho da V2 que entregava o token. Este é o fluxo de e-mail.
    const origin = req.headers.get("origin") ?? "";
    const appOrigin = isAllowedOrigin(origin) ? origin : CANONICAL_APP_ORIGIN;
    const redirectTo = `${appOrigin}${RESET_PATH}`;

    const mailer: ApproveResetEmailClient =
      deps.emailClient ?? createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });

    const { error: sendError } = await mailer.auth.resetPasswordForEmail(row.email, { redirectTo });
    const emailSent = !sendError;

    if (!emailSent) {
      // O e-mail NÃO saiu: a solicitação fica PENDENTE (retentável) — falha FECHADA.
      // Marcar 'approved' aqui repetiria o defeito que este cartão corrige: a tela
      // diria "aprovado / e-mail enviado" sem nada ter sido entregue.
      log.error("Reset email send failed", { requestId, error: sendError?.message });
    } else {
      // CAS: marca 'approved' so em quem ainda esta 'pending' e confere as linhas
      // afetadas. Duas aprovacoes simultaneas: a que perde recebe 409 e nao
      // reescreve reviewed_by de quem venceu.
      const { data: approvedRows, error: updateError } = await supabaseAdmin
        .from("password_reset_requests")
        .update({
          status: "approved",
          reviewed_by: caller.id,
          reviewed_at: now,
          updated_at: now,
        })
        .eq("id", requestId)
        .eq("status", "pending")
        .select("id");

      if (updateError) {
        log.error("Approve update failed", { error: updateError.message });
        return internalErrorResponse(updateError, req);
      }
      if (!Array.isArray(approvedRows) || approvedRows.length === 0) {
        log.warn("Request changed state before approve", { requestId });
        return errorResponse("Request already processed", 409, req);
      }
    }

    const auditError = await recordAudit(supabaseAdmin, {
      userId: caller.id,
      requestId,
      result: emailSent ? "approved" : "approved_email_failed",
      targetUserId: row.user_id,
      ip,
    });
    if (auditError) {
      log.error("Audit insert failed", { error: String(auditError) });
      return internalErrorResponse(auditError, req);
    }

    if (!emailSent) {
      log.done(502, { action: "approved_email_failed" });
      return jsonResponse(
        { success: false, emailSent: false, status: "approved_email_failed" },
        502,
        req,
      );
    }

    log.done(200, { action: "approved", emailSent: true });
    return jsonResponse({ success: true, emailSent: true, status: "approved" }, 200, req);
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : "Internal error", 500, req);
  }
}

if (import.meta.main) Deno.serve((req) => handleApprovePasswordResetRequest(req));
