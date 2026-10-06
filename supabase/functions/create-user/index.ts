import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { handleCors, errorResponse, internalErrorResponse, jsonResponse, requireEnv, Logger, sanitizeString, checkRateLimit, getClientIP } from "../_shared/validation.ts";

// ── Seams de injeção (R2-AUTH-016) ──────────────────────────────────────────
// O handler exportado recebe o que faz efeito (client admin service_role, client
// do chamador, rate limit e leitura de env) para o teste provar, sem tocar banco
// nem GoTrue, que a falha de QUALQUER escrita dependente (role, perfil, contas
// auxiliares) derruba o sucesso e dispara a compensação (auth.admin.deleteUser).

export interface CreateUserCallerClient {
  auth: {
    getUser: () => PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
  };
}

export interface CreateUserAdminClient {
  auth: {
    admin: {
      createUser: (attrs: {
        email: string;
        password: string;
        email_confirm: boolean;
        user_metadata: Record<string, unknown>;
      }) => PromiseLike<{ data: { user: { id: string } | null }; error: { message?: string } | null }>;
      deleteUser: (id: string) => PromiseLike<{ data?: unknown; error: { message?: string } | null }>;
    };
  };
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

export interface CreateUserDeps {
  env?: (name: string) => string;
  checkRateLimit?: (key: string, maxRequests: number, windowMs: number) => { allowed: boolean };
  caller?: CreateUserCallerClient;
  admin?: CreateUserAdminClient;
}

export async function handleCreateUserRequest(req: Request, deps: CreateUserDeps = {}): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("create-user");
  const env = deps.env ?? requireEnv;
  const rateLimit = deps.checkRateLimit ?? checkRateLimit;

  const ip = getClientIP(req);
  const rl = rateLimit(`create-user:${ip}`, 5, 60_000);
  if (!rl.allowed) return errorResponse('Rate limit exceeded', 429, req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      log.warn("Missing auth header");
      return errorResponse("Não autorizado", 401, req);
    }

    const callerClient: CreateUserCallerClient = deps.caller ?? createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      log.warn("Invalid auth token");
      return errorResponse("Não autorizado", 401, req);
    }

    const adminClient: CreateUserAdminClient = deps.admin ?? createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!roleData || roleData.role !== "admin") {
      log.warn("Non-admin attempted user creation", { callerId: caller.id });
      return errorResponse("Apenas administradores podem criar usuários", 403, req);
    }

    const bodySchema = z.object({
      email: z.string().email("Email inválido").max(255),
      password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres").max(128),
      name: z.string().min(1, "Nome é obrigatório").max(255),
      nickname: z.string().max(100).optional(),
      signature: z.string().max(500).optional(),
      job_title: z.string().max(255).optional(),
      avatar_url: z.string().url("URL inválida").max(500).optional(),
      role: z.enum(["admin", "supervisor", "agent", "special_agent"]).optional().default("agent"),
      gmail_email: z.string().email("Email Gmail inválido").max(255).optional(),
      google_services: z.array(z.enum(["google_sheets", "google_docs", "google_calendar", "google_drive"])).optional().default([]),
      dropbox_email: z.string().email("Email Dropbox inválido").max(255).optional(),
    });

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      return errorResponse(Object.values(errors).flat().join("; "), 400, req);
    }

    const { email, password, name, nickname, signature, job_title, avatar_url, role, gmail_email, google_services, dropbox_email } = parsed.data;
    const sanitizedName = sanitizeString(name) || name;

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: sanitizedName },
    });

    if (createError) {
      log.error("User creation failed", { error: createError.message });
      return errorResponse(createError.message ?? "Falha ao criar usuário", 400, req);
    }

    const createdUserId = newUser.user?.id;
    if (!createdUserId) {
      log.error("GoTrue não devolveu o usuário criado");
      return errorResponse("Falha ao criar usuário", 500, req);
    }

    // R2-AUTH-016: o usuário já existe no GoTrue. Se QUALQUER escrita dependente
    // falhar, a resposta não pode ser sucesso — compensa apagando o usuário e
    // responde 500. Falha da própria compensação é logada e ainda responde erro.
    // Só a conta Gmail criada NESTA requisição precisa ser removida antes do deleteUser
    // (as demais tabelas cascateiam). Sem ela criada, não há o que desfazer.
    let gmailAccountCreated = false;

    const failAndCompensate = async (msg: string, err: { message?: string } | null): Promise<Response> => {
      log.error(msg, { error: err?.message ?? String(err), userId: createdUserId });
      try {
        // gmail_accounts_user_id_fkey e ON DELETE RESTRICT (migration 20260926240000):
        // sem apagar a linha criada NESTA requisicao, o deleteUser do GoTrue falha com
        // violacao de FK e o usuario fica orfao. A conta e recem-criada (sem threads,
        // mensagens ou labels encadeados), entao remover essa linha nao perde dado.
        const { error: gmailUndoError } = gmailAccountCreated
          ? await adminClient
            .from("gmail_accounts")
            .delete()
            .eq("user_id", createdUserId)
          : { error: null };
        if (gmailUndoError) {
          log.error("Compensacao: falha ao remover a conta Gmail criada", { error: gmailUndoError.message, userId: createdUserId });
        }
        const { error: delError } = await adminClient.auth.admin.deleteUser(createdUserId);
        if (delError) {
          log.error("Compensação falhou: usuário órfão no GoTrue", { error: delError.message, userId: createdUserId });
        }
      } catch (delErr) {
        log.error("Compensação falhou: usuário órfão no GoTrue", {
          error: delErr instanceof Error ? delErr.message : String(delErr),
          userId: createdUserId,
        });
      }
      return errorResponse(msg, 500, req);
    };

    if (role && role !== "agent") {
      const { error: roleError } = await adminClient
        .from("user_roles")
        .update({ role })
        .eq("user_id", createdUserId);
      if (roleError) return failAndCompensate("Falha ao definir o papel do usuário", roleError);
    }

    const profileUpdate: Record<string, unknown> = {};
    if (nickname) profileUpdate.nickname = nickname;
    if (signature) profileUpdate.signature = signature;
    if (job_title) profileUpdate.job_title = job_title;
    if (avatar_url) profileUpdate.avatar_url = avatar_url;

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await adminClient
        .from("profiles")
        .update(profileUpdate)
        .eq("user_id", createdUserId);
      if (profileError) return failAndCompensate("Falha ao atualizar o perfil do usuário", profileError);
    }

    if (gmail_email) {
      const { error: gmailError } = await adminClient
        .from("gmail_accounts")
        .insert({
          user_id: createdUserId,
          email_address: gmail_email,
          is_active: true,
          sync_status: "pending",
        });
      if (gmailError) return failAndCompensate("Falha ao vincular a conta Gmail", gmailError);
      gmailAccountCreated = true;

      if (google_services && google_services.length > 0) {
        const serviceRows = google_services.map((svc: string) => ({
          user_id: createdUserId,
          service_type: svc,
          account_email: gmail_email,
          is_active: true,
        }));

        const { error: svcError } = await adminClient
          .from("user_service_accounts")
          .insert(serviceRows);
        if (svcError) return failAndCompensate("Falha ao vincular os serviços Google", svcError);
      }
    }

    if (dropbox_email) {
      const { error: dropboxError } = await adminClient
        .from("user_service_accounts")
        .insert({
          user_id: createdUserId,
          service_type: "dropbox",
          account_email: dropbox_email,
          is_active: true,
        });
      if (dropboxError) return failAndCompensate("Falha ao vincular a conta Dropbox", dropboxError);
    }

    log.done(200, { userId: createdUserId });
    return jsonResponse({ success: true, user_id: createdUserId }, 200, req);
  } catch (err: unknown) {
    log.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
    return internalErrorResponse(err, req);
  }
}

if (import.meta.main) Deno.serve((req) => handleCreateUserRequest(req));
