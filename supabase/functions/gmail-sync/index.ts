import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { handleCors, errorResponse, jsonResponse, Logger, requireEnv } from "../_shared/validation.ts";
import { ensureValidToken, gmailFetch, syncLabels, syncMessages } from "../_shared/gmail-helpers.ts";

const GmailSyncActionSchema = z.object({
  message_id: z.string().max(200).optional(),
  attachment_id: z.string().max(200).optional(),
  action: z.enum(['sync-labels', 'sync-inbox', 'sync-incremental', 'get-thread', 'setup-watch', 'get-attachment']),
  account_id: z.string().uuid("account_id must be a valid UUID"),
  query: z.string().max(500).optional(),
  maxResults: z.number().int().min(1).max(200).optional(),
  thread_id: z.string().max(500).optional(),
  topic_name: z.string().max(500).optional(),
});

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

serve(async (req) => {
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

    if (!account) throw new Error("Gmail account not found or inactive");

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
          const result = await syncMessages(supabase, account.id, accessToken, log, body.query || "in:inbox", body.maxResults || 50);
          const profileData = await gmailFetch(accessToken, "/profile");
          await supabase.from("gmail_accounts").update({
            sync_status: "synced", history_id: profileData.historyId,
            last_sync_at: new Date().toISOString(), last_error: null,
          }).eq("id", account.id);
          log.done(200, { synced: result.synced });
          return jsonResponse({ success: true, ...result }, 200, req);
        } catch (err: unknown) {
          await supabase.from("gmail_accounts").update({
            sync_status: "error", last_error: err instanceof Error ? err.message : String(err),
          }).eq("id", account.id);
          throw err;
        }
      }

      case "sync-incremental": {
        if (!account.history_id) { log.done(400); return errorResponse("No history_id. Run full sync first.", 400, req); }
        const historyData = await gmailFetch(accessToken, `/history?startHistoryId=${account.history_id}&historyTypes=messageAdded&historyTypes=messageDeleted&historyTypes=labelAdded&historyTypes=labelRemoved`);

        const newMessageIds = new Set<string>();
        for (const record of historyData.history || []) {
          for (const added of record.messagesAdded || []) newMessageIds.add(added.message.id);
        }
        // FIX E19: persistir mensagens novas via syncMessages
        let synced = 0;
        if (newMessageIds.size > 0) {
          const result = await syncMessages(supabase, account.id, accessToken, log, 'in:inbox', Math.min(newMessageIds.size + 5, 50));
          synced = result.synced;
        }
        await supabase.from("gmail_accounts").update({
          history_id: historyData.historyId || account.history_id,
          last_sync_at: new Date().toISOString(),
          last_error: null,
        }).eq("id", account.id);
        log.done(200, { newMessages: newMessageIds.size, synced });
        return jsonResponse({ success: true, new_messages: newMessageIds.size, synced }, 200, req);
      }

      case "get-thread": {
        if (!body.thread_id) throw new Error("Missing thread_id");
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
          watch_expiration: new Date(parseInt(watchData.expiration)).toISOString(),
        }).eq("id", account.id);
        log.done(200);
        return jsonResponse({ success: true, ...watchData }, 200, req);
      }

      // FIX E40: get-attachment - download de anexo sob demanda
      case "get-attachment": {
        const { message_id, attachment_id } = body;
        if (!message_id || !attachment_id) return errorResponse("Missing message_id or attachment_id", 400, req);
        const data = await gmailFetch(accessToken, `/messages/${message_id}/attachments/${attachment_id}`);
        log.done(200); return jsonResponse({ data: data.data, size: data.size }, 200, req);
      }
      default:
        log.done(400);
        return errorResponse(`Unknown action: ${body.action}`, 400, req);
    }
  } catch (error) {
    log.error("Gmail Sync error", { error: error instanceof Error ? error.message : String(error) });
    log.done(500);
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500, req);
  }
});
