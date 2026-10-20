import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, handleCors, Logger, requireEnv } from "../_shared/validation.ts";
import { ensureValidToken, syncMessages } from "../_shared/gmail-helpers.ts";

const BATCH = 3; // max contas em paralelo para evitar timeout de 60s

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);
  const secret = req.headers.get("x-cron-secret");
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }
  const enc = new TextEncoder();
  const a = enc.encode(secret ?? "");
  const b = enc.encode(expected);
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  if (diff !== 0) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }
  const log = new Logger("gmail-cron-sync");
  try {
    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: accounts, error } = await supabase.from("gmail_accounts").select("id, user_id, token_expires_at, history_id, is_active").eq("is_active", true);
    if (error || !accounts?.length) { log.info("No active accounts"); return new Response(JSON.stringify({ success: true, synced: 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    const results: Array<{ id: string; synced?: number; error?: string }> = [];
    for (let i = 0; i < accounts.length; i += BATCH) {
      const batch = accounts.slice(i, i + BATCH);
      const batchResults = await Promise.allSettled(batch.map(async (account) => {
        try {
          const accessToken = await ensureValidToken(supabase, account, log);
          if (!account.history_id) {
            // conta sem history_id: full sync
            await supabase.from("gmail_accounts").update({ sync_status: "syncing" }).eq("id", account.id);
            const result = await syncMessages(supabase, account.id, accessToken, log, "in:inbox", 50);
            const pr = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${accessToken}` } });
            const profile = await pr.json();
            await supabase.from("gmail_accounts").update({ sync_status: "synced", history_id: profile.historyId, last_sync_at: new Date().toISOString(), last_error: null }).eq("id", account.id);
            return { id: account.id, synced: result.synced };
          } else {
            // sync incremental
            const hr = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${account.history_id}&historyTypes=messageAdded`, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (!hr.ok) throw new Error(`History API: ${await hr.text()}`);
            const hd = await hr.json();
            const ids = new Set<string>(); for (const r of hd.history || []) for (const a of r.messagesAdded || []) ids.add(a.message.id);
            let synced = 0;
            if (ids.size > 0) { const r = await syncMessages(supabase, account.id, accessToken, log, "in:inbox", Math.min(ids.size + 5, 50)); synced = r.synced; }
            await supabase.from("gmail_accounts").update({ history_id: hd.historyId || account.history_id, last_sync_at: new Date().toISOString(), last_error: null }).eq("id", account.id);
            return { id: account.id, synced };
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await supabase.from("gmail_accounts").update({ last_error: msg, sync_status: "error" }).eq("id", account.id);
          return { id: account.id, error: msg };
        }
      }));
      for (const r of batchResults) results.push(r.status === "fulfilled" ? r.value : { id: "unknown", error: String(r.reason) });
    }
    log.done(200, { accounts: accounts.length }); return new Response(JSON.stringify({ success: true, results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"; log.error("Cron failed", { error: msg });
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
