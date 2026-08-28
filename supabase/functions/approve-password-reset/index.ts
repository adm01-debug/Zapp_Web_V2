import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { ApprovePasswordResetSchema, parseBody } from "../_shared/schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("approve-password-reset");

  try {
    const ip = getClientIP(req);
    const rl = checkRateLimit(`approve-reset:${ip}`, 10, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Authorization header required", 401, req);

    const supabaseUser = createClient(supabaseUrl, requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) return errorResponse("Unauthorized", 401, req);

    const { data: isAdmin } = await supabaseUser.rpc("is_admin_or_supervisor", { _user_id: user.id });
    if (!isAdmin) return errorResponse("Only admins can approve password resets", 403, req);

    const parsed = parseBody(ApprovePasswordResetSchema, await req.json());
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    const { requestId, action, rejectionReason } = parsed.data;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    log.info(`Processing ${action} for request ${requestId}`);

    const { data: resetRequest, error: fetchError } = await supabaseAdmin
      .from("password_reset_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (fetchError || !resetRequest) return errorResponse("Reset request not found", 404, req);
    if (resetRequest.status !== "pending") return errorResponse("Request already processed", 409, req);

    if (action === "reject") {
      const { error: updateError } = await supabaseAdmin
        .from("password_reset_requests")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectionReason || "Solicitação rejeitada pelo administrador",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (updateError) throw updateError;

      log.done(200, { action: "rejected" });
      return jsonResponse({ success: true, message: "Solicitação rejeitada" }, 200, req);
    }

    // Approve: Generate password reset link
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: resetRequest.email,
      options: {
        redirectTo: `${req.headers.get("origin") || supabaseUrl}/reset-password`,
      },
    });

    if (resetError) {
      log.error("Error generating reset link", { error: resetError.message });
      throw new Error("Failed to generate reset link");
    }

    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    // Update request status
    const { error: updateError } = await supabaseAdmin
      .from("password_reset_requests")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (updateError) throw updateError;

    // Reset e coberto pelo action_link nativo do GoTrue (resetData.properties.action_link).
    // O par store_reset_token/validate_reset_token era subsistema morto - removido na migration 20260827170000.

    log.done(200, { action: "approved" });
    return jsonResponse({
      success: true,
      message: "Solicitação aprovada",
      resetLink: resetData.properties?.action_link,
    }, 200, req);
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : "Internal error", 500, req);
  }
});
