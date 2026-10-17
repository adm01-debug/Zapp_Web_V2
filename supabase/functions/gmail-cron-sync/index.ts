import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, handleCors, Logger, requireEnv } from "../_shared/validation.ts";
import { ensureValidToken, gmailFetch, reconcileEmailThreads, runGmailFullSync, syncMessageIds } from "../_shared/gmail-helpers.ts";

const BATCH = 3; // max contas em paralelo para evitar timeout de 60s

// Escopo de CONTEÚDO do sync: Entrada + Enviados, janela de 12 meses. Spam,
// Lixeira e Rascunhos aparecem só como CONTAGEM de rótulo (`syncLabels` grava
// `email_labels.message_count`), nunca como mensagem baixada — escopo mínimo,
// sem trazer conteúdo que o produto não mostra (LGPD).
export const GMAIL_CRON_SCOPE_QUERY = "(in:inbox OR in:sent) newer_than:365d";

// Teto de páginas de histórico por rodada. O cron roda a cada 5 min: a rodada
// para dentro do tempo da Edge e o cursor (history_id) é gravado com o valor da
// ÚLTIMA página processada — a rodada seguinte continua exatamente de lá.
export const GMAIL_CRON_HISTORY_MAX_PAGES_PER_RUN = 10;

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
// O histórico traz messageAdded, messageDeleted, labelAdded e labelRemoved.
// Rótulo adicionado/removido re-sincroniza a mensagem (a thread passa a
// refletir a pasta do Gmail — ex.: sair da Entrada, entrar em Enviados);
// mensagem excluída é apagada do local, sem re-buscar conteúdo.
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
    if (pageToken && pages >= GMAIL_CRON_HISTORY_MAX_PAGES_PER_RUN) { truncated = true; break; }
  } while (pageToken);

  // mensagem excluída não é re-sincronizada (o Gmail não tem mais o conteúdo)
  for (const deletedId of deletedMessageIds) changedMessageIds.delete(deletedId);

  let synced = 0;
  if (changedMessageIds.size > 0) {
    const r = await syncMessageIds(supabase, account.id, accessToken, log, [...changedMessageIds]);
    if (r.failed > 0) throw new Error(`${r.failed} mensagens falharam no sync incremental; cursor preservado`);
    synced = r.synced;
  }

  if (deletedMessageIds.size > 0) {
    const { data: ownedDeleted, error: readError } = await supabase.from("email_messages")
      .select("id,thread_id,gmail_message_id")
      .eq("gmail_account_id", account.id).in("gmail_message_id", [...deletedMessageIds]);
    if (readError) throw new Error("Failed to resolve deleted Gmail messages locally");
    const affectedThreadIds = [...new Set((ownedDeleted || []).map(message => message.thread_id).filter(Boolean))] as string[];
    if (ownedDeleted?.length) {
      const { error: deleteError } = await supabase.from("email_messages")
        .delete().eq("gmail_account_id", account.id).in("id", ownedDeleted.map(message => message.id));
      if (deleteError) throw new Error("Failed to delete Gmail messages locally");
    }
    await reconcileEmailThreads(supabase, account.id, affectedThreadIds);
  }

  const { data: advanced, error: cursorError } = await supabase.from("gmail_accounts").update({ history_id: latestHistoryId, last_sync_at: new Date().toISOString(), last_error: null }).eq("id", account.id).eq("history_id", account.history_id).select("id");
  if (cursorError) throw new Error("Failed to persist Gmail history cursor");
  return { synced, deleted: deletedMessageIds.size, cursor_advanced: Boolean(advanced && advanced.length > 0), history_pages: pages, history_truncated: truncated };
}

export interface GmailCronAccountResult {
  id: string;
  synced?: number;
  deleted?: number;
  cursor_advanced?: boolean;
  history_pages?: number;
  history_truncated?: boolean;
}

// Sincroniza UMA conta na rodada do cron: sem cursor vai de full sync (escopo
// Entrada+Enviados), com cursor vai de incremental. Erro propaga para o
// chamador — o handler marca a conta como erro, não engole.
export async function syncGmailCronAccount(
  supabase: SupabaseClient,
  account: { id: string; token_expires_at: string; history_id: string | null },
  log: Logger,
): Promise<GmailCronAccountResult> {
  const accessToken = await ensureValidToken(supabase, account, log);
  const historyId = account.history_id;
  if (!historyId) {
    // conta sem history_id: full sync (todas as páginas; cursor só no fim, sem falhas)
    await supabase.from("gmail_accounts").update({ sync_status: "syncing" }).eq("id", account.id);
    const result = await runGmailFullSync(supabase, account.id, accessToken, log, GMAIL_CRON_SCOPE_QUERY, 50);
    if (result.failed > 0) throw new Error(`Full sync incompleto: ${result.failed} mensagens falharam`);
    return { id: account.id, synced: result.synced };
  }
  // sync incremental: aplica só os IDs do histórico; cursor avança só sem falhas e via CAS
  const r = await runGmailCronIncrementalSync(supabase, { id: account.id, history_id: historyId }, accessToken, log);
  return { id: account.id, synced: r.synced, deleted: r.deleted, cursor_advanced: r.cursor_advanced, history_pages: r.history_pages, history_truncated: r.history_truncated };
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
    const { data: accounts, error } = await supabase.from("gmail_accounts").select("id, user_id, token_expires_at, history_id, is_active").eq("is_active", true);
    if (error || !accounts?.length) { log.info("No active accounts"); return new Response(JSON.stringify({ success: true, synced: 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    const results: Array<{ id: string; synced?: number; error?: string; cursor_advanced?: boolean }> = [];
    for (let i = 0; i < accounts.length; i += BATCH) {
      const batch = accounts.slice(i, i + BATCH);
      const batchResults = await Promise.allSettled(batch.map(async (account) => {
        try {
          // conta sem history_id: full sync no escopo Entrada+Enviados (12 meses);
          // conta com history_id: incremental (exclusões e mudanças de rótulo do Gmail)
          return await syncGmailCronAccount(supabase, account, log);
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
}

if (import.meta.main) {
  Deno.serve(handleGmailCronSync);
}
