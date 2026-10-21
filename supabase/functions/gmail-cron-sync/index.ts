import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, handleCors, Logger, requireEnv, internalErrorResponse } from "../_shared/validation.ts";
import { ensureValidToken, recordGmailAccountFailure, runGmailFullSync, sanitizeGmailErrorMessage, selectGmailAccountsDue, syncMessageIds } from "../_shared/gmail-helpers.ts";

const BATCH = 3; // max contas em paralelo para evitar timeout de 60s

interface GmailCronAccount {
  id: string;
  token_expires_at: string;
  history_id: string | null;
  sync_status?: string | null;
  error_count?: number | null;
  next_attempt_at?: string | null;
}

// R2-API-011B — avanço de cursor incremental por compare-and-swap: o UPDATE só
// grava se o history_id da linha ainda for o lido no início da tentativa
// (account.history_id). 0 linhas = outro fluxo já moveu o cursor → conflito:
// não sobrescreve e não marca a conta como erro, só devolve
// cursor_advanced=false no resultado da conta. Erro real do UPDATE é
// propagado (a conta sai como erro em vez de "sincronizada" sem cursor).
export async function runGmailCronIncrementalSync(
  supabase: SupabaseClient,
  account: { id: string; history_id: string },
  accessToken: string,
  log: Logger,
): Promise<{ synced: number; cursor_advanced: boolean }> {
  const hr = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${account.history_id}&historyTypes=messageAdded`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!hr.ok) throw new Error(`History API: ${await hr.text()}`);
  const hd = await hr.json();
  const ids = new Set<string>(); for (const r of hd.history || []) for (const a of r.messagesAdded || []) ids.add(a.message.id);
  let synced = 0;
  if (ids.size > 0) {
    const r = await syncMessageIds(supabase, account.id, accessToken, log, [...ids]);
    if (r.failed > 0) throw new Error(`${r.failed} mensagens falharam no sync incremental; cursor preservado`);
    synced = r.synced;
  }
  const { data: advanced, error: cursorError } = await supabase.from("gmail_accounts").update({ history_id: hd.historyId || account.history_id, last_sync_at: new Date().toISOString(), last_error: null, error_count: 0, next_attempt_at: null }).eq("id", account.id).eq("history_id", account.history_id).select("id");
  if (cursorError) throw new Error("Failed to persist Gmail history cursor");
  return { synced, cursor_advanced: Boolean(advanced && advanced.length > 0) };
}

export async function handleGmailCronSync(req: Request): Promise<Response> {
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
    const { data: accounts, error } = await supabase.from("gmail_accounts").select("id, user_id, token_expires_at, history_id, is_active, sync_status, error_count, next_attempt_at").eq("is_active", true);
    if (error || !accounts?.length) { log.info("No active accounts"); return new Response(JSON.stringify({ success: true, synced: 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    // Pula as contas que exigem ação humana (reauth_required) e as que ainda
    // estão na espera crescente de uma falha transitória — não bate no Google de novo.
    const dueAccounts = selectGmailAccountsDue((accounts ?? []) as GmailCronAccount[]);
    const skipped = accounts.length - dueAccounts.length;
    if (!dueAccounts.length) { log.info("No accounts due", { skipped }); return new Response(JSON.stringify({ success: true, synced: 0, skipped }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    const results: Array<{ id: string; synced?: number; error?: string; cursor_advanced?: boolean }> = [];
    for (let i = 0; i < dueAccounts.length; i += BATCH) {
      const batch = dueAccounts.slice(i, i + BATCH);
      const batchResults = await Promise.allSettled(batch.map(async (account: GmailCronAccount) => {
        try {
          const accessToken = await ensureValidToken(supabase, account, log);
          const historyId = account.history_id;
          if (!historyId) {
            // conta sem history_id: full sync (todas as páginas; cursor só no fim, sem falhas)
            await supabase.from("gmail_accounts").update({ sync_status: "syncing" }).eq("id", account.id);
            const result = await runGmailFullSync(supabase, account.id, accessToken, log, "in:inbox", 50);
            if (result.failed > 0) throw new Error(`Full sync incompleto: ${result.failed} mensagens falharam`);
            return { id: account.id, synced: result.synced };
          } else {
            // sync incremental: aplica só os IDs do histórico; cursor avança só sem falhas e via CAS
            const r = await runGmailCronIncrementalSync(supabase, { id: account.id, history_id: historyId }, accessToken, log);
            return { id: account.id, synced: r.synced, cursor_advanced: r.cursor_advanced };
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          try {
            // token revogado/expirado vira 'reauth_required'; o resto 'error'.
            // error_count conta falhas SEGUIDAS (a coluna já tem as anteriores).
            const attempts = (typeof account.error_count === "number" ? account.error_count : 0) + 1;
            await recordGmailAccountFailure(supabase, account.id, err, attempts);
          } catch (recordErr) {
            log.error("Falha ao registrar o estado de erro da conta Gmail", { error: recordErr instanceof Error ? recordErr.message : String(recordErr) });
          }
          return { id: account.id, error: sanitizeGmailErrorMessage(msg) };
        }
      }));
      for (const r of batchResults) results.push(r.status === "fulfilled" ? r.value : { id: "unknown", error: String(r.reason) });
    }
    log.done(200, { accounts: accounts.length }); return new Response(JSON.stringify({ success: true, results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return internalErrorResponse(error, req);
  }
}

if (import.meta.main) {
  Deno.serve(handleGmailCronSync);
}
