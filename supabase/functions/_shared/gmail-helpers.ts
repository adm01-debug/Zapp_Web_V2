// Shared Gmail helpers extracted from gmail-sync/index.ts

import { Logger, requireEnv } from "./validation.ts";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload: {
    headers: { name: string; value: string }[];
    mimeType: string;
    body?: { data?: string; size: number; attachmentId?: string };
    parts?: GmailMessagePart[];
  };
}

export interface GmailMessagePart {
  mimeType: string;
  filename?: string;
  body?: { data?: string; size: number; attachmentId?: string };
  parts?: GmailMessagePart[];
  headers?: { name: string; value: string }[];
}

export function getHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

export function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeURIComponent(
      atob(base64).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
    );
  } catch {
    return atob(base64);
  }
}

export function extractBody(payload: GmailMessage["payload"]): { text: string; html: string } {
  let text = "";
  let html = "";

  function processPart(part: GmailMessagePart) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      text = decodeBase64Url(part.body.data);
    } else if (part.mimeType === "text/html" && part.body?.data) {
      html = decodeBase64Url(part.body.data);
    }
    if (part.parts) part.parts.forEach(processPart);
  }

  if (payload.body?.data) {
    if (payload.mimeType === "text/html") html = decodeBase64Url(payload.body.data);
    else text = decodeBase64Url(payload.body.data);
  }
  if (payload.parts) payload.parts.forEach(processPart);

  return { text, html };
}

export function extractAttachments(payload: GmailMessage["payload"]): Array<{
  filename: string; mimeType: string; attachmentId: string; size: number;
}> {
  const attachments: Array<{ filename: string; mimeType: string; attachmentId: string; size: number }> = [];

  function processPart(part: GmailMessagePart) {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({ filename: part.filename, mimeType: part.mimeType, attachmentId: part.body.attachmentId, size: part.body.size || 0 });
    }
    if (part.parts) part.parts.forEach(processPart);
  }

  if (payload.parts) payload.parts.forEach(processPart);
  return attachments;
}

// deno-lint-ignore no-explicit-any
export async function getTokens(supabase: any, accountId: string): Promise<{ access_token: string; refresh_token: string }> {
  const { data, error } = await supabase.rpc("get_gmail_tokens", { p_account_id: accountId });
  if (error || !data?.length) throw new Error("Failed to retrieve tokens");
  return data[0];
}

// deno-lint-ignore no-explicit-any
export async function storeTokens(supabase: any, accountId: string, accessToken: string, refreshToken?: string | null) {
  await supabase.rpc("store_gmail_tokens", {
    p_account_id: accountId,
    p_access_token: accessToken,
    p_refresh_token: refreshToken ?? null,
  });
}

// deno-lint-ignore no-explicit-any
export async function ensureValidToken(supabase: any, account: any, log: Logger): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(account.token_expires_at);
  const storedTokens = await getTokens(supabase, account.id);

  if (now < new Date(expiresAt.getTime() - 5 * 60 * 1000)) {
    return storedTokens.access_token;
  }

  log.info("Refreshing Gmail token");
  const GOOGLE_CLIENT_ID = requireEnv("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = requireEnv("GOOGLE_CLIENT_SECRET");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: storedTokens.refresh_token,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) throw new Error("Failed to refresh token");
  const tokens = await response.json();

  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await storeTokens(supabase, account.id, tokens.access_token, tokens.refresh_token || null);
  await supabase.from("gmail_accounts").update({ token_expires_at: newExpiresAt }).eq("id", account.id);

  return tokens.access_token;
}

// deno-lint-ignore no-explicit-any
export async function gmailFetch(accessToken: string, path: string): Promise<any> {
  const response = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gmail API error (${response.status}): ${error}`);
  }
  return response.json();
}

// deno-lint-ignore no-explicit-any
export async function syncLabels(supabase: any, accountId: string, accessToken: string) {
  const data = await gmailFetch(accessToken, "/labels");

  for (const label of data.labels || []) {
    await supabase.from("email_labels").upsert({
      gmail_account_id: accountId,
      gmail_label_id: label.id,
      name: label.name,
      label_type: label.type === "system" ? "system" : "user",
      color: label.color?.backgroundColor || null,
      message_count: label.messagesTotal || 0,
      unread_count: label.messagesUnread || 0,
    }, { onConflict: "gmail_account_id,gmail_label_id" });
  }
}

// deno-lint-ignore no-explicit-any
export async function syncMessages(
  supabase: any, accountId: string, accessToken: string, log: Logger,
  query: string = "", maxResults: number = 50
) {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (query) params.set("q", query);

  const listData = await gmailFetch(accessToken, `/messages?${params.toString()}`);
  // deno-lint-ignore no-explicit-any
  const messageIds = (listData.messages || []).map((m: any) => m.id);
  const results = [];

  for (const msgId of messageIds) {
    try {
      const msg: GmailMessage = await gmailFetch(accessToken, `/messages/${msgId}?format=full`);
      const headers = msg.payload.headers;
      const { text, html } = extractBody(msg.payload);
      const attachments = extractAttachments(msg.payload);

      const fromRaw = getHeader(headers, "From");
      const fromMatch = fromRaw.match(/(?:"?([^"]*)"?\s)?<?([^>]+)>?/);
      const fromName = fromMatch?.[1]?.trim() || "";
      const fromAddress = fromMatch?.[2]?.trim() || fromRaw;

      const toRaw = getHeader(headers, "To");
      const toAddresses = toRaw.split(",").map(t => t.trim()).filter(Boolean);
      const ccRaw = getHeader(headers, "Cc");
      const ccAddresses = ccRaw ? ccRaw.split(",").map(t => t.trim()).filter(Boolean) : [];

      const { data: thread } = await supabase.from("email_threads").upsert({
        gmail_account_id: accountId, gmail_thread_id: msg.threadId,
        subject: getHeader(headers, "Subject"), snippet: msg.snippet, label_ids: msg.labelIds,
        is_unread: msg.labelIds.includes("UNREAD"), is_starred: msg.labelIds.includes("STARRED"),
        is_important: msg.labelIds.includes("IMPORTANT"),
        last_message_at: new Date(parseInt(msg.internalDate)).toISOString(),
      }, { onConflict: "gmail_account_id,gmail_thread_id" }).select().single();

      const { data: gmailAccount } = await supabase.from("gmail_accounts").select("email_address").eq("id", accountId).single();
      const isOutbound = fromAddress.toLowerCase() === gmailAccount?.email_address?.toLowerCase();

      const { data: emailMsg } = await supabase.from("email_messages").upsert({
        thread_id: thread?.id, gmail_message_id: msg.id, gmail_account_id: accountId,
        from_address: fromAddress, from_name: fromName, to_addresses: toAddresses, cc_addresses: ccAddresses,
        reply_to_address: getHeader(headers, "Reply-To") || null,
        subject: getHeader(headers, "Subject"), body_text: text, body_html: html, snippet: msg.snippet,
        label_ids: msg.labelIds, is_read: !msg.labelIds.includes("UNREAD"),
        is_starred: msg.labelIds.includes("STARRED"), has_attachments: attachments.length > 0,
        in_reply_to: getHeader(headers, "In-Reply-To") || null,
        references_header: getHeader(headers, "References") || null,
        internal_date: new Date(parseInt(msg.internalDate)).toISOString(),
        direction: isOutbound ? "outbound" : "inbound",
      }, { onConflict: "gmail_message_id" }).select().single();

      if (emailMsg && attachments.length > 0) {
        for (const att of attachments) {
          await supabase.from("email_attachments").upsert({
            email_message_id: emailMsg.id, gmail_attachment_id: att.attachmentId,
            filename: att.filename, mime_type: att.mimeType, size_bytes: att.size,
          }, { onConflict: "email_message_id" }).select();
        }
      }

      if (thread && !thread.contact_id) {
        const contactEmail = isOutbound ? toAddresses[0] : fromAddress;
        if (contactEmail) {
          const cleanEmail = contactEmail.replace(/<|>/g, "").trim().toLowerCase();
          const { data: contact } = await supabase.from("contacts").select("id").ilike("email", cleanEmail).maybeSingle();
          if (contact) await supabase.from("email_threads").update({ contact_id: contact.id }).eq("id", thread.id);
        }
      }

      if (thread) {
        const { count } = await supabase.from("email_messages").select("*", { count: "exact", head: true }).eq("thread_id", thread.id);
        await supabase.from("email_threads").update({ message_count: count || 0 }).eq("id", thread.id);
      }

      results.push({ id: msg.id, threadId: msg.threadId, subject: getHeader(headers, "Subject") });
    } catch (err: unknown) {
      log.error(`Error syncing message ${msgId}`, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { synced: results.length, messages: results, nextPageToken: listData.nextPageToken };
}
