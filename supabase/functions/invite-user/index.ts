import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { handleCors, errorResponse, internalErrorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";

/**
 * invite-user — convite por e-mail com papel definido (paridade V3 -> V2).
 *
 * Regras de autorização (fechadas, valem no caminho padrão):
 *   - Sem JWT válido: 401.
 *   - Quem chama precisa ser admin OU supervisor (lido de user_roles com o
 *     cliente de escopo do usuário, nunca com a service role).
 *   - Supervisor só convida papel 'agent'; qualquer outro papel exige admin.
 *   - Domínio da empresa (handle_new_user_role, fail-closed): e-mail fora do
 *     domínio confiável só pode ser convidado por admin, e a auditoria marca
 *     domain_trusted=false. Supervisor convidando domínio fora recebe 403 e
 *     nenhuma conta é criada. Admin convidando domínio fora é concessão manual
 *     (a migration 20260925140000 permite explicitamente ao admin conceder
 *     papel a conta de outro domínio — parceiro, freelancer).
 *   - O papel do convidado é gravado pela RPC public.admin_set_role (caminho
 *     que a V2 já usa) quando quem convida é admin, via cliente com o JWT do
 *     chamador (a RPC exige sessão JWT e is_admin). Supervisor só convida
 *     'agent' e a RPC levanta admin_required para não-admin, por isso esse
 *     caso restrito usa insert direto com service_role.
 *   - Se a atribuicao de papel falhar, a conta recem-convidada é desfeita.
 *   - O e-mail vai pelo proprio GoTrue (inviteUserByEmail, sem user_metadata:
 *     papel mora em user_roles); a resposta NAO carrega link de convite.
 *   - Auditoria do convite é best-effort: se falhar, só é registrada em log
 *     (o convite já se concretizou; desfazer uma conta válida por causa da
 *     auditoria seria pior — e no caminho admin a RPC já auditou via trigger).
 */

export interface InviteUserCallerClient {
  auth: {
    getUser: () => PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // RPC public.admin_set_role, chamada com o JWT do chamador (a RPC exige
  // sessão JWT e is_admin; service_role sem JWT cai em jwt_session_required).
  rpc: (
    fn: string,
    // deno-lint-ignore no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: Record<string, any>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface InviteUserAdminClient {
  auth: {
    admin: {
      inviteUserByEmail: (
        email: string,
        options?: Record<string, unknown>,
      ) => PromiseLike<{
        data: { user: { id: string } | null } | null;
        error: { message: string } | null;
      }>;
      deleteUser: (
        id: string,
      ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
  };
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

export interface InviteUserDeps {
  env?: (name: string) => string;
  checkRateLimit?: (key: string, maxRequests: number, windowMs: number) => { allowed: boolean };
  caller?: InviteUserCallerClient;
  admin?: InviteUserAdminClient;
}

const INVITABLE_ROLES = ["admin", "supervisor", "agent", "special_agent"] as const;

// Domínio confiável da empresa (mesma semântica de handle_new_user_role,
// migration 20260925140000): default fail-closed para o domínio da empresa,
// sobrescrevível por TRUSTED_DOMAINS (lista separada por vírgula).
const DEFAULT_TRUSTED_DOMAINS = ["promobrindes.com.br"];

function getTrustedDomains(env: (name: string) => string): string[] {
  let raw: string | null = null;
  try {
    raw = env("TRUSTED_DOMAINS");
  } catch {
    raw = null;
  }
  if (!raw || !raw.trim()) return DEFAULT_TRUSTED_DOMAINS;
  const list = raw.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  return list.length > 0 ? list : DEFAULT_TRUSTED_DOMAINS;
}

function emailDomain(email: string): string {
  return (email.split("@")[1] ?? "").trim().toLowerCase();
}

const bodySchema = z.object({
  email: z.string().email("Email inválido").max(255),
  role: z.enum(INVITABLE_ROLES).optional().default("agent"),
}).strict();

export async function handleInviteUserRequest(req: Request, deps: InviteUserDeps = {}): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("invite-user");
  const env = deps.env ?? requireEnv;
  const rateLimit = deps.checkRateLimit ?? checkRateLimit;

  const ip = getClientIP(req);
  const rl = rateLimit(`invite-user:${ip}`, 10, 60_000);
  if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) {
      log.warn("Missing auth header");
      return errorResponse("Não autorizado", 401, req);
    }

    const callerClient: InviteUserCallerClient = deps.caller ?? createClient(
      env("SUPABASE_URL"),
      env("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      log.warn("Invalid auth token");
      return errorResponse("Não autorizado", 401, req);
    }

    // Papel do chamador lido no escopo do proprio usuario (RLS de user_roles).
    // Consulta com erro FECHA: nao abrimos por falha.
    const { data: roleRows, error: roleError } = await callerClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    if (roleError) {
      log.error("Falha ao confirmar papel do chamador", { error: roleError.message ?? String(roleError) });
      return errorResponse("Não foi possível confirmar suas permissões", 403, req);
    }
    const roles: string[] = (roleRows ?? []).map((r: { role: string }) => r.role);
    const isAdmin = roles.includes("admin");
    const isSupervisor = roles.includes("supervisor");
    if (!isAdmin && !isSupervisor) {
      log.warn("Não autorizado a convidar", { callerId: caller.id });
      return errorResponse("Apenas administradores e supervisores podem convidar usuários", 403, req);
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      return errorResponse(Object.values(errors).flat().join("; "), 400, req);
    }
    const { email, role } = parsed.data;

    // Supervisor so convida 'agent'; qualquer outro papel exige admin.
    if (!isAdmin && role !== "agent") {
      log.warn("Supervisor tentou convidar papel privilegiado", { callerId: caller.id, role });
      return errorResponse("Supervisor só pode convidar usuários com o papel agent", 403, req);
    }

    // Domínio da empresa (handle_new_user_role, fail-closed): fora do domínio
    // confiável, só admin convida — e nenhuma conta é criada antes dessa
    // checagem. Supervisor recebe 403 aqui.
    const domainTrusted = getTrustedDomains(env).includes(emailDomain(email));
    if (!domainTrusted && !isAdmin) {
      log.warn("Supervisor tentou convidar domínio fora da empresa", { callerId: caller.id, email });
      return errorResponse("Convites para domínios fora da empresa exigem um administrador", 403, req);
    }

    const adminClient: InviteUserAdminClient = deps.admin ?? createClient(
      env("SUPABASE_URL"),
      env("SUPABASE_SERVICE_ROLE_KEY"),
    );

    // Sem user_metadata: papel não é fonte de verdade em user_metadata, ele é
    // gravado em user_roles logo abaixo (admin_set_role ou insert restrito).
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
    );
    if (inviteError) {
      log.error("Falha ao convidar", { error: inviteError.message });
      return errorResponse(inviteError.message, 400, req);
    }

    const invitedId = inviteData?.user?.id;
    if (!invitedId) {
      log.error("Convite sem usuário retornado");
      return internalErrorResponse(new Error("invite_failed"), req);
    }

    // Papel pelo caminho que a V2 já usa: quando quem convida é admin, a RPC
    // public.admin_set_role (migration 20260925100657) via cliente com o JWT
    // do chamador — a RPC exige sessão JWT (jwt_session_required) e is_admin,
    // e audita via trigger com changed_by = auth.uid(). Supervisor só convida
    // 'agent' e a RPC levanta admin_required para não-admin, por isso esse
    // caso restrito usa insert direto com service_role. Falha aqui desfaz a
    // conta recém-convidada.
    try {
      if (isAdmin) {
        const { error: rpcError } = await callerClient.rpc("admin_set_role", {
          _user_id: invitedId,
          _role: role,
        });
        if (rpcError) throw rpcError;
      } else {
        const { error: insertError } = await adminClient
          .from("user_roles")
          .insert({ user_id: invitedId, role });
        if (insertError) throw insertError;
      }
    } catch (assignError) {
      const motivo = assignError && typeof assignError === "object" && "message" in assignError
        ? String((assignError as { message: unknown }).message)
        : String(assignError);
      log.error("Falha ao atribuir papel; desfazendo convite", { error: motivo });
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(invitedId);
      if (deleteError) log.error("Falha ao desfazer convite", { error: deleteError.message });
      return errorResponse("Não foi possível concluir o convite", 500, req);
    }

    // Auditoria: registra quem convidou (service_role nao carrega auth.uid()).
    // Auditoria best-effort e intencional: o convite já se concretizou
    // (conta + papel); se a auditoria falhar, só registra em log em vez de
    // desfazer uma conta válida. No caminho admin, a RPC admin_set_role já
    // auditou a troca de papel via trigger com changed_by = auth.uid().
    const { error: auditError } = await adminClient.from("audit_logs").insert({
      user_id: caller.id,
      action: "user_invited",
      table_name: "auth.users",
      record_id: invitedId,
      details: { invited_email: email, invited_role: role, domain_trusted: domainTrusted },
    });
    if (auditError) {
      log.warn("Auditoria do convite falhou (convite mantido)", { error: auditError.message });
    }

    log.done(200, { userId: invitedId, role });
    // Resposta NAO carrega link de convite (o e-mail vai pelo GoTrue).
    return jsonResponse({ success: true, user_id: invitedId, email, role }, 200, req);
  } catch (err: unknown) {
    log.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
    return internalErrorResponse(err, req);
  }
}

if (import.meta.main) Deno.serve((req) => handleInviteUserRequest(req));
