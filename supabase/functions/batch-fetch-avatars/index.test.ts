/**
 * Contrato executável do `batch-fetch-avatars` (varredura administrativa de avatares).
 *
 * Chama o handler REAL (`handleBatchFetchAvatars`) com o client Supabase injetado por
 * `_injected` (fake em memória que registra RPCs, updates e uploads) e
 * `globalThis.fetch` trocado por um espião que faz o papel da Evolution GO e da CDN
 * da foto. Sem rede, sem banco, env e segredos sintéticos.
 *
 * Entrada: a função não lê corpo (a varredura é decidida no servidor), então não há
 * caso de validação 400; o gate é a autorização (cron secret, service key ou
 * usuário admin/supervisor).
 *
 * Run with:
 *   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/batch-fetch-avatars/index.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleBatchFetchAvatars } from "./index.ts";

const SEGREDO_CRON = "segredo-cron-sintetico";
const SERVICE_KEY = "service-role-sintetica";
const EVOLUTION = "https://evolution.stub.test";
const FOTO = "https://pps.whatsapp.net/v/foto-sintetica.jpg";
const FOTO_BYTES = new Uint8Array(256).fill(7);

const CONTATO = {
  id: "c1",
  phone: "5511999990000",
  name: "Cliente",
  avatar_url: null,
  avatar_fetch_attempted_at: null,
  whatsapp_connection_id: "conn-1",
};

interface Fake {
  rpcs: string[];
  updates: Array<Record<string, unknown>>;
  uploads: Array<{ path: string; bytes: number }>;
  tabelas: string[];
}

/** Client Supabase em memória: só o que o handler usa, cada chamada registrada. */
function fakeSupabase(opts: { contatos?: unknown[]; privilegiado?: boolean; usuario?: boolean } = {}) {
  const fake: Fake = { rpcs: [], updates: [], uploads: [], tabelas: [] };
  /** Query builder encadeável e "thenable", como o do supabase-js. */
  function consulta(tabela: string, resultado: () => { data: unknown; error: null }): Record<string, unknown> {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "not", "or", "order", "limit", "in", "eq"]) q[m] = () => q;
    q.update = (row: Record<string, unknown>) => {
      fake.updates.push({ tabela, ...row });
      return q;
    };
    q.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve(resultado()).then(ok, falha);
    return q;
  }
  const client = {
    rpc(nome: string) {
      fake.rpcs.push(nome);
      if (nome === "get_avatars_refresh_cron_secret") return Promise.resolve({ data: SEGREDO_CRON, error: null });
      if (nome === "is_admin_or_supervisor") return Promise.resolve({ data: opts.privilegiado ?? false, error: null });
      return Promise.resolve({ data: null, error: { message: "rpc nao stubada" } });
    },
    auth: {
      getUser: () =>
        Promise.resolve(
          opts.usuario === false
            ? { data: { user: null }, error: { message: "invalid JWT" } }
            : { data: { user: { id: "user-1" } }, error: null },
        ),
    },
    from(tabela: string) {
      fake.tabelas.push(tabela);
      if (tabela === "contacts") return consulta(tabela, () => ({ data: opts.contatos ?? [CONTATO], error: null }));
      if (tabela === "whatsapp_connections") {
        return consulta(tabela, () => ({ data: [{ id: "conn-1", instance_id: "PRINCIPAL" }], error: null }));
      }
      return consulta(tabela, () => ({ data: null, error: null }));
    },
    storage: {
      from: () => ({
        upload: (path: string, bytes: Uint8Array) => {
          fake.uploads.push({ path, bytes: bytes.length });
          return Promise.resolve({ error: null });
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://stub.supabase.co/storage/v1/object/public/avatars/${path}` } }),
      }),
    },
  };
  return { client, fake };
}

/** Env da Evolution GO + fetch espião (Evolution responde a URL da foto; a CDN, os bytes). */
async function comEvolution<T>(fn: (chamadas: string[]) => Promise<T>): Promise<T> {
  const valores: Record<string, string | undefined> = {
    EVOLUTION_API_URL: EVOLUTION,
    EVOLUTION_API_KEY: "evolution-key-sintetica",
    EVOLUTION_INSTANCE_NAME: "PRINCIPAL",
    EVOLUTION_INSTANCE_TOKEN: "instance-token-sintetico",
    EVOLUTION_API_FLAVOR: undefined,
  };
  const salvos = Object.keys(valores).map((k) => [k, Deno.env.get(k)] as const);
  for (const [k, v] of Object.entries(valores)) {
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  const original = globalThis.fetch;
  const chamadas: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    chamadas.push(url);
    if (url === `${EVOLUTION}/user/avatar`) {
      return Promise.resolve(new Response(JSON.stringify({ data: { URL: FOTO } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    }
    if (url === FOTO) return Promise.resolve(new Response(FOTO_BYTES, { status: 200 }));
    return Promise.resolve(new Response("nao stubado", { status: 599 }));
  }) as typeof fetch;
  try {
    return await fn(chamadas);
  } finally {
    globalThis.fetch = original;
    for (const [k, v] of salvos) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

let ipSeq = 0;
function pedido(headers: Record<string, string>, method = "POST"): Request {
  ipSeq += 1;
  return new Request("https://edge.invalid/functions/v1/batch-fetch-avatars", {
    method,
    headers: { "x-forwarded-for": `198.51.100.${ipSeq}`, ...headers },
  });
}

Deno.test("batch-fetch-avatars: preflight OPTIONS responde CORS sem tocar o banco", async () => {
  const { client, fake } = fakeSupabase();
  const res = await handleBatchFetchAvatars(pedido({}, "OPTIONS"), { supabase: client, serviceKey: SERVICE_KEY });
  await res.body?.cancel();
  assertEquals(res.status, 200);
  assertEquals((res.headers.get("access-control-allow-headers") ?? "").includes("authorization"), true);
  assertEquals(fake.tabelas.length + fake.rpcs.length, 0);
});

Deno.test("batch-fetch-avatars: sem credencial devolve 401 e não varre contatos", async () => {
  const { client, fake } = fakeSupabase();
  const res = await handleBatchFetchAvatars(pedido({}), { supabase: client, serviceKey: SERVICE_KEY });
  await res.body?.cancel();
  assertEquals(res.status, 401);
  assertEquals(fake.tabelas.length, 0);
});

Deno.test("batch-fetch-avatars: cron secret errado e JWT inválido devolvem 401", async () => {
  const { client, fake } = fakeSupabase({ usuario: false });
  const res = await handleBatchFetchAvatars(
    pedido({ "x-cron-secret": "errado", authorization: "Bearer jwt-invalido" }),
    { supabase: client, serviceKey: SERVICE_KEY },
  );
  await res.body?.cancel();
  assertEquals(res.status, 401);
  assertEquals(fake.tabelas.length, 0);
});

Deno.test("batch-fetch-avatars: usuário autenticado sem papel admin/supervisor recebe 403", async () => {
  const { client, fake } = fakeSupabase({ privilegiado: false });
  const res = await handleBatchFetchAvatars(pedido({ authorization: "Bearer jwt-agente" }), {
    supabase: client,
    serviceKey: SERVICE_KEY,
  });
  await res.body?.cancel();
  assertEquals(res.status, 403);
  assertEquals(fake.rpcs.includes("is_admin_or_supervisor"), true);
  assertEquals(fake.tabelas.length, 0);
});

Deno.test("batch-fetch-avatars: service key sem contatos pendentes responde 200 sem chamar a Evolution", async () => {
  const { client } = fakeSupabase({ contatos: [] });
  await comEvolution(async (chamadas) => {
    const res = await handleBatchFetchAvatars(pedido({ authorization: `Bearer ${SERVICE_KEY}` }), {
      supabase: client,
      serviceKey: SERVICE_KEY,
    });
    assertEquals(res.status, 200);
    const corpo = await res.json();
    assertEquals(corpo.success, true);
    assertEquals(corpo.processed, 0);
    assertEquals(chamadas.length, 0);
  });
});

Deno.test("batch-fetch-avatars: caminho feliz (cron) baixa a foto, sobe no Storage e grava a URL", async () => {
  const { client, fake } = fakeSupabase();
  await comEvolution(async (chamadas) => {
    const res = await handleBatchFetchAvatars(pedido({ "x-cron-secret": SEGREDO_CRON }), {
      supabase: client,
      serviceKey: SERVICE_KEY,
    });
    assertEquals(res.status, 200);
    const corpo = await res.json();
    assertEquals([corpo.success, corpo.processed, corpo.updated, corpo.failed, corpo.skipped], [true, 1, 1, 0, 0]);
    assertEquals(chamadas, [`${EVOLUTION}/user/avatar`, FOTO]);
    assertEquals(fake.uploads, [{ path: "avatars/5511999990000.jpg", bytes: FOTO_BYTES.length }]);
    const gravado = fake.updates.find((u) => typeof u.avatar_url === "string");
    assertEquals(
      String(gravado?.avatar_url).startsWith("https://stub.supabase.co/storage/v1/object/public/avatars/avatars/5511999990000.jpg?v="),
      true,
    );
  });
});
