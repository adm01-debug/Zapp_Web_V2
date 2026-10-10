import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { GmailSendActionSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { buildGmailMimeMessage, encodeBase64Url } from "../_shared/gmail-mime.ts";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailAccount {
  id: string;
  email_address: string;
  token_expires_at: string;
}

interface GmailMetadataResponse {
  payload?: { headers?: Array<{ name?: string; value?: string }> };
}

function getMetadataHeader(message: GmailMetadataResponse, headerName: string): string | undefined {
  const value = message.payload?.headers?.find(header => header.name?.toLowerCase() === headerName.toLowerCase())?.value;
  return value && !/[\r\n]/.test(value) ? value : undefined;
}

async function getTokens(supabase: SupabaseClient, accountId: string): Promise<{ access_token: string; refresh_token: string }> {
  const { data, error } = await supabase.rpc("get_gmail_tokens", { p_account_id: accountId });
  if (error || !data?.length) throw new Error("Failed to retrieve tokens");
  return data[0];
}

async function storeTokens(supabase: SupabaseClient, accountId: string, accessToken: string, refreshToken?: string | null) {
  await supabase.rpc("store_gmail_tokens", {
    p_account_id: accountId,
    p_access_token: accessToken,
    p_refresh_token: refreshToken ?? null,
  });
}

async function ensureValidToken(supabase: SupabaseClient, account: GmailAccount): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(account.token_expires_at);
  
  const storedTokens = await getTokens(supabase, account.id);
  
  if (now < new Date(expiresAt.getTime() - 5 * 60 * 1000)) return storedTokens.access_token;

  const GOOGLE_CLIENT_ID = requireEnv("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = requireEnv("GOOGLE_CLIENT_SECRET");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: storedTokens.refresh_token, client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET, grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error("Failed to refresh token");
  const tokens = await response.json();

  await storeTokens(supabase, account.id, tokens.access_token, tokens.refresh_token || null);
  await supabase.from("gmail_accounts").update({
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }).eq("id", account.id);

  return tokens.access_token;
}

async function threadBelongsToAccount(supabase: SupabaseClient, accountId: string, gmailThreadId: string): Promise<boolean> {
  const result = await supabase.from("email_threads").select("id").eq("gmail_account_id", accountId).eq("gmail_thread_id", gmailThreadId).maybeSingle();
  return Boolean(result.data?.id);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("gmail-send");

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401, req);

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const supabase = createClient(SUPABASE_URL, requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const userClient = createClient(SUPABASE_URL, requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return errorResponse("Unauthorized", 401, req);

    const parsed = parseBody(GmailSendActionSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const body = parsed.data;
    const { action, account_id } = body;

    const { data: account } = await supabase
      .from("gmail_accounts")
      .select("id, email_address, is_active, token_expires_at, user_id")
      .eq("id", account_id).eq("user_id", user.id).eq("is_active", true).single();

    if (!account) return errorResponse("Gmail account not found or inactive", 404, req);

    const accessToken = await ensureValidToken(supabase, account);

    switch (action) {
      case "send": {
        const { to, cc, bcc, subject, text_body, html_body, attachments } = body;
        if (!to || !subject) return errorResponse("Missing required fields: to, subject", 400, req);

        const raw = buildGmailMimeMessage({
          from: account.email_address, to: Array.isArray(to) ? to : [to],
          cc: cc || [], bcc: bcc || [], subject, textBody: text_body, htmlBody: html_body, attachments,
        });

        const response = await fetch(`${GMAIL_API}/messages/send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw: encodeBase64Url(raw) }),
        });
        if (!response.ok) throw new Error(`Failed to send email: ${await response.text()}`);

        const sentMessage = await response.json();
        // FIX E21: upsert thread + resolver thread_id real
        const { data: threadRow, error: threadUpsertError } = await supabase.from("email_threads")
          .upsert({ gmail_account_id: account.id, gmail_thread_id: sentMessage.threadId, subject, snippet: (text_body || "").slice(0, 200), last_message_at: new Date().toISOString(), is_unread: false }, { onConflict: "gmail_account_id,gmail_thread_id" })
          .select("id").maybeSingle();
        let resolvedThreadId = threadRow?.id ?? null;
        if (!resolvedThreadId) { const { data: ex } = await supabase.from("email_threads").select("id").eq("gmail_account_id", account.id).eq("gmail_thread_id", sentMessage.threadId).single(); resolvedThreadId = ex?.id ?? null; }
        if (!resolvedThreadId) {
          log.done(200, { action });
          return jsonResponse({ success: true, message_id: sentMessage.id, thread_id: sentMessage.threadId, warning: threadUpsertError ? 'local_persistence_failed_thread_upsert' : 'local_persistence_failed_no_thread' }, 200, req);
        }
        const { error: messageInsertError } = await supabase.from("email_messages").insert({ gmail_message_id: sentMessage.id, gmail_account_id: account.id, thread_id: resolvedThreadId, from_address: account.email_address, to_addresses: Array.isArray(to) ? to : [to], cc_addresses: cc || [], bcc_addresses: bcc || [], subject, body_text: text_body || "", body_html: html_body || "", direction: "outbound", is_read: true, internal_date: new Date().toISOString() });
        if (messageInsertError) return jsonResponse({ success: true, message_id: sentMessage.id, thread_id: sentMessage.threadId, warning: "local_persistence_failed" }, 200, req);
        log.done(200, { action });
        return jsonResponse({ success: true, message_id: sentMessage.id, thread_id: sentMessage.threadId }, 200, req);
      }

      case "reply": {
        const { thread_id, message_id, to, cc, bcc, subject, text_body, html_body, attachments } = body;
        if (!thread_id || !message_id || !to) return errorResponse("Missing required fields: thread_id, message_id, to", 400, req);

        const { data: tRow } = await supabase.from("email_threads").select("id").eq("gmail_thread_id", thread_id).eq("gmail_account_id", account.id).single();
        if (!tRow?.id) return errorResponse("Thread not found locally — run sync-inbox first", 400, req);
        const { data: originalMsg } = await supabase.from("email_messages")
          .select("gmail_message_id, subject, from_address, references_header, message_id_header")
          .eq("gmail_message_id", message_id).eq("gmail_account_id", account.id).eq("thread_id", tRow.id).single();
        if (!originalMsg) return errorResponse("Original message not found in this thread and account", 404, req);
        let inReplyToValue = originalMsg.message_id_header || undefined;
        let referencesValue = originalMsg.references_header || undefined;
        if (!inReplyToValue) {
          const metadataResponse = await fetch(`${GMAIL_API}/messages/${message_id}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!metadataResponse.ok) return errorResponse("Unable to recover RFC Message-ID for the reply target", 409, req);
          const metadata = await metadataResponse.json() as GmailMetadataResponse;
          inReplyToValue = getMetadataHeader(metadata, "Message-ID");
          referencesValue ||= getMetadataHeader(metadata, "References");
        }
        if (!inReplyToValue) return errorResponse("Reply target has no valid RFC Message-ID", 409, req);
        const replySubject = subject || (originalMsg?.subject?.startsWith("Re:") ? originalMsg.subject : `Re: ${originalMsg?.subject || ""}`);
        const raw = buildGmailMimeMessage({
          from: account.email_address, to: Array.isArray(to) ? to : [to],
          cc: cc || [], bcc: bcc || [], subject: replySubject,
          textBody: text_body, htmlBody: html_body,
          inReplyTo: inReplyToValue,
          references: referencesValue ? `${referencesValue} ${inReplyToValue}` : inReplyToValue,
          attachments,
        });
        const response = await fetch(`${GMAIL_API}/messages/send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw: encodeBase64Url(raw), threadId: thread_id }),
        });
        if (!response.ok) throw new Error(`Failed to send reply: ${await response.text()}`);
        const sentMessage = await response.json();
        // FIX E22: persistir reply no banco local
        const { error: persistError } = await supabase.from("email_messages").insert({ gmail_message_id: sentMessage.id, gmail_account_id: account.id, thread_id: tRow.id, from_address: account.email_address, to_addresses: Array.isArray(to) ? to : [to], cc_addresses: cc || [], bcc_addresses: bcc || [], subject: replySubject, body_text: text_body || "", body_html: html_body || "", direction: "outbound", is_read: true, internal_date: new Date().toISOString(), in_reply_to: inReplyToValue });
        if (persistError) return jsonResponse({ success: true, message_id: sentMessage.id, thread_id: sentMessage.threadId, warning: "local_persistence_failed" }, 200, req);
        log.done(200, { action });
        return jsonResponse({ success: true, message_id: sentMessage.id, thread_id: sentMessage.threadId }, 200, req);
      }

      case "create-draft": {
        const { to, cc, bcc, subject, text_body, html_body, thread_id, attachments } = body;
        if (thread_id && !(await threadBelongsToAccount(supabase, account.id, thread_id))) return errorResponse("Thread not found for this account", 404, req);
        const raw = buildGmailMimeMessage({
          from: account.email_address, to: Array.isArray(to) ? to : [to || ""],
          cc: cc || [], bcc: bcc || [], subject: subject || "", textBody: text_body, htmlBody: html_body, attachments,
        });
        const draftBody: { message: { raw: string; threadId?: string } } = { message: { raw: encodeBase64Url(raw) } };
        if (thread_id) draftBody.message.threadId = thread_id;

        const response = await fetch(`${GMAIL_API}/drafts`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(draftBody),
        });
        if (!response.ok) throw new Error(`Failed to create draft: ${await response.text()}`);

        const draft = await response.json();
        log.done(200, { action });
        return jsonResponse({ success: true, draft_id: draft.id, message_id: draft.message?.id }, 200, req);
      }

      case "update-draft": {
        const { draft_id, to, cc, bcc, subject, text_body, html_body, thread_id, attachments } = body;
        if (!draft_id) return errorResponse("Missing draft_id", 400, req);
        if (thread_id && !(await threadBelongsToAccount(supabase, account.id, thread_id))) return errorResponse("Thread not found for this account", 404, req);
        const raw = buildGmailMimeMessage({ from: account.email_address, to: Array.isArray(to) ? to : [to || ""], cc: cc || [], bcc: bcc || [], subject: subject || "", textBody: text_body, htmlBody: html_body, attachments });
        const message: Record<string, string> = { raw: encodeBase64Url(raw) };
        if (thread_id) message.threadId = thread_id;
        const response = await fetch(`${GMAIL_API}/drafts/${draft_id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        if (!response.ok) throw new Error(`Failed to update draft: ${await response.text()}`);
        const draft = await response.json();
        return jsonResponse({ success: true, draft_id: draft.id, message_id: draft.message?.id }, 200, req);
      }

      case "delete-draft": {
        const { draft_id } = body;
        if (!draft_id) return errorResponse("Missing draft_id", 400, req);
        const response = await fetch(`${GMAIL_API}/drafts/${draft_id}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
        if (!response.ok) throw new Error(`Failed to delete draft: ${await response.text()}`);
        return jsonResponse({ success: true }, 200, req);
      }

      case "modify-labels": {
        const { message_id: gmailMsgId, add_labels, remove_labels } = body;
        if (!gmailMsgId) return errorResponse("Missing message_id", 400, req);
        const ownedMessage = await supabase.from("email_messages").select("id").eq("gmail_message_id", gmailMsgId).eq("gmail_account_id", account.id).maybeSingle();
        if (!ownedMessage.data) return errorResponse("Message not found for this account", 404, req);

        const response = await fetch(`${GMAIL_API}/messages/${gmailMsgId}/modify`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ addLabelIds: add_labels || [], removeLabelIds: remove_labels || [] }),
        });
        if (!response.ok) throw new Error(`Failed to modify labels: ${await response.text()}`);
        const modResult = await response.json();
        const { error: localUpdateError } = await supabase.from("email_messages").update({ label_ids: modResult.labelIds }).eq("gmail_message_id", gmailMsgId).eq("gmail_account_id", account.id);
        if (localUpdateError) return jsonResponse({ success: true, warning: "local_persistence_failed" }, 200, req);
        log.done(200, { action }); return jsonResponse({ success: true }, 200, req);
      }

      case "modify-thread-labels": {
        const { thread_id, add_labels, remove_labels } = body;
        if (!thread_id) return errorResponse("Missing thread_id", 400, req);
        const owned = await supabase.from("email_threads").select("id").eq("gmail_thread_id", thread_id).eq("gmail_account_id", account.id).maybeSingle();
        if (!owned.data) return errorResponse("Thread not found for this account", 404, req);
        const response = await fetch(`${GMAIL_API}/threads/${thread_id}/modify`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ addLabelIds: add_labels || [], removeLabelIds: remove_labels || [] }),
        });
        if (!response.ok) throw new Error(`Failed to modify thread labels: ${await response.text()}`);
        const result = await response.json();
        const messages = Array.isArray(result.messages) ? result.messages as Array<{ id?: string; labelIds?: string[] }> : [];
        if (messages.length > 0) {
          let localPersistenceFailed = false;
          for (const message of messages) {
            if (!message.id || !Array.isArray(message.labelIds)) continue;
            const update = await supabase.from("email_messages").update({ label_ids: message.labelIds, is_read: !message.labelIds.includes("UNREAD"), is_starred: message.labelIds.includes("STARRED") }).eq("gmail_message_id", message.id).eq("gmail_account_id", account.id);
            if (update.error) localPersistenceFailed = true;
          }
          const aggregateLabels = [...new Set(messages.flatMap(message => message.labelIds || []))];
          const isInInbox = messages.some(message => message.labelIds?.includes("INBOX"));
          const threadUpdate = await supabase.from("email_threads").update({ label_ids: aggregateLabels, is_unread: messages.some(message => message.labelIds?.includes("UNREAD")), is_starred: messages.some(message => message.labelIds?.includes("STARRED")), status: isInInbox ? "open" : "archived" }).eq("id", owned.data.id).eq("gmail_account_id", account.id);
          if (threadUpdate.error) localPersistenceFailed = true;
          if (localPersistenceFailed) return jsonResponse({ success: true, warning: "local_persistence_failed" }, 200, req);
        }
        return jsonResponse({ success: true }, 200, req);
      }

      case "mark-read": {
        const { message_ids } = body;
        if (!message_ids?.length) return errorResponse("Missing message_ids", 400, req);
        const ownedMessages = await supabase.from("email_messages").select("gmail_message_id").eq("gmail_account_id", account.id).in("gmail_message_id", message_ids);
        const ownedIds = new Set((ownedMessages.data || []).map((message: { gmail_message_id: string }) => message.gmail_message_id));
        if (message_ids.some(messageId => !ownedIds.has(messageId))) return errorResponse("One or more messages were not found for this account", 404, req);

        const updatedIds: string[] = [];
        const failedIds: string[] = [];
        for (const msgId of message_ids) {
          const response = await fetch(`${GMAIL_API}/messages/${msgId}/modify`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
          });
          if (response.ok) updatedIds.push(msgId);
          else failedIds.push(msgId);
        }
        if (updatedIds.length > 0) {
          await supabase.from("email_messages").update({ is_read: true }).eq("gmail_account_id", account.id).in("gmail_message_id", updatedIds);
          // Recalcula is_unread apenas para as threads confirmadas pelo Gmail.
          const { data: aff } = await supabase.from("email_messages").select("thread_id").eq("gmail_account_id", account.id).in("gmail_message_id", updatedIds);
          const tids = [...new Set((aff || []).map((m: { thread_id: string | null }) => m.thread_id).filter(Boolean))];
          if (tids.length > 0) { const { data: unread } = await supabase.from("email_messages").select("thread_id").eq("gmail_account_id", account.id).in("thread_id", tids).eq("is_read", false); const unreadSet = new Set((unread || []).map((r: { thread_id: string }) => r.thread_id)); for (const tid of tids) { await supabase.from("email_threads").update({ is_unread: unreadSet.has(tid as string) }).eq("id", tid).eq("gmail_account_id", account.id); } }
        }
        log.done(200, { action });
        return jsonResponse({ success: failedIds.length === 0, updated_ids: updatedIds, failed_ids: failedIds }, failedIds.length > 0 ? 207 : 200, req);
      }

      case "trash": {
        const { message_id: trashMsgId } = body;
        if (!trashMsgId) return errorResponse("Missing message_id", 400, req);
        const ownedMessage = await supabase.from("email_messages").select("id").eq("gmail_message_id", trashMsgId).eq("gmail_account_id", account.id).maybeSingle();
        if (!ownedMessage.data) return errorResponse("Message not found for this account", 404, req);

        const response = await fetch(`${GMAIL_API}/messages/${trashMsgId}/trash`, {
          method: "POST", headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error("Failed to trash message");
        log.done(200, { action });
        return jsonResponse({ success: true }, 200, req);
      }

      // FIX E32: trash-thread - descarta thread inteira via API Gmail
      case "trash-thread": {
        const { thread_id } = body;
        if (!thread_id) return errorResponse("Missing thread_id", 400, req);
        const ownedThread = await supabase.from("email_threads").select("id").eq("gmail_thread_id", thread_id).eq("gmail_account_id", account.id).maybeSingle();
        if (!ownedThread.data) return errorResponse("Thread not found for this account", 404, req);
        const resp = await fetch(`${GMAIL_API}/threads/${thread_id}/trash`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
        if (!resp.ok) throw new Error(`Failed to trash thread: ${await resp.text()}`);
        const localUpdate = await supabase.from("email_threads").update({ status: "archived", label_ids: ["TRASH"] }).eq("gmail_thread_id", thread_id).eq("gmail_account_id", account.id);
        if (localUpdate.error) return jsonResponse({ success: true, warning: "local_persistence_failed" }, 200, req);
        log.done(200, { action }); return jsonResponse({ success: true }, 200, req);
      }

      default:
        return errorResponse(`Unknown action: ${action}`, 400, req);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log.error("Unhandled error", { error: msg });
    return errorResponse(msg, 500, req);
  }
});
