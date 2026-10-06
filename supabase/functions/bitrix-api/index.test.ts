// P2 R2-API-048 (item 222) — "Teste de conexão Bitrix ignora a URL e o domínio
// informados na tela" (auditoria 2026-10-03, reports/providers).
//
// O defeito, do lado da Edge: o handler resolvia o alvo SÓ por
// `BITRIX_WEBHOOK_URL` e devolvia `{success, data, total}` sem dizer QUAL portal
// respondeu; um `webhookUrl`/`domain` digitado na tela era descartado em
// silêncio. Assim a resposta do portal A podia ser apresentada como se fosse o
// portal B recém-informado.
//
// Contrato provado aqui:
//   1. o chamador NÃO escolhe o alvo — a URL do webhook carrega o token do
//      portal (é segredo). Body com `webhookUrl`/`domain` é recusado com 400 e
//      NADA sai para o provedor: a fixture "A configurado + B digitado" não
//      consegue confirmar B com a resposta de A;
//   2. o resultado NOMEIA o portal efetivamente testado (host do webhook
//      configurado), tanto no sucesso quanto no erro do provedor;
//   3. configuração ausente ou inválida NEGA sem tocar no provedor (nada de
//      "conectado" a partir de alvo que não existe).
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//     --allow-net=127.0.0.1 supabase/functions/bitrix-api/index.test.ts

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { handleBitrixApi } from "./index.ts";

const PORTAL_A = "https://portal-a.bitrix24.com.br/rest/1/token-do-portal-a/";
const HOST_A = "portal-a.bitrix24.com.br";
const WEBHOOK_B = "https://portal-b.bitrix24.com.br/rest/1/token-do-portal-b/";

Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key-de-teste");

/* eslint-disable @typescript-eslint/no-explicit-any -- mocks estruturais do
   client Supabase (SupabaseClient é genérico e não é importável no teste). */

function makeCallerClient(permitted = true): any {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "admin-1" } }, error: null }) },
    rpc: (fn: string) => {
      if (fn === "is_admin_or_supervisor") return Promise.resolve({ data: permitted, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  };
}

interface FetchSpy {
  /** URLs que o handler realmente pediu ao provedor (uma por chamada). */
  calls: string[];
  fetchImpl: typeof fetch;
}

function makeFetch(payload: unknown, status = 200): FetchSpy {
  const calls: string[] = [];
  const fetchImpl = ((url: any) => {
    calls.push(String(url));
    return Promise.resolve(
      new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }),
    );
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("https://edge.test/bitrix-api", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer jwt-de-teste" },
    body: JSON.stringify(body),
  });
}

/** Aplica `BITRIX_WEBHOOK_URL` (null = não configurada) e restaura ao fim. */
async function withWebhookUrl(url: string | null, fn: () => Promise<void>): Promise<void> {
  const previous = Deno.env.get("BITRIX_WEBHOOK_URL");
  if (url === null) Deno.env.delete("BITRIX_WEBHOOK_URL");
  else Deno.env.set("BITRIX_WEBHOOK_URL", url);
  try {
    await fn();
  } finally {
    if (previous === undefined) Deno.env.delete("BITRIX_WEBHOOK_URL");
    else Deno.env.set("BITRIX_WEBHOOK_URL", previous);
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

Deno.test("R2-API-048: o resultado nomeia o portal configurado (não o digitado na tela)", async () => {
  await withWebhookUrl(PORTAL_A, async () => {
    const spy = makeFetch({ result: [{ ID: "1", TITLE: "Lead do portal A" }], total: 1 });
    const res = await handleBitrixApi(
      makeRequest({ action: "list", entityType: "lead", filters: { LIMIT: 1 } }),
      { callerClient: makeCallerClient(), fetchImpl: spy.fetchImpl },
    );
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.portal, HOST_A, "o resultado tem de nomear o portal efetivamente testado");
    assertEquals(spy.calls.length, 1, "o teste fala com o provedor uma única vez");
    assertStringIncludes(spy.calls[0], `https://${HOST_A}/rest/1/`);
  });
});

Deno.test("R2-API-048: webhookUrl/domínio digitados na tela não escolhem o alvo (400, sem fetch)", async () => {
  await withWebhookUrl(PORTAL_A, async () => {
    const spy = makeFetch({ result: [{ ID: "1" }], total: 1 });
    const res = await handleBitrixApi(
      makeRequest({
        action: "list",
        entityType: "lead",
        webhookUrl: WEBHOOK_B,
        domain: "portal-b.bitrix24.com.br",
      }),
      { callerClient: makeCallerClient(), fetchImpl: spy.fetchImpl },
    );
    const text = await res.text();

    assertEquals(res.status, 400, "alvo escolhido pelo chamador tem de ser recusado");
    assertEquals(spy.calls.length, 0, "nenhum fetch pode sair com o alvo escolhido pelo chamador");
    assert(!text.includes("portal-b"), "a resposta não pode mencionar o portal digitado na tela");
  });
});

Deno.test("R2-API-048: erro do provedor também nomeia o portal testado", async () => {
  await withWebhookUrl(PORTAL_A, async () => {
    const spy = makeFetch({ error: "NO_CRM_PERMISSION", error_description: "Permissão insuficiente" });
    const res = await handleBitrixApi(
      makeRequest({ action: "list", entityType: "lead" }),
      { callerClient: makeCallerClient(), fetchImpl: spy.fetchImpl },
    );
    const body = await res.json();

    assertEquals(res.status, 400);
    assertEquals(body.portal, HOST_A, "a falha tem de dizer contra qual portal foi");
    assertStringIncludes(String(body.error), "Permissão insuficiente");
    assertEquals(spy.calls.length, 1);
  });
});

Deno.test("R2-API-048: sem BITRIX_WEBHOOK_URL a função nega (400) e não toca no provedor", async () => {
  await withWebhookUrl(null, async () => {
    const spy = makeFetch({ result: [{ ID: "1" }], total: 1 });
    const res = await handleBitrixApi(
      makeRequest({ action: "list", entityType: "lead" }),
      { callerClient: makeCallerClient(), fetchImpl: spy.fetchImpl },
    );
    const body = await res.json();

    assertEquals(res.status, 400);
    assertStringIncludes(String(body.error), "BITRIX_WEBHOOK_URL");
    assertEquals(spy.calls.length, 0, "sem configuração não há provedor a consultar");
  });
});

Deno.test("R2-API-048: BITRIX_WEBHOOK_URL inválida não é testada (nega, sem fetch)", async () => {
  await withWebhookUrl("sem-esquema/rest/1/token/", async () => {
    const spy = makeFetch({ result: [{ ID: "1" }], total: 1 });
    const res = await handleBitrixApi(
      makeRequest({ action: "list", entityType: "lead" }),
      { callerClient: makeCallerClient(), fetchImpl: spy.fetchImpl },
    );

    assertEquals(res.status, 400, "configuração inválida não pode virar 'conectado'");
    assertEquals(spy.calls.length, 0, "URL inválida não pode ser consultada");
  });
});

Deno.test("R2-API-048: agente comum recebe 403 e nenhum fetch sai", async () => {
  await withWebhookUrl(PORTAL_A, async () => {
    const spy = makeFetch({ result: [{ ID: "1" }], total: 1 });
    const res = await handleBitrixApi(
      makeRequest({ action: "list", entityType: "lead" }),
      { callerClient: makeCallerClient(false), fetchImpl: spy.fetchImpl },
    );

    assertEquals(res.status, 403);
    assertEquals(spy.calls.length, 0, "o gate de admin/supervisor vem antes de qualquer I/O");
  });
});
