/**
 * Talk X Storage Purge — drena a fila de expurgo de mídia do Talk X
 * (QA5-05; chamada pelo tick do motor, que deriva a URL de talkx_scheduler_url).
 *
 * A migration 20261004173439 (M-DB-01) tirou do expurgo LGPD o DELETE direto em
 * storage.objects — o gatilho storage.protect_delete derrubava o tick inteiro.
 * Os objetos órfãos de talkx-media passaram a ser registrados em
 * public.talkx_storage_purge_queue, e ESTA função é a consumidora da fila: lê as
 * linhas pendentes, remove cada objeto pela Storage API e preenche processed_at.
 *
 * Contrato de falha:
 *   - objeto removido OU já ausente ("not found" da Storage API) → a linha sai da
 *     fila: processed_at = now(), attempts+1, last_error = null (o objetivo — o
 *     objeto não existir — já está cumprido);
 *   - qualquer outro erro → a linha CONTINUA na fila (processed_at NULL) com
 *     attempts+1 e last_error; a próxima passada tenta de novo. Sem dead-letter:
 *     a fila é o manifesto e o retry é barato porque a seleção é só pendentes;
 *   - try/catch por linha: um objeto ruim não pode impedir os demais;
 *   - nunca lança: falha de infraestrutura vira 200 com o resumo
 *     { processed, failed, batch } — a drenagem é best-effort e não pode derrubar
 *     o tick que a chama.
 *
 * Autorização igual ao talkx-scheduler (X015): x-cron-secret conferido em tempo
 * constante contra get_talkx_cron_secret() (leitura do Vault que falha nunca
 * autoriza — fail-closed) OU Authorization: Bearer <service key>. Senão → 401.
 *
 * `handleTalkxStoragePurge` é exportado e o `Deno.serve` só sobe quando este
 * módulo é o entrypoint (`import.meta.main`), para os testes importarem o
 * handler sem rede, sem banco e sem env — tudo entra por `_injected`.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { timingSafeEqual } from "../_shared/hmac-validation.ts";

/** Linhas pendentes drenadas por invocação (configurável pela costura de teste). */
export const PURGE_BATCH_SIZE = 200;
/** last_error guarda só um resumo — mensagem inteira fica no log da edge. */
const LAST_ERROR_MAX = 500;
const QUEUE_TABLE = "talkx_storage_purge_queue";
/**
 * Nome da RPC SECURITY DEFINER que lê o segredo do Vault, em `const` e não como
 * literal colada na chamada `.rpc` — mesmo motivo documentado no talkx-scheduler
 * (o guard de acoplamento código↔banco varre literais de RPC).
 */
const CRON_SECRET_RPC = "get_talkx_cron_secret";

/**
 * Seam de teste: tudo que o handler precisa do mundo externo pode ser injetado,
 * sem rede, sem banco e sem variável de ambiente.
 */
export interface TalkxStoragePurgeInjected {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  serviceKey?: string;
  env?: (key: string) => string | undefined;
  now?: Date;
  fetch?: typeof fetch;
  getCronSecret?: () => Promise<string | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createSupabase?: (url: string, key: string) => any;
  /** Teto de linhas lidas por invocação (padrão de produção: PURGE_BATCH_SIZE). */
  batchSize?: number;
}

interface QueueRow {
  id: string;
  bucket_id: string;
  object_name: string;
  attempts: number;
}

/** Credencial válida? x-cron-secret do Vault (fail-closed) OU service key. */
async function isAuthorized(
  req: Request,
  serviceKey: string,
  getCronSecret: () => Promise<string | null>,
): Promise<boolean> {
  const cronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("Authorization");

  if (cronSecret) {
    // Leitura do Vault que falha nunca autoriza (fail-closed): devolve null.
    const vaultSecret = await getCronSecret();
    if (vaultSecret !== null && timingSafeEqual(cronSecret, vaultSecret)) return true;
    // Conveniência operacional: a própria service key no x-cron-secret também passa.
    if (serviceKey !== "" && timingSafeEqual(cronSecret, serviceKey)) return true;
  }

  if (serviceKey !== "" && authHeader?.startsWith("Bearer ") && timingSafeEqual(authHeader.slice(7), serviceKey)) {
    return true;
  }

  return false;
}

/**
 * O remove() de um objeto que já não existe volta como erro 404/"not found":
 * o fim que a fila quer — o objeto fora do bucket — já está cumprido, então a
 * linha é marcada como processada em vez de ficar tentando para sempre.
 */
function isStorageNotFound(error: unknown): boolean {
  const e = error as { status?: unknown; statusCode?: unknown; message?: unknown } | null;
  if (!e || typeof e !== "object") return false;
  if (e.status === 404 || e.statusCode === 404 || e.statusCode === "404") return true;
  const message = typeof e.message === "string" ? e.message : "";
  return /not found|does not exist|no such/i.test(message);
}

/** Resumo curto para last_error; a mensagem inteira fica no log da edge. */
function shortError(error: unknown): string {
  // StorageError do supabase-js traz .message; String(obj) viraria "[object Object]".
  const raw = error instanceof Error
    ? error.message
    : (typeof (error as { message?: unknown } | null)?.message === "string"
      ? (error as { message: string }).message
      : String(error));
  return raw.slice(0, LAST_ERROR_MAX);
}

// ─── Handler principal ──────────────────────────────────────────────────────────────────
export async function handleTalkxStoragePurge(
  req: Request,
  _injected?: TalkxStoragePurgeInjected,
): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const log = new Logger("talkx-storage-purge");

  const readEnv = _injected?.env ?? ((key: string) => Deno.env.get(key));
  const batchSize = _injected?.batchSize ?? PURGE_BATCH_SIZE;
  const summary = (extra: Record<string, unknown> = {}) =>
    new Response(
      JSON.stringify({ processed: 0, failed: 0, batch: 0, ...extra }),
      { status: 200, headers },
    );

  try {
    const supabaseUrl = readEnv("SUPABASE_URL") ?? "";
    const serviceKey = _injected?.serviceKey ?? readEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    // O `??` é PREGUIÇOSO: os testes injetam o client e rodam sem SUPABASE_URL. A
    // anotação `as SupabaseClient` evita que o receiver `any` apague a inferência.
    const supabase = (
      _injected?.supabase ?? (_injected?.createSupabase ?? createClient)(supabaseUrl, serviceKey)
    ) as SupabaseClient;
    const getCronSecret = _injected?.getCronSecret ?? (async () => {
      const { data, error } = await supabase.rpc(CRON_SECRET_RPC);
      return !error && typeof data === "string" ? data : null;
    });

    // ── 0. AUTH (mesmo do talkx-scheduler): sem credencial válida → 401 ───────────
    const authorized = await isAuthorized(req, serviceKey, getCronSecret);
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const nowIso = (_injected?.now ?? new Date()).toISOString();

    // ── 1. Pendentes da fila (índice parcial WHERE processed_at IS NULL) ──────────
    const { data: rows, error: selectErr } = await supabase
      .from(QUEUE_TABLE)
      .select("id,bucket_id,object_name,attempts")
      .is("processed_at", null)
      .order("enqueued_at")
      .limit(batchSize);

    if (selectErr) {
      // Fila ilegível: best-effort — devolve 200 com o resumo; a próxima passada tenta de novo.
      log.error("Error fetching storage purge queue", { error: selectErr.message });
      return summary({ error: selectErr.message });
    }

    const pending = (rows ?? []) as QueueRow[];
    let processed = 0;
    let failed = 0;

    // ── 2. Remove cada objeto pela Storage API — try/catch POR LINHA ──────────────
    for (const row of pending) {
      try {
        const { error: removeErr } = await supabase.storage
          .from(row.bucket_id)
          .remove([row.object_name]);

        if (!removeErr || isStorageNotFound(removeErr)) {
          const { error: markErr } = await supabase
            .from(QUEUE_TABLE)
            .update({ processed_at: nowIso, attempts: row.attempts + 1, last_error: null })
            .eq("id", row.id);
          if (markErr) {
            failed += 1;
            log.error("Failed to mark purge row processed", { id: row.id, error: markErr.message });
          } else {
            processed += 1;
            if (removeErr) {
              log.info("Objeto já ausente no bucket; linha marcada como processada", {
                id: row.id,
                bucket: row.bucket_id,
                object_name: row.object_name,
              });
            }
          }
          continue;
        }

        // Erro real do Storage: a linha FICA na fila (processed_at intocado).
        failed += 1;
        const message = shortError(removeErr);
        const { error: markErr } = await supabase
          .from(QUEUE_TABLE)
          .update({ attempts: row.attempts + 1, last_error: message })
          .eq("id", row.id);
        if (markErr) {
          log.error("Failed to record purge error", { id: row.id, error: markErr.message });
        }
        log.warn("Storage remove failed; linha segue na fila", {
          id: row.id,
          bucket: row.bucket_id,
          object_name: row.object_name,
          error: message,
        });
      } catch (err) {
        // Qualquer exceção na linha vira attempts+1/last_error, nunca derruba o laço.
        failed += 1;
        const message = shortError(err);
        try {
          await supabase
            .from(QUEUE_TABLE)
            .update({ attempts: row.attempts + 1, last_error: message })
            .eq("id", row.id);
        } catch {
          // Nem o registro da falha pode derrubar a drenagem; fica no log da edge.
        }
        log.error("Purge failed for queue row", { id: row.id, error: message });
      }
    }

    log.done(200, { processed, failed, batch: pending.length });
    return new Response(
      JSON.stringify({ success: true, processed, failed, batch: pending.length }),
      { headers },
    );
  } catch (err) {
    // Nunca lança: falha de infraestrutura também vira 200 com o resumo.
    const message = err instanceof Error ? err.message : String(err);
    log.error("Storage purge error", { error: message });
    return summary({ error: message });
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleTalkxStoragePurge(req));
}
