// P1 R2-API-022 — autorização de recover-corrupted-audios.
//
// Contrato (decisão t_d8505da9): o preflight CORS continua livre, mas toda
// execução exige JWT de admin/supervisor ANTES de parsear batch_size/offset/
// dry_run, antes do scan e antes de qualquer download/upload/update. Estes
// casos provam o RED/GREEN: sem identidade → 401, agente comum → 403 (e nenhum
// dos dois toca em scan/Storage/update), admin válido → admitido com dry_run.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//     supabase/functions/recover-corrupted-audios/index.test.ts

import { assertEquals, assert } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { handleRecoverCorruptedAudios } from "./index.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Mock do client Supabase com contagem de efeitos
// ─────────────────────────────────────────────────────────────────────────────

interface MockOpts {
  /** usuário devolvido por auth.getUser; null = token inválido/ausente */
  authUser?: { id: string } | null;
  authError?: boolean;
  /** resultado de is_admin_or_supervisor */
  isAdmin?: boolean;
  roleError?: boolean;
  /** resultado do scan em messages */
  messages?: Array<Record<string, unknown>> | null;
  /** resultado do lookup em whatsapp_connections */
  connection?: { instance_id: string } | null;
  /** instância por id de conexão (lote multi-conexão); tem prioridade sobre `connection` */
  connections?: Record<string, { instance_id: string } | null>;
}

interface Effects {
  tables: string[];
  getUserCalls: string[];
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  uploads: number;
  updates: number;
  /** ids consultados em whatsapp_connections (prova que a conexão é resolvida por mensagem) */
  connLookups?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSupabase(opts: MockOpts, fx: Effects): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = (table: string): any => {
    fx.tables.push(table);
    let eqValue: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (): { data: any; error: any } => {
      if (table === "messages") return { data: opts.messages ?? [], error: null };
      if (table === "whatsapp_connections") {
        if (opts.connections && eqValue !== undefined) {
          return { data: opts.connections[eqValue] ?? null, error: null };
        }
        return { data: opts.connection ?? null, error: null };
      }
      return { data: null, error: null };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: Record<string, any> = {};
    const chain = () => b;
    b.select = chain; b.not = chain; b.like = chain;
    b.eq = (_col: string, val: unknown) => {
      eqValue = String(val);
      if (table === "whatsapp_connections") fx.connLookups?.push(String(val));
      return chain();
    };
    b.order = chain; b.range = chain; b.single = () => Promise.resolve(rows());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.update = (_row: any) => { fx.updates++; return chain(); };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.then = (onFulfilled: any, onRejected: any) => Promise.resolve(rows()).then(onFulfilled, onRejected);
    return b;
  };

  return {
    auth: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getUser: async (token: string): Promise<any> => {
        fx.getUserCalls.push(token);
        if (opts.authError) return { data: { user: null }, error: new Error("invalid token") };
        return { data: { user: opts.authUser ?? null }, error: null };
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rpc: async (name: string, args: Record<string, unknown> = {}): Promise<any> => {
      fx.rpcCalls.push({ name, args });
      if (name === "is_admin_or_supervisor") {
        if (opts.roleError) return { data: null, error: new Error("rpc failed") };
        return { data: opts.isAdmin === true, error: null };
      }
      return { data: null, error: null };
    },
    from: builder,
    storage: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      from: (_bucket: string): any => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upload: async (..._args: any[]): Promise<{ data: null; error: null }> => {
          fx.uploads++;
          return { data: null, error: null };
        },
      }),
    },
  };
}

function makeReq(opts: { bearer?: string; body?: Record<string, unknown> }): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.bearer !== undefined) headers["Authorization"] = `Bearer ${opts.bearer}`;
  return new Request("https://edge.test/recover-corrupted-audios", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? { dry_run: true }),
  });
}

const ADMIN = { id: "00000000-0000-0000-0000-00000000aaaa" };
const AGENT = { id: "00000000-0000-0000-0000-00000000bbbb" };
const CONN = { instance_id: "INSTANCE_1" };
const SAMPLE_MESSAGES = [
  {
    id: "m1",
    external_id: "ext-1",
    media_url: "https://x.supabase.co/storage/v1/object/public/audio-messages/a.ogg",
    whatsapp_connection_id: "conn-1",
  },
];

function depsFor(opts: MockOpts, fx: Effects) {
  return {
    supabase: makeSupabase(opts, fx),
    supabaseUrl: "https://x.supabase.co",
    serviceKey: "svc-key",
    evolutionUrl: "https://evo.test",
    evolutionKey: "evo-key",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Casos
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("R2-API-022: preflight OPTIONS continua livre (CORS nao autoriza nada)", async () => {
  const fx: Effects = { tables: [], getUserCalls: [], rpcCalls: [], uploads: 0, updates: 0 };
  const req = new Request("https://edge.test/recover-corrupted-audios", { method: "OPTIONS" });
  const res = await handleRecoverCorruptedAudios(req, depsFor({}, fx));
  assertEquals(res.status, 200);
  // Nenhum efeito: nem getUser, nem scan, nem rpc.
  assertEquals(fx.getUserCalls.length, 0);
  assertEquals(fx.tables.length, 0);
  assertEquals(fx.rpcCalls.length, 0);
});

Deno.test("R2-API-022: chamada sem identidade -> 401, sem dry_run e sem scan/upload/update", async () => {
  const fx: Effects = { tables: [], getUserCalls: [], rpcCalls: [], uploads: 0, updates: 0 };
  const res = await handleRecoverCorruptedAudios(
    makeReq({ body: { dry_run: true } }),
    depsFor({ messages: SAMPLE_MESSAGES, connection: CONN }, fx),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  // Nenhum metadado de dry_run vaza.
  assert(!("dry_run" in body), "resposta 401 nao pode expor metadados de dry_run");
  assert(!("instance" in body), "resposta 401 nao pode expor a instancia");
  assert(!("sample_ids" in body), "resposta 401 nao pode expor amostra de IDs");
  // Nenhum efeito: sem scan, sem rpc de papel, sem upload, sem update.
  assertEquals(fx.tables.length, 0);
  assertEquals(fx.rpcCalls.length, 0);
  assertEquals(fx.uploads, 0);
  assertEquals(fx.updates, 0);
});

Deno.test("R2-API-022: usuario comum (agente) -> 403, sem dry_run e sem scan/upload/update", async () => {
  const fx: Effects = { tables: [], getUserCalls: [], rpcCalls: [], uploads: 0, updates: 0 };
  const res = await handleRecoverCorruptedAudios(
    makeReq({ bearer: "jwt.agente", body: { dry_run: true } }),
    depsFor({ authUser: AGENT, isAdmin: false, messages: SAMPLE_MESSAGES, connection: CONN }, fx),
  );
  assertEquals(res.status, 403);
  const body = await res.json();
  assert(!("dry_run" in body), "resposta 403 nao pode expor metadados de dry_run");
  assert(!("sample_ids" in body), "resposta 403 nao pode expor amostra de IDs");
  // Identidade foi resolvida e o papel conferido, mas NADA alem disso.
  assertEquals(fx.getUserCalls.length, 1);
  assertEquals(fx.rpcCalls.map((c) => c.name), ["is_admin_or_supervisor"]);
  assertEquals(fx.tables.length, 0);
  assertEquals(fx.uploads, 0);
  assertEquals(fx.updates, 0);
});

Deno.test("R2-API-022: agente com RPC de papel falhando -> 403 (falha fechada)", async () => {
  const fx: Effects = { tables: [], getUserCalls: [], rpcCalls: [], uploads: 0, updates: 0 };
  const res = await handleRecoverCorruptedAudios(
    makeReq({ bearer: "jwt.agente", body: { dry_run: true } }),
    depsFor({ authUser: AGENT, roleError: true, messages: SAMPLE_MESSAGES, connection: CONN }, fx),
  );
  assertEquals(res.status, 403);
  assertEquals(fx.tables.length, 0);
});

Deno.test("R2-API-022: admin valido e admitido (dry_run devolve metadados)", async () => {
  const fx: Effects = { tables: [], getUserCalls: [], rpcCalls: [], uploads: 0, updates: 0 };
  const res = await handleRecoverCorruptedAudios(
    makeReq({ bearer: "jwt.admin", body: { dry_run: true } }),
    depsFor({ authUser: ADMIN, isAdmin: true, messages: SAMPLE_MESSAGES, connection: CONN }, fx),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.dry_run, true);
  assertEquals(body.instance, "INSTANCE_1");
  assertEquals(body.sample_ids, ["ext-1"]);
  // O scan (messages + conexao) rodou; sem upload/update por ser dry_run.
  assertEquals(fx.tables, ["messages", "whatsapp_connections"]);
  assertEquals(fx.rpcCalls.map((c) => c.name), ["is_admin_or_supervisor"]);
  assertEquals(fx.uploads, 0);
  assertEquals(fx.updates, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// R2-API-034 (#208) — a instância de origem é POR MENSAGEM, não a da 1ª do lote
// ─────────────────────────────────────────────────────────────────────────────

/** "OggS" + 8 bytes nulos — cabeçalho válido para `isValidAudioBytes`. */
const OGG_B64 = "T2dnUwAAAAAAAAAA";

Deno.test("R2-API-034: lote multi-conexao baixa cada audio na instancia da SUA conexao", async () => {
  const fx: Effects = {
    tables: [], getUserCalls: [], rpcCalls: [], uploads: 0, updates: 0, connLookups: [],
  };
  const messages = [
    {
      id: "m1",
      external_id: "ext-1",
      media_url: "https://x.supabase.co/storage/v1/object/public/audio-messages/ext-1.ogg",
      whatsapp_connection_id: "conn-1",
    },
    {
      id: "m2",
      external_id: "ext-2",
      media_url: "https://x.supabase.co/storage/v1/object/public/audio-messages/ext-2.ogg",
      whatsapp_connection_id: "conn-2",
    },
  ];
  const opts: MockOpts = {
    authUser: ADMIN,
    isAdmin: true,
    messages,
    connections: {
      "conn-1": { instance_id: "INSTANCE_1" },
      "conn-2": { instance_id: "INSTANCE_2" },
    },
  };

  const evoUrls: string[] = [];
  const origFetch = globalThis.fetch;
  const origFlavor = Deno.env.get("EVOLUTION_API_FLAVOR");
  // Em v2 a instância aparece no path da chamada — é o que o teste observa.
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("evo.test")) {
      evoUrls.push(url);
      return Promise.resolve(new Response(
        JSON.stringify({ base64: `data:audio/ogg;base64,${OGG_B64}`, mimetype: "audio/ogg" }),
        { headers: { "Content-Type": "application/json" } },
      ));
    }
    // URL de mídia já existente no Storage: bytes inválidos → o handler re-baixa.
    return Promise.resolve(new Response(new Uint8Array([0x00, 0x01, 0x02, 0x03])));
  }) as typeof fetch;

  try {
    const res = await handleRecoverCorruptedAudios(
      makeReq({ bearer: "jwt.admin", body: { dry_run: false } }),
      depsFor(opts, fx),
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.recovered, 2);
    assertEquals(body.failed, 0);

    // Cada mensagem foi buscar a mídia na instância da PRÓPRIA conexão.
    assertEquals(evoUrls.length, 2);
    assert(
      evoUrls[0].includes("/chat/getBase64FromMediaMessage/INSTANCE_1"),
      `1a mensagem deveria usar INSTANCE_1: ${evoUrls[0]}`,
    );
    assert(
      evoUrls[1].includes("/chat/getBase64FromMediaMessage/INSTANCE_2"),
      `2a mensagem deveria usar INSTANCE_2 (conexão dela), não a da 1a: ${evoUrls[1]}`,
    );
    assert(!evoUrls[1].includes("INSTANCE_1"), "2a mensagem nao pode reutilizar a instancia da 1a");
    // As duas conexões do lote foram resolvidas no banco (conn-2 não veio de cache).
    assertEquals(fx.connLookups, ["conn-1", "conn-2"]);
  } finally {
    globalThis.fetch = origFetch;
    if (origFlavor === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", origFlavor);
  }
});
