import { handleBatchFetchAvatars } from "./index.ts";

// ---------------------------------------------------------------------------
// Migracao dos avatares legados (caminho fixo por telefone `avatars/<ddd>.jpg`).
// O cron horario (job avatars-refresh -> esta edge) reprocessa TODO contato com
// URL no caminho legado (mesmo dentro do backoff de 7d), re-hospeda os bytes no
// caminho imprevisivel `contacts/<id>/<token>.jpg` e remove o objeto antigo —
// assim a URL publica antiga (derivavel pelo telefone) deixa de funcionar.
// Tudo com mock em `_injected`: sem rede, sem banco, sem segredo real.
// ---------------------------------------------------------------------------

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.env.set("SUPABASE_URL", "https://projeto.supabase.co");
Deno.env.set("EVOLUTION_API_URL", "https://evolution.test");
Deno.env.set("EVOLUTION_API_KEY", "test-evolution-key");

const CRON_SECRET = "TEST_CRON_SECRET_avatars_refresh_fixture_nao_real_0000000000";
const SERVICE_KEY = "eyJtest.servicekey.forauth";
const LEGACY_URL = "https://projeto.supabase.co/storage/v1/object/public/avatars/avatars/5511999998888.jpg";

let ipSeq = 0;
const nextIp = () => `10.9.0.${++ipSeq}`;

function makeRequest(): Request {
  return new Request("https://edge.test/batch-fetch-avatars", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": CRON_SECRET,
      "x-forwarded-for": nextIp(),
    },
    body: "{}",
  });
}

// Builder "thenable" no molde do cron-secret-authz-l5.test.ts: a cadeia devolve o
// proprio builder e `await` resolve pelo conteudo mockado, como o PostgREST faria.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function builder(rows: unknown[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: Record<string, any> = {};
  const chain = () => b;
  b.select = chain; b.eq = chain; b.neq = chain; b.or = chain; b.is = chain;
  b.in = chain; b.not = chain; b.update = chain; b.insert = chain;
  b.delete = chain; b.lt = chain; b.order = chain; b.limit = chain;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.single = () => Promise.resolve({ data: rows[0] ?? null, error: null } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.then = (ok: any, no: any) => Promise.resolve({ data: rows, error: null }).then(ok, no);
  return b;
}

Deno.test("batch re-hospeda o avatar legado e remove o arquivo antigo por telefone", async () => {
  const uploads: string[] = [];
  const removals: string[][] = [];

  const legacyRow = {
    id: "contato-1",
    phone: "5511999998888",
    name: "Fulano",
    avatar_url: LEGACY_URL,
    // Dentro do backoff de 7d: mesmo assim o legado TEM de entrar na selecao.
    avatar_fetch_attempted_at: new Date().toISOString(),
    whatsapp_connection_id: "conn-1",
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deps: any = {
    serviceKey: SERVICE_KEY,
    supabase: {
      rpc: (name: string) =>
        Promise.resolve({
          data: name === "get_avatars_refresh_cron_secret" ? CRON_SECRET : null,
          error: null,
        }),
      auth: {
        getUser: () => Promise.resolve({ data: { user: null }, error: new Error("no user") }),
      },
      from: (table: string) => (table === "contacts" ? builder([legacyRow]) : builder([])),
      storage: {
        from: (_bucket: string) => ({
          upload: (path: string, _bytes: unknown, _opts: unknown) => {
            uploads.push(path);
            return Promise.resolve({ error: null });
          },
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://projeto.supabase.co/storage/v1/object/public/avatars/${path}` },
          }),
          remove: (paths: string[]) => {
            removals.push(paths);
            return Promise.resolve({ data: null, error: null });
          },
        }),
      },
    },
  };

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(new Uint8Array(1024), { status: 200 }));
  try {
    const res = await handleBatchFetchAvatars(makeRequest(), deps);
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.updated === 1, `esperado updated=1, recebido ${JSON.stringify(body)}`);

    assert(uploads.length === 1, `esperado 1 upload, recebido ${uploads.length}`);
    assert(
      /^contacts\/contato-1\/[0-9a-f]{32}\.jpg$/.test(uploads[0]),
      `caminho inesperado: ${uploads[0]}`,
    );
    // O objeto do caminho legado (derivavel pelo telefone) saiu do bucket.
    assert(
      JSON.stringify(removals) === JSON.stringify([["avatars/5511999998888.jpg"]]),
      `remocoes inesperadas: ${JSON.stringify(removals)}`,
    );
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

// ---------------------------------------------------------------------------
// Refazer 1 (recusa de 13/10): idempotencia da migracao + ramo de falha do legado.
//
// - Idempotencia: depois de migrado o contato fica com URL canonica
//   (`.../avatars/contacts/<id>/<token>.jpg`, caminho imprevisivel). A segunda
//   rodada do cron NAO pode re-hospeda-lo nem remover nada: a URL canonica nao
//   e tratada como legado (o `.or(...)` da selecao so casa `avatars/avatars/`)
//   e o contato segue pelo caminho normal da Evolution.
// - Falha do legado: se o re-hospede falha (persistProfilePicture devolve null
//   — ex. o arquivo antigo sumiu do bucket e o download volta 404), o contato
//   conta `failed++`, a URL antiga CONTINUA gravada (nenhum update toca
//   `avatar_url`, so o backoff `avatar_fetch_attempted_at`) e NADA e removido
//   do bucket (fail-closed: nunca apaga sem substituto).
// ---------------------------------------------------------------------------

const CANONICAL_URL =
  "https://projeto.supabase.co/storage/v1/object/public/avatars/contacts/contato-1/abcdef0123456789abcdef0123456789.jpg";

// Builder "thenable" como o `builder` acima, mas GRAVANDO: captura os args de
// cada `.or(...)` (para provar que a selecao so casa o legado) e os payloads
// de cada `.update(...)` (para provar que a falha nao reescreve `avatar_url`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function recordingBuilder(rows: unknown[], rec: { orArgs: string[]; updates: unknown[] }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: Record<string, any> = {};
  const chain = () => b;
  b.select = chain; b.eq = chain; b.neq = chain; b.is = chain;
  b.in = chain; b.not = chain; b.insert = chain; b.delete = chain;
  b.lt = chain; b.order = chain; b.limit = chain;
  b.or = (...args: unknown[]) => {
    rec.orArgs.push(args.map(String).join(","));
    return b;
  };
  b.update = (payload: unknown) => {
    rec.updates.push(payload);
    return b;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.single = () => Promise.resolve({ data: rows[0] ?? null, error: null } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.then = (ok: any, no: any) => Promise.resolve({ data: rows, error: null }).then(ok, no);
  return b;
}

function legacyRow() {
  return {
    id: "contato-1",
    phone: "5511999998888",
    name: "Fulano",
    avatar_url: LEGACY_URL,
    avatar_fetch_attempted_at: new Date().toISOString(),
    whatsapp_connection_id: "conn-1",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function recordingDeps(contactsRows: () => unknown[], rec: { orArgs: string[]; updates: unknown[] }): any {
  const uploads: string[] = [];
  const removals: string[][] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deps: any = {
    serviceKey: SERVICE_KEY,
    supabase: {
      rpc: (name: string) =>
        Promise.resolve({
          data: name === "get_avatars_refresh_cron_secret" ? CRON_SECRET : null,
          error: null,
        }),
      auth: {
        getUser: () => Promise.resolve({ data: { user: null }, error: new Error("no user") }),
      },
      from: (table: string) => {
        if (table === "contacts") return recordingBuilder(contactsRows(), rec);
        if (table === "whatsapp_connections") {
          return recordingBuilder([{ id: "conn-1", instance_id: "inst-1" }], rec);
        }
        return recordingBuilder([], rec);
      },
      storage: {
        from: (_bucket: string) => ({
          upload: (path: string, _bytes: unknown, _opts: unknown) => {
            uploads.push(path);
            return Promise.resolve({ error: null });
          },
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://projeto.supabase.co/storage/v1/object/public/avatars/${path}` },
          }),
          remove: (paths: string[]) => {
            removals.push(paths);
            return Promise.resolve({ data: null, error: null });
          },
        }),
      },
    },
  };
  return { deps, uploads, removals };
}

Deno.test("migracao e idempotente: segunda rodada com URL canonica nao re-hospeda nem remove", async () => {
  const rec = { orArgs: [] as string[], updates: [] as unknown[] };
  // O banco "evolui" entre as rodadas: na 1a o contato ainda e legado, na 2a
  // ja tem a URL canonica gravada pela rodada anterior.
  let round = 0;
  const canonical = { ...legacyRow(), avatar_url: CANONICAL_URL };
  const { deps, uploads, removals } = recordingDeps(() => [round === 0 ? legacyRow() : canonical], rec);

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (input: unknown, _init?: unknown) => {
    const url = String(input);
    // Roteado pela URL: o re-hospede baixa o proprio arquivo do bucket (bytes
    // reais); a Evolution nao tem foto do contato canonico -> 404.
    if (url.includes("evolution.test")) return Promise.resolve(new Response(null, { status: 404 }));
    return Promise.resolve(new Response(new Uint8Array(1024), { status: 200 }));
  };
  try {
    // Rodada 1: o legado migra (upload canonico + remocao do antigo).
    round = 0;
    const res1 = await handleBatchFetchAvatars(makeRequest(), deps);
    const body1 = await res1.json();
    assert(res1.status === 200, `rodada 1: esperado 200, recebido ${res1.status}`);
    assert(body1.updated === 1, `rodada 1: esperado updated=1, recebido ${JSON.stringify(body1)}`);
    assert(uploads.length === 1, `rodada 1: esperado 1 upload, recebido ${uploads.length}`);
    assert(
      JSON.stringify(removals) === JSON.stringify([["avatars/5511999998888.jpg"]]),
      `rodada 1: remocoes inesperadas: ${JSON.stringify(removals)}`,
    );
    const updatesAfterRound1 = rec.updates.length;

    // A selecao so casa o caminho legado: nenhuma clausula do `.or(...)`
    // alcanca `contacts/` (senao o canonico entraria na migracao de novo).
    assert(rec.orArgs.length > 0, "esperado ao menos um .or(...) capturado na selecao");
    assert(
      rec.orArgs.every((a) => !a.includes("contacts/")),
      `filtro alcanca o caminho canonico: ${JSON.stringify(rec.orArgs)}`,
    );
    assert(
      rec.orArgs.some((a) => a.includes("avatars/avatars/")),
      `filtro nao menciona o caminho legado: ${JSON.stringify(rec.orArgs)}`,
    );

    // Rodada 2: contato ja canonico — nao e legado, vai a Evolution (sem foto
    // -> failed++), SEM re-hospedar e SEM remover.
    round = 1;
    const res2 = await handleBatchFetchAvatars(makeRequest(), deps);
    const body2 = await res2.json();
    assert(res2.status === 200, `rodada 2: esperado 200, recebido ${res2.status}`);
    assert(body2.updated === 0, `rodada 2: esperado updated=0, recebido ${JSON.stringify(body2)}`);
    assert(body2.failed === 1, `rodada 2: esperado failed=1, recebido ${JSON.stringify(body2)}`);
    assert(uploads.length === 1, `segunda rodada re-hospedou: ${JSON.stringify(uploads)}`);
    assert(removals.length === 1, `segunda rodada removeu: ${JSON.stringify(removals)}`);
    // A URL canonica continua gravada: os updates da rodada 2 (backoff) nao
    // tocam `avatar_url`.
    const round2Updates = rec.updates.slice(updatesAfterRound1);
    assert(round2Updates.length > 0, "rodada 2 deveria marcar ao menos o backoff");
    for (const u of round2Updates) {
      assert(!("avatar_url" in (u as Record<string, unknown>)), `rodada 2 reescreveu avatar_url: ${JSON.stringify(u)}`);
    }
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

Deno.test("legado que falha (arquivo antigo indisponivel): failed++ e URL antiga intacta, sem remocao", async () => {
  const rec = { orArgs: [] as string[], updates: [] as unknown[] };
  const { deps, uploads, removals } = recordingDeps(() => [legacyRow()], rec);

  const fetchOriginal = globalThis.fetch;
  // O arquivo antigo sumiu (ou o egress negou): todo download volta 404, o
  // persist devolve null e o ramo `if (!newUrl)` assume.
  globalThis.fetch = () => Promise.resolve(new Response(null, { status: 404 }));
  try {
    const res = await handleBatchFetchAvatars(makeRequest(), deps);
    const body = await res.json();
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    assert(body.updated === 0, `esperado updated=0, recebido ${JSON.stringify(body)}`);
    assert(body.failed === 1, `esperado failed=1, recebido ${JSON.stringify(body)}`);
    assert(uploads.length === 0, `falha nao podia subir nada: ${JSON.stringify(uploads)}`);
    assert(removals.length === 0, `falha nao podia remover nada: ${JSON.stringify(removals)}`);
    // A URL antiga fica intacta: o unico update e o backoff, sem `avatar_url`.
    assert(rec.updates.length === 1, `esperado 1 update (backoff), recebido ${JSON.stringify(rec.updates)}`);
    const only = rec.updates[0] as Record<string, unknown>;
    assert(!("avatar_url" in only), `falha reescreveu avatar_url: ${JSON.stringify(only)}`);
    assert("avatar_fetch_attempted_at" in only, `backoff nao marcado: ${JSON.stringify(only)}`);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
