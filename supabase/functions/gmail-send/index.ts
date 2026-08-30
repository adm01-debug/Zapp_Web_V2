import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { GmailSendActionSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

function encodeBase64Url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildMimeMessage(options: {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{ filename: string; mimeType: string; content: string }>;
}): string {
  const boundary = `boundary_${crypto.randomUUID().replace(/-/g, "")}`;
  const hasAttachments = options.attachments && options.attachments.length > 0;
  const hasHtml = !!options.htmlBody;

  const headers = [`From: ${options.from}`, `To: ${options.to.join(", ")}`];
  if (options.cc?.length) headers.push(`Cc: ${options.cc.join(", ")}`);
  if (options.bcc?.length) headers.push(`Bcc: ${options.bcc.join(", ")}`);
  headers.push(`Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(options.subject)))}?=`);
  headers.push(`Date: ${new Date().toUTCString()}`);
  headers.push("MIME-Version: 1.0");
  if (options.inReplyTo) headers.push(`In-Reply-To: ${options.inReplyTo}`);
  if (options.references) headers.push(`References: ${options.references}`);

  if (hasAttachments) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    let body = headers.join("\r\n") + "\r\n\r\n";
    body += `--${boundary}\r\n`;

    if (hasHtml) {
      const altBoundary = `alt_${crypto.randomUUID().replace(/-/g, "")}`;
      body += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;
      if (options.textBody) {
        body += `--${altBoundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
        body += btoa(unescape(encodeURIComponent(options.textBody))) + "\r\n";
      }
      body += `--${altBoundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
      body += btoa(unescape(encodeURIComponent(options.htmlBody!))) + "\r\n";
      body += `--${altBoundary}--\r\n`;
    } else {
      body += "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n";
      body += btoa(unescape(encodeURIComponent(options.textBody || ""))) + "\r\n";
    }

    for (const att of options.attachments!) {
      body += `--${boundary}\r\nContent-Type: ${att.mimeType}; name="${att.filename}"\r\n`;
      body += `Content-Disposition: attachment; filename="${att.filename}"\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
      body += att.content + "\r\n";
    }
    body += `--${boundary}--`;
    return body;
  } else if (hasHtml) {
    const altBoundary = `alt_${crypto.randomUUID().replace(/-/g, "")}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    let body = headers.join("\r\n") + "\r\n\r\n";
    if (options.textBody) {
      body += `--${altBoundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
      body += btoa(unescape(encodeURIComponent(options.textBody))) + "\r\n";
    }
    body += `--${altBoundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
    body += btoa(unescape(encodeURIComponent(options.htmlBody!))) + "\r\n";
    body += `--${altBoundary}--`;
    return body;
  } else {
    headers.push("Content-Type: text/plain; charset=UTF-8");
    headers.push("Content-Transfer-Encoding: base64");
    return headers.join("\r\n") + "\r\n\r\n" + btoa(unescape(encodeURIComponent(options.textBody || "")));
  }
}

// deno-lint-ignore no-explicit-any
async function getTokens(supabase: any, accountId: string): Promise<{ access_token: string; refresh_token: string }> {
  const { data, error } = await supabase.rpc("get_gmail_tokens", { p_account_id: accountId });
  if (error || !data?.length) throw new Error("Failed to retrieve tokens");
  return data[0];
}

// deno-lint-ignore no-explicit-any
async function storeTokens(supabase: any, accountId: string, accessToken: string, refreshToken?: string | null) {
  await supabase.rpc("store_gmail_tokens", {
    p_account_id: accountId,
    p_access_token: accessToken,
    p_refresh_token: refreshToken ?? null,
  });
}

// deno-lint-ignore no-explicit-any
async function ensureValidToken(supabase: any, account: any): Promise<string> {
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

        const raw = buildMimeMessage({
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
        const { data: threadRow } = await supabase.from("email_threads")
          .upsert({ gmail_account_id: account.id, gmail_thread_id: sentMessage.threadId, subject, snippet: (text_body || "").slice(0, 200), last_message_at: new Date().toISOString(), is_unread: false }, { onConflict: "gmail_account_id,gmail_thread_id" })
          .select("id").maybeSingle();
        let resolvedThreadId = threadRow?.id ?? null;
        if (!resolvedThreadId) { const { data: ex } = await supabase.from("email_threads").select("id").eq("gmail_account_id", account.id).eq("gmail_thread_id", sentMessage.threadId).single(); resolvedThreadId = ex?.id ?? null; }
        if (!resolvedThreadId) {
          log.done(200, { action });
          return jsonResponse({ success: true, message_id: sentMessage.id, thread_id: sentMessage.threadId, warning: 'local_persistence_failed_no_thread' }, 200, req);
        }
        await supabase.from("email_messages").insert({ gmail_message_id: sentMessage.id, gmail_account_id: account.id, thread_id: resolvedThreadId, from_address: account.email_address, to_addresses: Array.isArray(to) ? to : [to], cc_addresses: cc || [], bcc_addresses: bcc || [], subject, body_text: text_body || "", body_html: html_body || "", direction: "outbound", is_read: true, internal_date: new Date().toISOString() });
        log.done(200, { action });
        return jsonResponse({ success: true, message_id: sentMessage.id, thread_id: sentMessage.threadId }, 200, req);
      }

      case "reply": {
        const { thread_id, message_id, to, cc, bcc, subject, text_body, html_body, attachments } = body;
        if (!thread_id || !to) return errorResponse("Missing required fields: thread_id, to", 400, req);

        // FIX E25: buscar message_id_header RFC para In-Reply-To correto
        const { data: originalMsg } = await supabase.from("email_messages")
          .select("gmail_message_id, subject, from_address, references_header, message_id_header")
          .eq("gmail_message_id", message_id).single();
        const inReplyToValue = originalMsg?.message_id_header ? originalMsg.message_id_header : `<${message_id}>`;
        const replySubject = subject || (originalMsg?.subject?.startsWith("Re:") ? originalMsg.subject : `Re: ${originalMsg?.subject || ""}`);
        const raw = buildMimeMessage({
          from: account.email_address, to: Array.isArray(to) ? to : [to],
          cc: cc || [], bcc: bcc || [], subject: replySubject,
          textBody: text_body, htmlBody: html_body,
          inReplyTo: inReplyToValue,
          references: originalMsg?.references_header ? `${originalMsg.references_header} ${inReplyToValue}` : inReplyToValue,
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
        const { data: tRow } = await supabase.from("email_threads").select("id").eq("gmail_thread_id", thread_id).eq("gmail_account_id", account.id).single();
        if (!tRow?.id) {
          log.done(400, { action });
          return jsonResponse({ success: false, error: 'Thread not found locally — run sync-inbox first' }, 400, req);
        }
        await supabase.from("email_messages").insert({ gmail_message_id: sentMessage.id, gmail_account_id: account.id, thread_id: tRow.id, from_address: account.email_address, to_addresses: Array.isArray(to) ? to : [to], cc_addresses: cc || [], bcc_addresses: bcc || [], subject: replySubject, body_text: text_body || "", body_html: html_body || "", direction: "outbound", is_read: true, internal_date: new Date().toISOString(), in_reply_to: inReplyToValue });
        log.done(200, { action });
        return jsonResponse({ success: true, message_id: sentMessage.id, thread_id: sentMessage.threadId }, 200, req);
      }

      case "create-draft": {
        const { to, cc, bcc, subject, text_body, html_body, thread_id } = body;
        const raw = buildMimeMessage({
          from: account.email_address, to: Array.isArray(to) ? to : [to || ""],
          cc: cc || [], bcc: bcc || [], subject: subject || "", textBody: text_body, htmlBody: html_body,
        });
        // deno-lint-ignore no-explicit-any
        const draftBody: any = { message: { raw: encodeBase64Url(raw) } };
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

      case "modify-labels": {
        const { message_id: gmailMsgId, add_labels, remove_labels } = body;
        if (!gmailMsgId) return errorResponse("Missing message_id", 400, req);

        const response = await fetch(`${GMAIL_API}/messages/${gmailMsgId}/modify`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ addLabelIds: add_labels || [], removeLabelIds: remove_labels || [] }),
        });
        if (!response.ok) throw new Error(`Failed to modify labels: ${await response.text()}`);
        const modResult = await response.json();
        await supabase.from("email_messages").update({ label_ids: modResult.labelIds }).eq("gmail_message_id", gmailMsgId);
        log.done(200, { action }); return jsonResponse({ success: true }, 200, req);
      }

      case "mark-read": {
        const { message_ids } = body;
        if (!message_ids?.length) return errorResponse("Missing message_ids", 400, req);

        for (const msgId of message_ids) {
          await fetch(`${GMAIL_API}/messages/${msgId}/modify`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
          });
        }
        await supabase.from("email_messages").update({ is_read: true }).in("gmail_message_id", message_ids);
        // FIX E29: recalcular is_unread das threads afetadas
        const { data: aff } = await supabase.from("email_messages").select("thread_id").in("gmail_message_id", message_ids);
        const tids = [...new Set((aff || []).map((m: { thread_id: string | null }) => m.thread_id).filter(Boolean))];
        if (tids.length > 0) { const { data: unread } = await supabase.from("email_messages").select("thread_id").in("thread_id", tids).eq("is_read", false); const unreadSet = new Set((unread || []).map((r: { thread_id: string }) => r.thread_id)); for (const tid of tids) { await supabase.from("email_threads").update({ is_unread: unreadSet.has(tid as string) }).eq("id", tid); } }
        log.done(200, { action });
        return jsonResponse({ success: true }, 200, req);
      }

      case "trash": {
        const { message_id: trashMsgId } = body;
        if (!trashMsgId) return errorResponse("Missing message_id", 400, req);

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
        const resp = await fetch(`${GMAIL_API}/threads/${thread_id}/trash`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
        if (!resp.ok) throw new Error(`Failed to trash thread: ${await resp.text()}`);
        await supabase.from("email_threads").update({ status: "archived" }).eq("gmail_thread_id", thread_id).eq("gmail_account_id", account.id);
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
