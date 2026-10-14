import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, handleCors, Logger, requireEnv } from "../_shared/validation.ts";
import { ensureValidToken, gmailFetch, GMAIL_HISTORY_MAX_PAGES_PER_RUN, GMAIL_SYNC_SCOPE_QUERY, reconcileEmailThreads, recordGmailAccountFailure, runGmailFullSync, sanitizeGmailErrorMessage, selectGmailAccountsDue, syncMessageIds } from "../_shared/gmail-helpers.ts";

const BATCH = 3; // max contas em paralelo para evitar timeout de 60s

interface GmailHistoryPage {
  history?: Array<{
    messagesAdded?: Array<{ message: { id: string } }>;
    messagesDeleted?: Array<{ message: { id: string } }>;
    labelsAdded?: Array<{ message: { id: string } }>;
    labelsRemoved?: Array<{ message: { id: string } }>;
  }>;
  historyId?: string;
  nextPageToken?: string;
}

export interface GmailCronIncrementalResult {
  synced: number;
  deleted: number;
  cursor_advanced: boolean;
  history_pages: number;
  history_truncated: boolean;
}

// R2-API-011B — avanço de cursor incremental por compare-and-swap: o UPDATE só
// grava se o history_id da linha ainda for o lido no início da tentativa
// (account.history_id). 0 linhas = outro fluxo já moveu o cursor → conflito:
// não sobrescreve e não marca a conta como erro, só devolve
// cursor_advanced=false no resultado da conta. Erro real do UPDATE é
// propagado (a conta sai como erro em vez de "sincronizada" sem cursor).
//
// Mesma regra de conteúdo do `gmail-sync`: o histórico traz messageAdded,
// messageDeleted, labelAdded e labelRemoved. Rótulo adicionado/removido
// re-sincroniza a mensagem (a thread passa a refletir a pasta do Gmail — ex.:
// sair da Entrada, entrar em Enviados); mensagem excluída é apagada do local.
// Cada rodada para no teto de páginas por causa do tempo da Edge e o cursor é
// persistido no historyId da última página processada — a rodada seguinte
// (cron a cada 5 min) continua exatamente de onde parou, sem pular eventos.
export async function runGmailCronIncrementalSync(
  supabase: SupabaseClient,
  account: { id: string; history_id: string },
  accessToken: string,
  log: Logger,
): Promise<GmailCronIncrementalResult> {
  const changedMessageIds = new Set<string>();
  const deletedMessageIds = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId = account.history_id;
  let pages = 0;
  let truncated = false;
  do {
    const params = new URLSearchParams({ startHistoryId: account.history_id });
    for (const historyType of ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"]) params.append("historyTypes", historyType);
    if (pageToken) params.set("pageToken", pageToken);
    const historyData = await gmailFetch<GmailHistoryPage>(accessToken, `/history?${params.toString()}`);
    for (const record of historyData.history || []) {
      for (const added of record.messagesAdded || []) changedMessageIds.add(added.message.id);
      for (const labeled of record.labelsAdded || []) changedMessageIds.add(labeled.message.id);
      for (const unlabeled of record.labelsRemoved || []) changedMessageIds.add(unlabeled.message.id);
      for (const deleted of record.messagesDeleted || []) deletedMessageIds.add(deleted.message.id);
    }
    latestHistoryId = historyData.historyId || latestHistoryId;
    pageToken = historyData.nextPageToken;
    pages += 1;
    if (pageToken && pages >= GMAIL_HISTORY_MAX_PAGES_PER_RUN) { truncated = true; break; }
  } while (pageToken);

  for (const deletedId of deletedMessageIds) changedMessageIds.delete(deletedId);

  let synced = 0;
  if (changedMessageIds.size > 0) {
    const r = await syncMessageIds(supabase, account.id, accessToken, log, [...changedMessageIds]);
    if (r.failed > 0) throw new Error(`${r.failed} mensagens falharam no sync incremental; cursor preservado`);
    synced = r.synced;
  }

  const affectedThreadIds: string[] = [];
  if (deletedMessageIds.size > 0) {
    const ownedDeleted = await supabase.from("email_messages").select("id,thread_id,gmail_message_id").eq("gmail_account_id", account.id).in("gmail_message_id", [...deletedMessageIds]);
    if (ownedDeleted.error) throw new Error("Failed to resolve deleted Gmail messages locally");
    affectedThreadIds.push(...(ownedDeleted.data || []).map(message => message.thread_id).filter(Boolean));
    if (ownedDeleted.data?.length) {
      const deletion = await supabase.from("email_messages").delete().eq("gmail_account_id", account.id).in("id", ownedDeleted.data.map(message => message.id));
      if (deletion.error) throw new Error("Failed to delete Gmail messages locally");
    }
    await reconcileEmailThreads(supabase, account.id, affectedThreadIds);
  }

  const { data: advanced, error: cursorError } = await supabase.from("gmail_accounts").update({ history_id: latestHistoryId, last_sync_at: new Date().toISOString(), last_error: null, error_count: 0, next_attempt_at: null }).eq("id", account.id).eq("history_id", account.history_id).select("id");
  if (cursorError) throw new Error("Failed to persist Gmail history cursor");
  return { synced, deleted: deletedMessageIds.size, cursor_advanced: Boolean(advanced && advanced.length > 0), history_pages: pages, history_truncated: truncated };
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
    const dueAccounts = selectGmailAccountsDue(accounts);
    const skipped = accounts.length - dueAccounts.length;
    if (!dueAccounts.length) { log.info("No accounts due", { skipped }); return new Response(JSON.stringify({ success: true, synced: 0, skipped }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    const results: Array<{ id: string; synced?: number; deleted?: number; error?: string; cursor_advanced?: boolean; history_pages?: number; history_truncated?: boolean }> = [];
    for (let i = 0; i < dueAccounts.length; i += BATCH) {
      const batch = dueAccounts.slice(i, i + BATCH);
      const batchResults = await Promise.allSettled(batch.map(async (account) => {
        try {
          const accessToken = await ensureValidToken(supabase, account, log);
          if (!account.history_id) {
            // conta sem history_id: full sync no escopo Entrada+Enviados (12 meses;
            // todas as páginas; cursor só no fim, sem falhas)
            await supabase.from("gmail_accounts").update({ sync_status: "syncing" }).eq("id", account.id);
            const result = await runGmailFullSync(supabase, account.id, accessToken, log, GMAIL_SYNC_SCOPE_QUERY, 50);
            if (result.failed > 0) throw new Error(`Full sync incompleto: ${result.failed} mensagens falharam`);
            return { id: account.id, synced: result.synced };
          } else {
            // sync incremental: aplica só os IDs do histórico; cursor avança só sem falhas e via CAS
            const r = await runGmailCronIncrementalSync(supabase, account, accessToken, log);
            return { id: account.id, synced: r.synced, deleted: r.deleted, cursor_advanced: r.cursor_advanced, history_pages: r.history_pages, history_truncated: r.history_truncated };
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          try {
            // token revogado/expirado vira 'reauth_required'; o resto 'error',
            // com a espera crescente contada a partir das falhas seguidas.
            await recordGmailAccountFailure(supabase, account.id, err, (account.error_count ?? 0) + 1);
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
    const msg = error instanceof Error ? error.message : "Unknown error"; log.error("Cron failed", { error: msg });
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

if (import.meta.main) {
  Deno.serve(handleGmailCronSync);
}
