import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  handleCors,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  requireEnv,
  Logger,
  checkRateLimit,
  getClientIP,
} from "../_shared/validation.ts";
import { z, validationErrorResponse } from "../_shared/schemas.ts";

// Paridade V3 -> V2 (auditoria do frontend da V3, 2ª passada, 2026-10-12).
// A V2 só tinha "forçar logout" de TODAS as sessões (ForceLogoutButton ->
// revoke-auth-sessions scope global). Aqui o admin passa a INVESTIGAR as
// sessões de um usuário (dispositivo resumido, IP e último uso) e a encerrar
// UMA sessão específica, como a V3 fazia (AdminUserSessionsDialog -> rpc
// sessions_list / edge revoke-session).
//
// Contrato POST:
//   { action: "list",   user_id }                  -> 200 { sessions: [...] }
//   { action: "revoke", user_id, session_id }      -> 200 { revoked: true }
//
// Autorização: SÓ admin. O JWT (verify_jwt=true no config.toml) identifica o
// chamador; o papel é reconferido no SERVIDOR via `user_roles` com a service
// role antes de qualquer leitura/efeito sobre o esquema auth — um usuário comum
// autenticado recebe 403 e a função não toca o Auth.
//
// As sessões vêm do esquema `auth` pelo endpoint admin do GoTrue (service role,
// mesmo caminho do `getUserById` que as outras edges já usam). Nenhuma
// informação é exportada: a resposta devolve só o necessário para a tela de
// investigação (id, datas, user agent RESUMIDO e IP) — não há download/cópia.
// Toda revogação é auditada em `audit_logs` com o admin ator.

const AdminUserSessionsSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list"),
    user_id: z.string().uuid("user_id inválido"),
  }),
  z.object({
    action: z.literal("revoke"),
    user_id: z.string().uuid("user_id inválido"),
    session_id: z.string().uuid("session_id inválido"),
  }),
]);

export interface AdminUserSessionsCallerClient {
  auth: {
    getUser: () => PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
  };
}

/** Client de serviço: usado para reconferir o papel e para gravar a auditoria. */
export interface AdminUserSessionsAdminClient {
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

/** Sessão como o GoTrue devolve no endpoint admin (só os campos que usamos). */
export interface RawAuthSession {
  id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  refreshed_at?: string | null;
  not_after?: string | null;
  user_agent?: string | null;
  ip?: string | null;
}

export type SessionsResult<T> = { ok: true; data: T } | { ok: false; status: number };

/** Acesso ao esquema auth (GoTrue admin). Injetável para o teste não sair na rede. */
export interface SessionsGateway {
  list(userId: string): PromiseLike<SessionsResult<RawAuthSession[]>>;
  revoke(userId: string, sessionId: string): PromiseLike<SessionsResult<null>>;
}

export interface AdminUserSessionsDeps {
  env?: (name: string) => string;
  checkRateLimit?: (key: string, maxRequests: number, windowMs: number) => { allowed: boolean };
  caller?: AdminUserSessionsCallerClient;
  admin?: AdminUserSessionsAdminClient;
  sessions?: SessionsGateway;
}

/** URL canônica do endpoint admin de sessões do GoTrue (documenta o contrato). */
export function buildSessionsUrl(supabaseUrl: string, userId: string, sessionId?: string): string {
  const base = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin/users/${encodeURIComponent(userId)}/sessions`;
  return sessionId ? `${base}/${encodeURIComponent(sessionId)}` : base;
}

/**
 * Resumo do user agent para a tela do admin — rótulo FIXO, nunca o UA cru
 * (o UA completo é um fingerprint e não precisa sair do Auth para investigar
 * "de onde veio" a sessão). Lista fechada; desconhecido vira um rótulo neutro.
 */
export function summarizeUserAgent(ua: unknown): string {
  if (typeof ua !== "string" || ua.trim() === "") return "Dispositivo desconhecido";
  const s = ua.trim();
  const browser =
    /Edg\//.test(s) ? "Edge" :
    /OPR\//.test(s) ? "Opera" :
    /SamsungBrowser/.test(s) ? "Samsung Internet" :
    /Firefox\//.test(s) ? "Firefox" :
    /Chrome\//.test(s) ? "Chrome" :
    /Safari\//.test(s) ? "Safari" :
    "Navegador desconhecido";
  const os =
    /Windows/.test(s) ? "Windows" :
    /Android/.test(s) ? "Android" :
    /iPhone/.test(s) ? "iPhone" :
    /iPad/.test(s) ? "iPad" :
    /Mac OS X|Macintosh/.test(s) ? "macOS" :
    /Linux/.test(s) ? "Linux" :
    "SO desconhecido";
  return `${browser} · ${os}`;
}

/** Gateway real: endpoint admin do GoTrue com a service role. */
export function createGoTrueSessionsGateway(supabaseUrl: string, serviceRoleKey: string): SessionsGateway {
  const authHeaders = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  return {
    async list(userId) {
      const res = await fetch(buildSessionsUrl(supabaseUrl, userId), { headers: authHeaders });
      if (!res.ok) return { ok: false, status: res.status };
      const data = await res.json().catch(() => null);
      return { ok: true, data: Array.isArray(data) ? (data as RawAuthSession[]) : [] };
    },
    async revoke(userId, sessionId) {
      const res = await fetch(buildSessionsUrl(supabaseUrl, userId, sessionId), {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, data: null };
    },
  };
}

export interface SanitizedSession {
  id: string;
  created_at: string | null;
  last_used_at: string | null;
  user_agent: string;
  ip: string | null;
}

/** Último uso: o GoTrue atualiza `refreshed_at` a cada refresh; `updated_at` cobre o resto. */
export function sanitizeSession(session: RawAuthSession): SanitizedSession {
  return {
    id: typeof session.id === "string" ? session.id : "",
    created_at: session.created_at ?? null,
    last_used_at: session.refreshed_at ?? session.updated_at ?? null,
    user_agent: summarizeUserAgent(session.user_agent),
    ip: typeof session.ip === "string" && session.ip.trim() !== "" ? session.ip : null,
  };
}

export async function handleAdminUserSessionsRequest(
  req: Request,
  deps: AdminUserSessionsDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("admin-user-sessions");
  const env = deps.env ?? requireEnv;

  if (req.method !== "POST") {
    return errorResponse("Método não permitido", 405, req);
  }

  const ip = getClientIP(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      log.warn("missing auth header");
      return errorResponse("Não autorizado", 401, req);
    }

    const callerClient: AdminUserSessionsCallerClient = deps.caller ??
      createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: authHeader } },
      });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      log.warn("invalid auth token");
      return errorResponse("Não autorizado", 401, req);
    }

    // Chave = identidade AUTENTICADA, não o IP (cabeçalho controlado pelo cliente).
    const rateLimit = deps.checkRateLimit ?? checkRateLimit;
    if (!rateLimit(`admin-user-sessions:${caller.id}`, 20, 60_000).allowed) {
      return errorResponse("Limite de requisições excedido", 429, req);
    }

    // Autorização ANTES de qualquer acesso ao esquema auth.
    const adminClient: AdminUserSessionsAdminClient = deps.admin ??
      createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!roleData || roleData.role !== "admin") {
      log.warn("non-admin attempted session management", { callerId: caller.id });
      return errorResponse("Apenas administradores podem gerenciar sessões", 403, req);
    }

    const rawBody = await req.json().catch(() => null);
    const parsed = AdminUserSessionsSchema.safeParse(rawBody);
    if (!parsed.success) {
      log.warn("invalid payload", { err: parsed.error.message });
      return validationErrorResponse(parsed.error, req);
    }
    const payload = parsed.data;

    const url = env("SUPABASE_URL");
    const sessions = deps.sessions ?? createGoTrueSessionsGateway(url, env("SUPABASE_SERVICE_ROLE_KEY"));

    if (payload.action === "list") {
      const result = await sessions.list(payload.user_id);
      if (!result.ok) {
        if (result.status === 404) return errorResponse("Usuário não encontrado", 404, req);
        log.error("gateway list failed", { status: result.status });
        return errorResponse("Falha ao listar sessões", 502, req);
      }
      const list = result.data.map(sanitizeSession);
      log.done(200, { action: "list", count: list.length });
      return jsonResponse({ action: "list", sessions: list }, 200, req);
    }

    // action === "revoke"
    const result = await sessions.revoke(payload.user_id, payload.session_id);
    if (!result.ok) {
      if (result.status === 404) return errorResponse("Sessão não encontrada", 404, req);
      log.error("gateway revoke failed", { status: result.status });
      return errorResponse("Falha ao encerrar sessão", 502, req);
    }

    // Auditoria: só depois do efeito real. A falha da trilha é LOGADA (nunca
    // engolida em silêncio), mas não desfaz a revogação já aplicada.
    const { error: auditError } = await adminClient.from("audit_logs").insert({
      user_id: caller.id,
      action: "revoke_user_session",
      entity_type: "auth_session",
      entity_id: payload.session_id,
      details: { target_user_id: payload.user_id },
      ip_address: ip === "unknown" ? null : ip,
      user_agent: summarizeUserAgent(req.headers.get("user-agent")),
    });
    if (auditError) {
      log.error("audit insert failed", { err: auditError.message });
    }

    log.done(200, { action: "revoke", target: payload.user_id });
    return jsonResponse(
      { action: "revoke", revoked: true, session_id: payload.session_id },
      200,
      req,
    );
  } catch (err) {
    log.error("unhandled", { err: err instanceof Error ? err.message : String(err) });
    return internalErrorResponse(err, req);
  }
}

if (import.meta.main) Deno.serve((req) => handleAdminUserSessionsRequest(req));
