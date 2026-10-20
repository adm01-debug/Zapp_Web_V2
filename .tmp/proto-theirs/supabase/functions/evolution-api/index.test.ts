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
  assert(actions.size > 100, `sanidade: esperava >100 ações no handler (achou ${actions.size})`);
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
