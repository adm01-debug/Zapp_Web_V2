import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  handleCors,
  errorResponse,
  jsonResponse,
  requireEnv,
  Logger,
  checkRateLimit,
  getClientIP,
  internalErrorResponse,
} from "../_shared/validation.ts";
import { z } from "https://esm.sh/zod@3.23.8";
import { parseBody, validationErrorResponse } from "../_shared/schemas.ts";

// R2-AUTH-004 (item 6): endpoint único de mutação para revogação de sessões Auth.
// Contrato POST: { scope: "global" | "local" | "others", target_user_id?, target_session_id? }.
// - global de terceiro exige papel admin validado no servidor (is_admin_or_supervisor).
// - local/others só atuam nas sessões do próprio usuário autenticado (a primitiva SQL
//   reforça o self-only via p_actor_user_id, então mesmo um bug aqui não escapa).
// A revogação real é feita pela função SQL SECURITY DEFINER revoke_auth_sessions,
// chamada pela service role; refresh/sessão Auth são removidos imediatamente e o JWT
// de acesso já emitido permanece válido somente até o exp.

const RevokeAuthSessionsSchema = z.object({
  scope: z.enum(["global", "local", "others"]),
  target_user_id: z.string().uuid().optional(),
  target_session_id: z.string().uuid().optional(),
});

export type Scope = "global" | "local" | "others";

export type RevocationPlan =
  | { ok: true; scope: Scope; actor: string | null; target: string | null; targetSession: string | null; preserve: string | null }
  | { ok: false; status: number; message: string };

/**
 * Decide a autorização e monta os argumentos da primitiva SQL, SEM tocar em rede.
 * Extraído para ser testável (a autorização é o coração do endpoint).
 * - global: alvo de terceiro exige admin; alvo próprio não exige.
 * - local: exige target_session_id; age só nas sessões do próprio ator.
 * - others: exige a sessão atual (preservada); age só nas sessões do próprio ator.
 */
export function planRevocation(
  scope: Scope,
  targetUserId: string | undefined,
  targetSessionId: string | undefined,
  callerId: string,
  currentSessionId: string | null,
  isAdmin: boolean,
): RevocationPlan {
  if (scope === "global") {
    if (targetUserId && targetUserId !== callerId && !isAdmin) {
      return { ok: false, status: 403, message: "Forbidden" };
    }
    return { ok: true, scope, actor: null, target: targetUserId ?? callerId, targetSession: null, preserve: null };
  }

  if (scope === "local") {
    if (!targetSessionId) {
      return { ok: false, status: 400, message: "target_session_id is required for local scope" };
    }
    return { ok: true, scope, actor: callerId, target: null, targetSession: targetSessionId, preserve: null };
  }

  // others
  if (!currentSessionId) {
    return { ok: false, status: 400, message: "Could not determine current session" };
  }
  return { ok: true, scope, actor: callerId, target: null, targetSession: null, preserve: currentSessionId };
}

/** Decodifica o payload (base64url) de um JWT de acesso, sem validar assinatura —
 * a assinatura já foi validada pelo getUser(). Só para extrair o claim session_id. */
export function decodeJwtClaims(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) return {};
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function handleRevokeAuthSessions(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("revoke-auth-sessions");

  try {
    if (req.method !== "POST") return errorResponse("Method not allowed", 405, req);

    const ip = getClientIP(req);
    const rl = checkRateLimit(`revoke-auth-sessions:${ip}`, 20, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401, req);

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) return errorResponse("Unauthorized", 401, req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON", 400, req);
    }
    const parsed = parseBody(RevokeAuthSessionsSchema, body);
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { scope, target_user_id, target_session_id } = parsed.data;
    const callerId = user.id;

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const claims = decodeJwtClaims(token);
    const currentSessionId = typeof claims.session_id === "string" ? claims.session_id : null;

    let isAdmin = false;
    if (scope === "global" && target_user_id && target_user_id !== callerId) {
      const { data: roleData, error: roleError } = await supabaseUser.rpc("is_admin_or_supervisor", {
        _user_id: callerId,
      });
      if (roleError) return internalErrorResponse(roleError, req);
      isAdmin = Boolean(roleData);
    }

    const plan = planRevocation(scope, target_user_id, target_session_id, callerId, currentSessionId, isAdmin);
    if (!plan.ok) return errorResponse(plan.message, plan.status, req);

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const { data: revoked, error: rpcError } = await supabaseAdmin.rpc("revoke_auth_sessions", {
      p_scope: plan.scope,
      p_actor_user_id: plan.actor,
      p_target_user_id: plan.target,
      p_target_session_id: plan.targetSession,
      p_preserve_session_id: plan.preserve,
    });

    if (rpcError) {
      log.error("revoke_auth_sessions rpc failed", { code: rpcError.code, msg: rpcError.message });
      return internalErrorResponse(rpcError, req);
    }

    const count = Array.isArray(revoked) ? revoked[0] : revoked;
    log.done(200, { scope, revoked: count });
    return jsonResponse(
      { revoked: typeof count === "number" ? count : 0, scope },
      200,
      req,
    );
  } catch (err) {
    log.error("unhandled", { err: err instanceof Error ? err.message : String(err) });
    return internalErrorResponse(err, req);
  }
}

if (import.meta.main) Deno.serve(handleRevokeAuthSessions);
