import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { Logger, requireEnv } from "./validation.ts";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailMessagePart {
  mimeType: string;
  filename?: string;
  body?: { data?: string; size: number; attachmentId?: string };
  parts?: GmailMessagePart[];
  headers?: Array<{ name: string; value: string }>;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    mimeType: string;
    body?: { data?: string; size: number; attachmentId?: string };
    parts?: GmailMessagePart[];
  };
}

interface GmailMessageList { messages?: Array<{ id: string }>; nextPageToken?: string }
interface GmailLabelList { labels?: Array<{ id: string; name: string; type: string; color?: { backgroundColor?: string }; messagesTotal?: number; messagesUnread?: number }> }
interface GmailTokens { access_token: string; refresh_token: string }
interface GmailAccountForToken { id: string; token_expires_at: string }

export function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find(header => header.name.toLowerCase() === name.toLowerCase())?.value || "";
}

export function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(data.length / 4) * 4, "=");
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(base64), character => character.charCodeAt(0)));
  } catch {
    return atob(base64);
  }
}

export function extractBody(payload: GmailMessage["payload"]): { text: string; html: string } {
  let text = "";
  let html = "";
  const processPart = (part: GmailMessagePart) => {
    if (part.mimeType === "text/plain" && part.body?.data && !text) text = decodeBase64Url(part.body.data);
    else if (part.mimeType === "text/html" && part.body?.data && !html) html = decodeBase64Url(part.body.data);
    part.parts?.forEach(processPart);
  };
  if (payload.body?.data) {
    if (payload.mimeType === "text/html") html = decodeBase64Url(payload.body.data);
    else text = decodeBase64Url(payload.body.data);
  }
  payload.parts?.forEach(processPart);
  return { text, html };
}

export function extractAttachments(payload: GmailMessage["payload"]): Array<{ filename: string; mimeType: string; attachmentId: string; size: number }> {
  const attachments: Array<{ filename: string; mimeType: string; attachmentId: string; size: number }> = [];
  const processPart = (part: GmailMessagePart) => {
    if (part.filename && part.body?.attachmentId) attachments.push({ filename: part.filename, mimeType: part.mimeType, attachmentId: part.body.attachmentId, size: part.body.size || 0 });
    part.parts?.forEach(processPart);
  };
  payload.parts?.forEach(processPart);
  return attachments;
}

export function parseGmailAddressList(header: string): Array<{ name: string; address: string }> {
  const tokens: string[] = [];
  let token = "";
  let quoted = false;
  let angleDepth = 0;
  for (const character of header) {
    if (character === '"') quoted = !quoted;
    if (!quoted && character === '<') angleDepth += 1;
    if (!quoted && character === '>') angleDepth = Math.max(0, angleDepth - 1);
    if (character === ',' && !quoted && angleDepth === 0) { if (token.trim()) tokens.push(token.trim()); token = ""; }
    else token += character;
  }
  if (token.trim()) tokens.push(token.trim());
  return tokens.map(value => {
    const match = value.match(/^(?:"([^"]+)"|([^<]+?))?\s*<([^>]+)>$/);
    if (match) return { name: (match[1] || match[2] || "").trim(), address: match[3].trim().toLowerCase() };
    return { name: "", address: value.replace(/^mailto:/i, "").trim().toLowerCase() };
  }).filter(item => item.address.includes('@'));
}

export async function getTokens(supabase: SupabaseClient, accountId: string): Promise<GmailTokens> {
  const { data, error } = await supabase.rpc("get_gmail_tokens", { p_account_id: accountId });
  if (error || !data?.length) throw new Error("Failed to retrieve tokens");
  return data[0] as GmailTokens;
}

export async function storeTokens(supabase: SupabaseClient, accountId: string, accessToken: string, refreshToken?: string | null): Promise<void> {
  const { error } = await supabase.rpc("store_gmail_tokens", { p_account_id: accountId, p_access_token: accessToken, p_refresh_token: refreshToken ?? null });
  if (error) throw new Error("Failed to persist refreshed Gmail token");
}

export async function ensureValidToken(supabase: SupabaseClient, account: GmailAccountForToken, log: Logger): Promise<string> {
  const storedTokens = await getTokens(supabase, account.id);
  if (Date.now() < new Date(account.token_expires_at).getTime() - 5 * 60 * 1000) return storedTokens.access_token;
  log.info("Refreshing Gmail token");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: storedTokens.refresh_token, client_id: requireEnv("GOOGLE_CLIENT_ID"), client_secret: requireEnv("GOOGLE_CLIENT_SECRET"), grant_type: "refresh_token" }),
  });
  if (!response.ok) throw new Error("Failed to refresh token");
  const tokens = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await storeTokens(supabase, account.id, tokens.access_token, tokens.refresh_token || null);
  const { error } = await supabase.from("gmail_accounts").update({ token_expires_at: newExpiresAt }).eq("id", account.id);
  if (error) throw new Error("Failed to persist Gmail token expiration");
  return tokens.access_token;
}

export async function gmailFetch<T = Record<string, unknown>>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`${GMAIL_API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Gmail API error (${response.status}): ${await response.text()}`);
  return response.json() as Promise<T>;
}

export async function syncLabels(supabase: SupabaseClient, accountId: string, accessToken: string): Promise<void> {
  const data = await gmailFetch<GmailLabelList>(accessToken, "/labels");
  for (const label of data.labels || []) {
    const { error } = await supabase.from("email_labels").upsert({ gmail_account_id: accountId, gmail_label_id: label.id, name: label.name, label_type: label.type === "system" ? "system" : "user", color: label.color?.backgroundColor || null, message_count: label.messagesTotal || 0, unread_count: label.messagesUnread || 0 }, { onConflict: "gmail_account_id,gmail_label_id" });
    if (error) throw new Error(`Failed to persist Gmail label ${label.id}`);
  }
}

export async function reconcileEmailThreads(supabase: SupabaseClient, accountId: string, localThreadIds: string[]): Promise<void> {
  for (const threadId of [...new Set(localThreadIds.filter(Boolean))]) {
    const { data: messages, error } = await supabase.from("email_messages").select("from_name,from_address,subject,snippet,internal_date,label_ids,is_read,is_starred").eq("gmail_account_id", accountId).eq("thread_id", threadId).order("internal_date", { ascending: false });
    if (error) throw new Error(`Failed to reconcile local thread ${threadId}`);
    if (!messages?.length) {
      const deletion = await supabase.from("email_threads").delete().eq("gmail_account_id", accountId).eq("id", threadId);
      if (deletion.error) throw new Error(`Failed to remove empty local thread ${threadId}`);
      continue;
    }
    const latest = messages[0];
    const aggregateLabels = [...new Set(messages.flatMap(message => message.label_ids || []))];
    const update = await supabase.from("email_threads").update({
      subject: latest.subject || "", snippet: latest.snippet || "", last_message_at: latest.internal_date,
      last_from_name: latest.from_name || null, last_from_address: latest.from_address || null,
      label_ids: aggregateLabels, message_count: messages.length,
      is_unread: messages.some(message => !message.is_read), is_starred: messages.some(message => message.is_starred),
      is_important: aggregateLabels.includes("IMPORTANT"), status: aggregateLabels.includes("INBOX") ? "open" : "archived",
    }).eq("gmail_account_id", accountId).eq("id", threadId);
    if (update.error) throw new Error(`Failed to update local thread ${threadId}`);
  }
}

export async function syncMessageIds(supabase: SupabaseClient, accountId: string, accessToken: string, log: Logger, messageIds: string[]) {
  const { data: gmailAccount, error: accountError } = await supabase.from("gmail_accounts").select("email_address").eq("id", accountId).single();
  if (accountError || !gmailAccount?.email_address) throw new Error("Gmail account address unavailable during sync");
  const accountEmail = gmailAccount.email_address.toLowerCase();
  const results: Array<{ id: string; threadId: string; subject: string }> = [];
  const failed: Array<{ id: string; error: string }> = [];
  const affectedLocalThreadIds = new Set<string>();

  for (const messageId of [...new Set(messageIds)]) {
    try {
      const message = await gmailFetch<GmailMessage>(accessToken, `/messages/${messageId}?format=full`);
      const headers = message.payload.headers;
      const from = parseGmailAddressList(getHeader(headers, "From"))[0] || { name: "", address: getHeader(headers, "From").trim().toLowerCase() };
      const to = parseGmailAddressList(getHeader(headers, "To"));
      const cc = parseGmailAddressList(getHeader(headers, "Cc"));
      const { text, html } = extractBody(message.payload);
      const attachments = extractAttachments(message.payload);
      const internalDate = new Date(Number(message.internalDate)).toISOString();
      const subject = getHeader(headers, "Subject");
      if (!message.id || !message.threadId || internalDate === 'Invalid Date') throw new Error("Invalid Gmail message payload");

      const threadResult = await supabase.from("email_threads").upsert({ gmail_account_id: accountId, gmail_thread_id: message.threadId, subject, snippet: message.snippet, label_ids: message.labelIds, last_message_at: internalDate }, { onConflict: "gmail_account_id,gmail_thread_id" }).select("id,contact_id").single();
      if (threadResult.error || !threadResult.data?.id) throw new Error("Failed to persist Gmail thread");
      const localThread = threadResult.data;
      affectedLocalThreadIds.add(localThread.id);
      const isOutbound = from.address === accountEmail;
      const messageResult = await supabase.from("email_messages").upsert({
        thread_id: localThread.id, gmail_message_id: message.id, gmail_account_id: accountId,
        from_address: from.address, from_name: from.name, to_addresses: to.map(item => item.address), cc_addresses: cc.map(item => item.address),
        reply_to_address: parseGmailAddressList(getHeader(headers, "Reply-To"))[0]?.address || null,
        subject, body_text: text, body_html: html, snippet: message.snippet, label_ids: message.labelIds,
        is_read: !message.labelIds.includes("UNREAD"), is_starred: message.labelIds.includes("STARRED"), has_attachments: attachments.length > 0,
        in_reply_to: getHeader(headers, "In-Reply-To") || null, references_header: getHeader(headers, "References") || null,
        message_id_header: getHeader(headers, "Message-ID") || null, internal_date: internalDate, direction: isOutbound ? "outbound" : "inbound",
      }, { onConflict: "gmail_account_id,gmail_message_id" }).select("id").single();
      if (messageResult.error || !messageResult.data?.id) throw new Error("Failed to persist Gmail message");

      for (const attachment of attachments) {
        const attachmentResult = await supabase.from("email_attachments").upsert({ email_message_id: messageResult.data.id, gmail_attachment_id: attachment.attachmentId, filename: attachment.filename, mime_type: attachment.mimeType, size_bytes: attachment.size }, { onConflict: "email_message_id,gmail_attachment_id" });
        if (attachmentResult.error) throw new Error(`Failed to persist attachment ${attachment.attachmentId}`);
      }

      if (!localThread.contact_id) {
        const contactEmail = isOutbound ? to[0]?.address : from.address;
        if (contactEmail) {
          const contactResult = await supabase.from("contacts").select("id").ilike("email", contactEmail).maybeSingle();
          if (contactResult.data?.id) await supabase.from("email_threads").update({ contact_id: contactResult.data.id }).eq("gmail_account_id", accountId).eq("id", localThread.id);
        }
      }
      results.push({ id: message.id, threadId: message.threadId, subject });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Error syncing message ${messageId}`, { error: errorMessage });
      failed.push({ id: messageId, error: errorMessage });
    }
  }

  await reconcileEmailThreads(supabase, accountId, [...affectedLocalThreadIds]);
  if (failed.length > 0) {
    const { error } = await supabase.from("gmail_accounts").update({ last_error: `${failed.length} mensagens falharam na sincronização` }).eq("id", accountId);
    if (error) log.error("Failed to record Gmail sync failure", { error: error.message });
  }
  return { synced: results.length, failed: failed.length, failures: failed, messages: results };
}

export async function syncMessages(supabase: SupabaseClient, accountId: string, accessToken: string, log: Logger, query = "", maxResults = 50) {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (query) params.set("q", query);
  const listData = await gmailFetch<GmailMessageList>(accessToken, `/messages?${params.toString()}`);
  const result = await syncMessageIds(supabase, accountId, accessToken, log, (listData.messages || []).map(message => message.id));
  return { ...result, nextPageToken: listData.nextPageToken };
}

// ---------------------------------------------------------------------------
// Pipeline incremental canônico (R2-API-011) — UM só, por conta, consumido por
// gmail-webhook, gmail-cron-sync e gmail-sync (action=sync-incremental).
// Percorre TODAS as páginas do users.history.list e TODOS os tipos de evento,
// aplica os efeitos nos IDs realmente alterados e só então avança o cursor com
// compare-and-swap. Qualquer falha conserva o history_id lido no início (ponto
// recuperável) e o 404 do Gmail marca a conta para resync completo.
// ---------------------------------------------------------------------------

export const GMAIL_HISTORY_TYPES = ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"] as const;
const GMAIL_HISTORY_MAX_PAGES = 100;

export type GmailIncrementalStatus =
  | "synced"
  | "partial_failure"
  | "history_expired"
  | "cursor_conflict"
  | "needs_full_sync";

export interface GmailIncrementalSyncResult {
  status: GmailIncrementalStatus;
  cursor_advanced: boolean;
  changed_messages: number;
  deleted_messages: number;
  synced: number;
  failed: number;
  failures: Array<{ id: string; error: string }>;
  messages: Array<{ id: string; threadId: string; subject: string }>;
  history_pages: number;
  history_id: string | null;
}

interface GmailHistoryRecord {
  messagesAdded?: Array<{ message: { id: string } }>;
  messagesDeleted?: Array<{ message: { id: string } }>;
  labelsAdded?: Array<{ message: { id: string } }>;
  labelsRemoved?: Array<{ message: { id: string } }>;
}

interface GmailHistoryPage {
  history?: GmailHistoryRecord[];
  historyId?: string;
  nextPageToken?: string;
}

export async function runGmailIncrementalSync(
  supabase: SupabaseClient,
  account: { id: string; history_id: string | null },
  accessToken: string,
  log: Logger,
): Promise<GmailIncrementalSyncResult> {
  const base = {
    cursor_advanced: false,
    changed_messages: 0,
    deleted_messages: 0,
    synced: 0,
    failed: 0,
    failures: [] as Array<{ id: string; error: string }>,
    messages: [] as Array<{ id: string; threadId: string; subject: string }>,
    history_pages: 0,
    history_id: account.history_id,
  };
  if (!account.history_id) return { status: "needs_full_sync", ...base };

  const changedMessageIds = new Set<string>();
  const deletedMessageIds = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId = account.history_id;
  let pages = 0;

  // O fetch é direto (não gmailFetch) porque o 404 tem tratamento próprio:
  // startHistoryId expirado = conta marcada para resync, nunca cursor inválido.
  do {
    const params = new URLSearchParams({ startHistoryId: account.history_id });
    for (const historyType of GMAIL_HISTORY_TYPES) params.append("historyTypes", historyType);
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`${GMAIL_API}/history?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 404) {
      log.warn("Gmail history_id expirado; marcando conta para resync completo", { account: account.id });
      const { data: reset, error } = await supabase.from("gmail_accounts").update({
        sync_status: "pending",
        history_id: null,
        last_error: "History ID expired - full resync needed",
      }).eq("id", account.id).eq("history_id", account.history_id).select("id");
      if (error) throw new Error("Failed to flag Gmail account for full resync");
      if (!reset?.length) {
        log.warn("Conflito de cursor do Gmail: outro processo já avançou o history_id", { account: account.id });
        return { status: "cursor_conflict", ...base };
      }
      return { status: "history_expired", ...base };
    }
    if (!response.ok) throw new Error(`Gmail API error (${response.status}): ${await response.text()}`);
    const historyData = await response.json() as GmailHistoryPage;
    for (const record of historyData.history || []) {
      for (const added of record.messagesAdded || []) changedMessageIds.add(added.message.id);
      for (const labeled of record.labelsAdded || []) changedMessageIds.add(labeled.message.id);
      for (const unlabeled of record.labelsRemoved || []) changedMessageIds.add(unlabeled.message.id);
      for (const deleted of record.messagesDeleted || []) deletedMessageIds.add(deleted.message.id);
    }
    latestHistoryId = historyData.historyId || latestHistoryId;
    pageToken = historyData.nextPageToken;
    pages += 1;
    if (pages >= GMAIL_HISTORY_MAX_PAGES && pageToken) throw new Error("Gmail history exceeded the safe pagination limit");
  } while (pageToken);

  // Removida vence reetiquetada/reenviada: GET numa mensagem apagada seria
  // falha artificial que bloquearia o cursor.
  for (const deletedId of deletedMessageIds) changedMessageIds.delete(deletedId);

  const changedResult = await syncMessageIds(supabase, account.id, accessToken, log, [...changedMessageIds]);
  if (changedResult.failed > 0) {
    const { error } = await supabase.from("gmail_accounts").update({
      sync_status: "error",
      last_sync_at: new Date().toISOString(),
      last_error: `${changedResult.failed} eventos incrementais falharam; cursor preservado`,
    }).eq("id", account.id);
    if (error) throw new Error("Failed to record incremental sync failure");
    return {
      status: "partial_failure",
      ...base,
      changed_messages: changedMessageIds.size,
      deleted_messages: deletedMessageIds.size,
      synced: changedResult.synced,
      failed: changedResult.failed,
      failures: changedResult.failures,
      messages: changedResult.messages,
      history_pages: pages,
    };
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

  // Compare-and-swap: o update só encontra a linha se o cursor ainda for o
  // lido no início desta invocação. 0 linhas = outro processo (webhook, cron
  // ou outro incremental) já avançou — NÃO reescreve, porque essa invocação
  // antiga poderia regredir o cursor compartilhado.
  const { data: advanced, error: cursorError } = await supabase.from("gmail_accounts").update({
    history_id: latestHistoryId,
    sync_status: "synced",
    last_sync_at: new Date().toISOString(),
    last_error: null,
  }).eq("id", account.id).eq("history_id", account.history_id).select("id");
  if (cursorError) throw new Error("Failed to advance Gmail history cursor");
  if (!advanced?.length) {
    log.warn("Conflito de cursor do Gmail: outro processo já avançou o history_id", { account: account.id });
    return {
      status: "cursor_conflict",
      ...base,
      changed_messages: changedMessageIds.size,
      deleted_messages: deletedMessageIds.size,
      synced: changedResult.synced,
      messages: changedResult.messages,
      history_pages: pages,
    };
  }

  return {
    status: "synced",
    cursor_advanced: true,
    changed_messages: changedMessageIds.size,
    deleted_messages: deletedMessageIds.size,
    synced: changedResult.synced,
    failed: 0,
    failures: [],
    messages: changedResult.messages,
    history_pages: pages,
    history_id: latestHistoryId,
  };
}
