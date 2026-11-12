import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleEvolutionApi } from "./index.ts";
import { EvolutionApiRequestSchema } from "../_shared/schemas.ts";
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

// ─── R2-API-014 (P2) ────────────────────────────────────────────────────────
// Falha ao ler a privacidade atual NÃO pode virar abertura dos outros campos.
// Antes: GET /user/privacy falhando deixava `current = {}` e o merge fabricava
// 'all' — o valor MAIS permissivo — para cada campo não enviado; uma
// atualização parcial ampliava a visibilidade de seis campos que o operador
// não tocou. Depois: na falha ou na dúvida o handler NEGA (5xx,
// { error: true }) e ZERO escrita sai ao provedor; no sucesso, o merge carrega
// exatamente os valores do snapshot.
//
// O fake-evolution genérico não serve aqui: ele responde 405 a GET. Este fake
// específico controla a resposta do GET /user/privacy e registra toda escrita
// (POST/PUT/DELETE) que o handler tentar fazer ao provedor.

interface PrivacyFakeWrite {
  method: string;
  path: string;
  body: Record<string, unknown>;
}

function createPrivacyFake(respondPrivacyGet: () => Response) {
  const writes: PrivacyFakeWrite[] = [];
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    async (req) => {
      const path = new URL(req.url).pathname;
      if (req.method === "GET" && path === "/user/privacy") {
        return respondPrivacyGet();
      }
      const raw = await req.text();
      let body: Record<string, unknown> = {};
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>;
        }
      } catch {
        body = {};
      }
      writes.push({ method: req.method, path, body });
      return new Response(JSON.stringify({ status: "success" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  const addr = server.addr;
  if (addr.transport !== "tcp") throw new Error("privacy-fake: esperava listener TCP");
  return {
    url: `http://127.0.0.1:${addr.port}`,
    writes,
    stop: () => server.shutdown(),
  };
}

const PRIVACY_GET_SCENARIOS: Array<[string, () => Response]> = [
  ["GET /user/privacy responde 503", () =>
    new Response(JSON.stringify({ error: "provider_down" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })],
  ["GET /user/privacy responde 200 sem objeto `data`", () =>
    new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })],
  ["GET /user/privacy devolve snapshot sem todos os campos", () =>
    new Response(JSON.stringify({ data: { ReadReceipts: "all", Profile: "contacts" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })],
];

for (const [label, respondGet] of PRIVACY_GET_SCENARIOS) {
  Deno.test(`R2-API-014: update-privacy parcial com ${label} é negado e não escreve no provedor`, async () => {
    const fake = createPrivacyFake(respondGet);
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    Deno.env.set("EVOLUTION_API_FLAVOR", "go");
    try {
      const res = await handleEvolutionApi(
        controlRequest("update-privacy", { instanceName: "PRINCIPAL", readreceipts: "contacts" }),
        {
          callerClient: makeCallerClient({ isAdminOrSupervisor: true }),
          supabase: makeServiceClient(),
        },
      );
      const json = await res.json();
      // Convenção do proxy: a negação sai como HTTP 200 e o erro vai no corpo
      // (é esse shape que useEvolutionApiCore lê); o código real fica em `status`.
      assertEquals(res.status, 200, `convenção do proxy: HTTP 200, veio ${res.status}`);
      assert(json?.error === true, "resposta deve ser { error: true }");
      assert(
        Number(json?.status) >= 500,
        `corpo deve trazer status >= 500 (veio ${json?.status})`,
      );
      assertEquals(
        fake.writes.length,
        0,
        `leitura falhou/incompleta → nenhuma escrita pode sair ao provedor (veio ${JSON.stringify(fake.writes)})`,
      );
    } finally {
      await fake.stop();
    }
  });
}

Deno.test("R2-API-014: update-privacy com GET /user/privacy de corpo não-JSON é negado", async () => {
  // 200 com corpo que não parseia: exercita o ramo `catch` do handler (não só o
  // HTTP não-ok). Antes do fix o erro de parse era engolido, `current` ficava
  // vazio e a escrita saía ao provedor com seis campos em 'all'.
  const fake = createPrivacyFake(() =>
    new Response("<html>boom</html>", { status: 200, headers: { "Content-Type": "text/html" } }));
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  try {
    const res = await handleEvolutionApi(
      controlRequest("update-privacy", { instanceName: "PRINCIPAL", readreceipts: "contacts" }),
      {
        callerClient: makeCallerClient({ isAdminOrSupervisor: true }),
        supabase: makeServiceClient(),
      },
    );
    const json = await res.json();
    assertEquals(res.status, 200, `convenção do proxy: HTTP 200, veio ${res.status}`);
    assert(json?.error === true, "resposta deve ser { error: true }");
    assert(
      Number(json?.status) >= 500,
      `corpo deve trazer status >= 500 (veio ${json?.status})`,
    );
    assertEquals(fake.writes.length, 0, "leitura inválida → nenhuma escrita pode sair ao provedor");
  } finally {
    await fake.stop();
  }
});

Deno.test("R2-API-014: update-privacy parcial mergeia com o snapshot lido — nenhum 'all' fabricado", async () => {
  const snapshot = {
    ReadReceipts: "all",
    Profile: "none",
    Status: "contacts",
    Online: "none",
    LastSeen: "contacts",
    GroupAdd: "none",
    CallAdd: "contacts",
  };
  const fake = createPrivacyFake(() =>
    new Response(JSON.stringify({ data: snapshot }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  try {
    const res = await handleEvolutionApi(
      controlRequest("update-privacy", { instanceName: "PRINCIPAL", readreceipts: "contacts" }),
      {
        callerClient: makeCallerClient({ isAdminOrSupervisor: true }),
        supabase: makeServiceClient(),
      },
    );
    const json = await res.json();
    assertEquals(res.status, 200, `merge com snapshot deve ser sucesso: ${JSON.stringify(json)}`);
    assertEquals(fake.writes.length, 1, "exatamente uma escrita ao provedor");
    const write = fake.writes[0];
    assertEquals(write.method, "POST");
    assertEquals(write.path, "/user/privacy");
    // Cada campo não enviado carrega o valor EXATO do snapshot lido — campo
    // algum pode sair 'all' se nem o operador nem o snapshot disseram 'all'.
    assertEquals(write.body, {
      readReceipts: "contacts", // enviado pelo operador
      profile: "none",
      status: "contacts",
      online: "none",
      lastSeen: "contacts",
      groupAdd: "none",
      callAdd: "contacts",
    });
  } finally {
    await fake.stop();
  }
});

// ─── E45 / SL-050 (P2) ──────────────────────────────────────────────────────
// O corpo de `evolution-api` não passava por nenhum schema (grep zod na pasta:
// 0). `instanceName`/`action` eram lidos crus, `{}`/array/nulo viravam decisão
// e o corpo ia inteiro ao provedor. Depois: o corpo é validado com
// `EvolutionApiRequestSchema` (_shared/schemas.ts) e a recusa sai no formato
// único de validação (422 + VALIDATION_ERROR — docs/contracts.md), sem nenhum
// I/O no provedor.

/** Corpo com a ação NO CORPO (path `evolution-api` puro, como o front faz). */
function bareControlRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/functions/v1/evolution-api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": TEST_JWT,
      "x-real-ip": nextIp(),
    },
    body: JSON.stringify(body),
  });
}

Deno.test("E45: ação desconhecida no corpo devolve 422 e não chega ao provedor", async () => {
  const fake = createFakeEvolution();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  try {
    const res = await handleEvolutionApi(
      bareControlRequest({ action: "acao-que-nao-existe", instanceName: "PRINCIPAL" }),
      {
        callerClient: makeCallerClient({ isAdminOrSupervisor: true }),
        supabase: makeServiceClient(),
      },
    );
    assertEquals(res.status, 422, "ação fora da lista deve ser recusada na validação");
    const json = await res.json();
    assertEquals(json?.error?.code, "VALIDATION_ERROR");
    assertEquals(json?.error?.fields?.[0]?.path, "action");
    assertEquals(fake.posts.length, 0, "corpo inválido não pode chegar ao provedor");
  } finally {
    await fake.stop();
  }
});

Deno.test("E45: ação de instância sem instanceName devolve 422 e não chega ao provedor", async () => {
  const fake = createFakeEvolution();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  try {
    // chamador COM papel: o 422 tem de vir da validação do corpo (instância
    // obrigatória por ação — E17), não do gate de autorização.
    const res = await handleEvolutionApi(
      controlRequest("send-text", { number: "5511999999999", text: "oi" }),
      {
        callerClient: makeCallerClient({ isAdminOrSupervisor: true }),
        supabase: makeServiceClient(),
      },
    );
    assertEquals(res.status, 422, "instância ausente deve ser recusada na validação");
    const json = await res.json();
    assertEquals(json?.error?.code, "VALIDATION_ERROR");
    assertEquals(json?.error?.fields?.[0]?.path, "instanceName");
    assertEquals(fake.posts.length, 0, "corpo inválido não pode chegar ao provedor");
  } finally {
    await fake.stop();
  }
});

Deno.test("E45: corpo válido com a ação no corpo segue para o provedor", async () => {
  const fake = createFakeEvolution();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  try {
    const res = await handleEvolutionApi(
      bareControlRequest({
        action: "set-webhook",
        instanceName: "PRINCIPAL",
        url: "https://x/functions/v1/evolution-webhook",
        enabled: true,
      }),
      {
        callerClient: makeCallerClient({ isAdminOrSupervisor: true }),
        supabase: makeServiceClient(),
      },
    );
    assertEquals(res.status, 200, "corpo válido não pode ser recusado");
    assert(fake.posts.length >= 1, "corpo válido deve alcançar o provedor");
  } finally {
    await fake.stop();
  }
});

Deno.test("E45: ação global (list-instances) continua sem exigir instância", async () => {
  const fake = createFakeEvolution();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  try {
    const res = await handleEvolutionApi(
      controlRequest("list-instances", {}),
      {
        callerClient: makeCallerClient({ isAdminOrSupervisor: false }),
        supabase: makeServiceClient(),
      },
    );
    const json = await res.json();
    assert(
      json?.error?.code !== "VALIDATION_ERROR",
      `list-instances é isenta de instância (E17): ${JSON.stringify(json)}`,
    );
    assertEquals(res.status, 200);
  } finally {
    await fake.stop();
  }
});

Deno.test("E45: a lista de ações do schema cobre toda ação que o handler implementa", async () => {
  // Guarda contra a única falha grave deste cartão: recusar em 422 uma ação que
  // o handler suporta. O fonte do handler é a fonte da verdade (mesma extração
  // do teste de exaustividade da matriz de autorização, em
  // _shared/__tests__/evolution-control-authz.test.ts).
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const actions = new Set(
    [...source.matchAll(/action === '([^']+)'/g)].map((m) => m[1]),
  );
  assert(actions.size > 50, `sanidade: esperava >50 ações no handler (achou ${actions.size})`);
  for (const action of actions) {
    assert(
      EvolutionApiRequestSchema.safeParse({ action, instanceName: "PRINCIPAL" }).success,
      `o schema recusa a ação suportada '${action}'`,
    );
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

// ─── R2EXT-AGENDA: agenda/conversas/mídia fora da visibilidade + credencial ──
// find-chats/find-contacts devolvem a instância inteira (sem remoteJid único
// para gate por visibilidade — ADR R1EXT-F3); get-media-base64 lê a mídia de
// qualquer mensagem. Todas passam a exigir admin/supervisor. RED: um agente
// autenticado as disparava na GO. GREEN: 403 e ZERO I/O no provedor.

/** Fake que responde qualquer método com o payload dado por path e registra cada requisição. */
function createInstanceReadFake(payload: (path: string) => unknown) {
  const gets: string[] = [];
  const requests: Array<{ method: string; path: string }> = [];
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, (req) => {
    const path = new URL(req.url).pathname;
    requests.push({ method: req.method, path });
    if (req.method === "GET") gets.push(path);
    return new Response(JSON.stringify(payload(path)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const addr = server.addr;
  if (addr.transport !== "tcp") throw new Error("fake: listener não TCP");
  return { url: `http://127.0.0.1:${addr.port}`, gets, requests, stop: () => server.shutdown() };
}

const INSTANCIA_COM_CREDENCIAL = {
  name: "PRINCIPAL",
  instanceId: "11111111-1111-1111-1111-111111111111",
  status: "open",
  token: "TOKEN-NAO-DEVIA-SAIR",
  Token: "TOKEN-NAO-DEVIA-SAIR",
  apikey: "APIKEY-NAO-DEVIA-SAIR",
  hash: "HASH-NAO-DEVIA-SAIR",
  data: { token: "TOKEN-ANINHADO-NAO-DEVIA-SAIR" },
};

function assertSemCredencial(texto: string, contexto: string) {
  for (const segredo of ["NAO-DEVIA-SAIR", "TOKEN-ANINHADO"]) {
    assert(!texto.includes(segredo), `${contexto}: corpo vazou '${segredo}': ${texto}`);
  }
}

for (const action of ["find-chats", "find-contacts", "get-media-base64"]) {
  Deno.test(`R2EXT-AGENDA: ${action} sem papel devolve 403 e não produz I/O no provedor`, async () => {
    const fake = createFakeEvolution();
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    Deno.env.set("EVOLUTION_API_FLAVOR", "go");
    try {
      const body = action === "get-media-base64"
        ? { instanceName: "PRINCIPAL", message: { key: { id: "msg-1" } } }
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

Deno.test("R2EXT-AGENDA: find-contacts com papel segue para o provedor (restrita, não desabilitada)", async () => {
  const fake = createInstanceReadFake(() => ({}));
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2"); // v2 mantém POST /chat/findContacts/{instância}
  try {
    const res = await handleEvolutionApi(
      controlRequest("find-contacts", { instanceName: "PRINCIPAL", page: 1, offset: 0 }),
      { callerClient: makeCallerClient({ isAdminOrSupervisor: true }), supabase: makeServiceClient() },
    );
    assertEquals(res.status, 200, "admin/supervisor não pode ser recusado");
    assert(
      fake.requests.some((r) => r.method === "POST" && r.path.startsWith("/chat/findContacts")),
      "admin/supervisor deve alcançar o provedor",
    );
  } finally {
    await fake.stop();
  }
});

Deno.test("R2EXT-AGENDA: instance-info (v2) não devolve token/apikey/hash", async () => {
  const fake = createInstanceReadFake(() => INSTANCIA_COM_CREDENCIAL);
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const res = await handleEvolutionApi(
      controlRequest("instance-info", { instanceName: "PRINCIPAL" }),
      { callerClient: makeCallerClient({ isAdminOrSupervisor: false }), supabase: makeServiceClient() },
    );
    assertEquals(res.status, 200);
    const texto = await res.text();
    assertSemCredencial(texto, "instance-info v2");
    assert(texto.includes("open"), "o dado legítimo (status) deve permanecer");
  } finally {
    await fake.stop();
  }
});

Deno.test("R2EXT-AGENDA: instance-info (GO) não devolve token/apikey/hash", async () => {
  // GO resolve o nome→UUID em /instance/all antes de /instance/info/{id}; o
  // fake serve a lista em /instance/all (com o instanceId) e o objeto em
  // /instance/info — os dois passam pela higienização.
  const fake = createInstanceReadFake((path) =>
    path === "/instance/all" ? { data: [INSTANCIA_COM_CREDENCIAL] } : INSTANCIA_COM_CREDENCIAL
  );
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  try {
    const res = await handleEvolutionApi(
      controlRequest("instance-info", { instanceName: "PRINCIPAL" }),
      { callerClient: makeCallerClient({ isAdminOrSupervisor: false }), supabase: makeServiceClient() },
    );
    assertEquals(res.status, 200);
    const texto = await res.text();
    assertSemCredencial(texto, "instance-info go");
    assert(fake.gets.some((p) => p.startsWith("/instance/info/")), "deve consultar /instance/info");
  } finally {
    await fake.stop();
  }
});

Deno.test("R2EXT-AGENDA: list-instances (GO) não devolve token/apikey/hash", async () => {
  const fake = createInstanceReadFake(() => ({ data: [INSTANCIA_COM_CREDENCIAL] }));
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  try {
    const res = await handleEvolutionApi(
      controlRequest("list-instances", {}),
      { callerClient: makeCallerClient({ isAdminOrSupervisor: false }), supabase: makeServiceClient() },
    );
    assertEquals(res.status, 200);
    const texto = await res.text();
    assertSemCredencial(texto, "list-instances go");
    assert(fake.gets.includes("/instance/all"), "GO deve listar em /instance/all");
  } finally {
    await fake.stop();
  }
});

Deno.test("R2EXT-AGENDA: list-instances (v2) não devolve token/apikey/hash", async () => {
  // v2 devolve o array direto em /instance/fetchInstances: o strip precisa
  // percorrer a lista (senão o token do item escaparia).
  const fake = createInstanceReadFake(() => [INSTANCIA_COM_CREDENCIAL]);
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const res = await handleEvolutionApi(
      controlRequest("list-instances", {}),
      { callerClient: makeCallerClient({ isAdminOrSupervisor: false }), supabase: makeServiceClient() },
    );
    assertEquals(res.status, 200);
    const texto = await res.text();
    assertSemCredencial(texto, "list-instances v2");
    assert(fake.gets.includes("/instance/fetchInstances"), "v2 deve listar em /instance/fetchInstances");
  } finally {
    await fake.stop();
  }
});

// ─── R2EXT-STATUS: Publicar Status/Story é controle e corpo é saneado ────────
// RED: `send-status` estava em `send` (sem contato-alvo, o gate negava por
// acidente) e o corpo ia INTEIRO para /message/sendStatus — campos livres
// (`allContacts`, `font`), texto sem teto e `statusJidList` com números de fora,
// tudo sem trilha. GREEN: exige admin/supervisor, allowlist + teto, lista só da
// empresa e linha em `audit_logs` (ator e tipo, jamais conteúdo/telefone).

const CONN_ID = "11111111-1111-1111-1111-111111111111";
const CONTATO_EMPRESA = "5511911111111";
const NUMERO_DE_FORA = "5599999999999";

/** Service client que serve a conexão/contatos e captura os inserts de auditoria. */
function makeStatusServiceClient(opts: { contacts?: string[]; auditError?: { message: string } | null } = {}) {
  const auditInserts: any[] = [];
  const client: any = {
    rpc: (fn: string) => fn === "get_instance_token"
      ? Promise.resolve({ data: "vault-instance-token", error: null })
      : Promise.resolve({ data: null, error: null }),
    from: (table: string) => {
      if (table === "whatsapp_connections") {
        const q: any = {
          select: () => q,
          eq: () => q,
          maybeSingle: () => Promise.resolve({ data: { id: CONN_ID }, error: null }),
        };
        return q;
      }
      if (table === "contacts") {
        const q: any = {
          select: () => q,
          eq: () => q,
          limit: () => q,
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: (opts.contacts ?? []).map((phone) => ({ phone })), error: null }),
        };
        return q;
      }
      if (table === "audit_logs") {
        return {
          insert: (row: any) => {
            auditInserts.push(row);
            return Promise.resolve({ data: null, error: opts.auditError ?? null });
          },
        };
      }
      return makeQuery();
    },
  };
  return { client, auditInserts };
}

Deno.test("R2EXT-STATUS: agente (não-admin) publica status? 403 e ZERO I/O no provedor", async () => {
  const fake = createFakeEvolution();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const svc = makeStatusServiceClient({ contacts: [CONTATO_EMPRESA] });
  try {
    const res = await handleEvolutionApi(
      controlRequest("send-status", { instanceName: "PRINCIPAL", type: "text", content: "oi" }),
      { callerClient: makeCallerClient({ isAdminOrSupervisor: false }), supabase: svc.client },
    );
    assertEquals(res.status, 403, "send-status é controle: agente não publica");
    assert((await res.json())?.error === true);
    assertEquals(fake.posts.length, 0, "nada pode chegar ao provedor");
    assertEquals(svc.auditInserts.length, 0, "sem envio, sem trilha de publicação");
  } finally {
    await fake.stop();
  }
});

Deno.test("R2EXT-STATUS: supervisor publica — allowlist, teto do texto, lista só da empresa e trilha", async () => {
  const fake = createFakeEvolution();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const svc = makeStatusServiceClient({ contacts: [CONTATO_EMPRESA] });
  const textoLongo = "a".repeat(2000);
  try {
    const res = await handleEvolutionApi(
      controlRequest("send-status", {
        instanceName: "PRINCIPAL",
        type: "text",
        content: textoLongo,
        backgroundColor: "#ff0000",
        allContacts: true,
        font: 1,
        statusJidList: [`${CONTATO_EMPRESA}@s.whatsapp.net`, `${NUMERO_DE_FORA}@s.whatsapp.net`],
      }),
      { callerClient: makeCallerClient({ isAdminOrSupervisor: true }), supabase: svc.client },
    );
    assertEquals(res.status, 200, "supervisor publica");

    assertEquals(fake.posts.length, 1, "um único POST ao provedor");
    const post = fake.posts[0];
    assertEquals(post.path, "/message/sendStatus/PRINCIPAL");
    const enviado = post.body;
    assertEquals(enviado.type, "text");
    assertEquals((enviado.content as string).length, 1024, "texto cortado no teto");
    assertEquals(enviado.backgroundColor, "#ff0000");
    assertEquals(enviado.statusJidList, [`${CONTATO_EMPRESA}@s.whatsapp.net`], "só o JID da empresa sobrevive");
    assert(!("allContacts" in enviado), "campo livre allContacts descartado");
    assert(!("font" in enviado), "campo livre font descartado");

    assertEquals(svc.auditInserts.length, 1, "publicação exige trilha");
    const trilha = svc.auditInserts[0];
    assertEquals(trilha.action, "evolution_status_published");
    assertEquals(trilha.user_id, "agent-1");
    assertEquals(trilha.entity_id, CONN_ID);
    assertEquals(trilha.details?.type, "text");
    const serializado = JSON.stringify(trilha);
    assert(!serializado.includes(textoLongo), "a trilha não guarda o conteúdo");
    assert(!serializado.includes(CONTATO_EMPRESA), "a trilha não guarda telefone");
  } finally {
    await fake.stop();
  }
});

Deno.test("R2EXT-STATUS: statusJidList só com números de fora nega (não cai no broadcast global)", async () => {
  const fake = createFakeEvolution();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const svc = makeStatusServiceClient({ contacts: [CONTATO_EMPRESA] });
  try {
    const res = await handleEvolutionApi(
      controlRequest("send-status", {
        instanceName: "PRINCIPAL",
        type: "text",
        content: "oi",
        statusJidList: [`${NUMERO_DE_FORA}@s.whatsapp.net`],
      }),
      { callerClient: makeCallerClient({ isAdminOrSupervisor: true }), supabase: svc.client },
    );
    assertEquals(res.status, 403, "lista sem nenhum destino da empresa não pode virar broadcast");
    assert((await res.json())?.error === true);
    assertEquals(fake.posts.length, 0, "não pode chegar ao provedor");
    assertEquals(svc.auditInserts.length, 0, "sem publicação não há trilha");
  } finally {
    await fake.stop();
  }
});

Deno.test("R2EXT-STATUS: falha da trilha NÃO publica o status (403/500 e zero I/O)", async () => {
  const fake = createFakeEvolution();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const svc = makeStatusServiceClient({ contacts: [CONTATO_EMPRESA], auditError: { message: "audit down" } });
  try {
    const res = await handleEvolutionApi(
      controlRequest("send-status", { instanceName: "PRINCIPAL", type: "text", content: "oi" }),
      { callerClient: makeCallerClient({ isAdminOrSupervisor: true }), supabase: svc.client },
    );
    assert(res.status >= 400, "sem trilha o status é negado (fail-closed)");
    assertEquals(fake.posts.length, 0, "não pode publicar sem registro");
  } finally {
    await fake.stop();
  }
});

// ─── Instância validada = instância usada (bypass por `instanceName: ""`) ────
// O schema validava `instanceName ?? instance` e o handler usava
// `instanceName || instance`: com `instanceName` vazio, o nome checado era ''
// e o usado era `instance`, sem passar pelo padrão — e esse nome vira path da
// URL do provedor. Prova: ação de LEITURA (liberada a qualquer autenticado),
// agente sem papel, nome fora do padrão → 422 e ZERO requests ao provedor.
function createRecordingFake() {
  const calls: Array<{ method: string; path: string; search: string; body: any }> = [];
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    const raw = await req.text();
    let body: any = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    const u = new URL(req.url);
    calls.push({ method: req.method, path: u.pathname, search: u.search, body });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const addr = server.addr;
  if (addr.transport !== "tcp") throw new Error("fake: listener não TCP");
  return { url: `http://127.0.0.1:${addr.port}`, calls, stop: () => server.shutdown() };
}

const NO_ROLE = () => makeCallerClient({ isAdminOrSupervisor: false });
const BAD_INSTANCE = "../../instance/restart/OUTRA";

for (const flavor of ["v2", "go"]) {
  for (const body of [
    { instanceName: "", instance: BAD_INSTANCE },
    { instanceName: null, instance: BAD_INSTANCE },
    { instance: BAD_INSTANCE },
    { instanceName: "", instance: "PRINCIPAL" },
  ]) {
    Deno.test(`instância: leitura sem papel (${flavor}) com ${JSON.stringify(body)} → 422 sem I/O`, async () => {
      const fake = createRecordingFake();
      Deno.env.set("EVOLUTION_API_URL", fake.url);
      Deno.env.set("EVOLUTION_API_FLAVOR", flavor);
      try {
        const res = await handleEvolutionApi(controlRequest("check-numbers", { ...body, numbers: ["5511999990001"] }), {
          callerClient: NO_ROLE(), supabase: makeServiceClient(null),
        });
        assertEquals(res.status, 422);
        assertEquals((await res.json()).error?.code ?? "VALIDATION_ERROR", "VALIDATION_ERROR");
        assertEquals(fake.calls.length, 0, "nome fora do padrão não pode virar URL do provedor");
      } finally {
        await fake.stop();
        Deno.env.delete("EVOLUTION_API_FLAVOR");
      }
    });
  }
}

Deno.test("instância: schema valida o mesmo valor que o handler usa", () => {
  assertEquals(EvolutionApiRequestSchema.safeParse({ instanceName: "", instance: BAD_INSTANCE }).success, false);
  assertEquals(EvolutionApiRequestSchema.safeParse({ instanceName: null, instance: BAD_INSTANCE }).success, false);
  assertEquals(EvolutionApiRequestSchema.safeParse({ instance: "PRINCIPAL" }).success, true);
  assertEquals(EvolutionApiRequestSchema.safeParse({ instanceName: "PRINCIPAL", instance: "qualquer" }).success, true);
});

Deno.test("instância: alias legado `instance` válido continua funcionando (v2)", async () => {
  const fake = createRecordingFake();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const res = await handleEvolutionApi(controlRequest("check-numbers", { instance: "PRINCIPAL", numbers: ["1"] }), {
      callerClient: NO_ROLE(), supabase: makeServiceClient(),
    });
    assertEquals(res.status, 200);
    assertEquals(fake.calls.map((c) => `${c.method} ${c.path}`), ["POST /chat/whatsappNumbers/PRINCIPAL"]);
  } finally {
    await fake.stop();
    Deno.env.delete("EVOLUTION_API_FLAVOR");
  }
});

// ─── group-invite-code: JID validado e codificado na query ──────────────────
for (const groupJid of ["1@g.us&extra=1", "1@g.us#x", "5511999990001@s.whatsapp.net", "", "../x"]) {
  Deno.test(`group-invite-code: groupJid ${JSON.stringify(groupJid)} → 422 sem I/O`, async () => {
    const fake = createRecordingFake();
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
    try {
      const res = await handleEvolutionApi(controlRequest("group-invite-code", { instanceName: "PRINCIPAL", groupJid }), {
        callerClient: NO_ROLE(), supabase: makeServiceClient(),
      });
      assertEquals(res.status, 422);
      assertEquals(fake.calls.length, 0);
    } finally {
      await fake.stop();
      Deno.env.delete("EVOLUTION_API_FLAVOR");
    }
  });
}

for (const flavor of ["v2", "go"]) {
  Deno.test(`group-invite-code: JID de grupo válido chega codificado ao provedor (${flavor})`, async () => {
    const fake = createRecordingFake();
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    Deno.env.set("EVOLUTION_API_FLAVOR", flavor);
    try {
      const res = await handleEvolutionApi(controlRequest("group-invite-code", { instanceName: "PRINCIPAL", groupJid: "120363000000000000@g.us" }), {
        callerClient: NO_ROLE(), supabase: makeServiceClient(),
      });
      assertEquals(res.status, 200);
      assertEquals(fake.calls.length, 1);
      if (flavor === "v2") {
        assertEquals(fake.calls[0].path, "/group/inviteCode/PRINCIPAL");
        assertEquals(fake.calls[0].search, "?groupJid=120363000000000000%40g.us");
      } else {
        // GO: a tradução lê a query (URLSearchParams decodifica) e manda no corpo.
        assertEquals(`${fake.calls[0].method} ${fake.calls[0].path}`, "POST /group/invitelink");
        assertEquals(fake.calls[0].body?.groupJid, "120363000000000000@g.us");
      }
    } finally {
      await fake.stop();
      Deno.env.delete("EVOLUTION_API_FLAVOR");
    }
  });
}

// ─── catch-all: 500 padrão, sem a mensagem crua da exceção ──────────────────
Deno.test("catch-all: exceção interna vira 500 genérico (sem vazar a mensagem)", async () => {
  Deno.env.set("EVOLUTION_API_URL", "http://127.0.0.1:9");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const SECRET = "segredo-interno-do-banco-xyz";
  const exploding: any = {
    from: () => { throw new Error(SECRET); },
    rpc: () => { throw new Error(SECRET); },
  };
  try {
    const res = await handleEvolutionApi(controlRequest("send-text", { instanceName: "PRINCIPAL", number: "5511999990001", text: "oi" }), {
      callerClient: NO_ROLE(), supabase: exploding,
    });
    assertEquals(res.status, 500);
    const text = await res.text();
    assertEquals(text.includes(SECRET), false, "mensagem interna não pode ir ao cliente");
    assertEquals(JSON.parse(text).error, "Internal server error");
  } finally {
    Deno.env.delete("EVOLUTION_API_FLAVOR");
  }
});

// ─── Rotas restauradas após o #2054 (tinham tela e respondiam 404/403) ───────
function createCapturingFake(payload: unknown = { ok: true }) {
  const calls: Array<{ method: string; path: string; body: any }> = [];
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    const raw = await req.text();
    let body: any = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    calls.push({ method: req.method, path: new URL(req.url).pathname, body });
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const addr = server.addr;
  if (addr.transport !== "tcp") throw new Error("fake: listener não TCP");
  return { url: `http://127.0.0.1:${addr.port}`, calls, stop: () => server.shutdown() };
}

const adminClient = () => makeCallerClient({ isAdminOrSupervisor: true });
const agentClient = () => makeCallerClient({ isAdminOrSupervisor: false, contactVisible: true });

Deno.test("#2054 get-settings (v2, admin): GET /settings/find/{instância}", async () => {
  const fake = createCapturingFake({ rejectCall: true });
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const res = await handleEvolutionApi(controlRequest("get-settings", { instanceName: "PRINCIPAL" }),
      { callerClient: adminClient(), supabase: makeServiceClient() });
    assertEquals(res.status, 200);
    assertEquals((await res.json()).rejectCall, true);
    assertEquals(fake.calls.map((c) => `${c.method} ${c.path}`), ["GET /settings/find/PRINCIPAL"]);
  } finally {
    await fake.stop();
  }
});

Deno.test("#2054 set-settings (v2, admin): POST /settings/set só com os 7 campos do contrato", async () => {
  const fake = createCapturingFake();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const res = await handleEvolutionApi(controlRequest("set-settings", {
      instanceName: "PRINCIPAL", rejectCall: true, msgCall: "ocupado", groupsIgnore: false,
      alwaysOnline: false, readMessages: true, readStatus: false, syncFullHistory: false, extra: "não vai",
    }), { callerClient: adminClient(), supabase: makeServiceClient() });
    assertEquals(res.status, 200);
    assertEquals(fake.calls.length, 1);
    assertEquals(fake.calls[0].path, "/settings/set/PRINCIPAL");
    assertEquals(Object.keys(fake.calls[0].body).sort(),
      ["alwaysOnline", "groupsIgnore", "msgCall", "readMessages", "readStatus", "rejectCall", "syncFullHistory"]);
  } finally {
    await fake.stop();
  }
});

for (const action of ["get-settings", "set-settings", "get-webhook"]) {
  Deno.test(`#2054 ${action} sem papel devolve 403 e não produz I/O`, async () => {
    const fake = createCapturingFake();
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
    try {
      const res = await handleEvolutionApi(controlRequest(action, { instanceName: "PRINCIPAL" }),
        { callerClient: makeCallerClient({ isAdminOrSupervisor: false }), supabase: makeServiceClient() });
      assertEquals(res.status, 403);
      assertEquals(fake.calls.length, 0);
    } finally {
      await fake.stop();
    }
  });
}

for (const action of ["get-settings", "set-settings"]) {
  Deno.test(`#2054 ${action} (GO): notSupported com 200, sem I/O no provedor`, async () => {
    const fake = createCapturingFake();
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    Deno.env.set("EVOLUTION_API_FLAVOR", "go");
    try {
      const res = await handleEvolutionApi(controlRequest(action, { instanceName: "PRINCIPAL" }),
        { callerClient: adminClient(), supabase: makeServiceClient() });
      assertEquals(res.status, 200);
      assertEquals((await res.json()).notSupported, true);
      assertEquals(fake.calls.length, 0);
    } finally {
      await fake.stop();
    }
  });
}

Deno.test("#2054 get-webhook (v2, admin): GET /webhook/find/{instância}", async () => {
  const fake = createCapturingFake({ url: "https://x/functions/v1/evolution-webhook", events: ["MESSAGES_UPSERT"] });
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const res = await handleEvolutionApi(controlRequest("get-webhook", { instanceName: "PRINCIPAL" }),
      { callerClient: adminClient(), supabase: makeServiceClient() });
    assertEquals(res.status, 200);
    assertEquals((await res.json()).url, "https://x/functions/v1/evolution-webhook");
    assertEquals(fake.calls.map((c) => `${c.method} ${c.path}`), ["GET /webhook/find/PRINCIPAL"]);
  } finally {
    await fake.stop();
  }
});

Deno.test("#2054 get-webhook (GO, admin): lê a config da listagem de instâncias", async () => {
  const fake = createCapturingFake({ data: [{ name: "PRINCIPAL", webhook: "https://x/wh", events: "MESSAGE,CONNECTION" }] });
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  try {
    const res = await handleEvolutionApi(controlRequest("get-webhook", { instanceName: "PRINCIPAL" }),
      { callerClient: adminClient(), supabase: makeServiceClient() });
    assertEquals(res.status, 200);
    const json = await res.json();
    assertEquals(json.webhook.url, "https://x/wh");
    assertEquals(json.webhook.events, ["MESSAGE", "CONNECTION"]);
    assertEquals(fake.calls.map((c) => c.path), ["/instance/all"]);
  } finally {
    await fake.stop();
  }
});

function sendSupabase(): any {
  return {
    from: (table: string) => {
      if (table === "whatsapp_connections") return makeQuery({ id: "conn-1" });
      if (table === "contacts") return makeQuery({ id: "contact-1" });
      return makeQuery(null);
    },
    rpc: (fn: string) => fn === "get_instance_token"
      ? Promise.resolve({ data: "vault-instance-token", error: null })
      : Promise.resolve({ data: null, error: null }),
  };
}

Deno.test("#2054 mark-unread (v2): agente com contato visível alcança o provedor só com a key validada", async () => {
  const fake = createCapturingFake();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const key = { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "M1" };
    const res = await handleEvolutionApi(controlRequest("mark-unread", {
      instanceName: "PRINCIPAL", key,
      // tentativa de carona: JID de OUTRA conversa fora da checagem do gate
      readMessages: [{ remoteJid: "5521888888888@s.whatsapp.net", fromMe: false, id: "X" }],
    }), { callerClient: agentClient(), supabase: sendSupabase() });
    assertEquals(res.status, 200);
    assertEquals(fake.calls.length, 1);
    // Evolution v2: MarkChatUnreadDto em /chat/markChatUnread = { chat, lastMessage: { key } }.
    assertEquals(fake.calls[0].path, "/chat/markChatUnread/PRINCIPAL");
    assertEquals(fake.calls[0].body, { chat: key.remoteJid, lastMessage: { key } });
  } finally {
    await fake.stop();
  }
});

Deno.test("#2054 mark-unread: agente sem contato visível é negado (403, sem I/O)", async () => {
  const fake = createCapturingFake();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const res = await handleEvolutionApi(controlRequest("mark-unread", {
      instanceName: "PRINCIPAL", key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "M1" },
    }), { callerClient: makeCallerClient({ isAdminOrSupervisor: false, contactVisible: false }), supabase: sendSupabase() });
    assertEquals(res.status, 403);
    assertEquals(fake.calls.length, 0);
  } finally {
    await fake.stop();
  }
});

Deno.test("#2054 mark-unread (GO): notSupported com 200, sem I/O no provedor", async () => {
  const fake = createCapturingFake();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  try {
    const res = await handleEvolutionApi(controlRequest("mark-unread", {
      instanceName: "PRINCIPAL", key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "M1" },
    }), { callerClient: agentClient(), supabase: sendSupabase() });
    assertEquals(res.status, 200);
    assertEquals((await res.json()).notSupported, true);
    assertEquals(fake.calls.length, 0);
  } finally {
    await fake.stop();
  }
});

Deno.test("#2054 set-presence (v2, admin): POST /instance/setPresence só com a presença", async () => {
  const fake = createCapturingFake();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const res = await handleEvolutionApi(controlRequest("set-presence", { instanceName: "PRINCIPAL", presence: "unavailable", extra: 1 }),
      { callerClient: adminClient(), supabase: makeServiceClient() });
    assertEquals(res.status, 200);
    assertEquals(fake.calls.map((c) => `${c.method} ${c.path}`), ["POST /instance/setPresence/PRINCIPAL"]);
    assertEquals(fake.calls[0].body, { presence: "unavailable" });
  } finally {
    await fake.stop();
  }
});

Deno.test("#2054 toggle-ephemeral (v2, admin): POST /group/toggleEphemeral com grupo e expiração", async () => {
  const fake = createCapturingFake();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const res = await handleEvolutionApi(controlRequest("toggle-ephemeral", { instanceName: "PRINCIPAL", groupJid: "123@g.us", expiration: 86400 }),
      { callerClient: adminClient(), supabase: makeServiceClient() });
    assertEquals(res.status, 200);
    assertEquals(fake.calls[0].path, "/group/toggleEphemeral/PRINCIPAL");
    assertEquals(fake.calls[0].body, { groupJid: "123@g.us", expiration: 86400 });
  } finally {
    await fake.stop();
  }
});

for (const action of ["set-presence", "toggle-ephemeral"]) {
  Deno.test(`#2054 ${action} sem papel devolve 403 e não produz I/O`, async () => {
    const fake = createCapturingFake();
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
    try {
      const res = await handleEvolutionApi(controlRequest(action, { instanceName: "PRINCIPAL", presence: "available", groupJid: "1@g.us", expiration: 0 }),
        { callerClient: makeCallerClient({ isAdminOrSupervisor: false }), supabase: makeServiceClient() });
      assertEquals(res.status, 403);
      assertEquals(fake.calls.length, 0);
    } finally {
      await fake.stop();
    }
  });
}

Deno.test("#2054 invite-info (v2): leitura com o código codificado na query, permitida sem papel", async () => {
  const fake = createCapturingFake({ subject: "Grupo X", size: 3 });
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const res = await handleEvolutionApi(controlRequest("invite-info", { instanceName: "PRINCIPAL", inviteCode: "AbC&x=1#y" }),
      { callerClient: makeCallerClient({ isAdminOrSupervisor: false }), supabase: makeServiceClient() });
    assertEquals(res.status, 200);
    assertEquals((await res.json()).subject, "Grupo X");
    assertEquals(fake.calls.length, 1);
    assertEquals(fake.calls[0].method, "GET");
    assertEquals(fake.calls[0].path, "/group/inviteInfo/PRINCIPAL");
  } finally {
    await fake.stop();
  }
});

Deno.test("#2054 send-template (v2): agente com contato visível envia; sem visibilidade, 403", async () => {
  const fake = createCapturingFake({ key: { id: "T1" } });
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const template = { name: "boas_vindas", language: "pt_BR", components: [] };
    const negado = await handleEvolutionApi(controlRequest("send-template", { instanceName: "PRINCIPAL", number: "5511999999999", template }),
      { callerClient: makeCallerClient({ isAdminOrSupervisor: false, contactVisible: false }), supabase: sendSupabase() });
    assertEquals(negado.status, 403);
    assertEquals(fake.calls.length, 0);

    const res = await handleEvolutionApi(controlRequest("send-template", { instanceName: "PRINCIPAL", number: "5511999999999", template }),
      { callerClient: agentClient(), supabase: sendSupabase() });
    assertEquals(res.status, 200);
    assertEquals(fake.calls[0].path, "/message/sendTemplate/PRINCIPAL");
    // Evolution v2 (templateMessageSchema): campos no topo, sem o envelope `template`.
    assertEquals(fake.calls[0].body, { number: "5511999999999", name: "boas_vindas", language: "pt_BR", components: [] });

    const topo = await handleEvolutionApi(controlRequest("send-template", {
      instanceName: "PRINCIPAL", number: "5511999999999", name: "promo", language: "pt_BR",
      components: [{ type: "body", parameters: [] }], webhookUrl: "https://x/wh",
    }), { callerClient: agentClient(), supabase: sendSupabase() });
    assertEquals(topo.status, 200);
    assertEquals(fake.calls[1].body, {
      number: "5511999999999", name: "promo", language: "pt_BR",
      components: [{ type: "body", parameters: [] }], webhookUrl: "https://x/wh",
    });
  } finally {
    await fake.stop();
  }
});

for (const [action, body] of [
  ["set-presence", { presence: "available" }],
  ["toggle-ephemeral", { groupJid: "1@g.us", expiration: 0 }],
  ["invite-info", { inviteCode: "abc" }],
] as const) {
  Deno.test(`#2054 ${action} (GO): notSupported com 200, sem I/O no provedor`, async () => {
    const fake = createCapturingFake();
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    Deno.env.set("EVOLUTION_API_FLAVOR", "go");
    try {
      const res = await handleEvolutionApi(controlRequest(action, { instanceName: "PRINCIPAL", ...body }),
        { callerClient: adminClient(), supabase: makeServiceClient() });
      assertEquals(res.status, 200);
      assertEquals((await res.json()).notSupported, true);
      assertEquals(fake.calls.length, 0);
    } finally {
      await fake.stop();
    }
  });
}

Deno.test("#2054 send-template (GO): notSupported com 200, sem I/O no provedor", async () => {
  const fake = createCapturingFake();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  try {
    const res = await handleEvolutionApi(controlRequest("send-template", { instanceName: "PRINCIPAL", number: "5511999999999", template: { name: "x" } }),
      { callerClient: agentClient(), supabase: sendSupabase() });
    assertEquals(res.status, 200);
    assertEquals((await res.json()).notSupported, true);
    assertEquals(fake.calls.length, 0);
  } finally {
    await fake.stop();
  }
});


// Revisão (12/11): o gate de mark-read/mark-unread resolvia o alvo por `number`
// primeiro — um `number` de contato VISÍVEL liberava a `key` de OUTRA conversa.
function supabaseComContatoVisivelSo(digitos: string): any {
  return {
    from: (table: string) => {
      if (table === "whatsapp_connections") return makeQuery({ id: "conn-1" });
      if (table === "contacts") {
        let phone = "";
        const q: any = {
          select: () => q,
          eq: (col: string, val: string) => { if (col === "phone") phone = val; return q; },
          maybeSingle: () => Promise.resolve({ data: phone === digitos ? { id: "contact-visivel" } : null, error: null }),
        };
        return q;
      }
      return makeQuery(null);
    },
    rpc: (fn: string) => fn === "get_instance_token"
      ? Promise.resolve({ data: "vault-instance-token", error: null })
      : Promise.resolve({ data: null, error: null }),
  };
}

for (const action of ["mark-read", "mark-unread"]) {
  Deno.test(`revisão: ${action} com number de contato visível e key de OUTRA conversa → 403, zero chamadas`, async () => {
    const fake = createCapturingFake();
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
    try {
      const res = await handleEvolutionApi(controlRequest(action, {
        instanceName: "PRINCIPAL",
        number: "5511999999999",
        key: { remoteJid: "5521888888888@s.whatsapp.net", fromMe: false, id: "OUTRA" },
      }), { callerClient: agentClient(), supabase: supabaseComContatoVisivelSo("5511999999999") });
      assertEquals(res.status, 403);
      assertEquals(fake.calls.length, 0);
    } finally {
      await fake.stop();
    }
  });

  Deno.test(`revisão: ${action} da própria conversa visível passa e só a key vai ao provedor`, async () => {
    const fake = createCapturingFake();
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
    try {
      const key = { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "M1" };
      const res = await handleEvolutionApi(controlRequest(action, {
        instanceName: "PRINCIPAL", key,
        readMessages: [{ remoteJid: "5521888888888@s.whatsapp.net", fromMe: false, id: "X" }],
      }), { callerClient: agentClient(), supabase: supabaseComContatoVisivelSo("5511999999999") });
      assertEquals(res.status, 200);
      assertEquals(fake.calls.length, 1);
      const enviado = JSON.stringify(fake.calls[0].body);
      assert(!enviado.includes("5521888888888"), `JID de outra conversa vazou: ${enviado}`);
    } finally {
      await fake.stop();
    }
  });
}

// ─── Rotas pendentes do #2054 restauradas por decisão do dono (12/11) ────────
for (const [action, method, path, body, esperado] of [
  ["find-chats", "POST", "/chat/findChats/PRINCIPAL", { where: { archived: false } }, { where: { archived: false } }],
  ["find-templates", "GET", "/template/find/PRINCIPAL", {}, null],
  ["get-catalog", "POST", "/business/getCatalog/PRINCIPAL", { number: "5511999999999", limit: 10 }, { number: "5511999999999", limit: 10 }],
  ["get-collections", "POST", "/business/getCollections/PRINCIPAL", { number: "5511999999999" }, { number: "5511999999999" }],
] as const) {
  Deno.test(`#2054 ${action} (v2, admin): ${method} ${path}`, async () => {
    const fake = createCapturingFake([]);
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
    try {
      const res = await handleEvolutionApi(controlRequest(action, { instanceName: "PRINCIPAL", ...body }),
        { callerClient: adminClient(), supabase: makeServiceClient() });
      assertEquals(res.status, 200);
      assertEquals(fake.calls.map((c) => `${c.method} ${c.path}`), [`${method} ${path}`]);
      if (esperado) assertEquals(fake.calls[0].body, esperado);
    } finally {
      await fake.stop();
    }
  });
}

Deno.test("#2054 create-template / delete-template (v2, admin): repassam o corpo (contrato pré-#2054)", async () => {
  const fake = createCapturingFake();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const criar = await handleEvolutionApi(controlRequest("create-template", {
      instanceName: "PRINCIPAL", name: "boas_vindas", category: "UTILITY", language: "pt_BR",
      components: [{ type: "BODY", text: "Olá {{1}}" }],
    }), { callerClient: adminClient(), supabase: makeServiceClient() });
    assertEquals(criar.status, 200);
    assertEquals(fake.calls[0].method, "POST");
    assertEquals(fake.calls[0].path, "/template/create/PRINCIPAL");
    assertEquals(fake.calls[0].body.name, "boas_vindas");

    const apagar = await handleEvolutionApi(controlRequest("delete-template", { instanceName: "PRINCIPAL", name: "boas_vindas" }),
      { callerClient: adminClient(), supabase: makeServiceClient() });
    assertEquals(apagar.status, 200);
    assertEquals(fake.calls[1].method, "DELETE");
    assertEquals(fake.calls[1].path, "/template/delete/PRINCIPAL");
    assertEquals(fake.calls[1].body.name, "boas_vindas");
  } finally {
    await fake.stop();
  }
});

for (const action of ["find-chats", "create-template", "find-templates", "delete-template", "get-catalog", "get-collections"]) {
  Deno.test(`#2054 ${action} sem papel devolve 403 e não produz I/O`, async () => {
    const fake = createCapturingFake();
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
    try {
      const res = await handleEvolutionApi(controlRequest(action, { instanceName: "PRINCIPAL", number: "5511999999999", name: "x" }),
        { callerClient: makeCallerClient({ isAdminOrSupervisor: false, contactVisible: true }), supabase: sendSupabase() });
      assertEquals(res.status, 403);
      assertEquals(fake.calls.length, 0);
    } finally {
      await fake.stop();
    }
  });
}

Deno.test("#2054 offer-call (v2): agente com contato visível alcança o provedor; sem visibilidade, 403", async () => {
  const fake = createCapturingFake();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const negado = await handleEvolutionApi(controlRequest("offer-call", { instanceName: "PRINCIPAL", number: "5511999999999" }),
      { callerClient: makeCallerClient({ isAdminOrSupervisor: false, contactVisible: false }), supabase: sendSupabase() });
    assertEquals(negado.status, 403);
    assertEquals(fake.calls.length, 0);

    const res = await handleEvolutionApi(controlRequest("offer-call", { instanceName: "PRINCIPAL", number: "5511999999999" }),
      { callerClient: agentClient(), supabase: sendSupabase() });
    assertEquals(res.status, 200);
    assertEquals(fake.calls[0].path, "/call/offer/PRINCIPAL");
    assertEquals(fake.calls[0].body, { number: "5511999999999", isVideo: false, callDuration: 5 });
  } finally {
    await fake.stop();
  }
});

for (const action of ["find-chats", "create-template", "find-templates", "delete-template", "get-catalog", "get-collections", "offer-call"]) {
  Deno.test(`#2054 ${action} (GO): notSupported com 200, sem I/O no provedor`, async () => {
    const fake = createCapturingFake();
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    Deno.env.set("EVOLUTION_API_FLAVOR", "go");
    try {
      const res = await handleEvolutionApi(controlRequest(action, { instanceName: "PRINCIPAL", number: "5511999999999", name: "x" }),
        { callerClient: adminClient(), supabase: sendSupabase() });
      assertEquals(res.status, 200);
      assertEquals((await res.json()).notSupported, true);
      assertEquals(fake.calls.length, 0);
    } finally {
      await fake.stop();
    }
  });
}

for (const callDuration of [0, 61, 3.5, "10"]) {
  Deno.test(`revisão: offer-call com callDuration=${JSON.stringify(callDuration)} é recusado (422) sem I/O`, async () => {
    const fake = createCapturingFake();
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
    try {
      const res = await handleEvolutionApi(controlRequest("offer-call", { instanceName: "PRINCIPAL", number: "5511999999999", callDuration }),
        { callerClient: adminClient(), supabase: sendSupabase() });
      assertEquals(res.status, 422);
      assertEquals(fake.calls.length, 0);
    } finally {
      await fake.stop();
    }
  });
}

Deno.test("revisão: offer-call com callDuration=60 passa e vai a /call/offer", async () => {
  const fake = createCapturingFake();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const res = await handleEvolutionApi(controlRequest("offer-call", { instanceName: "PRINCIPAL", number: "5511999999999", callDuration: 60, isVideo: true }),
      { callerClient: adminClient(), supabase: sendSupabase() });
    assertEquals(res.status, 200);
    assertEquals(fake.calls[0].path, "/call/offer/PRINCIPAL");
    assertEquals(fake.calls[0].body, { number: "5511999999999", isVideo: true, callDuration: 60 });
  } finally {
    await fake.stop();
  }
});

// Console de produção (12/11): `POST evolution-api/find-status-messages → 404`
// ao abrir o ContactDetails. A rota saiu do roteador no #2054 e caía no
// "Unknown action"; o `useWhatsAppStatus` continua chamando.
Deno.test("find-status-messages (v2, admin): lê status@broadcast e devolve o array de registros", async () => {
  const fake = createInstanceReadFake(() => ({ messages: { records: [{ id: "s1", key: { remoteJid: "status@broadcast" } }] } }));
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const res = await handleEvolutionApi(
      controlRequest("find-status-messages", { instanceName: "PRINCIPAL", page: 1, offset: 200 }),
      { callerClient: makeCallerClient({ isAdminOrSupervisor: true }), supabase: makeServiceClient() },
    );
    assertEquals(res.status, 200, "a rota existe: nada de 404 'Unknown action'");
    const json = await res.json();
    assert(Array.isArray(json), "contrato: array de registros");
    assertEquals(json.length, 1);
    assert(
      fake.requests.some((r) => r.method === "POST" && r.path === "/chat/findMessages/PRINCIPAL"),
      "deve consultar /chat/findMessages da instância",
    );
  } finally {
    await fake.stop();
  }
});

Deno.test("find-status-messages (GO): notSupported com 200, sem I/O no provedor", async () => {
  const fake = createInstanceReadFake(() => ({}));
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  try {
    const res = await handleEvolutionApi(
      controlRequest("find-status-messages", { instanceName: "PRINCIPAL" }),
      { callerClient: makeCallerClient({ isAdminOrSupervisor: true }), supabase: makeServiceClient() },
    );
    assertEquals(res.status, 200);
    const json = await res.json();
    assertEquals(json.notSupported, true);
    assert(!fake.requests.some((r) => r.path.startsWith("/chat/findMessages")), "GO não tem findMessages");
  } finally {
    await fake.stop();
  }
});

Deno.test("find-status-messages sem papel devolve 403 (leitura instance-wide)", async () => {
  const fake = createInstanceReadFake(() => ({}));
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const res = await handleEvolutionApi(
      controlRequest("find-status-messages", { instanceName: "PRINCIPAL" }),
      { callerClient: makeCallerClient({ isAdminOrSupervisor: false }), supabase: makeServiceClient() },
    );
    assertEquals(res.status, 403);
    assertEquals(fake.requests.length, 0);
  } finally {
    await fake.stop();
  }
});
