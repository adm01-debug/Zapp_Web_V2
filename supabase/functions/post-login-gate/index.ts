import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  handleCors,
  errorResponse,
  jsonResponse,
  requireEnv,
  Logger,
  internalErrorResponse,
} from "../_shared/validation.ts";
import {
  resolveNetworkPolicy,
  networkPolicyDenialResponse,
  type NetworkPolicyDecision,
  type NetworkPolicyRpcClient,
} from "../_shared/request-policy.ts";

// Porteiro pós-login (ADR-007): os caminhos que NÃO passam pela Edge `auth-login`
// (Google/`signInWithOAuth`, link por e-mail/OTP e o password grant direto do
// GoTrue) emitiam uma sessão sem decisão de política de rede. `requireAuth` só
// cobre as Edges; o PostgREST/RLS do app fica fora. Esta Edge é chamada logo
// depois de qualquer login fora do `auth-login` e, para o usuário JÁ AUTENTICADO:
//   1. decide a política de rede na fronteira canônica (`resolve_network_policy`);
//   2. confere `profiles.is_active` do próprio chamador;
//   3. permitido -> {allowed:true}; negado -> ENCERRA a sessão do chamador e
//      devolve a MESMA recusa genérica do login ("Access denied", 403).
//
// Indecidível (503) não revoga: não há prova de negação e revogar em indisponi-
// bilidade derrubaria sessões legítimas. O front trata qualquer resposta diferente
// de {allowed:true} como recusa e encerra a sessão local (fail-closed).
//
// Risco residual e janela do JWT estão na ADR-007. ban/banned_until fica com o
// cartão PD-03 (t_cd4627c5); aqui só a política de rede + is_active.

const NETWORK_POLICY_DEFAULT_MAX = 30;
const NETWORK_POLICY_DEFAULT_WINDOW_SECONDS = 60;

export interface AuthGetUserResult {
  data: { user: { id: string } | null };
  error: unknown;
}

/** Client service_role: RPC de política de rede e de revogação de sessão. */
export type GateAdminClient = NetworkPolicyRpcClient;

/** Leitor estrutural de `profiles.is_active` (service_role em produção). */
export interface ProfileActiveReader {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{
          data: { is_active?: boolean | null } | null;
          error: unknown;
        }>;
      };
    };
  };
}

export interface PostLoginGateDeps {
  /** Valida o bearer e devolve o usuário (injetável: o teste não toca o GoTrue). */
  getUser: (authHeader: string) => PromiseLike<AuthGetUserResult>;
  /** service_role: `resolve_network_policy` e `revoke_auth_sessions`. */
  admin: GateAdminClient;
  /** service_role: leitura de `profiles.is_active`. */
  profiles: ProfileActiveReader;
}

/** Decodifica o payload (base64url) do JWT de acesso SEM validar assinatura — a
 *  assinatura já foi validada pelo `getUser()`. Só extrai o claim `session_id`. */
export function decodeJwtSessionId(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { session_id?: unknown };
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

/** Recusa genérica idêntica à do login: não revela se a negação foi de rede,
 *  de país ou de conta inativa. */
function genericRefusal(req: Request): Response {
  return errorResponse("Access denied", 403, req);
}

/**
 * Encerra a sessão do chamador pela primitiva canônica `revoke_auth_sessions`
 * (service_role). Com `session_id` identificado, revoga SÓ a sessão atual
 * (scope `local`, self-only imposto no SQL). Sem o claim, cai em `global` do
 * PRÓPRIO usuário — nunca de terceiro.
 */
async function revokeOwnSession(
  deps: PostLoginGateDeps,
  log: Logger,
  userId: string,
  sessionId: string | null,
): Promise<void> {
  const args = sessionId
    ? {
        p_scope: "local",
        p_actor_user_id: userId,
        p_target_user_id: null,
        p_target_session_id: sessionId,
        p_preserve_session_id: null,
      }
    : {
        p_scope: "global",
        p_actor_user_id: null,
        p_target_user_id: userId,
        p_target_session_id: null,
        p_preserve_session_id: null,
      };
  const { error } = await deps.admin.rpc("revoke_auth_sessions", args);
  if (error) log.error("revoke_auth_sessions failed", { scope: args.p_scope });
}

export async function handlePostLoginGate(
  req: Request,
  deps: PostLoginGateDeps,
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("post-login-gate");

  try {
    if (req.method !== "POST") return errorResponse("Method not allowed", 405, req);

    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return errorResponse("Missing Authorization bearer token", 401, req);
    }

    // 1. Autenticação: sem usuário não há sessão a encerrar.
    let userId: string;
    try {
      const { data, error } = await deps.getUser(authHeader);
      if (error || !data?.user) return errorResponse("Invalid or expired token", 401, req);
      userId = data.user.id;
    } catch {
      return errorResponse("Authentication failed", 401, req);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const sessionId = decodeJwtSessionId(token);

    // 2. Política de rede (mesma fronteira canônica do login).
    let decision: NetworkPolicyDecision;
    try {
      decision = await resolveNetworkPolicy(req, "post-login-gate", {
        rpc: deps.admin,
        defaultMaxRequests: NETWORK_POLICY_DEFAULT_MAX,
        defaultWindowSeconds: NETWORK_POLICY_DEFAULT_WINDOW_SECONDS,
      });
    } catch {
      decision = { allowed: false, status: 503 } as const;
    }

    if (!decision.allowed) {
      if (decision.status === 403) {
        await revokeOwnSession(deps, log, userId, sessionId);
        log.done(403, { reason: "network_policy", revoked: true });
        return genericRefusal(req);
      }
      // Indecidível: 503 genérico, sem revogar (sem prova de negação).
      log.warn("network policy indecidable");
      log.done(503, { reason: "policy_indecidable" });
      return networkPolicyDenialResponse(decision, req);
    }

    // 3. Conta ativa do PRÓPRIO chamador.
    let active: boolean;
    try {
      const { data, error } = await deps.profiles
        .from("profiles")
        .select("is_active")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        log.error("profiles lookup failed");
        log.done(503, { reason: "profile_indecidable" });
        return internalErrorResponse(error, req);
      }
      // Linha ausente é tratada como inativa (falha fechada).
      active = data?.is_active === true;
    } catch {
      log.error("profiles lookup threw");
      log.done(503, { reason: "profile_indecidable" });
      return errorResponse("Service unavailable", 503, req);
    }

    if (!active) {
      await revokeOwnSession(deps, log, userId, sessionId);
      log.done(403, { reason: "account_inactive", revoked: true });
      return genericRefusal(req);
    }

    log.done(200, { userId });
    return jsonResponse({ allowed: true }, 200, req);
  } catch (err) {
    log.error("unhandled", { err: String(err) });
    return internalErrorResponse(err, req);
  }
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const anon = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    return handlePostLoginGate(req, {
      getUser: async (authHeader: string) => {
        const { data, error } = await anon.auth.getUser(authHeader);
        return { data: { user: data?.user ? { id: data.user.id } : null }, error };
      },
      admin: service as unknown as GateAdminClient,
      profiles: service as unknown as ProfileActiveReader,
    });
  });
}
