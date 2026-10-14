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
// revoke-auth-sessions, escopo global). Aqui o admin passa a INVESTIGAR as
// sessões de um usuário (dispositivo resumido, IP e último uso) e a encerrar
// UMA sessão específica, como a V3 fazia (AdminUserSessionsDialog).
//
// Contrato POST:
//   { action: "list",   user_id }                  -> 200 { sessions: [...] }
//   { action: "revoke", user_id, session_id }      -> 200 { revoked: true }
//
// Fonte de verdade: `auth.sessions` no BANCO, pela service role, via as RPCs
// SECURITY DEFINER `list_auth_sessions` / `revoke_auth_session`
// (migration 20261014120000, mesma fonte da primitiva `revoke_auth_sessions`).
// DELETE em auth.sessions remove os refresh tokens vinculados (FK com
// ON DELETE CASCADE) e mantém o inventário public.user_sessions coerente.
// Limite conhecido (o mesmo do revoke-auth-sessions): o JWT de acesso já
// emitido continua válido até o exp; a sessão não renova mais.
//
// Autorização: SÓ admin. O JWT (verify_jwt=true no config.toml) identifica o
// chamador; o papel é reconferido no SERVIDOR via `user_roles` com a service
// role antes de qualquer leitura/efeito sobre o esquema auth — um usuário comum
// autenticado recebe 403 e a função não toca o Auth.
//
// Nenhuma informação é exportada: a resposta devolve só o necessário para a
// tela de investigação (id, datas, user agent RESUMIDO e IP) — não há
// download/cópia. Toda revogação é auditada em `audit_logs` com o admin ator.

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

/** Client de serviço: reconfere o papel, chama as RPCs e grava a auditoria. */
export interface AdminUserSessionsAdminClient {
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** Linha de sessão como a RPC `list_auth_sessions` devolve (só os campos usados). */
export interface DbSessionRow {
  id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  refreshed_at?: string | null;
  user_agent?: string | null;
  ip?: string | null;
}

export interface AdminUserSessionsDeps {
  env?: (name: string) => string;
  checkRateLimit?: (key: string, maxRequests: number, windowMs: number) => { allowed: boolean };
  caller?: AdminUserSessionsCallerClient;
  admin?: AdminUserSessionsAdminClient;
}

const HOSTNAME_PERMITIDO = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Valida a SUPABASE_URL antes de usá-la (falha fechada: URL ausente,
 * malformada, com credencial embutida, com host fora da lista de caracteres
 * permitidos ou http fora de loopback derruba a função em 500 sem vazar
 * detalhe ao chamador).
 */
export function assertSupabaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("SUPABASE_URL invalida");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error("SUPABASE_URL com credencial embutida");
  }
  const host = parsed.hostname.toLowerCase();
  if (!HOSTNAME_PERMITIDO.test(host)) {
    throw new Error("SUPABASE_URL com host invalido");
  }
  if (parsed.protocol === "http:") {
    if (!LOOPBACK.has(host)) throw new Error("SUPABASE_URL http fora de loopback");
  } else if (parsed.protocol !== "https:") {
    throw new Error("SUPABASE_URL com esquema invalido");
  }
  return raw;
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

export interface SanitizedSession {
  id: string;
  created_at: string | null;
  last_used_at: string | null;
  user_agent: string;
  ip: string | null;
}

/** Último uso: `refreshed_at` a cada refresh; `updated_at` cobre o resto. */
export function sanitizeSession(session: DbSessionRow): SanitizedSession {
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
    let supabaseUrl: string;
    try {
      supabaseUrl = assertSupabaseUrl(env("SUPABASE_URL"));
    } catch (err) {
      log.error("invalid supabase url", { err: err instanceof Error ? err.message : String(err) });
      return errorResponse("Configuração inválida", 500, req);
    }
    const adminClient: AdminUserSessionsAdminClient = deps.admin ??
      createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY"));
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

    if (payload.action === "list") {
      const { data, error: rpcError } = await adminClient.rpc("list_auth_sessions", {
        p_target_user_id: payload.user_id,
      });
      if (rpcError) {
        log.error("list rpc failed", { err: rpcError.message });
        return errorResponse("Falha ao listar sessões", 502, req);
      }
      const rows = Array.isArray(data) ? (data as DbSessionRow[]) : [];
      const list = rows.map(sanitizeSession);
      log.done(200, { action: "list", count: list.length });
      return jsonResponse({ action: "list", sessions: list }, 200, req);
    }

    // action === "revoke"
    const { data: removed, error: revokeError } = await adminClient.rpc("revoke_auth_session", {
      p_target_user_id: payload.user_id,
      p_target_session_id: payload.session_id,
    });
    if (revokeError) {
      log.error("revoke rpc failed", { err: revokeError.message });
      return errorResponse("Falha ao encerrar sessão", 502, req);
    }
    // Revalidação no caminho de volta: a RPC só remove quando a sessão existe
    // E pertence ao alvo (WHERE id + user_id). 0 linhas = nada foi encerrado.
    if (typeof removed !== "number" || removed < 1) {
      return errorResponse("Sessão não encontrada", 404, req);
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
