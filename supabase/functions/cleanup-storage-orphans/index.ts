/**
 * cleanup-storage-orphans — expurgo de objetos órfãos dos buckets de mídia.
 *
 * Achado de paridade V3 — "arquivos sem uso" (etapa 086): mídia de conversa sobe
 * para `whatsapp-media` e áudio de mensagem para `audio-messages`; quando a linha
 * de origem é apagada/limpa, o objeto fica no bucket para sempre. Esta edge varre
 * os dois buckets e remove SÓ o objeto que não tem nenhuma linha apontando para ele.
 *
 * Regra de ouro (fail-closed em toda direção):
 *   1. NUNCA apaga o que tem linha. A referência é procurada em todas as tabelas
 *      que guardam URL de objeto dos dois buckets (ver REFERENCE_SOURCES). Leitura
 *      de referência que falha = bucket inteiro pulado, nada é apagado nele.
 *   2. Só apaga objeto com idade conhecida >= ORPHAN_MIN_AGE_DAYS (created_at do
 *      próprio objeto). created_at ausente = objeto preservado.
 *   3. `dryRun` só conta e reporta; nunca chama remove().
 *   4. O lote é limitado por MAX_DELETE_PER_RUN (o restante fica para a próxima
 *      passada). O log/resposta registram só CONTAGEM — nunca nome de arquivo.
 *
 * Autorização (ver _shared/cron-secret-auth.ts e hmac-validation.ts):
 *   - cron: `x-cron-secret` conferido em tempo constante contra o env CRON_SECRET
 *     desta função (segredo dedicado; ausente = nunca autoriza — fail-closed);
 *   - máquina: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`;
 *   - manual: usuário autenticado E `is_admin(user)` — o agendador (PE-102) usa o
 *     primeiro; o operador usa o último com `{"dryRun": true}`.
 *   Sem credencial → 401; usuário autenticado que não é admin → 403.
 *
 * Sem corpo (chamada do cron) → APLICA. Chamada manual de admin sem `dryRun`
 * explícito → PREVIEW (dryRun=true): quem aperta o botão não apaga por engano.
 *
 * `handleCleanupStorageOrphans` é exportado e o `Deno.serve` só sobe quando este
 * módulo é o entrypoint (`import.meta.main`), para o teste importar o handler sem
 * rede, sem banco e sem env — tudo entra por `_injected`.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, handleCors, internalErrorResponse, Logger } from "../_shared/validation.ts";
import { timingSafeEqual } from "../_shared/hmac-validation.ts";
import { unauthorizedResponse } from "../_shared/cron-secret-auth.ts";

/** Buckets de mídia privada que esta edge varre. */
export const BUCKETS = ["audio-messages", "whatsapp-media"] as const;

/** Idade mínima (dias) para um objeto ser candidato — margem do fluxo de upload. */
export const ORPHAN_MIN_AGE_DAYS = 7;

/** Teto de remoções por invocação. */
export const MAX_DELETE_PER_RUN = 500;

/** Página da Storage API e do PostgREST. */
const PAGE_SIZE = 1000;

/** Teto de entradas varridas por bucket (evita varredura infinita de recursão). */
const MAX_SCAN_PER_BUCKET = 20000;

/** Teto de linhas de referência lidas por (tabela, coluna). */
const MAX_REFERENCE_ROWS = 50000;

/**
 * Fontes de referência: toda coluna do banco que guarda URL de objeto dos nossos
 * buckets. `messages.media_url`/`contacts.avatar_url` são o núcleo (cartão); as
 * demais entram porque também apontam para `whatsapp-media`/`audio-messages` e
 * apagar um objeto ainda referenciado por elas seria um falso-órfão.
 * `email_attachments` fica de fora: não tem coluna de caminho (só gmail id).
 */
export const REFERENCE_SOURCES = [
  { table: "messages", column: "media_url" },
  { table: "contacts", column: "avatar_url" },
  { table: "scheduled_messages", column: "media_url" },
  { table: "audio_memes", column: "audio_url" },
  { table: "stickers", column: "image_url" },
] as const;

// ─── Tipos estruturais (evitam acoplar a versão do supabase-js) ──────────────────────────

interface ListResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export interface StorageListEntry {
  name: string;
  id: string | null;
  created_at?: string | null;
}

export interface StorageBucketClient {
  list: (
    prefix: string,
    opts?: { limit?: number; offset?: number; sortBy?: { column: string; order: string } },
  ) => Promise<ListResult<StorageListEntry>>;
  remove: (paths: string[]) => Promise<ListResult<unknown>>;
}

export interface ReferenceQuery extends PromiseLike<ListResult<Record<string, unknown>>> {
  select(cols: string): ReferenceQuery;
  like(col: string, pattern: string): ReferenceQuery;
  order(col: string, opts?: { ascending?: boolean }): ReferenceQuery;
  range(from: number, to: number): ReferenceQuery;
}

export interface SupabaseLike {
  from(table: string): ReferenceQuery;
  storage: { from(bucket: string): StorageBucketClient };
  auth: { getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
}

/** Seam de teste: tudo que o handler precisa do mundo externo é injetável. */
export interface CleanupInjected {
  supabase?: SupabaseLike;
  serviceKey?: string;
  cronSecret?: string;
  env?: (key: string) => string | undefined;
  now?: Date;
  createSupabase?: (url: string, key: string) => SupabaseLike;
  maxDeletePerRun?: number;
  minAgeDays?: number;
}

type Caller = "cron" | "admin";
type CallerResult = Caller | "forbidden" | null;

// ─── Handler principal ──────────────────────────────────────────────────────────────────

/**
 * Resolve QUEM chamou. Cron e service key são "cron"; usuário autenticado só passa
 * se `is_admin` disser que sim ("admin"). Usuário autenticado sem admin →
 * "forbidden" (403). Sem credencial → null (401).
 */
async function resolveCaller(
  req: Request,
  supabase: SupabaseLike,
  serviceKey: string,
  cronSecret: string,
): Promise<CallerResult> {
  const headerCron = req.headers.get("x-cron-secret");
  if (headerCron) {
    if (cronSecret !== "" && timingSafeEqual(headerCron, cronSecret)) return "cron";
    // Conveniência operacional: a própria service key no x-cron-secret também passa.
    if (serviceKey !== "" && timingSafeEqual(headerCron, serviceKey)) return "cron";
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (serviceKey !== "" && timingSafeEqual(token, serviceKey)) return "cron";

  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user ?? null;
  if (error || user === null) return null;

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin", { _user_id: user.id });
  if (adminError || isAdmin !== true) return "forbidden";
  return "admin";
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isSafeObjectPath(path: string): boolean {
  if (path === "" || path.includes("\\") || path.includes("\0")) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extrai o caminho do objeto DENTRO do bucket a partir de uma URL de Storage
 * (public/sign/authenticated), ignorando a query (?v=...). Devolve null quando a
 * URL não é deste bucket ou o caminho é inseguro.
 */
export function extractObjectPath(value: unknown, bucket: string): string | null {
  if (typeof value !== "string" || value === "") return null;
  const re = new RegExp(
    `/storage/v1/object/(?:public|sign|authenticated)/${escapeRegExp(bucket)}/([^?#]+)`,
  );
  const match = value.match(re);
  if (!match) return null;
  const decoded = safeDecode(match[1]);
  if (decoded === null || !isSafeObjectPath(decoded)) return null;
  return decoded;
}

// ─── Leitura dos objetos do bucket (recursiva, com teto) ────────────────────────────────

export interface ListedObject {
  path: string;
  createdAt: string | null;
}

export interface ListingResult {
  objects: ListedObject[];
  truncated: boolean;
  failed: boolean;
}

/**
 * Varre o bucket recursivamente. Pastas vêm da Storage API sem `id` — a recursão
 * entra nelas (o layout real tem `<contactId>/image/...`, não `image/...`).
 * Qualquer erro de leitura aborta o bucket com `failed: true` (o chamador pula).
 */
export async function listBucketObjects(
  client: SupabaseLike,
  bucket: string,
  pageSize = PAGE_SIZE,
  maxScan = MAX_SCAN_PER_BUCKET,
): Promise<ListingResult> {
  const storage = client.storage.from(bucket);
  const objects: ListedObject[] = [];
  const pendingPrefixes: string[] = [""];
  let truncated = false;

  while (pendingPrefixes.length > 0) {
    const prefix = pendingPrefixes.shift() as string;
    let offset = 0;
    for (;;) {
      const { data, error } = await storage.list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) return { objects, truncated, failed: true };

      const entries = data ?? [];
      for (const entry of entries) {
        const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
        if (entry.id === null) {
          pendingPrefixes.push(path);
        } else {
          if (objects.length >= maxScan) {
            truncated = true;
            break;
          }
          objects.push({ path, createdAt: entry.created_at ?? null });
        }
      }

      if (entries.length < pageSize || truncated) break;
      offset += entries.length;
    }
    if (truncated) break;
  }

  return { objects, truncated, failed: false };
}

// ─── Leitura das referências do banco ───────────────────────────────────────────────────

export interface ReferenceResult {
  paths: Set<string>;
  failed: boolean;
}

/**
 * Coleta, no banco, todo caminho de objeto referenciado neste bucket. A linha só
 * é consultada quando a URL aponta para o bucket (LIKE com o nome do bucket), e o
 * caminho vem do parser acima.
 *
 * Fail-closed nas duas pontas: erro de leitura → `failed`. E se uma linha CASOU
 * com o LIKE do bucket mas o caminho não pôde ser extraído (formato de URL
 * desconhecido), o bucket inteiro é dado como `failed` — melhor não limpar do que
 * arriscar apagar um objeto que essa linha referencia.
 */
export async function collectReferencedPaths(
  client: SupabaseLike,
  bucket: string,
  options: { pageSize?: number; maxRows?: number; sources?: typeof REFERENCE_SOURCES } = {},
): Promise<ReferenceResult> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const maxRows = options.maxRows ?? MAX_REFERENCE_ROWS;
  const sources = options.sources ?? REFERENCE_SOURCES;
  const pattern = `%/storage/v1/object/%/${bucket}/%`;
  const paths = new Set<string>();

  for (const source of sources) {
    let offset = 0;
    let scanned = 0;
    for (;;) {
      const { data, error } = await client
        .from(source.table)
        .select(`id,${source.column}`)
        .like(source.column, pattern)
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) return { paths, failed: true };

      const rows = data ?? [];
      for (const row of rows) {
        const path = extractObjectPath(row[source.column], bucket);
        if (path === null) return { paths, failed: true };
        paths.add(path);
      }
      scanned += rows.length;
      if (rows.length < pageSize || scanned >= maxRows) break;
      offset += rows.length;
    }
  }

  return { paths, failed: false };
}

// ─── Handler principal ──────────────────────────────────────────────────────────────────

export type BucketReport = {
  /** entradas de arquivo vistas no bucket */
  scanned: number;
  /** órfãos elegíveis (idade + sem referência) encontrados */
  candidates: number;
  /** órfãos efetivamente removidos nesta passada */
  deleted: number;
};

export async function handleCleanupStorageOrphans(
  req: Request,
  _injected?: CleanupInjected,
): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const log = new Logger("cleanup-storage-orphans");
  const readEnv = _injected?.env ?? ((key: string) => Deno.env.get(key));
  const maxDelete = _injected?.maxDeletePerRun ?? MAX_DELETE_PER_RUN;
  const minAgeDays = _injected?.minAgeDays ?? ORPHAN_MIN_AGE_DAYS;

  try {
    const supabaseUrl = readEnv("SUPABASE_URL") ?? "";
    const serviceKey = _injected?.serviceKey ?? readEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cronSecret = _injected?.cronSecret ?? readEnv("CRON_SECRET") ?? "";
    const supabase = _injected?.supabase ??
      (_injected?.createSupabase ?? ((url, key) => createClient(url, key) as unknown as SupabaseLike))(
        supabaseUrl,
        serviceKey,
      );

    // ── 0. AUTH ─────────────────────────────────────────────────────────────────
    const caller = await resolveCaller(req, supabase, serviceKey, cronSecret);
    if (caller === "forbidden") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
    }
    if (caller === null) return unauthorizedResponse(headers);

    // ── 1. dryRun: explícito no corpo vence; sem corpo, admin faz preview e cron aplica
    let bodyDryRun: boolean | undefined;
    try {
      const raw = await req.text();
      if (raw.trim() !== "") {
        const parsed = JSON.parse(raw) as { dryRun?: unknown };
        if (typeof parsed?.dryRun === "boolean") bodyDryRun = parsed.dryRun;
      }
    } catch {
      // corpo ilegível cai no padrão do chamador (fail-safe: admin faz preview)
    }
    const dryRun = bodyDryRun ?? caller === "admin";

    // ── 2. Varredura por bucket ─────────────────────────────────────────────────
    const nowMs = (_injected?.now ?? new Date()).getTime();
    const minAgeMs = minAgeDays * 24 * 60 * 60 * 1000;
    const reports: Record<string, BucketReport> = {};
    let deletedTotal = 0;
    let budget = maxDelete;
    const errors: string[] = [];

    for (const bucket of BUCKETS) {
      const report: BucketReport = { scanned: 0, candidates: 0, deleted: 0 };

      const referenced = await collectReferencedPaths(supabase, bucket);
      if (referenced.failed) {
        // Fail-closed: sem saber o que está referenciado, NÃO se apaga nada deste bucket.
        errors.push(`${bucket}:reference-read-failed`);
        reports[bucket] = report;
        continue;
      }

      const listing = await listBucketObjects(supabase, bucket);
      if (listing.failed) {
        errors.push(`${bucket}:list-failed`);
        reports[bucket] = report;
        continue;
      }
      if (listing.truncated) errors.push(`${bucket}:scan-truncated`);
      report.scanned = listing.objects.length;

      const candidates = listing.objects
        .filter((obj) => {
          if (obj.createdAt === null) return false; // idade desconhecida: preserva
          const age = nowMs - Date.parse(obj.createdAt);
          if (!Number.isFinite(age) || age < minAgeMs) return false; // jovem demais: preserva
          return !referenced.paths.has(obj.path);
        })
        .sort((a, b) => Date.parse(a.createdAt as string) - Date.parse(b.createdAt as string));

      report.candidates = candidates.length;

      if (!dryRun && candidates.length > 0 && budget > 0) {
        const toDelete = candidates.slice(0, budget).map((obj) => obj.path);
        const { error } = await supabase.storage.from(bucket).remove(toDelete);
        if (error) {
          errors.push(`${bucket}:remove-failed`);
          log.error("Falha ao remover órfãos do bucket", { bucket, count: toDelete.length, error: error.message });
        } else {
          report.deleted = toDelete.length;
          deletedTotal += toDelete.length;
          budget -= toDelete.length;
        }
      }

      reports[bucket] = report;
      log.info("Varredura do bucket concluída", {
        bucket,
        scanned: report.scanned,
        candidates: report.candidates,
        deleted: report.deleted,
        dryRun,
      });
    }

    const body = {
      success: true,
      dryRun,
      minAgeDays,
      maxDeletePerRun: maxDelete,
      deletedTotal,
      buckets: reports,
      ...(errors.length > 0 ? { errors } : {}),
    };
    log.done(200, { dryRun, deletedTotal });
    return new Response(JSON.stringify(body), { status: 200, headers });
  } catch (err) {
    log.error("Falha inesperada no expurgo de órfãos", {
      error: err instanceof Error ? err.message : String(err),
    });
    return internalErrorResponse(err, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleCleanupStorageOrphans(req));
}
