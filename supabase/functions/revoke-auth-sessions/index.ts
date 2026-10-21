import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  handleCors,
  errorResponse,
  jsonResponse,
  requireEnv,
  Logger,
  enforceRateLimit,
  getClientIP,
  internalErrorResponse,
} from "../_shared/validation.ts";
import { z } from "https://esm.sh/zod@3.23.8";
import { parseBody, validationErrorResponse } from "../_shared/schemas.ts";

// R2-AUTH-004 (item 6): endpoint único de mutação para revogação de sessões Auth.
// Contrato POST: { scope: "global" | "local" | "others", target_user_id?, target_session_id? }.
// - global de terceiro exige admin; supervisor só alcança agentes (nunca admin/supervisor),
//   resolvido por `effective_role` (matriz em decideThirdPartyRevocation).
// - local/others só atuam nas sessões do próprio usuário autenticado (a primitiva SQL
//   reforça o self-only via p_actor_user_id, então mesmo um bug aqui não escapa).
// Toda revogação bem-sucedida é auditada em audit_logs (ator, alvo, escopo, resultado),
// sem token nem IP completo.
// A revogação real é feita pela função SQL SECURITY DEFINER revoke_auth_sessions,
// chamada pela service role; refresh/sessão Auth são removidos imediatamente e o JWT
// de acesso já emitido permanece válido somente até o exp.

const RevokeAuthSessionsSchema = z.object({
  scope: z.enum(["global", "local", "others"]),
  target_user_id: z.string().uuid().optional(),
  target_session_id: z.string().uuid().optional(),
});

export type Scope = "global" | "local" | "others";

/** Seams de injecao: o teste prova o gate de rate limit e a chave por usuario sem
 *  tocar rede. `caller` substitui o client do chamador (getUser + rpc de papel). */
export interface RevokeCallerClient {
  auth: {
    getUser: () => PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
}

export interface RevokeAuthSessionsDeps {
  env?: (name: string) => string;
  enforceRateLimit?: (key: string, maxRequests: number, windowMs: number) => PromiseLike<{ allowed: boolean }>;
  caller?: RevokeCallerClient;
}

export type RevocationPlan =
  | { ok: true; scope: Scope; actor: string | null; target: string | null; targetSession: string | null; preserve: string | null }
  | { ok: false; status: number; message: string };

/**
 * Decide a autorização e monta os argumentos da primitiva SQL, SEM tocar em rede.
 * Extraído para ser testável (a autorização é o coração do endpoint).
 * - global: alvo de terceiro exige `canRevokeThirdParty` (decidido pela matriz de papéis); alvo próprio não exige.
 * - local: exige target_session_id; age só nas sessões do próprio ator.
 * - others: exige a sessão atual (preservada); age só nas sessões do próprio ator.
 */
export function planRevocation(
  scope: Scope,
  targetUserId: string | undefined,
  targetSessionId: string | undefined,
  callerId: string,
  currentSessionId: string | null,
  canRevokeThirdParty: boolean,
): RevocationPlan {
  if (scope === "global") {
    if (targetUserId && targetUserId !== callerId && !canRevokeThirdParty) {
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

/** Linha de auditoria de uma revogação bem-sucedida. Campos decididos aqui, sem rede,
 *  para poderem ser provados por teste. NUNCA carrega token/JWT/sessão em claro —
 *  o ator e o alvo são referidos por uuid. */
export interface RevocationAuditRow {
  user_id: string;
  action: "auth_sessions_revoke";
  entity_type: "auth_session";
  entity_id: string | null;
  details: { scope: Scope; target_user_id: string; revoked: number };
  ip_address: string;
}

/**
 * Monta a linha de auditoria a partir do plano já autorizado. O ator (`user_id`) é
 * SEMPRE o chamador autenticado (`callerId`), nunca o alvo — quem revogou a sessão de
 * um terceiro fica registrado como quem agiu, e o terceiro só em `details.target_user_id`.
 * `entity_id` é a sessão alvo quando conhecida (escopo local); fora disso, null.
 */
export function buildRevocationAudit(
  plan: Extract<RevocationPlan, { ok: true }>,
  callerId: string,
  revoked: number,
  ip: string,
): RevocationAuditRow {
  const targetUserId = plan.target ?? plan.actor ?? callerId;
  const entityId = plan.targetSession ?? null;
  return {
    user_id: callerId,
    action: "auth_sessions_revoke",
    entity_type: "auth_session",
    entity_id: entityId,
    details: { scope: plan.scope, target_user_id: targetUserId, revoked },
    ip_address: ip,
  };
}

/** Cliente mínimo necessário para gravar a auditoria (a service role real satisfaz). */
export interface AuditSink {
  from(table: string): {
    insert(row: unknown): PromiseLike<{ error: { message: string } | null }>;
  };
}

/**
 * Grava a auditoria pela service role (RLS bloqueia INSERT direto do usuário). Chamada
 * só APÓS a revogação ter efeito. Devolve o resultado em vez de lançar: uma falha de
 * auditoria não deve derrubar a resposta já conquistada, mas também não é engolida —
 * o chamador registra no log e informa `audited: false`.
 */
export async function recordRevocationAudit(
  sink: AuditSink,
  row: RevocationAuditRow,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await sink.from("audit_logs").insert(row);
  return error ? { ok: false, error: error.message } : { ok: true, error: null };
}

/** Papéis canônicos do app (public.app_role). Precedência: admin > supervisor > special_agent > agent. */
export type AppRole = "admin" | "supervisor" | "special_agent" | "agent";

const KNOWN_ROLES: readonly AppRole[] = ["admin", "supervisor", "special_agent", "agent"];

/** Normaliza o valor de `effective_role`/`user_roles.role`. Desconhecido -> null (fail-closed). */
export function normalizeRole(value: unknown): AppRole | null {
  if (typeof value !== "string") return null;
  return (KNOWN_ROLES as readonly string[]).includes(value) ? (value as AppRole) : null;
}

/** Papéis que um supervisor PODE atingir ao revogar a sessão de um terceiro. */
export const SUPERVISOR_MAY_TARGET: readonly AppRole[] = ["agent", "special_agent"];

export interface ThirdPartyRevocationInput {
  /** alvo é o próprio chamador? então qualquer um revoga a própria sessão. */
  isSelf: boolean;
  /** papel efetivo do chamador (null/desconhecido -> negado). */
  callerRole: AppRole | null;
  /** papel efetivo do alvo (null/desconhecido -> negado para supervisor). */
  targetRole: AppRole | null;
}

export interface ThirdPartyDecision {
  allowed: boolean;
  status: number;
  message: string;
}

/**
 * Matriz de papéis da revogação de sessões de TERCEIRO (a própria sessão nunca é barrada):
 * - admin        -> revoga a sessão de administrador, supervisor ou agente.
 * - supervisor   -> SÓ revoga a de agentes (`agent`/`special_agent`); NUNCA a de admin
 *                   nem a de outro supervisor.
 * - agent/outros -> 403 (só a própria sessão).
 * Papel desconhecido/ausente nega (fail-closed), inclusive o alvo de um supervisor.
 */
export function decideThirdPartyRevocation(input: ThirdPartyRevocationInput): ThirdPartyDecision {
  const ALLOW = { allowed: true, status: 200, message: "ok" } as const;
  const DENY = { allowed: false, status: 403, message: "Forbidden" } as const;

  if (input.isSelf) return ALLOW;
  if (input.callerRole === "admin") return ALLOW;
  if (
    input.callerRole === "supervisor" &&
    input.targetRole !== null &&
    (SUPERVISOR_MAY_TARGET as readonly string[]).includes(input.targetRole)
  ) {
    return ALLOW;
  }
  return DENY;
}

/** Cliente mínimo para resolver o papel efetivo (a service role real satisfaz). */
export interface RoleResolver {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** Resolve o papel efetivo de um usuário pela função SQL `effective_role` (service role).
 *  Erro/timeout -> null (fail-closed: sem papel confirmado, nega a revogação de terceiro). */
export async function resolveEffectiveRole(client: RoleResolver, userId: string): Promise<AppRole | null> {
  const { data, error } = await client.rpc("effective_role", { _user_id: userId });
  if (error) return null;
  return normalizeRole(data);
}

export async function handleRevokeAuthSessions(
  req: Request,
  deps: RevokeAuthSessionsDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("revoke-auth-sessions");
  const env = deps.env ?? requireEnv;
  const rateLimit = deps.enforceRateLimit ?? enforceRateLimit;

  try {
    if (req.method !== "POST") return errorResponse("Method not allowed", 405, req);

    // Pre-auth: chave por IP, contador persistente (nao zera a cada isolate).
    const ip = getClientIP(req);
    const rl = await rateLimit(`revoke-auth-sessions:${ip}`, 20, 60_000);
    if (!rl.allowed) {
      const limited = errorResponse("Rate limit exceeded", 429, req);
      limited.headers.set("Retry-After", "60");
      return limited;
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401, req);

    const supabaseUrl = env("SUPABASE_URL");
    const anonKey = env("SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseUser: RevokeCallerClient = deps.caller ?? createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) return errorResponse("Unauthorized", 401, req);

    // Pos-auth: chave por USUARIO — segura uma conta comprometida mesmo trocando de IP.
    const userRl = await rateLimit(`revoke-auth-sessions:user:${user.id}`, 20, 60_000);
    if (!userRl.allowed) {
      const limited = errorResponse("Rate limit exceeded", 429, req);
      limited.headers.set("Retry-After", "60");
      return limited;
    }

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

    // Matriz de papéis: revogar a sessão de TERCEIRO exige admin; supervisor só
    // alcança agentes (nunca admin/supervisor). O papel sai de `effective_role`
    // (mesma fonte das policies), consultado pela service role. Papel não
    // confirmado -> nega (fail-closed).
    let canRevokeThirdParty = false;
    if (scope === "global" && target_user_id && target_user_id !== callerId) {
      const [callerRole, targetRole] = await Promise.all([
        resolveEffectiveRole(supabaseAdmin, callerId),
        resolveEffectiveRole(supabaseAdmin, target_user_id),
      ]);
      canRevokeThirdParty = decideThirdPartyRevocation({ isSelf: false, callerRole, targetRole }).allowed;
      if (!canRevokeThirdParty) {
        log.warn("revogação de terceiro negada pela matriz de papéis", {
          caller_role: callerRole ?? "desconhecido",
          target_role: targetRole ?? "desconhecido",
        });
      }
    }

    const plan = planRevocation(scope, target_user_id, target_session_id, callerId, currentSessionId, canRevokeThirdParty);
    if (!plan.ok) return errorResponse(plan.message, plan.status, req);

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
    const revokedCount = typeof count === "number" ? count : 0;

    // Auditoria SÓ depois de a revogação ter efeito. Falha ao auditar não desfaz o
    // que já foi revogado: registra no log e devolve `audited: false` (nada é engolido).
    const auditRow = buildRevocationAudit(plan, callerId, revokedCount, ip);
    const audit = await recordRevocationAudit(supabaseAdmin, auditRow);
    if (!audit.ok) log.error("audit insert failed", { error: audit.error });

    log.done(200, { scope, revoked: revokedCount, audited: audit.ok });
    return jsonResponse(
      { revoked: revokedCount, scope, audited: audit.ok },
      200,
      req,
    );
  } catch (err) {
    log.error("unhandled", { err: err instanceof Error ? err.message : String(err) });
    return internalErrorResponse(err, req);
  }
}

if (import.meta.main) Deno.serve((req) => handleRevokeAuthSessions(req));
