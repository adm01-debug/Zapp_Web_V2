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
 *   - O papel do convidado é garantido pelo caminho de serviço (update/insert
 *     em user_roles com service_role): handle_new_user_role só cria 'agent'
 *     para dominio confiavel, entao o convite NAO depende dele.
 *   - Se a atribuicao de papel falhar, a conta recem-convidada é desfeita.
 *   - O e-mail vai pelo proprio GoTrue (inviteUserByEmail); a resposta NAO
 *     carrega link de convite.
 */

export interface InviteUserCallerClient {
  auth: {
    getUser: () => PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any;
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
  from: (table: string) => any;
}

export interface InviteUserDeps {
  env?: (name: string) => string;
  checkRateLimit?: (key: string, maxRequests: number, windowMs: number) => { allowed: boolean };
  caller?: InviteUserCallerClient;
  admin?: InviteUserAdminClient;
}

const INVITABLE_ROLES = ["admin", "supervisor", "agent", "special_agent"] as const;

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

    const adminClient: InviteUserAdminClient = deps.admin ?? createClient(
      env("SUPABASE_URL"),
      env("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      { data: { role } },
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

    // Papel garantido pelo caminho de serviço: atualiza a linha existente
    // (auto-provisionada por handle_new_user_role) ou insere quando ela nao
    // existe (dominio diferente do da empresa). Falha aqui desfaz a conta.
    try {
      const { data: updated, error: updateError } = await adminClient
        .from("user_roles")
        .update({ role })
        .eq("user_id", invitedId)
        .select("id");
      if (updateError) throw updateError;
      if (!updated || updated.length === 0) {
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
    const { error: auditError } = await adminClient.from("audit_logs").insert({
      user_id: caller.id,
      action: "user_invited",
      entity_type: "user_invitation",
      entity_id: invitedId,
      details: { invited_by: caller.id, email, role },
    });
    if (auditError) {
      log.error("Falha ao registrar auditoria do convite", { error: auditError.message });
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
