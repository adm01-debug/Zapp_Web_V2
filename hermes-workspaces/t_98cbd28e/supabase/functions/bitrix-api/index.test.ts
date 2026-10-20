// R2-API-018 — "Bitrix pode devolver sucesso de criação mesmo quando o provedor rejeita".
//
// O Bitrix REST sinaliza rejeição de negócio com HTTP 200 e envelope
// `{ error, error_description }` (e também com 4xx/5xx, muitas vezes com o mesmo
// envelope). Os dois ramos especiais de criação (`push_contact` e
// `create_lead_from_conversation`) faziam o fetch, liam o JSON e devolviam
// `success: true` sem olhar HTTP, envelope ou ID — o front
// (`useBitrixApi.pushContact`/`createLeadFromConversation`) só checa
// `result.success`, então o operador recebia toast "Contato enviado para o
// Bitrix"/"Lead criado a partir da conversa" para um registro que o provedor
// recusou. O `sync_contacts` omitia os erros por item (upsert e contato sem
// telefone) e resumia tudo a uma contagem menor.
//
// O que estes testes travam: (1) só há sucesso com HTTP ok + resposta sem
// envelope de erro + ID devolvido; (2) envelope de erro em 200 e erro em
// 4xx/5xx não produzem `success` (logo, nenhum toast de criação); (3) o sync
// devolve estado parcial explícito por item, com razão sanitizada.
//
// São OFFLINE: nada de Bitrix real. O `globalThis.fetch` é trocado por rotas
// (auth/RPC/PostgREST do Supabase falso + o endpoint do Bitrix que cada teste
// roteiriza) e o handler REAL é chamado com um `Request` — o mesmo que o
// entrypoint usa em produção.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/bitrix-api/index.test.ts

import { handleBitrixApi } from "./index.ts";

const SUPABASE_URL = "https://local.supabase.test";
const ANON_KEY = "anon-test-key";
const BITRIX_URL = "https://portal.bitrix.test/rest/1/test-webhook";
const ADMIN_ID = "00000000-0000-4000-8000-00000000000a";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Route = (url: string, init?: RequestInit) => Response;

/** Roteiriza o Bitrix e (quando o teste precisar) o PostgREST do Supabase falso. */
function installFetch(bitrix: Route, postgrest?: Route) {
  const original = globalThis.fetch;
  const bitrixUrls: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(`${SUPABASE_URL}/auth/v1/user`)) {
      return Promise.resolve(jsonResponse({ id: ADMIN_ID, aud: "authenticated", role: "authenticated" }));
    }
    if (url.includes("/rest/v1/rpc/is_admin_or_supervisor")) {
      return Promise.resolve(jsonResponse(true));
    }
    if (url.startsWith(`${SUPABASE_URL}/rest/v1/`)) {
      if (!postgrest) return Promise.reject(new Error(`PostgREST não roteirizado: ${url}`));
      return Promise.resolve(postgrest(url, init));
    }
    if (url.startsWith(`${BITRIX_URL}/`)) {
      bitrixUrls.push(url);
      return Promise.resolve(bitrix(url, init));
    }
    return Promise.reject(new Error(`fetch não roteirizado: ${url}`));
  }) as typeof fetch;
  return {
    bitrixUrls,
    restore: () => { globalThis.fetch = original; },
  };
}

function configureEnv() {
  Deno.env.set("SUPABASE_URL", SUPABASE_URL);
  Deno.env.set("SUPABASE_ANON_KEY", ANON_KEY);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
  Deno.env.set("BITRIX_WEBHOOK_URL", BITRIX_URL);
}

async function callHandler(body: unknown) {
  const response = await handleBitrixApi(new Request("https://edge.test/bitrix-api", {
    method: "POST",
    headers: { authorization: "Bearer test-jwt", "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  const text = await response.text();
  return { status: response.status, raw: text, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
}

/** Nenhum caminho de recusa pode devolver `success: true` (é o que dispara o toast). */
function assertNoSuccess(label: string, result: { status: number; body: Record<string, unknown> }) {
  if (result.body.success === true) {
    throw new Error(`${label}: provedor recusou e a edge devolveu success=true (status ${result.status})`);
  }
  if (result.status < 400) {
    throw new Error(`${label}: recusa do provedor virou HTTP ${result.status}`);
  }
  if (typeof result.body.error !== "string" || result.body.error.length === 0) {
    throw new Error(`${label}: recusa sem corpo de erro`);
  }
}

configureEnv();

// ─── Envelope de erro em 200 ────────────────────────────────────────────────

Deno.test("R2-API-018: push_contact não declara sucesso quando o Bitrix recusa em 200", async () => {
  const fetchStub = installFetch(() => jsonResponse({
    error: "ERROR_CORE",
    error_description: "Não é possível criar contato duplicado",
  }));
  try {
    const result = await callHandler({ action: "push_contact", data: { name: "Ana", phone: "+55 11 90000-0000" } });
    assertNoSuccess("push_contact 200+erro", result);
    if (result.status !== 400) throw new Error(`esperava 400, veio ${result.status}`);
    if (!String(result.body.error).includes("duplicado")) throw new Error("mensagem do provedor não foi propagada");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("R2-API-018: create_lead_from_conversation não declara sucesso quando o Bitrix recusa em 200", async () => {
  const fetchStub = installFetch(() => jsonResponse({
    error: "INVALID_ARG",
    error_description: "Campo TITLE obrigatório",
  }));
  try {
    const result = await callHandler({
      action: "create_lead_from_conversation",
      data: { title: "", contactName: "Ana", phone: "+55 11 90000-0000" },
    });
    assertNoSuccess("create_lead_from_conversation 200+erro", result);
    if (result.status !== 400) throw new Error(`esperava 400, veio ${result.status}`);
  } finally {
    fetchStub.restore();
  }
});

// ─── Erro em 4xx/5xx ───────────────────────────────────────────────────────

Deno.test("R2-API-018: erro HTTP do Bitrix não vira sucesso em nenhuma das criações especiais", async () => {
  const fetchStub = installFetch(() => jsonResponse({
    error: "INSUFFICIENT_RIGHTS",
    error_description: "Acesso negado",
  }, 403));
  try {
    const contact = await callHandler({ action: "push_contact", data: { name: "Ana" } });
    assertNoSuccess("push_contact 403", contact);
    if (contact.status < 500) throw new Error(`falha de upstream deve virar 5xx, veio ${contact.status}`);
    if (contact.raw.includes("INSUFFICIENT_RIGHTS")) throw new Error("detalhe do provedor vazou no 5xx");

    const lead = await callHandler({ action: "create_lead_from_conversation", data: { contactName: "Ana" } });
    assertNoSuccess("create_lead_from_conversation 403", lead);
    if (lead.status < 500) throw new Error(`falha de upstream deve virar 5xx, veio ${lead.status}`);
  } finally {
    fetchStub.restore();
  }
});

// ─── Sem ID não é sucesso ──────────────────────────────────────────────────

Deno.test("R2-API-018: 200 sem ID (envelope vazio, proxy/portal) não é sucesso de criação", async () => {
  const fetchStub = installFetch(() => jsonResponse({}));
  try {
    const contact = await callHandler({ action: "push_contact", data: { name: "Ana" } });
    assertNoSuccess("push_contact sem ID", contact);

    const lead = await callHandler({ action: "create_lead_from_conversation", data: { contactName: "Ana" } });
    assertNoSuccess("create_lead_from_conversation sem ID", lead);

    const generic = await callHandler({ action: "create", entityType: "lead", data: { TITLE: "Lead" } });
    assertNoSuccess("create genérico sem ID", generic);
  } finally {
    fetchStub.restore();
  }
});

// ─── Caminho feliz continua funcionando ────────────────────────────────────

Deno.test("R2-API-018: com ID devolvido pelo Bitrix, as criações seguem devolvendo sucesso", async () => {
  const fetchStub = installFetch((url) => jsonResponse({ result: url.endsWith("/crm.contact.add") ? 701 : 702 }));
  try {
    const contact = await callHandler({ action: "push_contact", data: { name: "Ana" } });
    if (contact.status !== 200 || contact.body.success !== true || contact.body.bitrixId !== 701) {
      throw new Error(`push_contact: ${contact.status} ${contact.raw}`);
    }
    const lead = await callHandler({ action: "create_lead_from_conversation", data: { contactName: "Ana" } });
    if (lead.status !== 200 || lead.body.success !== true || lead.body.leadId !== 702) {
      throw new Error(`create_lead_from_conversation: ${lead.status} ${lead.raw}`);
    }
    const generic = await callHandler({ action: "create", entityType: "lead", data: { TITLE: "Lead" } });
    if (generic.status !== 200 || generic.body.success !== true || generic.body.data !== 702) {
      throw new Error(`create genérico: ${generic.status} ${generic.raw}`);
    }
  } finally {
    fetchStub.restore();
  }
});

// ─── Resposta ilegível e caminho genérico preservado ───────────────────────

Deno.test("R2-API-018: resposta não-JSON do Bitrix não vira sucesso", async () => {
  const fetchStub = installFetch(() => new Response("<html>portal errado</html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  }));
  try {
    const result = await callHandler({ action: "push_contact", data: { name: "Ana" } });
    assertNoSuccess("push_contact corpo ilegivel", result);
    if (result.status < 500) throw new Error(`corpo ilegivel deve falhar fechado (5xx), veio ${result.status}`);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("R2-API-018: leitura (list) segue devolvendo data/total do Bitrix", async () => {
  const fetchStub = installFetch(() => jsonResponse({ result: [{ ID: 1 }], total: 1 }));
  try {
    const result = await callHandler({ action: "list", entityType: "lead" });
    if (result.status !== 200 || result.body.success !== true) throw new Error(`list: ${result.status} ${result.raw}`);
    if (result.body.total !== 1) throw new Error(`total do Bitrix não foi preservado: ${result.raw}`);
    if (!Array.isArray(result.body.data)) throw new Error(`result do Bitrix não foi preservado: ${result.raw}`);
  } finally {
    fetchStub.restore();
  }
});

// ─── sync_contacts: estado parcial explícito, por item ─────────────────────

const OK_PHONE = "5511911111111";
const DUPLICATE_PHONE = "5511922222222";

Deno.test("R2-API-018: sync_contacts expõe as falhas por item e não declara sucesso parcial como completo", async () => {
  const fetchStub = installFetch(
    () => jsonResponse({
      result: [
        { ID: 11, NAME: "Ana", PHONE: [{ VALUE: "+55 11 91111-1111" }] },
        { ID: 12, NAME: "Bia", PHONE: [{ VALUE: "+55 11 92222-2222" }] },
        { ID: 13, NAME: "Sem fone" },
      ],
    }),
    (_url, init) => {
      const payload = JSON.parse(String(init?.body ?? "{}")) as { phone?: string };
      if (payload.phone === DUPLICATE_PHONE) {
        return jsonResponse({ code: "23505", message: "duplicate key value violates unique constraint contacts_phone_key" }, 409);
      }
      return jsonResponse({ id: `row-${payload.phone}`, phone: payload.phone, name: "Ana" }, 201);
    },
  );
  try {
    const result = await callHandler({ action: "sync_contacts" });
    if (result.status !== 200 || result.body.success !== true) throw new Error(`sync falhou: ${result.status} ${result.raw}`);
    if (result.body.total !== 3) throw new Error(`total deveria ser 3, veio ${result.body.total}`);
    if (result.body.synced !== 1) throw new Error(`synced deveria ser 1, veio ${result.body.synced}`);
    if (result.body.failed !== 2) throw new Error(`failed deveria ser 2, veio ${result.body.failed}`);

    const failures = result.body.failures as Array<{ id: unknown; reason: string }>;
    if (!Array.isArray(failures) || failures.length !== 2) throw new Error(`failures ausente/curto: ${result.raw}`);
    const reasons = failures.map((f) => f.reason).sort();
    if (reasons.join(",") !== "missing_phone,upsert_failed") throw new Error(`razões inesperadas: ${reasons.join(",")}`);
    if (String((failures.find((f) => f.reason === "missing_phone") ?? {}).id) !== "13") {
      throw new Error("falha por item não identifica o contato do Bitrix");
    }
    if (result.raw.includes("duplicate key")) throw new Error("erro cru do banco vazou no corpo");
    if (fetchStub.bitrixUrls.length !== 1 || !fetchStub.bitrixUrls[0].endsWith("/crm.contact.list")) {
      throw new Error(`sync chamou endpoints inesperados: ${fetchStub.bitrixUrls.join(",")}`);
    }
  } finally {
    fetchStub.restore();
  }
});

Deno.test("R2-API-018: sync_contacts com erro do Bitrix não devolve sucesso", async () => {
  const fetchStub = installFetch(() => jsonResponse({
    error: "INVALID_CREDENTIALS",
    error_description: "Webhook inválido",
  }));
  try {
    const result = await callHandler({ action: "sync_contacts" });
    assertNoSuccess("sync_contacts com erro do provedor", result);
  } finally {
    fetchStub.restore();
  }
});
