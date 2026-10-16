import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleEvolutionApi, isInstanceGonePayload } from "./index.ts";
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

// ─── SL-075 E43: ações sem equivalente na Evolution GO ──────────────────────
// Lista gerada por script (ação × translateV2ToGo → null), não por heurística.
const REMOVED_GOLESS_ACTIONS = [
  // integrações do painel removidas na E43
  "set-chatwoot", "get-chatwoot", "delete-chatwoot",
  "set-typebot", "get-typebot", "delete-typebot",
  "typebot-sessions", "typebot-change-status", "start-typebot",
  "set-openai", "get-openai", "delete-openai",
  "set-dify", "get-dify", "delete-dify",
  "set-flowise", "get-flowise", "delete-flowise",
  "set-evolution-bot", "get-evolution-bot", "delete-evolution-bot",
  // infra/eventos e demais rotas v2 sem equivalente GO
  "set-rabbitmq", "get-rabbitmq", "set-sqs", "get-sqs",
  "create-template", "find-templates", "delete-template",
  "set-evoai", "get-evoai", "delete-evoai",
  "set-n8n", "get-n8n", "delete-n8n",
  "set-kafka", "get-kafka", "set-nats", "get-nats", "set-pusher", "get-pusher",
  "set-proxy", "get-proxy", "get-catalog", "get-collections", "offer-call",
  "set-presence", "set-settings", "get-settings", "get-webhook",
  "send-template", "mark-unread",
  "find-chats", "find-messages", "find-status-messages",
  "invite-info", "toggle-ephemeral",
];
for (const action of REMOVED_GOLESS_ACTIONS) {
  Deno.test(`E43: '${action}' (sem equivalente GO) cai em 'Unknown action' 404 sem I/O no provedor`, async () => {
    const fake = createFakeEvolution();
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    try {
      const res = await handleEvolutionApi(
        controlRequest(action, { instanceName: "PRINCIPAL" }),
        {
          callerClient: makeCallerClient({ isAdminOrSupervisor: true }),
          supabase: makeServiceClient(),
        },
      );
      const json = await res.json();
      assertEquals(res.status, 404, `'${action}' deve cair no 'Unknown action' do handler (veio ${res.status})`);
      assertEquals(json?.error, "Unknown action");
      assertEquals(fake.posts.length, 0, `'${action}' não pode produzir I/O no provedor`);
    } finally {
      await fake.stop();
    }
  });
}

// E43: ação removida que era 'read' nega agente sem papel (deny-by-default)
Deno.test("E43: ação removida que era 'read' nega agente sem papel (deny-by-default)", async () => {
  const fake = createFakeEvolution();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  try {
    const res = await handleEvolutionApi(
      controlRequest("get-settings", { instanceName: "PRINCIPAL" }),
      {
        callerClient: makeCallerClient({ isAdminOrSupervisor: false }),
        supabase: makeServiceClient(),
      },
    );
    assertEquals(res.status, 403, "leitura removida deve negar agente pelo classifyEvolutionAction");
    assertEquals(fake.posts.length, 0);
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

// ─── SL-075 E43: ações sem equivalente na Evolution GO ──────────────────────
// Lista gerada por script (ação × translateV2ToGo → null), não por heurística.
const REMOVED_GOLESS_ACTIONS = [
  // integrações do painel removidas na E43
  "set-chatwoot", "get-chatwoot", "delete-chatwoot",
  "set-typebot", "get-typebot", "delete-typebot",
  "typebot-sessions", "typebot-change-status", "start-typebot",
  "set-openai", "get-openai", "delete-openai",
  "set-dify", "get-dify", "delete-dify",
  "set-flowise", "get-flowise", "delete-flowise",
  "set-evolution-bot", "get-evolution-bot", "delete-evolution-bot",
  // infra/eventos e demais rotas v2 sem equivalente GO
  "set-rabbitmq", "get-rabbitmq", "set-sqs", "get-sqs",
  "create-template", "find-templates", "delete-template",
  "set-evoai", "get-evoai", "delete-evoai",
  "set-n8n", "get-n8n", "delete-n8n",
  "set-kafka", "get-kafka", "set-nats", "get-nats", "set-pusher", "get-pusher",
  "set-proxy", "get-proxy", "get-catalog", "get-collections", "offer-call",
  "set-presence", "set-settings", "get-settings", "get-webhook",
  "send-template", "mark-unread",
  "find-chats", "find-messages", "find-status-messages",
  "invite-info", "toggle-ephemeral",
];
for (const action of REMOVED_GOLESS_ACTIONS) {
  Deno.test(`E43: '${action}' (sem equivalente GO) cai em 'Unknown action' 404 sem I/O no provedor`, async () => {
    const fake = createFakeEvolution();
    Deno.env.set("EVOLUTION_API_URL", fake.url);
    try {
      const res = await handleEvolutionApi(
        controlRequest(action, { instanceName: "PRINCIPAL" }),
        {
          callerClient: makeCallerClient({ isAdminOrSupervisor: true }),
          supabase: makeServiceClient(),
        },
      );
      const json = await res.json();
      assertEquals(res.status, 404, `'${action}' deve cair no 'Unknown action' do handler (veio ${res.status})`);
      assertEquals(json?.error, "Unknown action");
      assertEquals(fake.posts.length, 0, `'${action}' não pode produzir I/O no provedor`);
    } finally {
      await fake.stop();
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

// E43: ação removida que era 'read' nega agente sem papel (deny-by-default)
Deno.test("E43: ação removida que era 'read' nega agente sem papel (deny-by-default)", async () => {
  const fake = createFakeEvolution();
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  try {
    const res = await handleEvolutionApi(
      controlRequest("get-settings", { instanceName: "PRINCIPAL" }),
      {
        callerClient: makeCallerClient({ isAdminOrSupervisor: false }),
        supabase: makeServiceClient(),
      },
    );
    assertEquals(res.status, 403, "leitura removida deve negar agente pelo classifyEvolutionAction");
    assertEquals(fake.posts.length, 0);

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

// ═══ B2 (12/10/2026): ciclo de sessão robusto, telefone validado e INSTANCE_GONE ═══
// RED: (1) connect/status/disconnect faziam fetch DIRETO ao provedor, sem `signal` e
// sem catch — provedor pendurado segurava a função até o limite da plataforma e o
// operador recebia 500 cru; (2) delete-instance devolvia 404 quando a instância já
// não existia na Evolution GO, e o front abortava: a conexão fantasma ficava presa na
// lista sem poder ser excluída; (3) create-connection gravava o telefone cru do
// formulário em `phone_number` e aceitava o nome da instância cru no path/query.
// GREEN: timeout tratado como falha de provedor (200 { error:true, status:0 });
// INSTANCE_GONE apaga a linha local e reconcilia; telefone validado/normalizado
// (DDI 55 + nono dígito) antes do INSERT e nome de instância travado por conjunto de
// caracteres (422 no schema).

/** Cliente service-role que REGISTRA o que o handler fez no banco (insert/delete) —
 *  sem isso não há como provar a remoção da linha local fantasma nem o valor que foi
 *  para `phone_number`. `global_settings` devolve 'true' (multi-conexão ligada e
 *  manutenção ausente) e o INSERT de `whatsapp_connections` devolve a linha, como o
 *  PostgREST faria. */
function makeServiceRecorder(): {
  client: any;
  inserts: Array<{ table: string; values: Record<string, unknown> }>;
  deletes: Array<{ table: string }>;
} {
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  const deletes: Array<{ table: string }> = [];
  let lastInserted: Record<string, unknown> | null = null;
  const chainFor = (table: string): any => {
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
      update: () => q,
      upsert: () => q,
      insert: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        lastInserted = { id: `row-${table}`, ...values };
        return q;
      },
      delete: () => {
        deletes.push({ table });
        return q;
      },
      maybeSingle: () => Promise.resolve({ data: table === "global_settings" ? { value: "true" } : null, error: null }),
      single: () => Promise.resolve({ data: table === "whatsapp_connections" ? lastInserted : null, error: null }),
    };
    return q;
  };
  return {
    client: {
      from: (table: string) => chainFor(table),
      rpc: (fn: string) => Promise.resolve({
        data: fn === "get_instance_token" ? "vault-instance-token" : null,
        error: null,
      }),
    },
    inserts,
    deletes,
  };
}

/** Caller client com papel e id escolhidos por quem chama — o teto do ciclo de sessão
 *  é por usuário, então o teste do 429 precisa de um usuário só dele. */
function makeCallerWithRole(isAdminOrSupervisor: boolean, userId: string): any {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: userId } }, error: null }) },
    rpc: (fn: string) => Promise.resolve({
      data: fn === "is_admin_or_supervisor" ? isAdminOrSupervisor : null,
      error: null,
    }),
  };
}

/** Evolution fake que REGISTRA método + path + corpo (é o que prova "não tocou o
 *  provedor") e responde o mínimo do ciclo de sessão. `instances` alimenta
 *  GET /instance/all (o mapa nome→id da GO). */
function createSessionFake(instances: string[] = []) {
  const requests: Array<{ method: string; path: string; body: Record<string, unknown> | null }> = [];
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    const path = new URL(req.url).pathname;
    let body: Record<string, unknown> | null = null;
    try {
      body = JSON.parse(await req.text());
    } catch {
      body = null;
    }
    requests.push({ method: req.method, path, body });
    const json = (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
    if (path === "/instance/all") {
      return json({ data: instances.map((name, i) => ({ name, id: `go-instance-${i}` })) });
    }
    if (path === "/instance/fetchInstances") return json([]);
    return json({ status: "success" });
  });
  const addr = server.addr;
  if (addr.transport !== "tcp") throw new Error("session-fake: esperava listener TCP");
  return { url: `http://127.0.0.1:${addr.port}`, requests, stop: () => server.shutdown() };
}

Deno.test("B2-01: connect pendurado devolve erro amigável (status 0) em vez de 500 cru", async () => {
  // O fake segura a resposta do POST /instance/connect além do nosso timeout — é o
  // cenário exato do incidente (provedor pendurado).
  const fake = createFakeEvolution({ mode: "timeout", timeoutDelayMs: 400 });
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  Deno.env.set("EVOLUTION_SESSION_TIMEOUT_MS", "60");
  try {
    const svc = makeServiceRecorder();
    const res = await handleEvolutionApi(
      controlRequest("connect", { instanceName: "PRINCIPAL" }),
      { callerClient: makeCallerWithRole(true, "b2-admin-1"), supabase: svc.client },
    );
    assertEquals(res.status, 200, "falha de rede/timeout não pode virar 500 cru");
    const json = await res.json();
    assertEquals(json?.error, true);
    assertEquals(json?.status, 0, "status 0 marca falha de rede/timeout, não erro do provedor");
    assert(typeof json?.message === "string" && json.message.length > 0, "precisa de mensagem amigável");
  } finally {
    Deno.env.delete("EVOLUTION_SESSION_TIMEOUT_MS");
    Deno.env.delete("EVOLUTION_API_FLAVOR");
    await fake.stop();
  }
});

Deno.test("B2-02: status com a Evolution inalcançável devolve erro amigável (status 0), não 500", async () => {
  // Porta fechada: o fetch lança imediatamente — mesmo ramo de catch do timeout.
  Deno.env.set("EVOLUTION_API_URL", "http://127.0.0.1:1");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const svc = makeServiceRecorder();
    const res = await handleEvolutionApi(
      controlRequest("status", { instanceName: "PRINCIPAL" }),
      { callerClient: makeCallerWithRole(true, "b2-admin-2"), supabase: svc.client },
    );
    assertEquals(res.status, 200, "queda de rede não pode virar 500 cru");
    const json = await res.json();
    assertEquals(json?.error, true);
    assertEquals(json?.status, 0);
    assert(typeof json?.message === "string" && json.message.length > 0);
  } finally {
    Deno.env.delete("EVOLUTION_API_FLAVOR");
  }
});

Deno.test("B2-03: delete-instance com instância ausente na GO devolve INSTANCE_GONE e apaga a linha local", async () => {
  // /instance/all responde vazio ⇒ a instância não existe mais na GO.
  const fake = createSessionFake([]);
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  try {
    const svc = makeServiceRecorder();
    const res = await handleEvolutionApi(
      controlRequest("delete-instance", { instanceName: "CX0ADMIN" }),
      { callerClient: makeCallerWithRole(true, "b2-admin-3"), supabase: svc.client },
    );
    assertEquals(res.status, 200);
    const json = await res.json();
    assertEquals(json?.error, true);
    assertEquals(json?.code, "INSTANCE_GONE", "estado a reconciliar, não 404 de erro");
    assert(
      svc.deletes.some((d) => d.table === "whatsapp_connections"),
      "deve apagar a linha local fantasma",
    );
    assertEquals(fake.requests.length, 1, "sem id na GO não pode existir delete no provedor");
    assertEquals(fake.requests[0].path, "/instance/all");
  } finally {
    Deno.env.delete("EVOLUTION_API_FLAVOR");
    await fake.stop();
  }
});

/** Fake que TEM a instância em /instance/all mas responde 404 no delete (ela sumiu
 *  entre a listagem e o delete). */
function createGoneOnDeleteFake(instanceName: string) {
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, (req) => {
    const path = new URL(req.url).pathname;
    const json = (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
    if (path === "/instance/all") return json({ data: [{ name: instanceName, id: "go-instance-1" }] });
    if (path.startsWith("/instance/delete/")) return json({ message: "Instance not found" }, 404);
    return json({ status: "success" });
  });
  const addr = server.addr;
  if (addr.transport !== "tcp") throw new Error("gone-on-delete-fake: esperava listener TCP");
  return { url: `http://127.0.0.1:${addr.port}`, stop: () => server.shutdown() };
}

Deno.test("B2-04: delete-instance quando o provedor responde 404 também reconcilia (INSTANCE_GONE)", async () => {
  const fake = createGoneOnDeleteFake("CX0ADMIN");
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  try {
    const svc = makeServiceRecorder();
    const res = await handleEvolutionApi(
      controlRequest("delete-instance", { instanceName: "CX0ADMIN" }),
      { callerClient: makeCallerWithRole(true, "b2-admin-4"), supabase: svc.client },
    );
    assertEquals(res.status, 200);
    const json = await res.json();
    assertEquals(json?.code, "INSTANCE_GONE");
    assert(svc.deletes.some((d) => d.table === "whatsapp_connections"), "deve apagar a linha local");
  } finally {
    Deno.env.delete("EVOLUTION_API_FLAVOR");
    await fake.stop();
  }
});

Deno.test("B2-07: isInstanceGonePayload só reconhece ausência (404/mensagem), não erro comum", () => {
  assert(isInstanceGonePayload({ error: true, status: 404 }));
  assert(isInstanceGonePayload({ error: true, message: "Instance not found" }));
  assert(isInstanceGonePayload({ error: true, message: "Instância não encontrada" }));
  assertEquals(isInstanceGonePayload({ error: true, status: 500, message: "boom" }), false);
  assertEquals(isInstanceGonePayload({ status: "success" }), false);
});

Deno.test("B2-05: create-connection recusa telefone inválido com 422 e NÃO toca o provedor", async () => {
  const fake = createSessionFake(["principal"]);
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const svc = makeServiceRecorder();
    const res = await handleEvolutionApi(
      controlRequest("create-connection", { instanceName: "principal", name: "principal", phone_number: "1199" }),
      { callerClient: makeCallerWithRole(true, "b2-admin-5"), supabase: svc.client },
    );
    assertEquals(res.status, 422);
    const json = await res.json();
    assertEquals(json?.error?.code, "VALIDATION_ERROR");
    assertEquals(fake.requests.length, 0, "telefone inválido não pode chegar ao provedor");
    assertEquals(svc.inserts.length, 0, "não pode inserir a linha da conexão");
  } finally {
    Deno.env.delete("EVOLUTION_API_FLAVOR");
    await fake.stop();
  }
});

Deno.test("B2-05b: create-connection normaliza o telefone (DDI 55 + nono dígito) antes do INSERT", async () => {
  const fake = createSessionFake(["principal"]);
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const svc = makeServiceRecorder();
    const res = await handleEvolutionApi(
      controlRequest("create-connection", { instanceName: "principal", name: "principal", phone_number: "+55 (11) 8765-4321" }),
      { callerClient: makeCallerWithRole(true, "b2-admin-6"), supabase: svc.client },
    );
    assertEquals(res.status, 200);
    const row = svc.inserts.find((i) => i.table === "whatsapp_connections");
    assert(row, "deve inserir a linha da conexão");
    assertEquals(row!.values.phone_number, "5511987654321", "DDD 11 + nono dígito + DDI 55, só-dígitos");
    const createCall = fake.requests.find((r) => r.path === "/instance/create");
    assert(createCall, "o create da instância precisa ter chegado ao provedor");
    assertEquals(createCall!.body?.number, "5511987654321", "o provedor recebe o número normalizado, nunca o cru");
  } finally {
    Deno.env.delete("EVOLUTION_API_FLAVOR");
    await fake.stop();
  }
});

Deno.test("B2-06: nome de instância fora do conjunto seguro é recusado pelo schema; o válido passa", () => {
  assertEquals(
    EvolutionApiRequestSchema.safeParse({ action: "status", instanceName: "../../instance/all" }).success,
    false,
  );
  assertEquals(
    EvolutionApiRequestSchema.safeParse({ action: "status", instanceName: "PRINCIPAL-1_x" }).success,
    true,
  );
});

Deno.test("B2-06b: list-instances com instanceName de injeção devolve 422 e não chama o provedor", async () => {
  const fake = createSessionFake(["PRINCIPAL"]);
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const res = await handleEvolutionApi(
      controlRequest("list-instances", { instanceName: "../../instance/all" }),
      { callerClient: makeCallerWithRole(true, "b2-admin-7"), supabase: makeServiceRecorder().client },
    );
    assertEquals(res.status, 422);
    assertEquals(fake.requests.length, 0, "nome de injeção não pode virar path no provedor");
  } finally {
    Deno.env.delete("EVOLUTION_API_FLAVOR");
    await fake.stop();
  }
});

Deno.test("B2-08: teto por usuário corta o abuso do ciclo de sessão (429) sem tocar o provedor", async () => {
  const fake = createSessionFake(["PRINCIPAL"]);
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const svc = makeServiceRecorder();
    let saw429 = false;
    let requestsAt429 = 0;
    for (let i = 0; i < 15; i++) {
      const res = await handleEvolutionApi(
        controlRequest("disconnect", { instanceName: "PRINCIPAL" }),
        { callerClient: makeCallerWithRole(true, "b2-rate-limit-user"), supabase: svc.client },
      );
      if (res.status === 429) {
        saw429 = true;
        requestsAt429 = fake.requests.length;
        const json = await res.json();
        assert(typeof json?.message === "string" && json.message.length > 0, "429 precisa de mensagem amigável");
        break;
      }
    }
    assert(saw429, "o 11º disconnect do mesmo usuário deve ser cortado com 429");
    // E o corte acontece ANTES do provedor: depois do 429, nada novo chega à Evolution.
    const res = await handleEvolutionApi(
      controlRequest("disconnect", { instanceName: "PRINCIPAL" }),
      { callerClient: makeCallerWithRole(true, "b2-rate-limit-user"), supabase: svc.client },
    );
    assertEquals(res.status, 429);
    assertEquals(fake.requests.length, requestsAt429, "429 não pode produzir I/O no provedor");
  } finally {
    Deno.env.delete("EVOLUTION_API_FLAVOR");
    await fake.stop();
  }
});
