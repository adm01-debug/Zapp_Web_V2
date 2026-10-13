/**
 * Contrato executável do cleanup-storage-orphans (PE-101 / etapa 086).
 *
 * Trava o que o cartão promete:
 *   1. sem credencial → 401; x-cron-secret do env → passa; usuário admin passa;
 *      usuário autenticado que NÃO é admin → 403;
 *   2. órfão antigo é apagado, o referenciado NÃO;
 *   3. objeto jovem (< ORPHAN_MIN_AGE_DAYS) NÃO é apagado;
 *   4. dryRun só conta e reporta, nunca chama remove();
 *   5. recursão: objeto em subpasta (`<contato>/image/...`) é visto;
 *   6. fail-closed: erro ao ler referência → nada é apagado naquele bucket;
 *   7. teto de lote (maxDeletePerRun) corta;
 *   8. a resposta não traz nome de arquivo (só contagem).
 *
 * Roda sem rede, sem banco e sem env: tudo entra por `_injected`.
 * Comando do CI: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/cleanup-storage-orphans/index.test.ts
 */
import {
  collectReferencedPaths,
  extractObjectPath,
  handleCleanupStorageOrphans,
  listBucketObjects,
  type StorageListEntry,
  type SupabaseLike,
} from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const TEST_SERVICE_KEY = "service-role-key-fake-para-teste-cleanup-orphans-xxxxxxxx";
const TEST_CRON_SECRET = "cron-secret-cleanup-orphans-test-64chars-timing-safe-xxxxxxxx";
const NOW = new Date("2026-10-13T12:00:00.000Z");
const OLD = "2026-10-01T12:00:00.000Z"; // 12 dias antes de NOW
const YOUNG = "2026-10-12T12:00:00.000Z"; // 1 dia antes de NOW
const PUBLIC = "https://projeto.supabase.co/storage/v1/object/public";

interface RemoveCall {
  bucket: string;
  paths: string[];
}

interface ClientCtx {
  removes: RemoveCall[];
  likes: Array<[string, string, string]>;
  adminRpc: Array<string>;
  /** chamadas de storage.list (contadas para a borda de paginação) */
  listCalls: number;
  /** ranges de PostgREST pedidos, na ordem */
  ranges: Array<[number, number]>;
}

interface ClientOpts {
  /** entradas de list() por `${bucket}|${prefix}` (pastas têm id null) */
  entries?: Record<string, StorageListEntry[]>;
  /** linhas de referência por tabela -> coluna -> valores */
  refs?: Record<string, Record<string, string[]>>;
  /** erro de list() por bucket */
  listErrors?: Record<string, { message: string }>;
  /** erro de select() por tabela */
  selectErrors?: Record<string, { message: string }>;
  removeError?: { message: string };
  /** usuário resolvido por auth.getUser (null = token inválido) */
  user?: { id: string } | null;
  getUserError?: boolean;
  /** ids de usuário que is_admin aprova */
  adminIds?: string[];
}

function matchesLike(value: string, pattern: string): boolean {
  // Traduz o LIKE do PostgREST (`%x%`) para "contém, em ordem".
  const chunks = pattern.split("%").filter((c) => c !== "");
  let cursor = 0;
  for (const chunk of chunks) {
    const at = value.indexOf(chunk, cursor);
    if (at < 0) return false;
    cursor = at + chunk.length;
  }
  return true;
}

function makeClient(o: ClientOpts): { client: SupabaseLike; ctx: ClientCtx } {
  const ctx: ClientCtx = { removes: [], likes: [], adminRpc: [], listCalls: 0, ranges: [] };

  function from(table: string): unknown {
    let cols = "";
    let likePattern = "";
    let offset = 0;
    let limit = Number.POSITIVE_INFINITY;

    const resolve = () => {
      if (o.selectErrors?.[table]) return { data: null, error: o.selectErrors[table] };
      const column = cols.split(",")[1] ?? "";
      const values = (o.refs?.[table]?.[column] ?? []).filter((value) =>
        likePattern === "" ? true : matchesLike(value, likePattern),
      );
      const rows = values.map((value, i) => ({ id: `${table}-${column}-${i}`, [column]: value }));
      return { data: rows.slice(offset, offset + limit), error: null };
    };

    const builder: Record<string, unknown> = {
      select: (c: string) => {
        cols = c;
        return builder;
      },
      like: (col: string, pattern: string) => {
        likePattern = pattern;
        ctx.likes.push([table, col, pattern]);
        return builder;
      },
      order: () => builder,
      range: (from: number, to: number) => {
        offset = from;
        limit = to - from + 1;
        ctx.ranges.push([from, to]);
        return builder;
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(resolve()).then(res, rej),
      catch: (rej: (e: unknown) => unknown) => Promise.resolve(resolve()).catch(rej),
    };
    return builder;
  }

  const client = {
    from,
    rpc: (name: string, args?: Record<string, unknown>) => {
      if (name === "is_admin") {
        const id = String(args?._user_id ?? "");
        ctx.adminRpc.push(id);
        return Promise.resolve({ data: (o.adminIds ?? []).includes(id), error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    auth: {
      getUser: (_token: string) =>
        Promise.resolve(
          o.getUserError || o.user === null
            ? { data: { user: null }, error: o.getUserError ? { message: "invalid" } : null }
            : { data: { user: o.user }, error: null },
        ),
    },
    storage: {
      from: (bucket: string) => ({
        list: (prefix: string, opts?: { limit?: number; offset?: number }) => {
          ctx.listCalls += 1;
          if (o.listErrors?.[bucket]) return Promise.resolve({ data: null, error: o.listErrors[bucket] });
          const all = o.entries?.[`${bucket}|${prefix}`] ?? [];
          const start = opts?.offset ?? 0;
          const take = opts?.limit ?? all.length;
          return Promise.resolve({ data: all.slice(start, start + take), error: null });
        },
        remove: (paths: string[]) => {
          ctx.removes.push({ bucket, paths });
          if (o.removeError) return Promise.resolve({ data: null, error: o.removeError });
          return Promise.resolve({ data: paths.map((name) => ({ name })), error: null });
        },
      }),
    },
  } as unknown as SupabaseLike;

  return { client, ctx };
}

function makeRequest(opts: { cronSecret?: string; bearer?: string; body?: string } = {}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.cronSecret !== undefined) headers["x-cron-secret"] = opts.cronSecret;
  if (opts.bearer !== undefined) headers["Authorization"] = `Bearer ${opts.bearer}`;
  const body = opts.body ?? "";
  const init: RequestInit = { method: "POST", headers };
  if (body !== "") init.body = body;
  return new Request("https://edge.test/cleanup-storage-orphans", init);
}

function makeDeps(o: { client: SupabaseLike; maxDeletePerRun?: number }) {
  return {
    supabase: o.client,
    serviceKey: TEST_SERVICE_KEY,
    cronSecret: TEST_CRON_SECRET,
    env: () => undefined,
    now: NOW,
    maxDeletePerRun: o.maxDeletePerRun,
  };
}

const authed = () => makeRequest({ cronSecret: TEST_CRON_SECRET });

/** Bucket whatsapp-media com a pasta real `<contato>/image/`. */
function entriesWhatsapp(orphan = true, young = false) {
  return {
    "whatsapp-media|": [{ name: "contato-1", id: null, created_at: null }],
    "whatsapp-media|contato-1": [{ name: "image", id: null, created_at: null }],
    "whatsapp-media|contato-1/image": [
      ...(orphan ? [{ name: "orfa.jpg", id: "f-orfa", created_at: OLD }] : []),
      { name: "fixa.jpg", id: "f-fixa", created_at: OLD },
      ...(young ? [{ name: "nova.jpg", id: "f-nova", created_at: YOUNG }] : []),
    ],
  };
}

const refFixa = {
  messages: { media_url: [`${PUBLIC}/whatsapp-media/contato-1/image/fixa.jpg`] },
};

// --------------------------------------------------------------------------- parser

Deno.test("parser: extrai o caminho do bucket, ignora query e rejeita bucket alheio", () => {
  assert(extractObjectPath(`${PUBLIC}/whatsapp-media/a/b.jpg?v=123`, "whatsapp-media") === "a/b.jpg", "query não ignorada");
  assert(extractObjectPath(`${PUBLIC}/whatsapp-media/a/x%20y.jpg`, "whatsapp-media") === "a/x y.jpg", "encode não decodificado");
  assert(extractObjectPath(`${PUBLIC}/audio-messages/a.ogg`, "whatsapp-media") === null, "bucket alheio aceito");
  assert(extractObjectPath(`${PUBLIC}/whatsapp-media/../b.jpg`, "whatsapp-media") === null, "path inseguro aceito");
});

// --------------------------------------------------------------------------- auth

Deno.test("auth: sem x-cron-secret e sem Authorization → 401", async () => {
  const { client } = makeClient({});
  const res = await handleCleanupStorageOrphans(makeRequest(), makeDeps({ client }));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: x-cron-secret errado → 401", async () => {
  const { client } = makeClient({});
  const res = await handleCleanupStorageOrphans(
    makeRequest({ cronSecret: "segredo-errado" }),
    makeDeps({ client }),
  );
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
});

Deno.test("auth: usuário autenticado que não é admin → 403", async () => {
  const { client } = makeClient({ user: { id: "u-1" }, adminIds: [] });
  const res = await handleCleanupStorageOrphans(
    makeRequest({ bearer: "jwt-de-usuario-comum" }),
    makeDeps({ client }),
  );
  assert(res.status === 403, `esperado 403, recebido ${res.status}`);
});

// --------------------------------------------------------------------------- drenagem

Deno.test("cron: órfão antigo é apagado; referenciado e jovem ficam", async () => {
  const { client, ctx } = makeClient({
    entries: entriesWhatsapp(true, true),
    refs: refFixa,
  });
  const res = await handleCleanupStorageOrphans(authed(), makeDeps({ client }));
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();

  assert(ctx.removes.length === 1, `esperado 1 remove, recebido ${JSON.stringify(ctx.removes)}`);
  assert(ctx.removes[0].bucket === "whatsapp-media", `bucket errado: ${ctx.removes[0].bucket}`);
  assert(
    ctx.removes[0].paths.join(",") === "contato-1/image/orfa.jpg",
    `caminho removido errado: ${ctx.removes[0].paths.join(",")}`,
  );

  assert(body.dryRun === false, `dryRun deveria ser false no cron: ${JSON.stringify(body)}`);
  assert(body.deletedTotal === 1, `deletedTotal errado: ${JSON.stringify(body)}`);
  const wm = body.buckets["whatsapp-media"];
  assert(wm.scanned === 3, `scanned errado: ${JSON.stringify(wm)}`);
  assert(wm.candidates === 1, `candidates errado (jovem/referenciado contados): ${JSON.stringify(wm)}`);
  assert(wm.deleted === 1, `deleted errado: ${JSON.stringify(wm)}`);
  assert(body.buckets["audio-messages"].deleted === 0, "audio-messages não deveria apagar nada");

  // A resposta não pode vazar nome de arquivo.
  const texto = JSON.stringify(body);
  assert(!texto.includes("orfa.jpg") && !texto.includes("fixa.jpg"), `resposta vazou nome de arquivo: ${texto}`);
});

Deno.test("cron: dryRun=true só conta, nunca chama remove", async () => {
  const { client, ctx } = makeClient({ entries: entriesWhatsapp(true, false), refs: refFixa });
  const res = await handleCleanupStorageOrphans(
    makeRequest({ cronSecret: TEST_CRON_SECRET, body: JSON.stringify({ dryRun: true }) }),
    makeDeps({ client }),
  );
  const body = await res.json();
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(ctx.removes.length === 0, `dryRun chamou remove: ${JSON.stringify(ctx.removes)}`);
  assert(body.dryRun === true, `dryRun deveria ser true: ${JSON.stringify(body)}`);
  assert(body.deletedTotal === 0, `deletedTotal deveria ser 0: ${JSON.stringify(body)}`);
  assert(body.buckets["whatsapp-media"].candidates === 1, `candidates errado: ${JSON.stringify(body.buckets)}`);
});

Deno.test("admin: JWT admin sem dryRun no corpo → preview (não apaga por engano)", async () => {
  const { client, ctx } = makeClient({
    entries: entriesWhatsapp(true, false),
    refs: refFixa,
    user: { id: "admin-1" },
    adminIds: ["admin-1"],
  });
  const res = await handleCleanupStorageOrphans(
    makeRequest({ bearer: "jwt-do-admin" }),
    makeDeps({ client }),
  );
  const body = await res.json();
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(ctx.removes.length === 0, "admin sem dryRun apagou — deveria ser preview");
  assert(body.dryRun === true, `dryRun deveria ser true no preview: ${JSON.stringify(body)}`);
  assert(ctx.adminRpc.join(",") === "admin-1", `is_admin não foi consultado: ${JSON.stringify(ctx.adminRpc)}`);
});

Deno.test("admin: {dryRun:false} aplica de verdade", async () => {
  const { client, ctx } = makeClient({
    entries: entriesWhatsapp(true, false),
    refs: refFixa,
    user: { id: "admin-1" },
    adminIds: ["admin-1"],
  });
  const res = await handleCleanupStorageOrphans(
    makeRequest({ bearer: "jwt-do-admin", body: JSON.stringify({ dryRun: false }) }),
    makeDeps({ client }),
  );
  const body = await res.json();
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(body.dryRun === false, `dryRun errado: ${JSON.stringify(body)}`);
  assert(ctx.removes.length === 1 && ctx.removes[0].paths[0] === "contato-1/image/orfa.jpg", `remove errado: ${JSON.stringify(ctx.removes)}`);
});

// --------------------------------------------------------------------------- fail-closed / teto

Deno.test("fail-closed: erro ao ler referencia → bucket não apaga nada", async () => {
  const { client, ctx } = makeClient({
    entries: entriesWhatsapp(true, false),
    selectErrors: { messages: { message: "boom no select" } },
  });
  const res = await handleCleanupStorageOrphans(authed(), makeDeps({ client }));
  const body = await res.json();
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(ctx.removes.length === 0, "apagou sem conseguir ler a referência (fail-open)");
  assert(body.deletedTotal === 0, `deletedTotal errado: ${JSON.stringify(body)}`);
  assert(
    (body.errors ?? []).includes("whatsapp-media:reference-read-failed"),
    `erro não reportado: ${JSON.stringify(body)}`,
  );
});

Deno.test("fail-closed: linha que casa o LIKE mas tem URL ilegível → bucket não apaga", async () => {
  const { client, ctx } = makeClient({
    entries: entriesWhatsapp(true, false),
    // URL dentro do bucket, mas com segmento `..` no caminho: o parser recusa, e o
    // bucket inteiro tem de ser pulado em vez de arriscar apagar algo referenciado.
    refs: { messages: { media_url: [`${PUBLIC}/whatsapp-media/contato-1/../image/estranha.jpg`] } },
  });
  const res = await handleCleanupStorageOrphans(authed(), makeDeps({ client }));
  const body = await res.json();
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(ctx.removes.length === 0, "apagou com referência ilegível (fail-open)");
  assert(
    (body.errors ?? []).includes("whatsapp-media:reference-read-failed"),
    `erro não reportado: ${JSON.stringify(body)}`,
  );
});

Deno.test("fail-closed: erro de list → bucket não apaga nada", async () => {
  const { client, ctx } = makeClient({ listErrors: { "whatsapp-media": { message: "boom no list" } } });
  const res = await handleCleanupStorageOrphans(authed(), makeDeps({ client }));
  const body = await res.json();
  assert(ctx.removes.length === 0, "apagou com list quebrado");
  assert((body.errors ?? []).includes("whatsapp-media:list-failed"), `erro não reportado: ${JSON.stringify(body)}`);
});

Deno.test("teto: maxDeletePerRun corta o lote e o resto fica para a próxima", async () => {
  const entries = {
    "whatsapp-media|": [
      { name: "a.jpg", id: "a", created_at: OLD },
      { name: "b.jpg", id: "b", created_at: OLD },
      { name: "c.jpg", id: "c", created_at: OLD },
    ],
  };
  const { client, ctx } = makeClient({ entries });
  const res = await handleCleanupStorageOrphans(authed(), makeDeps({ client, maxDeletePerRun: 2 }));
  const body = await res.json();
  assert(ctx.removes.length === 1 && ctx.removes[0].paths.length === 2, `teto ignorado: ${JSON.stringify(ctx.removes)}`);
  assert(body.deletedTotal === 2, `deletedTotal errado: ${JSON.stringify(body)}`);
  assert(body.buckets["whatsapp-media"].candidates === 3, `candidates errado: ${JSON.stringify(body.buckets)}`);
});

Deno.test("borda de paginação: prefixo com total IGUAL à página (1000) não perde nem repete objeto", async () => {
  // Total múltiplo exato do tamanho da página é o caso que já reprovou a área: o laço
  // tem de pedir a página seguinte (vazia) e parar, sem 416 e sem duplicar.
  const exatos: StorageListEntry[] = Array.from({ length: 1000 }, (_, i) => ({
    name: `p${String(i).padStart(4, "0")}.jpg`,
    id: `id-${i}`,
    created_at: OLD,
  }));
  const { client, ctx } = makeClient({ entries: { "whatsapp-media|": exatos } });
  const listado = await listBucketObjects(client, "whatsapp-media");
  assert(listado.failed === false, "list falhou no múltiplo exato");
  assert(listado.objects.length === 1000, `perdeu/duplicou objeto: ${listado.objects.length}`);
  assert(listado.truncated === false, "truncou sem necessidade");
  assert(ctx.listCalls === 2, `esperava 2 chamadas de list (1000 + vazia), veio ${ctx.listCalls}`);
});

Deno.test("borda de paginação: referências com total IGUAL à página (1000) somam as duas páginas", async () => {
  const valores = Array.from(
    { length: 1000 },
    (_, i) => `${PUBLIC}/whatsapp-media/contato-1/image/r${i}.jpg`,
  );
  const { client, ctx } = makeClient({ refs: { messages: { media_url: valores } } });
  const ref = await collectReferencedPaths(client, "whatsapp-media", {
    sources: [{ table: "messages", column: "media_url" }],
  });
  assert(ref.failed === false, "leitura das referências falhou");
  assert(ref.paths.size === 1000, `esperava 1000 caminhos, veio ${ref.paths.size}`);
  assert(ctx.ranges.length === 2, `esperava 2 ranges (1000 + vazia), veio ${ctx.ranges.length}`);
});
