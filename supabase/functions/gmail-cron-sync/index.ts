import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, handleCors, Logger, requireEnv } from "../_shared/validation.ts";
import { ensureValidToken, runGmailFullSync, syncMessageIds } from "../_shared/gmail-helpers.ts";

const BATCH = 3; // max contas em paralelo para evitar timeout de 60s

// Renovação do watch de push (a assinatura do Gmail expira sozinha). O cron roda
// 1x/dia: renovar quando faltam <= 24 h coloca o watch na janela e ele é
// renovado ANTES de expirar, qualquer que seja a vida real da assinatura (7 dias
// do Gmail, ou 24 h como a V3 documenta). Rodar o cron de novo no mesmo dia cai
// no ramo "still_valid" logo após a 1ª renovação — idempotente.
export const GMAIL_WATCH_RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000;
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_PUBSUB_TOPIC_ENV = "GMAIL_PUBSUB_TOPIC";

export type GmailWatchRenewalStatus = "renewed" | "still_valid" | "skipped_no_topic" | "error";

export interface GmailWatchRenewalResult {
  status: GmailWatchRenewalStatus;
  expiration?: string | null;
  error?: string;
}

interface GmailWatchAccount {
  id: string;
  watch_expiration: string | null;
}

// Renova o watch SÓ quando ele está expirado ou dentro da janela de renovação;
// um watch ainda válido não gera chamada à API (idempotente entre execuções).
// Nunca lança: o polling do cron cobre a perda do push, então a falha vira
// `status: "error"` no resultado e warning no log — registrada, nunca silenciosa.
// Sem tópico configurado não inventa um destino: devolve `skipped_no_topic`,
// que aparece no log e na resposta do cron (o watch, nesse caso, é o único jeito
// de o push voltar e o operador precisa ver o motivo).
export async function renewGmailWatchIfNeeded(
  supabase: SupabaseClient,
  account: GmailWatchAccount,
  accessToken: string,
  log: Logger,
  options: { topicName?: string | null; now?: Date } = {},
): Promise<GmailWatchRenewalResult> {
  const now = options.now ?? new Date();
  const currentMs = account.watch_expiration ? new Date(account.watch_expiration).getTime() : Number.NaN;
  const needsRenewal = !Number.isFinite(currentMs) || currentMs - now.getTime() <= GMAIL_WATCH_RENEWAL_WINDOW_MS;
  if (!needsRenewal) return { status: "still_valid", expiration: account.watch_expiration };

  const topicName = options.topicName ?? Deno.env.get(GMAIL_PUBSUB_TOPIC_ENV) ?? "";
  if (!topicName) {
    log.warn("Gmail watch renewal skipped: no Pub/Sub topic configured", { accountId: account.id, env: GMAIL_PUBSUB_TOPIC_ENV });
    return { status: "skipped_no_topic" };
  }

  try {
    const response = await fetch(`${GMAIL_API}/watch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ topicName, labelIds: ["INBOX"], labelFilterBehavior: "INCLUDE" }),
    });
    if (!response.ok) throw new Error(`Watch renewal failed (${response.status})`);
    const watchData = await response.json();
    const expirationMs = Number.parseInt(String(watchData.expiration ?? ""), 10);
    if (!Number.isFinite(expirationMs)) throw new Error("Watch renewal returned no expiration");
    const expiration = new Date(expirationMs).toISOString();
    const { error } = await supabase
      .from("gmail_accounts")
      .update({ watch_expiration: expiration })
      .eq("id", account.id);
    if (error) throw new Error("Failed to persist Gmail watch expiration");
    log.info("Gmail watch renewed", { accountId: account.id, watchExpiration: expiration });
    return { status: "renewed", expiration };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn("Gmail watch renewal failed", { accountId: account.id, error: msg });
    return { status: "error", error: msg };
  }
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
  const { data: advanced, error: cursorError } = await supabase.from("gmail_accounts").update({ history_id: hd.historyId || account.history_id, last_sync_at: new Date().toISOString(), last_error: null }).eq("id", account.id).eq("history_id", account.history_id).select("id");
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
    const { data: accounts, error } = await supabase.from("gmail_accounts").select("id, user_id, token_expires_at, history_id, is_active, watch_expiration").eq("is_active", true);
    if (error || !accounts?.length) { log.info("No active accounts"); return new Response(JSON.stringify({ success: true, synced: 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    const results: Array<{ id: string; synced?: number; error?: string; cursor_advanced?: boolean; watch?: GmailWatchRenewalResult }> = [];
    for (let i = 0; i < accounts.length; i += BATCH) {
      const batch = accounts.slice(i, i + BATCH);
      const batchResults = await Promise.allSettled(batch.map(async (account) => {
        let watch: GmailWatchRenewalResult | undefined;
        try {
          const accessToken = await ensureValidToken(supabase, account, log);
          // Watch renovado independente do sync: se a renovação falhar, o sync
          // do dia continua (o polling cobre a perda do push) e o motivo sai no
          // resultado/log da conta, nunca em silêncio.
          watch = await renewGmailWatchIfNeeded(supabase, account, accessToken, log);
          if (!account.history_id) {
            // conta sem history_id: full sync (todas as páginas; cursor só no fim, sem falhas)
            await supabase.from("gmail_accounts").update({ sync_status: "syncing" }).eq("id", account.id);
            const result = await runGmailFullSync(supabase, account.id, accessToken, log, "in:inbox", 50);
            if (result.failed > 0) throw new Error(`Full sync incompleto: ${result.failed} mensagens falharam`);
            return { id: account.id, synced: result.synced, watch };
          } else {
            // sync incremental: aplica só os IDs do histórico; cursor avança só sem falhas e via CAS
            const r = await runGmailCronIncrementalSync(supabase, account, accessToken, log);
            return { id: account.id, synced: r.synced, cursor_advanced: r.cursor_advanced, watch };
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await supabase.from("gmail_accounts").update({ last_error: msg, sync_status: "error" }).eq("id", account.id);
          return { id: account.id, error: msg, watch };
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
