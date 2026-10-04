/**
 * auto-close-conversations — encerra conversas inativas conforme `auto_close_config`.
 *
 * R2-API-022 (P1): antes desta correção a rotina selecionava e modificava contatos
 * globalmente com service role, sem segredo de cron nem usuário autorizado — qualquer
 * chamador admitido pelo gateway podia antecipar o encerramento global.
 *
 * Contrato de autorização (decisão de decomposição 2026-10-04):
 *   - Preflight CORS continua livre (`handleCors`).
 *   - A autorização acontece ANTES de qualquer parse/configuração, scan global e
 *     criação/uso do cliente service role.
 *   - Execução automática (cron): header dedicado `x-cron-secret` igual a `CRON_SECRET`
 *     (env), comparado em tempo constante. `CRON_SECRET` vazio/ausente NÃO habilita o
 *     caminho do cron (fail-closed).
 *   - Execução manual: JWT válido de admin/supervisor, verificado pela RPC canônica
 *     `is_admin_or_supervisor`.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, jsonResponse, errorResponse, internalErrorResponse, Logger } from "../_shared/validation.ts";
import { timingSafeEqual } from "../_shared/hmac-validation.ts";

/** Header dedicado da credencial de máquina do cron. */
export const CRON_SECRET_HEADER = "x-cron-secret";
/** Env que habilita o caminho do cron; vazio/ausente = cron desligado (fail-closed). */
export const CRON_SECRET_ENV = "CRON_SECRET";

/** Seam de teste: tudo que o handler precisa do mundo externo pode ser injetado. */
export interface AutoCloseInjected {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any; // client service role (trabalho real, criado SÓ após autorizar)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authClient?: any; // client anon p/ verificar JWT + papel (getUser + rpc)
  cronSecret?: string; // valor de CRON_SECRET (teste)
  env?: (key: string) => string | undefined;
  now?: Date;
}

type AuthzResult = { ok: true } | { ok: false; status: number; message: string };

/**
 * Autoriza o chamador: cron com `x-cron-secret` válido OU admin/supervisor por JWT.
 * Qualquer outra coisa devolve a negação (401/403) sem tocar o banco.
 */
async function authorizeCaller(
  req: Request,
  opts: {
    cronSecret: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authClient?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    makeAuthClient: (authHeader: string) => any;
  },
): Promise<AuthzResult> {
  const cronHeader = req.headers.get(CRON_SECRET_HEADER);

  // Caminho do cron: header dedicado presente (não-vazio) → compara em tempo constante.
  if (cronHeader) {
    if (opts.cronSecret === "") return { ok: false, status: 401, message: "Unauthorized" };
    if (timingSafeEqual(cronHeader, opts.cronSecret)) return { ok: true };
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  // Caminho manual: JWT de admin/supervisor.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  const token = authHeader.slice(7).trim();
  if (token === "") return { ok: false, status: 401, message: "Unauthorized" };

  const client = opts.authClient ?? opts.makeAuthClient(authHeader);
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return { ok: false, status: 401, message: "Unauthorized" };

  const { data: isAdmin, error: roleError } = await client.rpc("is_admin_or_supervisor", { _user_id: user.id });
  if (roleError || !isAdmin) return { ok: false, status: 403, message: "Forbidden" };

  return { ok: true };
}

export async function handleAutoCloseConversations(
  req: Request,
  injected?: AutoCloseInjected,
): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const log = new Logger("auto-close-conversations");
  const readEnv = injected?.env ?? ((key: string) => Deno.env.get(key));

  try {
    const supabaseUrl = readEnv("SUPABASE_URL") ?? "";
    const anonKey = readEnv("SUPABASE_ANON_KEY") ?? readEnv("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cronSecret = injected?.cronSecret ?? readEnv(CRON_SECRET_ENV) ?? "";

    // ── 0. AUTORIZAÇÃO — antes de qualquer cliente service role, parse ou scan ──
    const authz = await authorizeCaller(req, {
      cronSecret,
      authClient: injected?.authClient,
      makeAuthClient: (authHeader: string) =>
        createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false },
        }),
    });
    if (!authz.ok) {
      return errorResponse(authz.message, authz.status, req);
    }

    // ── 1. Cliente service role só AGORA (a autorização já decidiu) ──
    const supabase = (injected?.supabase ?? createClient(supabaseUrl, serviceKey)) as SupabaseClient;

    // Get auto-close config
    const { data: config, error: configError } = await supabase
      .from("auto_close_config")
      .select("*")
      .eq("is_enabled", true)
      .maybeSingle();

    if (configError) {
      log.error("Error fetching config", { error: configError.message });
      return errorResponse("Failed to fetch config", 500, req);
    }

    if (!config) {
      return jsonResponse({ message: "Auto-close is disabled", closed: 0 }, 200, req);
    }

    const now = injected?.now ?? new Date();
    const cutoffDate = new Date(now.getTime());
    cutoffDate.setHours(cutoffDate.getHours() - config.inactivity_hours);

    const { data: staleContacts, error: staleError } = await supabase
      .from("contacts")
      .select("id, name, phone, assigned_to")
      .lt("updated_at", cutoffDate.toISOString())
      .not("assigned_to", "is", null);

    if (staleError) {
      log.error("Error finding stale contacts", { error: staleError.message });
      return errorResponse("Failed to query stale contacts", 500, req);
    }

    if (!staleContacts || staleContacts.length === 0) {
      return jsonResponse({ message: "No stale conversations found", closed: 0 }, 200, req);
    }

    let closedCount = 0;

    for (const contact of staleContacts) {
      if (config.close_message) {
        await supabase.from("messages").insert({
          contact_id: contact.id,
          content: config.close_message,
          sender: "agent",
          message_type: "text",
        });
      }

      await supabase.from("conversation_closures").insert({
        contact_id: contact.id,
        close_reason: "inactivity",
        outcome: "auto_closed",
        notes: `Auto-closed after ${config.inactivity_hours}h of inactivity`,
      });

      await supabase
        .from("contacts")
        .update({ assigned_to: null })
        .eq("id", contact.id);

      closedCount++;
    }

    log.info(`Auto-closed ${closedCount} conversations`);
    log.done(200, { closed: closedCount });

    return jsonResponse({
      message: `Auto-closed ${closedCount} conversations`,
      closed: closedCount,
    }, 200, req);
  } catch (error) {
    log.error("Unexpected error", { error: error instanceof Error ? error.message : String(error) });
    return internalErrorResponse(error, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleAutoCloseConversations(req));
}
