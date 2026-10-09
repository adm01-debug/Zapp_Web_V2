import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleEvolutionApi } from "./index.ts";
import { EvolutionApiRequestSchema } from "../_shared/schemas.ts";
import { createFakeEvolution } from "../_shared/__tests__/fake-evolution.ts";

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

function makeServiceClient(): any {
  return { from: () => makeQuery(), rpc: () => Promise.resolve({ data: null, error: null }) };
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
