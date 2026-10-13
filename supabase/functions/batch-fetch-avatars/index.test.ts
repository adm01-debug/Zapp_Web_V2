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
