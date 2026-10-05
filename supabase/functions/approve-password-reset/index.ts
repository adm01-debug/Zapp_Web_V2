import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  handleCors,
  errorResponse,
  jsonResponse,
  internalErrorResponse,
  requireEnv,
  Logger,
  checkRateLimit,
  getClientIP,
} from "../_shared/validation.ts";
import { ApprovePasswordResetSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

// R2-AUTH-007 (item 73): generateLink montava o link sem enviar e-mail nenhum, o
// resetLink ia no corpo e a UI descartava a resposta anunciando "e-mail enviado".
// O envio real e resetPasswordForEmail (transporte GoTrue); delivery_status so vira
// 'sent' DEPOIS de o transporte aceitar. A decisao e um claim atomico (uma unica
// escrita guardada por status='pending'): dois revisores nao decidem o mesmo pedido.
// Padrao: claim atomico -> efeito externo -> registro, cada update guardado pelo
// estado que consome (queued -> sent/failed). Nao vira RPC porque o envio e efeito
// externo e nao pode ficar dentro de uma transacao de banco.

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface ApprovePasswordResetDeps {
  supabaseUser?: SupabaseLike;
  supabaseAdmin?: SupabaseLike;
}

export async function handleApprovePasswordReset(
  req: Request,
  deps: ApprovePasswordResetDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("approve-password-reset");

  try {
    const ip = getClientIP(req);
    const rl = checkRateLimit(`approve-reset:${ip}`, 10, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Authorization header required", 401, req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseUser = deps.supabaseUser ?? createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = deps.supabaseAdmin ?? createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) return errorResponse("Unauthorized", 401, req);

    const { data: isAdmin, error: roleError } = await supabaseUser.rpc("is_admin_or_supervisor", { _user_id: user.id });
    if (roleError) return internalErrorResponse(roleError, req);
    if (!isAdmin) return errorResponse("Only admins can approve password resets", 403, req);

    const parsed = parseBody(ApprovePasswordResetSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { requestId, action, rejectionReason } = parsed.data;
    log.info(`Processing ${action} for request ${requestId}`);

    const now = new Date().toISOString();

    if (action === "reject") {
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from("password_reset_requests")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: now,
          rejection_reason: rejectionReason || "Solicitação rejeitada pelo administrador",
          updated_at: now,
        })
        .eq("id", requestId)
        .eq("status", "pending")
        .select("id");

      if (claimError) return internalErrorResponse(claimError, req);
      if (!claimed || claimed.length === 0) return errorResponse("Request already processed", 409, req);

      log.done(200, { action: "rejected" });
      return jsonResponse({ success: true, message: "Solicitação rejeitada" }, 200, req);
    }

    // approve | resend — claim atomico: UMA escrita condicionada ao estado que ela
    // consome. approve exige pending; resend exige approved + entrega failed.
    const { data: claimed, error: claimError } = action === "approve"
      ? await supabaseAdmin
        .from("password_reset_requests")
        .update({
          status: "approved",
          delivery_status: "queued",
          delivery_error: null,
          reviewed_by: user.id,
          reviewed_at: now,
          updated_at: now,
        })
        .eq("id", requestId)
        .eq("status", "pending")
        .select("id, email")
      : await supabaseAdmin
        .from("password_reset_requests")
        .update({
          delivery_status: "queued",
          delivery_error: null,
          updated_at: now,
        })
        .eq("id", requestId)
        .eq("status", "approved")
        .eq("delivery_status", "failed")
        .select("id, email");

    if (claimError) return internalErrorResponse(claimError, req);
    if (!claimed || claimed.length === 0) return errorResponse("Request already processed", 409, req);

    // Envio real pelo transporte GoTrue. generateLink NAO envia — nunca usar aqui.
    const redirectTo = `${req.headers.get("origin") || supabaseUrl}/reset-password`;
    const { error: sendError } = await supabaseAdmin.auth.resetPasswordForEmail(claimed[0].email, { redirectTo });

    if (sendError) {
      log.error("Recovery email send refused", { error: sendError.message });
      const { error: markError } = await supabaseAdmin
        .from("password_reset_requests")
        .update({
          delivery_status: "failed",
          delivery_error: String(sendError.message || "send refused").slice(0, 200),
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("delivery_status", "queued");
      if (markError) return internalErrorResponse(markError, req);

      log.done(502, { action, delivery: "failed" });
      return jsonResponse(
        { success: false, delivery: "failed", message: "Falha ao enviar o e-mail de recuperação" },
        502,
        req,
      );
    }

    const deliveredAt = new Date().toISOString();
    const { error: markError } = await supabaseAdmin
      .from("password_reset_requests")
      .update({
        delivery_status: "sent",
        delivered_at: deliveredAt,
        delivery_error: null,
        updated_at: deliveredAt,
      })
      .eq("id", requestId)
      .eq("delivery_status", "queued");
    if (markError) return internalErrorResponse(markError, req);

    log.done(200, { action, delivery: "sent" });
    return jsonResponse(
      { success: true, delivery: "sent", message: "Solicitação aprovada; e-mail de recuperação enviado" },
      200,
      req,
    );
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return internalErrorResponse(error, req);
  }
}

if (import.meta.main) Deno.serve((req) => handleApprovePasswordReset(req));
