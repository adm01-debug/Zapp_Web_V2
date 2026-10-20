import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { handleCors, errorResponse, jsonResponse, Logger, requireEnv } from "../_shared/validation.ts";
import { ensureValidToken, gmailFetch, reconcileEmailThreads, runGmailFullSync, syncLabels, syncMessageIds } from "../_shared/gmail-helpers.ts";

const GMAIL_RESOURCE_ID_RE = /^[0-9A-Za-z_-]{1,200}$/;
// Cor de marcador do Gmail: o schema só garante o formato hex; a paleta exata é
// validada pela própria API do Gmail (erro explícito devolvido ao chamador).
const GMAIL_LABEL_HEX_RE = /^#[0-9a-fA-F]{6}$/;
// O Gmail aceita nomes de marcador de até 225 caracteres.
const GMAIL_LABEL_NAME_MAX = 225;

const GmailLabelColorSchema = z.object({
  backgroundColor: z.string().regex(GMAIL_LABEL_HEX_RE, "color.backgroundColor deve ser hex #RRGGBB"),
  textColor: z.string().regex(GMAIL_LABEL_HEX_RE, "color.textColor deve ser hex #RRGGBB"),
});

export const GmailSyncActionSchema = z.object({
  message_id: z.string().max(200).regex(GMAIL_RESOURCE_ID_RE).optional(),
  attachment_id: z.string().max(200).regex(GMAIL_RESOURCE_ID_RE).optional(),
  action: z.enum(['sync-labels', 'sync-inbox', 'sync-incremental', 'get-thread', 'setup-watch', 'get-attachment', 'create-label', 'update-label', 'delete-label']),
  account_id: z.string().uuid("account_id must be a valid UUID"),
  query: z.string().max(500).optional(),
  maxResults: z.number().int().min(1).max(200).optional(),
  thread_id: z.string().max(200).regex(GMAIL_RESOURCE_ID_RE).optional(),
  topic_name: z.string().max(500).optional(),
  // Gerenciamento de marcadores do Gmail (create/update/delete-label).
  label_id: z.string().max(200).regex(GMAIL_RESOURCE_ID_RE).optional(),
  name: z.string().max(GMAIL_LABEL_NAME_MAX).optional(),
  color: GmailLabelColorSchema.optional(),
  label_list_visibility: z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).optional(),
  message_list_visibility: z.enum(['show', 'hide']).optional(),
}).superRefine((value, ctx) => {
  if (value.action === 'create-label') {
    if (!value.name || value.name.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['name'], message: 'name é obrigatório para criar um marcador' });
    } else if (value.name !== value.name.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['name'], message: 'name não pode ter espaços nas pontas' });
    }
  }
  if ((value.action === 'update-label' || value.action === 'delete-label') && !value.label_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['label_id'], message: 'label_id é obrigatório' });
  }
  if (
    value.action === 'update-label' && value.name === undefined && value.color === undefined &&
    value.label_list_visibility === undefined && value.message_list_visibility === undefined
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['action'], message: 'nada para atualizar neste marcador' });
  }
});

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailHistoryPage {
  history?: Array<{
    messagesAdded?: Array<{ message: { id: string } }>;
    messagesDeleted?: Array<{ message: { id: string } }>;
    labelsAdded?: Array<{ message: { id: string } }>;
    labelsRemoved?: Array<{ message: { id: string } }>;
  }>;
  historyId?: string;
  nextPageToken?: string;
}

export interface GmailIncrementalSyncOutcome {
  status: number;
  payload: Record<string, unknown>;
}

// R2-API-011B — sync incremental com avanço de cursor por compare-and-swap: o
// UPDATE só grava se o history_id da linha ainda for o lido no início da
// tentativa (account.history_id). 0 linhas = outro fluxo já moveu o cursor →
// conflito: não sobrescreve, não marca a conta como erro, só devolve
// cursor_advanced=false. Erro real do UPDATE é propagado (o fluxo não declara
// sucesso com o cursor não gravado).
export async function runGmailIncrementalSync(
  supabase: SupabaseClient,
  account: { id: string; history_id: string },
  accessToken: string,
  log: Logger,
): Promise<GmailIncrementalSyncOutcome> {
  const changedMessageIds = new Set<string>();
  const deletedMessageIds = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId = account.history_id;
  let pages = 0;
  do {
    const params = new URLSearchParams({ startHistoryId: account.history_id });
    for (const historyType of ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"]) params.append("historyTypes", historyType);
    if (pageToken) params.set("pageToken", pageToken);
    const historyData = await gmailFetch<GmailHistoryPage>(accessToken, `/history?${params.toString()}`);
    for (const record of historyData.history || []) {
      for (const added of record.messagesAdded || []) changedMessageIds.add(added.message.id);
      for (const labeled of record.labelsAdded || []) changedMessageIds.add(labeled.message.id);
      for (const unlabeled of record.labelsRemoved || []) changedMessageIds.add(unlabeled.message.id);
      for (const deleted of record.messagesDeleted || []) deletedMessageIds.add(deleted.message.id);
    }
    latestHistoryId = historyData.historyId || latestHistoryId;
    pageToken = historyData.nextPageToken;
    pages += 1;
    if (pages >= 100 && pageToken) throw new Error("Gmail history exceeded the safe pagination limit");
  } while (pageToken);

  for (const deletedId of deletedMessageIds) changedMessageIds.delete(deletedId);
  const changedResult = await syncMessageIds(supabase, account.id, accessToken, log, [...changedMessageIds]);
  if (changedResult.failed > 0) {
    await supabase.from("gmail_accounts").update({ sync_status: "error", last_sync_at: new Date().toISOString(), last_error: `${changedResult.failed} eventos incrementais falharam; cursor preservado` }).eq("id", account.id);
    return { status: 207, payload: { success: false, cursor_advanced: false, changed_messages: changedMessageIds.size, ...changedResult } };
  }

  const affectedDeletedThreadIds: string[] = [];
  if (deletedMessageIds.size > 0) {
    const ownedDeleted = await supabase.from("email_messages").select("id,thread_id,gmail_message_id").eq("gmail_account_id", account.id).in("gmail_message_id", [...deletedMessageIds]);
    if (ownedDeleted.error) throw new Error("Failed to resolve deleted Gmail messages locally");
    affectedDeletedThreadIds.push(...(ownedDeleted.data || []).map(message => message.thread_id).filter(Boolean));
    if (ownedDeleted.data?.length) {
      const deletion = await supabase.from("email_messages").delete().eq("gmail_account_id", account.id).in("id", ownedDeleted.data.map(message => message.id));
      if (deletion.error) throw new Error("Failed to delete Gmail messages locally");
    }
    await reconcileEmailThreads(supabase, account.id, affectedDeletedThreadIds);
  }
  const { data: advanced, error: cursorError } = await supabase.from("gmail_accounts").update({
    history_id: latestHistoryId,
    sync_status: "synced",
    last_sync_at: new Date().toISOString(),
    last_error: null,
  }).eq("id", account.id).eq("history_id", account.history_id).select("id");
  if (cursorError) throw new Error("Failed to persist Gmail history cursor");
  const cursorAdvanced = Boolean(advanced && advanced.length > 0);
  return { status: 200, payload: { success: true, cursor_advanced: cursorAdvanced, changed_messages: changedMessageIds.size, deleted_messages: deletedMessageIds.size, synced: changedResult.synced, history_pages: pages } };
}

// ─── Gerenciamento de marcadores do Gmail (create/update/delete-label) ───────
// Alcança paridade com a V3 (`useGmailLabels.ts`, ações createLabel/updateLabel/
// deleteLabel). Os ids de sistema do Gmail não podem ser apagados pela API;
// negamos antes de qualquer chamada externa. Cada mutação espelha a linha em
// `email_labels` (upsert no create/update, delete na remoção), sempre escopada
// por `gmail_account_id` — mesmo padrão de `syncLabels`.
const SYSTEM_GMAIL_LABEL_IDS = new Set([
  "INBOX", "SENT", "DRAFT", "DRAFTS", "SPAM", "TRASH", "STARRED", "IMPORTANT",
  "UNREAD", "CHAT", "SCHEDULED",
]);

/** Marcador de sistema do Gmail: não pode ser apagado (INBOX, CATEGORY_*, ...). */
export function isSystemGmailLabelId(labelId: string): boolean {
  const upper = labelId.trim().toUpperCase();
  return SYSTEM_GMAIL_LABEL_IDS.has(upper) || upper.startsWith("CATEGORY_");
}

export type GmailLabelMutationAction = "create-label" | "update-label" | "delete-label";

export interface GmailLabelMutationInput {
  name?: string;
  label_id?: string;
  color?: { backgroundColor: string; textColor: string };
  label_list_visibility?: "labelShow" | "labelShowIfUnread" | "labelHide";
  message_list_visibility?: "show" | "hide";
}

export interface GmailLabelMutationOutcome {
  status: number;
  payload: Record<string, unknown>;
}

interface GmailLabelResource {
  id?: string;
  name?: string;
  type?: string;
  color?: { backgroundColor?: string };
  messagesTotal?: number;
  messagesUnread?: number;
}

/** Chamada de mutação à API do Gmail (POST/PATCH/DELETE). DELETE responde 204. */
async function gmailLabelFetch(
  accessToken: string,
  path: string,
  init: { method: string; body?: unknown },
): Promise<GmailLabelResource | null> {
  const response = await fetch(`${GMAIL_API}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) throw new Error(`Gmail API error (${response.status}): ${await response.text()}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? (JSON.parse(text) as GmailLabelResource) : null;
}

/**
 * Cria, renomeia/apaga um marcador do Gmail e espelha o resultado em
 * `email_labels`. Erro do espelho local é propagado: o fluxo não declara
 * sucesso com o banco desatualizado (mesma regra de `syncLabels`).
 */
export async function runGmailLabelMutation(
  supabase: SupabaseClient,
  accountId: string,
  accessToken: string,
  action: GmailLabelMutationAction,
  input: GmailLabelMutationInput,
): Promise<GmailLabelMutationOutcome> {
  if (action === "create-label") {
    const payload: Record<string, unknown> = { name: input.name };
    if (input.label_list_visibility) payload.labelListVisibility = input.label_list_visibility;
    if (input.message_list_visibility) payload.messageListVisibility = input.message_list_visibility;
    if (input.color) payload.color = input.color;
    const created = await gmailLabelFetch(accessToken, "/labels", { method: "POST", body: payload });
    if (created?.id) {
      const { error } = await supabase.from("email_labels").upsert({
        gmail_account_id: accountId,
        gmail_label_id: created.id,
        name: created.name ?? input.name ?? "",
        label_type: created.type === "system" ? "system" : "user",
        color: created.color?.backgroundColor ?? null,
        message_count: created.messagesTotal ?? 0,
        unread_count: created.messagesUnread ?? 0,
      }, { onConflict: "gmail_account_id,gmail_label_id" });
      if (error) throw new Error("Failed to persist Gmail label locally");
    }
    return { status: 201, payload: { success: true, label: created } };
  }

  const labelId = input.label_id as string;

  if (action === "update-label") {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.color) patch.color = input.color;
    if (input.label_list_visibility) patch.labelListVisibility = input.label_list_visibility;
    if (input.message_list_visibility) patch.messageListVisibility = input.message_list_visibility;
    const updated = await gmailLabelFetch(accessToken, `/labels/${encodeURIComponent(labelId)}`, {
      method: "PATCH",
      body: { id: labelId, ...patch },
    });
    const localPatch: Record<string, unknown> = {};
    if (input.name !== undefined) localPatch.name = updated?.name ?? input.name;
    if (input.color) localPatch.color = updated?.color?.backgroundColor ?? input.color.backgroundColor;
    if (Object.keys(localPatch).length > 0) {
      const { error } = await supabase.from("email_labels").update(localPatch)
        .eq("gmail_account_id", accountId).eq("gmail_label_id", labelId);
      if (error) throw new Error("Failed to persist Gmail label locally");
    }
    return { status: 200, payload: { success: true, label: updated } };
  }

  // delete-label
  if (isSystemGmailLabelId(labelId)) {
    return { status: 400, payload: { success: false, error: "Marcador de sistema não pode ser apagado" } };
  }
  await gmailLabelFetch(accessToken, `/labels/${encodeURIComponent(labelId)}`, { method: "DELETE" });
  const { error } = await supabase.from("email_labels").delete()
    .eq("gmail_account_id", accountId).eq("gmail_label_id", labelId);
  if (error) throw new Error("Failed to remove Gmail label locally");
  return { status: 200, payload: { success: true, deleted: true, label_id: labelId } };
}

export async function handleGmailSync(req: Request): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const log = new Logger("gmail-sync");

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) { log.done(401); return errorResponse("Unauthorized", 401, req); }

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const rawBody = await req.json();
    const parsed = GmailSyncActionSchema.safeParse(rawBody);
    if (!parsed.success) {
      const errors = parsed.error.flatten();
      const msg = Object.entries(errors.fieldErrors).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`).join('; ');
      log.done(400);
      return errorResponse(msg || "Invalid request", 400, req);
    }

    const body = parsed.data;
    log.info("Processing action", { action: body.action, accountId: body.account_id });

    const { data: account } = await supabase
      .from("gmail_accounts")
      .select("id, email_address, is_active, sync_status, token_expires_at, history_id, user_id")
      .eq("id", body.account_id).eq("user_id", user.id).eq("is_active", true).single();

    // Conta do próprio usuário: o filtro por `user_id` é o que nega o não-dono.
    // Negação explícita (403) — antes isto caía no throw genérico e o cliente
    // recebia 500 "Internal server error", escondendo a recusa.
    if (!account) {
      log.done(403, { action: body.action });
      return errorResponse("Gmail account not found or inactive", 403, req);
    }

    const accessToken = await ensureValidToken(supabase, account, log);

    switch (body.action) {
      case "sync-labels": {
        await syncLabels(supabase, account.id, accessToken);
        log.done(200);
        return jsonResponse({ success: true }, 200, req);
      }

      case "sync-inbox": {
        await supabase.from("gmail_accounts").update({ sync_status: "syncing" }).eq("id", account.id);
        try {
          const result = await runGmailFullSync(supabase, account.id, accessToken, log, body.query || "in:inbox", body.maxResults || 50);
          if (result.failed > 0) {
            log.done(207, { synced: result.synced, failed: result.failed });
            return jsonResponse({ success: false, ...result }, 207, req);
          }
          log.done(200, { synced: result.synced });
          return jsonResponse({ success: true, ...result }, 200, req);
        } catch (err: unknown) {
          try {
            // token revogado/expirado vira 'reauth_required'; o resto 'error'.
            await recordGmailAccountFailure(supabase, account.id, err, 1);
          } catch (recordErr) {
            log.error("Falha ao registrar o estado de erro da conta Gmail", { error: recordErr instanceof Error ? recordErr.message : String(recordErr) });
          }
          throw err;
        }
      }

      case "sync-incremental": {
        if (!account.history_id) { log.done(400); return errorResponse("No history_id. Run full sync first.", 400, req); }
        const outcome = await runGmailIncrementalSync(supabase, account, accessToken, log);
        log.done(outcome.status, { changedMessages: outcome.payload.changed_messages, deletedMessages: outcome.payload.deleted_messages, synced: outcome.payload.synced, pages: outcome.payload.history_pages, cursorAdvanced: outcome.payload.cursor_advanced });
        return jsonResponse(outcome.payload, outcome.status, req);
      }

      case "get-thread": {
        if (!body.thread_id) throw new Error("Missing thread_id");
        const { data: ownedThread } = await supabase.from("email_threads").select("id").eq("gmail_account_id", account.id).eq("gmail_thread_id", body.thread_id).maybeSingle();
        if (!ownedThread) return errorResponse("Thread not found for this account", 404, req);
        const threadData = await gmailFetch(accessToken, `/threads/${body.thread_id}?format=full`);
        log.done(200);
        return jsonResponse(threadData, 200, req);
      }

      case "setup-watch": {
        if (!body.topic_name) throw new Error("Missing topic_name");
        const response = await fetch(`${GMAIL_API}/watch`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ topicName: body.topic_name, labelIds: ["INBOX"] }),
        });
        if (!response.ok) throw new Error(`Watch setup failed: ${await response.text()}`);
        const watchData = await response.json();
        await supabase.from("gmail_accounts").update({
          history_id: watchData.historyId,
          watch_expiration: new Date(Number.parseInt(watchData.expiration)).toISOString(),
        }).eq("id", account.id);
        log.done(200);
        return jsonResponse({ success: true, ...watchData }, 200, req);
      }

      // FIX E40: get-attachment - download de anexo sob demanda
      case "get-attachment": {
        const { message_id, attachment_id } = body;
        if (!message_id || !attachment_id) return errorResponse("Missing message_id or attachment_id", 400, req);
        const { data: ownedMessage } = await supabase.from("email_messages").select("id").eq("gmail_account_id", account.id).eq("gmail_message_id", message_id).maybeSingle();
        if (!ownedMessage) return errorResponse("Message not found for this account", 404, req);
        const { data: ownedAttachment } = await supabase.from("email_attachments").select("id").eq("email_message_id", ownedMessage.id).eq("gmail_attachment_id", attachment_id).maybeSingle();
        if (!ownedAttachment) return errorResponse("Attachment not found for this message", 404, req);
        const data = await gmailFetch(accessToken, `/messages/${message_id}/attachments/${attachment_id}`);
        log.done(200); return jsonResponse({ data: data.data, size: data.size }, 200, req);
      }
      // Paridade com a V3 `useGmailLabels.ts` (createLabel/updateLabel/deleteLabel).
      case "create-label":
      case "update-label":
      case "delete-label": {
        const outcome = await runGmailLabelMutation(supabase, account.id, accessToken, body.action, body);
        log.done(outcome.status, { action: body.action });
        return jsonResponse(outcome.payload, outcome.status, req);
      }

      default:
        log.done(400);
        return errorResponse(`Unknown action: ${body.action}`, 400, req);
    }
  } catch (error) {
    log.error("Gmail Sync error", { error: error instanceof Error ? error.message : String(error) });
    log.done(500);
    return errorResponse(error instanceof Error ? sanitizeGmailErrorMessage(error.message) : "Internal server error", 500, req);
  }
}

if (import.meta.main) {
  serve(handleGmailSync);
}
