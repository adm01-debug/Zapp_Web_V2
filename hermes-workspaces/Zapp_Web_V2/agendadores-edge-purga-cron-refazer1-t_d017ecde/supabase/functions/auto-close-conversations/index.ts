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

/** Teto de contatos processados por execução (lote do cron a cada 10 min). */
export const AUTO_CLOSE_BATCH_LIMIT = 200;
/** Prefixo do seed do `client_message_id` idempotente do encerramento automático. */
export const AUTO_CLOSE_CLIENT_MESSAGE_PREFIX = "auto-close:";
/** Status em que a conversa NÃO é mais encerrada por inatividade. */
export const TERMINAL_CONVERSATION_STATUSES: readonly string[] = ["resolved", "archived"];

/** Código PostgREST/Postgres de violação de unicidade (recurso já existe). */
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "23505";
}

/** Formata os primeiros 16 bytes de um digest como UUID canônico. */
function digestToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes.subarray(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * `client_message_id` determinístico do encerramento automático.
 *
 * A coluna `messages.client_message_id` é `uuid` (migration 20260909220000), então o
 * seed legível `auto-close:<contato>:<fechamento>` é resumido em SHA-256: o MESMO seed
 * produz sempre o MESMO UUID e o índice único (contact_id, client_message_id) garante
 * que a reexecução do cron não duplique a mensagem de encerramento.
 */
export async function deriveAutoCloseClientMessageId(seed: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  return digestToUuid(new Uint8Array(digest));
}

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

/** Texto curto do erro devolvido pelo PostgREST, para log e relatório. */
function errorReason(err: unknown): string {
  if (err instanceof Error) return err.message;
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : String(err);
}

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

    // ── 2. Seleção do lote: conversa ABERTA e não excluída, ordenada e limitada ──
    // A inatividade é medida pela ÚLTIMA MENSAGEM (abaixo), NÃO por contacts.updated_at;
    // aqui só se monta o lote de candidatos. O `.limit` corta no banco e o `.slice`
    // repete o teto como defesa em profundidade.
    const { data: candidates, error: candidatesError } = await supabase
      .from("contacts")
      .select("id, name, phone, assigned_to, whatsapp_connection_id, conversation_status, deleted_at")
      .not("conversation_status", "in", '("resolved","archived")')
      .is("deleted_at", null)
      .not("assigned_to", "is", null)
      .order("updated_at", { ascending: true })
      .limit(AUTO_CLOSE_BATCH_LIMIT);

    if (candidatesError) {
      log.error("Error finding stale contacts", { error: errorReason(candidatesError) });
      return errorResponse("Failed to query stale contacts", 500, req);
    }

    interface CandidateContact {
      id: string;
      name?: string;
      phone?: string;
      assigned_to?: string | null;
      whatsapp_connection_id?: string | null;
      conversation_status?: string | null;
      deleted_at?: string | null;
    }

    // Guarda de defesa em profundidade: mesmo que o filtro do banco falhe (ou o teto
    // do PostgREST seja contornado), só entra conversa aberta, viva e atribuída.
    const staleContacts = ((candidates ?? []) as CandidateContact[])
      .filter((contact) =>
        !!contact?.assigned_to &&
        !contact.deleted_at &&
        !TERMINAL_CONVERSATION_STATUSES.includes(contact.conversation_status ?? "")
      )
      .slice(0, AUTO_CLOSE_BATCH_LIMIT);

    if (staleContacts.length === 0) {
      return jsonResponse(
        { message: "No stale conversations found", closed: 0, failed: 0, skipped: 0 },
        200,
        req,
      );
    }

    let closedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const failures: string[] = [];

    for (const contact of staleContacts) {
      const stepErrors: string[] = [];

      // Inatividade = ÚLTIMA MENSAGEM da conversa (não contacts.updated_at).
      const { data: lastRows, error: lastError } = await supabase
        .from("messages")
        .select("sender, created_at")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (lastError) {
        failedCount++;
        failures.push(`${contact.id}: last_message: ${errorReason(lastError)}`);
        log.error("Failed to read last message", { contactId: contact.id, error: errorReason(lastError) });
        continue;
      }

      const lastMessage = ((lastRows ?? []) as Array<{ sender?: string; created_at?: string }>)[0];
      // Sem histórico não há como PROVAR inatividade → não fecha (fail-closed).
      if (!lastMessage?.created_at) {
        skippedCount++;
        continue;
      }
      // Atividade recente → a conversa não está parada de verdade.
      if (new Date(lastMessage.created_at).getTime() >= cutoffDate.getTime()) {
        skippedCount++;
        continue;
      }
      // Última mensagem é do cliente: ele aguarda resposta, não é inatividade.
      if (lastMessage.sender === "contact") {
        skippedCount++;
        continue;
      }

      // ── 3. Enfileira a mensagem de encerramento no outbox oficial ──
      // Mesmo formato do retorno de `enqueue_outbound_message` (migration
      // 20260909220000): status 'sending' + client_message_id + agent_id +
      // whatsapp_connection_id. O RPC exige auth.role()='authenticated', que o service
      // role do cron não tem; o guard de campos internos libera service_role, então o
      // enfileiramento equivalente é esta linha — a mensagem NÃO nasce como enviada.
      if (config.close_message) {
        const clientMessageId = await deriveAutoCloseClientMessageId(
          `${AUTO_CLOSE_CLIENT_MESSAGE_PREFIX}${contact.id}:${lastMessage.created_at}`,
        );
        const { error: enqueueError } = await supabase.from("messages").insert({
          contact_id: contact.id,
          client_message_id: clientMessageId,
          whatsapp_connection_id: contact.whatsapp_connection_id ?? null,
          agent_id: contact.assigned_to,
          sender: "agent",
          content: config.close_message,
          message_type: "text",
          is_read: true,
          status: "sending",
        });
        if (enqueueError) {
          // Reexecução do cron: a mensagem já está no outbox (índice único
          // contact_id + client_message_id). Nada é reescrito — não duplica.
          if (isUniqueViolation(enqueueError)) {
            skippedCount++;
            continue;
          }
          stepErrors.push(`enqueue: ${errorReason(enqueueError)}`);
        }
      }

      if (stepErrors.length > 0) {
        failedCount++;
        failures.push(`${contact.id}: ${stepErrors.join("; ")}`);
        log.error("Failed to auto-close conversation", { contactId: contact.id, errors: stepErrors });
        continue;
      }

      // ── 4. Fechamento e desatribuição SÓ depois de a mensagem ser enfileirada ──
      const { error: closureError } = await supabase.from("conversation_closures").insert({
        contact_id: contact.id,
        close_reason: "inactivity",
        outcome: "auto_closed",
        notes: `Auto-closed after ${config.inactivity_hours}h of inactivity`,
      });
      if (closureError) stepErrors.push(`closure: ${errorReason(closureError)}`);

      const { error: unassignError } = await supabase
        .from("contacts")
        .update({ assigned_to: null })
        .eq("id", contact.id);
      if (unassignError) stepErrors.push(`unassign: ${errorReason(unassignError)}`);

      if (stepErrors.length > 0) {
        failedCount++;
        failures.push(`${contact.id}: ${stepErrors.join("; ")}`);
        log.error("Failed to auto-close conversation", { contactId: contact.id, errors: stepErrors });
        continue;
      }

      closedCount++;
    }

    log.info(`Auto-closed ${closedCount} conversations`, { failed: failedCount, skipped: skippedCount });
    log.done(200, { closed: closedCount, failed: failedCount, skipped: skippedCount });

    return jsonResponse({
      message: `Auto-closed ${closedCount} conversations`,
      closed: closedCount,
      failed: failedCount,
      skipped: skippedCount,
      errors: failures.slice(0, 10),
    }, 200, req);
  } catch (error) {
    log.error("Unexpected error", { error: error instanceof Error ? error.message : String(error) });
    return internalErrorResponse(error, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleAutoCloseConversations(req));
}
