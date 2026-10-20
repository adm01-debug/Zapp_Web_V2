import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { getCorsHeaders, jsonResponse, Logger, requireEnv } from "../_shared/validation.ts";
import { logGmailOidcAuthShadow } from "../_shared/hmac-validation.ts";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

const PubSubSchema = z.object({
  message: z.object({
    data: z.string().min(1),
    messageId: z.string().optional(),
    publishTime: z.string().optional(),
  }),
  subscription: z.string().optional(),
});

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
async function refreshToken(supabase: any, account: any, log: Logger): Promise<string> {
  const GOOGLE_CLIENT_ID = requireEnv("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = requireEnv("GOOGLE_CLIENT_SECRET");

  const storedTokens = await getTokens(supabase, account.id);

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

  await storeTokens(supabase, account.id, tokens.access_token, tokens.refresh_token || null);
  await supabase.from("gmail_accounts").update({
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }).eq("id", account.id);

  log.info("Token refreshed");
  return tokens.access_token;
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeURIComponent(
      atob(base64).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
    );
  } catch {
    return atob(base64);
  }
}

function getHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

// deno-lint-ignore no-explicit-any
function extractBody(payload: any): { text: string; html: string } {
  let text = "";
  let html = "";

  // deno-lint-ignore no-explicit-any
  function processPart(part: any) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      text = decodeBase64Url(part.body.data);
    } else if (part.mimeType === "text/html" && part.body?.data) {
      html = decodeBase64Url(part.body.data);
    }
    if (part.parts) part.parts.forEach(processPart);
  }

  if (payload.body?.data) {
    if (payload.mimeType === "text/html") {
      html = decodeBase64Url(payload.body.data);
    } else {
      text = decodeBase64Url(payload.body.data);
    }
  }
  if (payload.parts) payload.parts.forEach(processPart);

  return { text, html };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const log = new Logger("gmail-webhook");

  try {
    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // [WEBHOOK_AUTH_SHADOW] Modo sombra: apenas loga presenca/aud/iss do token
    // OIDC do Google Pub/Sub — NUNCA bloqueia. Verificacao completa (assinatura
    // contra JWKS do Google, audience/issuer) fica para iteracao futura.
    logGmailOidcAuthShadow(req.headers);

    const rawBody = await req.json();
    const parsed = PubSubSchema.safeParse(rawBody);
    if (!parsed.success) {
      log.warn("Invalid PubSub payload", { errors: parsed.error.message });
      return jsonResponse({ acknowledged: true, error: "Invalid payload" }, 200, req);
    }

    const decodedData = JSON.parse(atob(parsed.data.message.data));
    const { emailAddress, historyId: newHistoryId } = decodedData;

    log.info("Notification received", { email: emailAddress, historyId: newHistoryId });

    // Find the gmail account (without token columns)
    const { data: account, error: accountError } = await supabase
      .from("gmail_accounts")
      .select("id, email_address, is_active, token_expires_at, history_id, user_id")
      .eq("email_address", emailAddress)
      .eq("is_active", true)
      .single();

    if (accountError || !account) {
      log.info("No active Gmail account found", { email: emailAddress });
      return jsonResponse({ acknowledged: true }, 200, req);
    }

    if (!account.history_id) {
      log.info("No history_id stored, skipping incremental sync");
      return jsonResponse({ acknowledged: true }, 200, req);
    }

    // Ensure valid access token
    let accessToken: string;
    const now = new Date();
    if (now >= new Date(account.token_expires_at)) {
      accessToken = await refreshToken(supabase, account, log);
    } else {
      const storedTokens = await getTokens(supabase, account.id);
      accessToken = storedTokens.access_token;
    }

    // Fetch history changes
    const historyResponse = await fetch(
      `${GMAIL_API}/history?startHistoryId=${account.history_id}&historyTypes=messageAdded&labelFilterBehavior=include&labelIds=INBOX`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!historyResponse.ok) {
      if (historyResponse.status === 404) {
        log.warn("History ID expired, marking for full resync");
        await supabase.from("gmail_accounts").update({
          sync_status: "pending",
          history_id: null,
          last_error: "History ID expired - full resync needed",
        }).eq("id", account.id);

        return jsonResponse({ acknowledged: true, resync_needed: true }, 200, req);
      }
      throw new Error(`History fetch failed: ${historyResponse.status}`);
    }

    const historyData = await historyResponse.json();

    // Collect new message IDs
    const newMessageIds = new Set<string>();
    for (const record of historyData.history || []) {
      for (const added of record.messagesAdded || []) {
        if (added.message.labelIds?.includes("INBOX")) {
          newMessageIds.add(added.message.id);
        }
      }
    }

    log.info(`Found ${newMessageIds.size} new messages`, { email: emailAddress });

    // Process each new message
    for (const msgId of newMessageIds) {
      try {
        const msgResponse = await fetch(`${GMAIL_API}/messages/${msgId}?format=full`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!msgResponse.ok) continue;
        const msg = await msgResponse.json();

        const headers = msg.payload.headers || [];
        const { text, html } = extractBody(msg.payload);

        const fromRaw = getHeader(headers, "From");
        const fromMatch = fromRaw.match(/(?:"?([^"]*)"?\s)?<?([^>]+)>?/);
        const fromName = fromMatch?.[1]?.trim() || "";
        const fromAddress = fromMatch?.[2]?.trim() || fromRaw;

        const toRaw = getHeader(headers, "To");
        const toAddresses = toRaw.split(",").map((t: string) => t.trim()).filter(Boolean);
        const ccRaw = getHeader(headers, "Cc");
        const ccAddresses = ccRaw ? ccRaw.split(",").map((t: string) => t.trim()).filter(Boolean) : [];

        const isOutbound = fromAddress.toLowerCase() === account.email_address.toLowerCase();

        // Upsert thread
        const { data: thread } = await supabase.from("email_threads").upsert({
          gmail_account_id: account.id,
          gmail_thread_id: msg.threadId,
          subject: getHeader(headers, "Subject"),
          snippet: msg.snippet,
          label_ids: msg.labelIds || [],
          is_unread: (msg.labelIds || []).includes("UNREAD"),
          last_message_at: new Date(parseInt(msg.internalDate)).toISOString(),
        }, { onConflict: "gmail_account_id,gmail_thread_id" }).select().single();

        // Upsert email message
        // deno-lint-ignore no-explicit-any
        await supabase.from("email_messages").upsert({
          thread_id: thread?.id,
          gmail_message_id: msg.id,
          gmail_account_id: account.id,
          from_address: fromAddress,
          from_name: fromName,
          to_addresses: toAddresses,
          cc_addresses: ccAddresses,
          subject: getHeader(headers, "Subject"),
          body_text: text,
          body_html: html,
          snippet: msg.snippet,
          label_ids: msg.labelIds || [],
          is_read: !(msg.labelIds || []).includes("UNREAD"),
          has_attachments: (msg.payload.parts || []).some((p: any) => p.filename && p.body?.attachmentId),
          in_reply_to: getHeader(headers, "In-Reply-To") || null,
          references_header: getHeader(headers, "References") || null,
          internal_date: new Date(parseInt(msg.internalDate)).toISOString(),
          direction: isOutbound ? "outbound" : "inbound",
        }, { onConflict: "gmail_account_id,gmail_message_id" });

        // Link to contact if possible
        if (thread && !thread.contact_id) {
          const contactEmail = isOutbound ? toAddresses[0] : fromAddress;
          if (contactEmail) {
            const cleanEmail = contactEmail.replace(/<|>/g, "").trim().toLowerCase();
            const { data: contact } = await supabase
              .from("contacts")
              .select("id")
              .ilike("email", cleanEmail)
              .maybeSingle();

            if (contact) {
              await supabase.from("email_threads")
                .update({ contact_id: contact.id })
                .eq("id", thread.id);
            }
          }
        }

        // Update thread message count
        if (thread) {
          const { count } = await supabase
            .from("email_messages")
            .select("*", { count: "exact", head: true })
            .eq("thread_id", thread.id);

          await supabase.from("email_threads")
            .update({ message_count: count || 0 })
            .eq("id", thread.id);
        }
      } catch (err: unknown) {
        log.error(`Error processing message ${msgId}`, { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Update history_id
    await supabase.from("gmail_accounts").update({
      history_id: historyData.historyId || newHistoryId.toString(),
      last_sync_at: new Date().toISOString(),
    }).eq("id", account.id);

    log.done(200, { processed: newMessageIds.size });
    return jsonResponse({ acknowledged: true, processed: newMessageIds.size }, 200, req);
  } catch (error) {
    log.error("Gmail Webhook error", { error: error instanceof Error ? error.message : String(error) });
    log.done(200);
    return jsonResponse({ acknowledged: true, error: error instanceof Error ? error.message : "Unknown error" }, 200, req);
  }
});
