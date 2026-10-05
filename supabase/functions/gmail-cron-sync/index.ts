import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, handleCors, Logger, requireEnv } from "../_shared/validation.ts";
import { ensureValidToken, gmailFetch, runGmailIncrementalSync, syncMessages } from "../_shared/gmail-helpers.ts";

const BATCH = 3; // max contas em paralelo para evitar timeout de 60s

// O handler exportado aceita o client service_role injetado para o teste
// offline exercitar o fluxo real sem Supabase; o `if (import.meta.main)` no fim
// impede que o import suba o servidor.
export interface GmailCronSyncDeps {
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
}

export async function handleGmailCronSync(req: Request, deps: GmailCronSyncDeps = {}): Promise<Response> {
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
    // deno-lint-ignore no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = deps.supabase ?? createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: accounts, error } = await supabase.from("gmail_accounts").select("id, user_id, email_address, token_expires_at, history_id, is_active").eq("is_active", true);
    if (error) throw new Error(`Failed to list Gmail accounts: ${error.message}`);
    if (!accounts?.length) { log.info("No active accounts"); return new Response(JSON.stringify({ success: true, synced: 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    const results: Array<{ id: string; synced?: number; failed?: number; cursor_advanced?: boolean; status?: string; error?: string }> = [];
    for (let i = 0; i < accounts.length; i += BATCH) {
      const batch = accounts.slice(i, i + BATCH);
      const batchResults = await Promise.allSettled(batch.map(async (account: { id: string; token_expires_at: string; history_id: string | null }) => {
        try {
          const accessToken = await ensureValidToken(supabase, account, log);
          if (!account.history_id) {
            // conta sem history_id: full sync
            const { error: syncErr } = await supabase.from("gmail_accounts").update({ sync_status: "syncing" }).eq("id", account.id);
            if (syncErr) throw new Error(`Failed to mark account syncing: ${syncErr.message}`);
            const result = await syncMessages(supabase, account.id, accessToken, log, "in:inbox", 50);
            const profile = await gmailFetch<{ historyId?: string }>(accessToken, "/profile");
            const { error: doneErr } = await supabase.from("gmail_accounts").update({ sync_status: "synced", history_id: profile.historyId, last_sync_at: new Date().toISOString(), last_error: null }).eq("id", account.id);
            if (doneErr) throw new Error(`Failed to persist full sync cursor: ${doneErr.message}`);
            return { id: account.id, synced: result.synced, status: "synced" };
          }
          // R2-API-011: o MESMO pipeline incremental canônico do webhook e do
          // gmail-sync — todas as páginas/tipos do history, IDs realmente
          // alterados (não a heurística "caixa recente, 50"), cursor só avança
          // depois dos efeitos e com compare-and-swap.
          const result = await runGmailIncrementalSync(supabase, account, accessToken, log);
          return {
            id: account.id,
            synced: result.synced,
            failed: result.failed,
            cursor_advanced: result.cursor_advanced,
            status: result.status,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const { error: markErr } = await supabase.from("gmail_accounts").update({ last_error: msg, sync_status: "error" }).eq("id", account.id);
          if (markErr) log.error("Failed to record cron sync error", { error: markErr.message });
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
}

if (import.meta.main) {
  Deno.serve((req) => handleGmailCronSync(req));
}
