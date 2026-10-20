/**
 * QA5-05 — contrato executável do talkx-storage-purge.
 *
 * Trava o que o cartão promete:
 *   1. sem credencial → 401; com x-cron-secret do Vault (ou service key) → passa;
 *   2. 3 linhas na fila → 3 chamadas de storage.remove (uma por objeto) e as 3
 *      linhas saem da fila com processed_at preenchido;
 *   3. linha cujo remove falha FICA na fila: processed_at intocado, attempts+1 e
 *      last_error — e não impede as demais (try/catch por linha);
 *   4. objeto já ausente ("not found" do Storage) conta como removido;
 *   5. fila vazia → nenhum remove, nenhum update, resposta ok;
 *   6. a fila é lida no teto batchSize (a linha excedente fica para a próxima passada).
 *
 * Roda sem rede, sem banco e sem env: tudo entra por `_injected`.
 * Comando do CI: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/talkx-storage-purge/index.test.ts
 */
import { handleTalkxStoragePurge, PURGE_BATCH_SIZE } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const TEST_SERVICE_KEY = "service-role-key-fake-para-teste-de-auth";
const TEST_CRON_SECRET = "cron-secret-talkx-test-64chars-for-timing-safe-comparison-xxxxxx";
const NOW = new Date("2026-10-05T12:00:00.000Z");

interface QueueRow { [key: string]: unknown }

interface RemoveCall { bucket: string; paths: string[] }
interface UpdateCall { id: unknown; payload: Record<string, unknown> }

interface ClientOpts {
  rows?: QueueRow[];
  /** erro do remove por object_name (o que não estiver aqui é removido com sucesso) */
  removeErrors?: Record<string, { message: string; status?: number; statusCode?: number | string }>;
  /** erro na leitura da fila */
  selectError?: { message: string };
}

interface ClientCtx {
  removes: RemoveCall[];
  updates: UpdateCall[];
  selectLimit: number | null;
  isArgs: Array<[string, unknown]>;
}

/**
 * Client falso mínimo: `from('talkx_storage_purge_queue')` devolve as linhas da
 * fila pela cadeia select→is→order→limit (fiel ao thenable do PostgREST, com o
 * limit fatiando de verdade) e grava cada update().eq(); `storage.from(b).remove`
 * espia bucket+caminhos e falha só nos objetos listados em removeErrors.
 */
function makeClient(opts: ClientOpts): { client: unknown; ctx: ClientCtx } {
  const ctx: ClientCtx = { removes: [], updates: [], selectLimit: null, isArgs: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function from(table: string): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: Record<string, any> = {};
    if (table !== "talkx_storage_purge_queue") {
      b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res);
      return b;
    }
    const resolveRows = () => {
      if (opts.selectError) return { data: null, error: opts.selectError };
      const rows = (opts.rows ?? []).filter((r) => r.processed_at === null);
      const limit = ctx.selectLimit ?? rows.length;
      return { data: rows.slice(0, limit), error: null };
    };
    b.select = () => b;
    b.order = () => b;
    b.is = (col: string, val: unknown) => {
      ctx.isArgs.push([col, val]);
      return b;
    };
    b.limit = (n: number) => {
      ctx.selectLimit = n;
      return b;
    };
    b.update = (payload: Record<string, unknown>) => ({
      eq: (_col: string, val: unknown) => {
        ctx.updates.push({ id: val, payload });
        return Promise.resolve({ data: null, error: null });
      },
    });
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(resolveRows()).then(res, rej);
    b.catch = (rej: (e: unknown) => unknown) => Promise.resolve(resolveRows()).catch(rej);
    return b;
  }
  const client = {
    from,
    rpc: () => Promise.resolve({ data: null, error: null }),
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          ctx.removes.push({ bucket, paths });
          const error = opts.removeErrors?.[paths[0]] ?? null;
          return Promise.resolve({
            data: error ? null : paths.map((name) => ({ name })),
            error,
          });
        },
      }),
    },
  };
  return { client, ctx };
}

function makeRequest(opts: { cronSecret?: string; bearer?: string } = {}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.cronSecret !== undefined) headers["x-cron-secret"] = opts.cronSecret;
  if (opts.bearer !== undefined) headers["Authorization"] = `Bearer ${opts.bearer}`;
  return new Request("https://edge.test/talkx-storage-purge", { method: "POST", headers, body: "{}" });
}

function makeDeps(o: {
  client: unknown;
  cronSecretValue?: string | null;
  batchSize?: number;
}): {
  supabase: unknown;
  serviceKey: string;
  env: (key: string) => string | undefined;
  now: Date;
  getCronSecret: () => Promise<string | null>;
  batchSize?: number;
} {
  return {
    supabase: o.client,
    serviceKey: TEST_SERVICE_KEY,
    env: (key: string) => (key === "SUPABASE_URL" ? "https://supabase-test.example" : undefined),
    now: NOW,
    getCronSecret: () => Promise.resolve(o.cronSecretValue ?? null),
    batchSize: o.batchSize,
  };
}

let rowSeq = 0;
function queueRow(objectName: string, overrides: QueueRow = {}): QueueRow {
  rowSeq += 1;
  return {
    id: `row-${String(rowSeq).padStart(3, "0")}`,
    bucket_id: "talkx-media",
    object_name: objectName,
    attempts: 0,
    enqueued_at: "2026-10-05T00:00:00.000Z",
    processed_at: null,
    ...overrides,
  };
}

const authed = () => makeRequest({ cronSecret: TEST_CRON_SECRET });

// --------------------------------------------------------------------------- auth

Deno.test("QA5-05 auth: sem x-cron-secret e sem Authorization → 401", async () => {
  const { client } = makeClient({});
  const res = await handleTalkxStoragePurge(makeRequest(), makeDeps({ client, cronSecretValue: TEST_CRON_SECRET }));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("QA5-05 auth: x-cron-secret errado → 401", async () => {
  const { client } = makeClient({});
  const res = await handleTalkxStoragePurge(
    makeRequest({ cronSecret: "segredo-errado" }),
    makeDeps({ client, cronSecretValue: TEST_CRON_SECRET }),
  );
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
});

Deno.test("QA5-05 auth: Authorization Bearer com a service key → passa (não é 401)", async () => {
  const { client, ctx } = makeClient({ rows: [queueRow("a.bin")] });
  const res = await handleTalkxStoragePurge(
    makeRequest({ bearer: TEST_SERVICE_KEY }),
    makeDeps({ client, cronSecretValue: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(ctx.removes.length === 1, `esperado 1 remove, recebido ${ctx.removes.length}`);
});

// --------------------------------------------------------------------------- drenagem

Deno.test("QA5-05 drena: 3 linhas → 3 removes na Storage API e 3 processed_at", async () => {
  const rows = [queueRow("m1.bin"), queueRow("m2.bin"), queueRow("m3.bin")];
  const { client, ctx } = makeClient({ rows });
  const res = await handleTalkxStoragePurge(authed(), makeDeps({ client, cronSecretValue: TEST_CRON_SECRET }));
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();

  assert(ctx.removes.length === 3, `esperado 3 removes, recebido ${ctx.removes.length}`);
  const removed = ctx.removes.map((r) => `${r.bucket}/${r.paths[0]}`).sort().join(",");
  assert(
    removed === "talkx-media/m1.bin,talkx-media/m2.bin,talkx-media/m3.bin",
    `remove por (bucket, object_name) errado: ${removed}`,
  );

  assert(ctx.updates.length === 3, `esperado 3 updates, recebido ${ctx.updates.length}`);
  for (const u of ctx.updates) {
    assert(u.payload.processed_at === NOW.toISOString(), `processed_at errado: ${JSON.stringify(u.payload)}`);
    assert(u.payload.attempts === 1, `attempts errado: ${JSON.stringify(u.payload)}`);
    assert(u.payload.last_error === null, `last_error errado: ${JSON.stringify(u.payload)}`);
  }
  const marked = ctx.updates.map((u) => String(u.id)).sort().join(",");
  const expected = rows.map((r) => String(r.id)).sort().join(",");
  assert(marked === expected, `linhas marcadas erradas: ${marked} (esperado ${expected})`);

  assert(body.success === true, `body inesperado: ${JSON.stringify(body)}`);
  assert(body.processed === 3 && body.failed === 0 && body.batch === 3, `resumo errado: ${JSON.stringify(body)}`);
});

Deno.test("QA5-05 falha: linha com erro FICA na fila (attempts+1, last_error) e não impede as demais", async () => {
  const rows = [queueRow("ok1.bin"), queueRow("boom.bin"), queueRow("ok2.bin")];
  const { client, ctx } = makeClient({
    rows,
    removeErrors: { "boom.bin": { message: "Storage exploded" } },
  });
  const res = await handleTalkxStoragePurge(authed(), makeDeps({ client, cronSecretValue: TEST_CRON_SECRET }));
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();

  // O remove foi tentado nas 3: uma linha ruim não pode impedir as outras.
  assert(ctx.removes.length === 3, `esperado 3 removes, recebido ${ctx.removes.length}`);
  assert(ctx.updates.length === 3, `esperado 3 updates, recebido ${ctx.updates.length}`);

  const failId = rows[1].id;
  const failUpdate = ctx.updates.find((u) => u.id === failId);
  assert(failUpdate, "update da linha com erro ausente");
  assert(
    !("processed_at" in failUpdate.payload),
    `processed_at não pode ser tocado na linha com erro: ${JSON.stringify(failUpdate.payload)}`,
  );
  assert(failUpdate.payload.attempts === 1, `attempts errado: ${JSON.stringify(failUpdate.payload)}`);
  assert(
    typeof failUpdate.payload.last_error === "string" && failUpdate.payload.last_error.includes("Storage exploded"),
    `last_error errado: ${JSON.stringify(failUpdate.payload)}`,
  );

  for (const u of ctx.updates.filter((u) => u.id !== failId)) {
    assert(u.payload.processed_at === NOW.toISOString(), `linha ok tinha de sair da fila: ${JSON.stringify(u.payload)}`);
  }
  assert(body.processed === 2 && body.failed === 1 && body.batch === 3, `resumo errado: ${JSON.stringify(body)}`);
});

Deno.test("QA5-05 not-found: objeto já ausente no bucket conta como removido", async () => {
  const rows = [queueRow("ghost.bin")];
  const { client, ctx } = makeClient({
    rows,
    removeErrors: { "ghost.bin": { message: "Object not found", statusCode: 404 } },
  });
  const res = await handleTalkxStoragePurge(authed(), makeDeps({ client, cronSecretValue: TEST_CRON_SECRET }));
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();

  assert(ctx.removes.length === 1, `esperado 1 remove, recebido ${ctx.removes.length}`);
  assert(ctx.updates.length === 1, `esperado 1 update, recebido ${ctx.updates.length}`);
  assert(
    ctx.updates[0].payload.processed_at === NOW.toISOString(),
    `not-found tinha de sair da fila: ${JSON.stringify(ctx.updates[0].payload)}`,
  );
  assert(body.processed === 1 && body.failed === 0, `resumo errado: ${JSON.stringify(body)}`);
});

Deno.test("QA5-05 vazia: fila sem pendentes → nenhum remove, nenhum update, resposta ok", async () => {
  const { client, ctx } = makeClient({ rows: [] });
  const res = await handleTalkxStoragePurge(authed(), makeDeps({ client, cronSecretValue: TEST_CRON_SECRET }));
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();

  assert(ctx.removes.length === 0, `não pode haver remove: ${ctx.removes.length}`);
  assert(ctx.updates.length === 0, `não pode haver update: ${ctx.updates.length}`);
  assert(body.processed === 0 && body.failed === 0 && body.batch === 0, `resumo errado: ${JSON.stringify(body)}`);
});

Deno.test("QA5-05 lote: a seleção respeita o teto batchSize (o excedente fica para a próxima passada)", async () => {
  const rows = [queueRow("b1.bin"), queueRow("b2.bin"), queueRow("b3.bin")];
  const { client, ctx } = makeClient({ rows });
  const res = await handleTalkxStoragePurge(
    authed(),
    makeDeps({ client, cronSecretValue: TEST_CRON_SECRET, batchSize: 2 }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();

  assert(ctx.selectLimit === 2, `o select tinha de pedir limit 2, pediu ${ctx.selectLimit}`);
  assert(ctx.removes.length === 2, `esperado 2 removes, recebido ${ctx.removes.length}`);
  assert(ctx.updates.length === 2, `esperado 2 updates, recebido ${ctx.updates.length}`);
  assert(body.batch === 2, `resumo errado: ${JSON.stringify(body)}`);
});

Deno.test("QA5-05 leitura: erro ao ler a fila vira 200 com o resumo (best-effort, nunca lança)", async () => {
  const { client, ctx } = makeClient({ selectError: { message: "connection reset" } });
  const res = await handleTalkxStoragePurge(authed(), makeDeps({ client, cronSecretValue: TEST_CRON_SECRET }));
  assert(res.status === 200, `esperado 200 mesmo com a fila ilegível, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "connection reset", `erro tinha de vir no resumo: ${JSON.stringify(body)}`);
  assert(ctx.removes.length === 0 && ctx.updates.length === 0, "fila ilegível não pode drenar nada");
});

Deno.test("QA5-05 filtro: a seleção pede só pendentes (processed_at IS NULL) e o teto de produção é 200", async () => {
  const { client, ctx } = makeClient({ rows: [] });
  await handleTalkxStoragePurge(authed(), makeDeps({ client, cronSecretValue: TEST_CRON_SECRET }));
  assert(
    ctx.isArgs.some(([col, val]) => col === "processed_at" && val === null),
    `faltou .is('processed_at', null): ${JSON.stringify(ctx.isArgs)}`,
  );
  assert(ctx.selectLimit === PURGE_BATCH_SIZE, `teto padrão tinha de ser ${PURGE_BATCH_SIZE}, foi ${ctx.selectLimit}`);
  assert(PURGE_BATCH_SIZE === 200, `lote de produção deveria ser 200, é ${PURGE_BATCH_SIZE}`);
});
