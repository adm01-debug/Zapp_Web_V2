import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { handleCors, errorResponse, jsonResponse, Logger, requireEnv } from "../_shared/validation.ts";
import { ensureValidToken, gmailFetch, runGmailIncrementalSync, syncLabels, syncMessages } from "../_shared/gmail-helpers.ts";

const GMAIL_RESOURCE_ID_RE = /^[0-9A-Za-z_-]{1,200}$/;

const GmailSyncActionSchema = z.object({
  message_id: z.string().max(200).regex(GMAIL_RESOURCE_ID_RE).optional(),
  attachment_id: z.string().max(200).regex(GMAIL_RESOURCE_ID_RE).optional(),
  action: z.enum(['sync-labels', 'sync-inbox', 'sync-incremental', 'get-thread', 'setup-watch', 'get-attachment']),
  account_id: z.string().uuid("account_id must be a valid UUID"),
  query: z.string().max(500).optional(),
  maxResults: z.number().int().min(1).max(200).optional(),
  thread_id: z.string().max(200).regex(GMAIL_RESOURCE_ID_RE).optional(),
  topic_name: z.string().max(500).optional(),
});

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

// O handler exportado aceita o client service_role e o resolvedor de usuário
// injetados para o teste offline exercitar o fluxo real sem Supabase.
export interface GmailSyncDeps {
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  getUser?: () => Promise<{ user: { id: string } | null; error?: unknown }>;
}

export async function handleGmailSync(req: Request, deps: GmailSyncDeps = {}): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const log = new Logger("gmail-sync");

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) { log.done(401); return errorResponse("Unauthorized", 401, req); }

    // deno-lint-ignore no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = deps.supabase ?? createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const getUser = deps.getUser ?? (async () => {
      const userClient = createClient(requireEnv("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      return { user };
    });
    const { user } = await getUser();
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
          if (result.failed > 0) {
            await supabase.from("gmail_accounts").update({ sync_status: "error", last_sync_at: new Date().toISOString(), last_error: `${result.failed} mensagens falharam na sincronização` }).eq("id", account.id);
            log.done(207, { synced: result.synced, failed: result.failed });
            return jsonResponse({ success: false, ...result }, 207, req);
          }
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
        // R2-API-011: o MESMO pipeline incremental canônico do webhook e do cron.
        const result = await runGmailIncrementalSync(supabase, account, accessToken, log);
        if (result.status === "history_expired") {
          log.done(200, { resync: true });
          return jsonResponse({ success: true, cursor_advanced: false, resync_needed: true, synced: 0, failed: 0 }, 200, req);
        }
        if (!result.cursor_advanced) {
          log.done(207, { changed: result.changed_messages, failed: result.failed, status: result.status });
          return jsonResponse({
            success: false,
            cursor_advanced: false,
            changed_messages: result.changed_messages,
            deleted_messages: result.deleted_messages,
            synced: result.synced,
            failed: result.failed,
            failures: result.failures,
            messages: result.messages,
          }, 207, req);
        }
        log.done(200, { changedMessages: result.changed_messages, deletedMessages: result.deleted_messages, synced: result.synced, pages: result.history_pages });
        return jsonResponse({ success: true, cursor_advanced: true, changed_messages: result.changed_messages, deleted_messages: result.deleted_messages, synced: result.synced, history_pages: result.history_pages }, 200, req);
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
      default:
        log.done(400);
        return errorResponse(`Unknown action: ${body.action}`, 400, req);
    }
  } catch (error) {
    log.error("Gmail Sync error", { error: error instanceof Error ? error.message : String(error) });
    log.done(500);
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500, req);
  }
}

if (import.meta.main) {
  serve((req) => handleGmailSync(req));
}
