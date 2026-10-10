import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleEvolutionApi } from "./index.ts";
import { createFakeEvolution } from "../_shared/__tests__/fake-evolution.ts";
import { resetInstanceTokenCache } from "../_shared/evolution-instance-token.ts";

/* eslint-disable @typescript-eslint/no-explicit-any -- mocks estruturais dos
   clients Supabase (SupabaseClient é genérico e não é importável no teste). */

// R2-API-001 (P1): prova de que ação de controle sem papel/escopo não chega ao
// provedor. RED: antes da matriz, um `agent` autenticado disparava set-webhook/
// disconnect/update-privacy na GO (I/O real). GREEN: 403 e ZERO requests ao
// provedor. O teste injeta os dois clients (caller e service) e aponta
// EVOLUTION_API_URL para um servidor falso que registra cada POST recebido.

const TEST_JWT = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZ2VudCJ9.fake";
let ipSeq = 0;
function nextIp(): string {
  ipSeq += 1;
  return `10.0.0.${ipSeq}`;
}

/** Builder PostgREST em cadeia que nunca toca rede — devolve `data` no fim. */
function makeQuery(data: any = null): any {
  const q: any = {
    select: () => q,
    eq: () => q,
    neq: () => q,
    not: () => q,
    gte: () => q,
    lt: () => q,
    or: () => q,
    order: () => q,
    limit: () => q,
    in: () => q,
    maybeSingle: () => Promise.resolve({ data, error: null }),
    single: () => Promise.resolve({ data, error: null }),
    update: () => q,
    insert: () => q,
    delete: () => q,
  };
  return q;
}

function makeCallerClient(opts: { isAdminOrSupervisor: boolean; contactVisible?: boolean }): any {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "agent-1" } }, error: null }),
    },
    rpc: (fn: string) => {
      if (fn === "is_admin_or_supervisor") {
        return Promise.resolve({ data: opts.isAdminOrSupervisor, error: null });
      }
      if (fn === "is_contact_visible_to_user") {
        return Promise.resolve({ data: opts.contactVisible ?? false, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

function makeServiceClient(instanceToken: string | null = "vault-instance-token"): any {
  // TRA-002/#18: o handler passou a resolver o token DA conexão no Vault
  // (get_instance_token). O default devolve um token — é o estado real de uma
  // conexão já criada por create-connection; testes que precisam do caminho
  // NEGADO passam `null`.
  return {
    from: () => makeQuery(),
    rpc: (fn: string) => fn === "get_instance_token"
      ? Promise.resolve({ data: instanceToken, error: null })
      : Promise.resolve({ data: null, error: null }),
  };
}

function controlRequest(action: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost/functions/v1/evolution-api/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": TEST_JWT,
      "x-real-ip": nextIp(),
    },
    body: JSON.stringify(body),
  });
}

Deno.env.set("EVOLUTION_API_KEY", "test-evolution-key");
// SUPABASE_* não são lidos quando os dois clients vêm injetados.

for (const action of ["set-webhook", "disconnect", "update-privacy"]) {
  Deno.test(`R2-API-001: ${action} sem papel devolve 403 e não produz I/O no provedor`, async () => {
    const fake = createFakeEvolution();
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    try {
      const body = action === "set-webhook"
        ? { instanceName: "PRINCIPAL", url: "https://x/functions/v1/evolution-webhook", enabled: true }
        : action === "update-privacy"
          ? { instanceName: "PRINCIPAL", readreceipts: "all" }
          : { instanceName: "PRINCIPAL" };

      const res = await handleEvolutionApi(controlRequest(action, body), {
        callerClient: makeCallerClient({ isAdminOrSupervisor: false }),
        supabase: makeServiceClient(),
      });

      assertEquals(res.status, 403, `${action} deve ser 403 para agente`);
      const json = await res.json();
      assert(json?.error === true, "resposta deve ser { error: true }");
      assertEquals(fake.posts.length, 0, `${action} não pode chegar ao provedor`);
    } finally {
      await fake.stop();
    }
  });
}

Deno.test("R2-API-001: admin conserva a operação (set-webhook chega ao provedor)", async () => {
  const fake = createFakeEvolution();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  try {
    const res = await handleEvolutionApi(
      controlRequest("set-webhook", { instanceName: "PRINCIPAL", url: "https://x/functions/v1/evolution-webhook", enabled: true }),
      {
        callerClient: makeCallerClient({ isAdminOrSupervisor: true }),
        supabase: makeServiceClient(),
      },
    );
    assert(res.status !== 403, "admin não pode ser barrado");
    assert(fake.posts.length >= 1, "admin deve alcançar o provedor");
  } finally {
    await fake.stop();
  }
});

// Refazer t_3ee4be59: deny-by-default — 'connect' (emite QR / pode parear
// outro aparelho e recria a instância na sessão órfã) e qualquer ação
// desconhecida são 'control': agente recebe 403 antes de qualquer fetch.
for (const action of ["connect", "acao-desconhecida-nao-listada"]) {
  Deno.test(`R2-API-001: ${action} sem papel devolve 403 e não produz I/O no provedor`, async () => {
    const fake = createFakeEvolution();
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    try {
      const res = await handleEvolutionApi(
        controlRequest(action, { instanceName: "PRINCIPAL" }),
        {
          callerClient: makeCallerClient({ isAdminOrSupervisor: false }),
          supabase: makeServiceClient(),
        },
      );
      assertEquals(res.status, 403, `${action} deve ser 403 para agente`);
      const json = await res.json();
      assert(json?.error === true, "resposta deve ser { error: true }");
      assertEquals(fake.posts.length, 0, `${action} não pode chegar ao provedor`);
    } finally {
      await fake.stop();
    }
  });
}

Deno.test("R2-API-001: ação desconhecida com admin passa o gate e cai no 404 do handler", async () => {
  const fake = createFakeEvolution();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  try {
    const res = await handleEvolutionApi(
      controlRequest("acao-desconhecida-nao-listada", { instanceName: "PRINCIPAL" }),
      {
        callerClient: makeCallerClient({ isAdminOrSupervisor: true }),
        supabase: makeServiceClient(),
      },
    );
    assertEquals(res.status, 404, "admin em ação desconhecida deve cair no 'Unknown action'");
    assertEquals(fake.posts.length, 0);
  } finally {
    await fake.stop();
  }
});

Deno.test("R2-API-001: mutação de conversa (mark-read via JID) passa para agente com contato visível", async () => {
  const fake = createFakeEvolution();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  try {
    // mark-read não manda `number` — o alvo vem de key.remoteJid. Agente com o
    // contato na carteira (visível) conserva a operação; sem visibilidade, 403.
    const supabase: any = {
      from: (table: string) => {
        if (table === "whatsapp_connections") return makeQuery({ id: "conn-1" });
        if (table === "contacts") return makeQuery({ id: "contact-1" });
        return makeQuery(null);
      },
      rpc: () => Promise.resolve({ data: null, error: null }),
    };
    const body = {
      instanceName: "PRINCIPAL",
      key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "M1" },
    };
    const denied = await handleEvolutionApi(controlRequest("mark-read", body), {
      callerClient: makeCallerClient({ isAdminOrSupervisor: false, contactVisible: false }),
      supabase,
    });
    assertEquals(denied.status, 403, "agente sem contato visível deve ser negado");

    const allowed = await handleEvolutionApi(controlRequest("mark-read", body), {
      callerClient: makeCallerClient({ isAdminOrSupervisor: false, contactVisible: true }),
      supabase,
    });
    assert(allowed.status !== 403, "agente com contato visível deve passar");
  } finally {
    await fake.stop();
  }
});

Deno.test("R2-API-001: envio direto de agente sem contato visível é negado (fail-safe)", async () => {
  const fake = createFakeEvolution();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  try {
    // service client devolve: conexão existe (id) e contato NÃO existe → nega.
    const supabase: any = {
      from: (table: string) => {
        if (table === "whatsapp_connections") {
          return makeQuery({ id: "conn-1" });
        }
        if (table === "contacts") {
          return makeQuery(null);
        }
        return makeQuery(null);
      },
      rpc: () => Promise.resolve({ data: null, error: null }),
    };
    const res = await handleEvolutionApi(
      controlRequest("send-text", { instanceName: "PRINCIPAL", number: "5511999999999", text: "oi" }),
      { callerClient: makeCallerClient({ isAdminOrSupervisor: false }), supabase },
    );
    assertEquals(res.status, 403);
    assertEquals(fake.posts.length, 0, "envio negado não pode chegar ao provedor");
  } finally {
    await fake.stop();
  }
});

// ─── TRA-002 / item #18 (P1) ───────────────────────────────────────────────────────────────
// Rota de OUTRA conexão não pode autenticar com a credencial da instância
// PADRÃO nem com a key global: a Evolution GO seleciona a instância pela
// CREDENCIAL, então status/connect/logout/privacidade/webhook de uma conexão
// sairiam pela conexão errada. O handler resolve o token DA conexão no Vault
// (get_instance_token) e o entrega ao provedor; sem token, NEGA antes de qualquer
// I/O. RED: o handler lia EVOLUTION_INSTANCE_TOKEN (token da padrão) para TODA
// rota de instância e, sem ele, caía na key global.

const TOKEN_PADRAO = "credencial-da-instancia-padrao";

/** Fake que registra path + credencial (`apikey`) de cada request recebida. */
function createKeyCapturingFake() {
  const requests: Array<{ path: string; apikey: string | null }> = [];
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, (req) => {
    requests.push({ path: new URL(req.url).pathname, apikey: req.headers.get("apikey") });
    return new Response(JSON.stringify({ status: "success" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  });
  const addr = server.addr;
  if (addr.transport !== "tcp") throw new Error("key-fake: esperava listener TCP");
  return { url: `http://127.0.0.1:${addr.port}`, requests, stop: () => server.shutdown() };
}

/** Handler real, com o token que a conexão tem (ou não) no Vault. */
async function chamarComToken(action: string, body: Record<string, unknown>, token: string | null) {
  const fake = createKeyCapturingFake();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  Deno.env.set("EVOLUTION_INSTANCE_NAME", "PRINCIPAL");
  Deno.env.set("EVOLUTION_INSTANCE_TOKEN", TOKEN_PADRAO);
  resetInstanceTokenCache();
  const supabase: any = {
    from: () => makeQuery(),
    rpc: (fn: string) => fn === "get_instance_token"
      ? Promise.resolve({ data: token, error: null })
      : Promise.resolve({ data: null, error: null }),
  };
  const res = await handleEvolutionApi(controlRequest(action, body), {
    callerClient: makeCallerClient({ isAdminOrSupervisor: true }),
    supabase,
  });
  return { res, requests: fake.requests, stop: () => fake.stop() };
}

// Cada ponto de bloqueio NOVO: a rota de OUTRA conexão sem token NEGA e não
// produz I/O no provedor.
const NEGADAS: Array<[string, Record<string, unknown>]> = [
  ["set-webhook", { url: "https://x/functions/v1/evolution-webhook", enabled: true }],
  ["status", {}],
  ["connect", {}],
  ["disconnect", {}],
  ["update-privacy", { readreceipts: "contacts" }],
];
for (const [action, extra] of NEGADAS) {
  Deno.test(`TRA-002/#18: ${action} de OUTRA conexão sem token no Vault nega e não chega ao provedor`, async () => {
    const c = await chamarComToken(action, { instanceName: "CONN_B", ...extra }, null);
    try {
      assertEquals(c.requests.length, 0, "rota de outra conexão não pode usar a credencial da padrão");
      assertEquals(c.res.status, 200);
      assertEquals((await c.res.json())?.error, true);
    } finally {
      await c.stop();
    }
  });
}

Deno.test("TRA-002/#18: set-webhook (proxy) de OUTRA conexão usa o token DELA", async () => {
  const c = await chamarComToken("set-webhook", { instanceName: "CONN_B", url: "https://x/functions/v1/evolution-webhook", enabled: true }, "token-da-CONN_B");
  try {
    assertEquals(c.requests.length, 1);
    assertEquals(c.requests[0].apikey, "token-da-CONN_B");
  } finally {
    await c.stop();
  }
});

Deno.test("TRA-002/#18: status de OUTRA conexão usa o token DELA", async () => {
  const c = await chamarComToken("status", { instanceName: "CONN_B" }, "token-da-CONN_B");
  try {
    assertEquals(c.requests.length, 1);
    assertEquals(c.requests[0].path, "/instance/status");
    assertEquals(c.requests[0].apikey, "token-da-CONN_B");
  } finally {
    await c.stop();
  }
});

Deno.test("TRA-002/#18: instância PADRÃO sem token no Vault mantém o fallback EVOLUTION_INSTANCE_TOKEN", async () => {
  const c = await chamarComToken("set-webhook", { instanceName: "PRINCIPAL", url: "https://x/functions/v1/evolution-webhook", enabled: true }, null);
  try {
    assertEquals(c.requests.length, 1);
    assertEquals(c.requests[0].apikey, TOKEN_PADRAO);
  } finally {
    await c.stop();
  }
});
