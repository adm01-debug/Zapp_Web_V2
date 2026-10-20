// SEC-EDGE_FUNCTIONS-02 (P0) — docs/audits/SEGURANCA_EDGE_FUNCTIONS_2026-10-07.md
//
// O ramo de LEITURA do external-db-proxy montava a query no Postgres EXTERNO
// (evolution_contacts / evolution_messages / media_quarantine) com a credencial
// do servidor sem exigir papel nenhum: qualquer usuário autenticado (papel
// `agent`) recebia mensagens de WhatsApp de contatos que não enxerga no app —
// a RLS local nunca entra nessa query, que vai ao banco da VPS Evolution. O
// ramo de `update` já exigia `is_admin_or_supervisor`; a leitura, não.
//
// Estes testes chamam o handler REAL com um `Request` e o `globalThis.fetch`
// trocado por rotas (GoTrue + PostgREST do Supabase canônico e PostgREST do
// banco externo roteirizado pelo teste) — nada de rede, nada de produção.
//
// O que fica travado: (1) leitura sem papel → 403 e NENHUMA consulta ao banco
// externo, nas três tabelas; (2) admin/supervisor lê como antes; (3) falha do
// RPC de papel nega (fecha); (4) o ramo de `update` não mudou — validação
// (400) antes do papel (403) e admin atualiza como antes.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/external-db-proxy/index.test.ts

import { handleExternalDbProxy } from "./index.ts";

const SUPABASE_URL = "https://local.supabase.test";
const ANON_KEY = "anon-test-key";
const EXTERNAL_URL = "https://vps-evolution.test";
const EXTERNAL_KEY = "external-anon-test-key";
const USER_ID = "00000000-0000-4000-8000-00000000000a";

const READ_TABLES = ["evolution_contacts", "evolution_messages", "media_quarantine"];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Route = (url: string, init?: RequestInit) => Response;

/**
 * Roteiriza o Supabase canônico (GoTrue + RPC de papel) e o banco externo.
 * `role` é a resposta do RPC `is_admin_or_supervisor`; `external` responde as
 * consultas ao Postgres da VPS (leitura e update).
 */
function installFetch(role: Route, external: Route) {
  const original = globalThis.fetch;
  const externalUrls: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(`${SUPABASE_URL}/auth/v1/user`)) {
      return Promise.resolve(jsonResponse({ id: USER_ID, aud: "authenticated", role: "authenticated" }));
    }
    if (url.startsWith(`${SUPABASE_URL}/rest/v1/rpc/is_admin_or_supervisor`)) {
      return Promise.resolve(role(url, init));
    }
    if (url.startsWith(`${EXTERNAL_URL}/rest/v1/`)) {
      externalUrls.push(url);
      return Promise.resolve(external(url, init));
    }
    return Promise.reject(new Error(`fetch não roteirizado: ${url}`));
  }) as typeof fetch;
  return {
    externalUrls,
    restore: () => { globalThis.fetch = original; },
  };
}

function configureEnv() {
  Deno.env.set("SUPABASE_URL", SUPABASE_URL);
  Deno.env.set("SUPABASE_ANON_KEY", ANON_KEY);
  Deno.env.set("EVOLUTION_VPS_SUPABASE_URL", EXTERNAL_URL);
  Deno.env.set("EVOLUTION_VPS_SUPABASE_ANON_KEY", EXTERNAL_KEY);
}

async function callHandler(body: unknown) {
  const response = await handleExternalDbProxy(new Request("https://edge.test/external-db-proxy", {
    method: "POST",
    headers: { authorization: "Bearer test-jwt", "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  const text = await response.text();
  return { status: response.status, raw: text, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
}

configureEnv();

// ─── Leitura exige papel (o defeito) ───────────────────────────────────────

Deno.test("SEC-EDGE_FUNCTIONS-02: usuário sem papel não lê nenhuma das 3 tabelas e não toca o banco externo", async () => {
  const stub = installFetch(
    () => jsonResponse(false),
    () => jsonResponse([{ id: "vazamento" }]),
  );
  try {
    for (const table of READ_TABLES) {
      const result = await callHandler({ table, select: "*", limit: 500 });
      if (result.status !== 403) {
        throw new Error(`${table}: leitura sem papel devia ser 403, veio ${result.status}: ${result.raw}`);
      }
      if (result.body.error !== "Forbidden") {
        throw new Error(`${table}: corpo inesperado: ${result.raw}`);
      }
    }
    if (stub.externalUrls.length !== 0) {
      throw new Error(`consulta ao banco externo sem papel: ${stub.externalUrls.join(", ")}`);
    }
  } finally {
    stub.restore();
  }
});

Deno.test("SEC-EDGE_FUNCTIONS-02: papel que não resolve (RPC falhando) nega a leitura", async () => {
  const stub = installFetch(
    () => jsonResponse({ message: "rpc indisponível" }, 500),
    () => jsonResponse([{ id: "vazamento" }]),
  );
  try {
    const result = await callHandler({ table: "evolution_messages", select: "*" });
    if (result.status !== 403) {
      throw new Error(`falha do RPC devia negar (403), veio ${result.status}: ${result.raw}`);
    }
    if (stub.externalUrls.length !== 0) {
      throw new Error(`consulta ao banco externo com papel indeterminado: ${stub.externalUrls.join(", ")}`);
    }
  } finally {
    stub.restore();
  }
});

// ─── Admin/supervisor lê como antes ────────────────────────────────────────

Deno.test("SEC-EDGE_FUNCTIONS-02: admin lê evolution_messages como antes", async () => {
  const rows = [{ id: "m1", remote_jid: "5511999999999@s.whatsapp.net" }];
  const stub = installFetch(
    () => jsonResponse(true),
    () => jsonResponse(rows),
  );
  try {
    const result = await callHandler({
      table: "evolution_messages",
      select: "*",
      order: { column: "created_at", ascending: false },
      limit: 500,
    });
    if (result.status !== 200) throw new Error(`admin devia ler (200), veio ${result.status}: ${result.raw}`);
    if (!Array.isArray(result.body.data) || (result.body.data as unknown[]).length !== rows.length) {
      throw new Error(`admin não recebeu as linhas: ${result.raw}`);
    }
    if (stub.externalUrls.length !== 1 || !stub.externalUrls[0].includes("/rest/v1/evolution_messages")) {
      throw new Error(`consulta externa inesperada: ${stub.externalUrls.join(", ")}`);
    }
    if (!stub.externalUrls[0].includes("limit=500")) {
      throw new Error(`limite pedido não chegou ao banco externo: ${stub.externalUrls[0]}`);
    }
  } finally {
    stub.restore();
  }
});

Deno.test("SEC-EDGE_FUNCTIONS-02: supervisor lê media_quarantine com filtro/projeção como antes", async () => {
  const rows = [{ id: "q1", decision: "pending" }];
  const stub = installFetch(
    () => jsonResponse(true),
    () => jsonResponse(rows),
  );
  try {
    const result = await callHandler({
      table: "media_quarantine",
      select: "id,decision,threat_name",
      filters: [{ column: "decision", operator: "eq", value: "pending" }],
      limit: 200,
    });
    if (result.status !== 200) throw new Error(`supervisor devia ler (200), veio ${result.status}: ${result.raw}`);
    if (!Array.isArray(result.body.data) || (result.body.data as unknown[]).length !== rows.length) {
      throw new Error(`supervisor não recebeu as linhas: ${result.raw}`);
    }
    const url = stub.externalUrls[0] ?? "";
    if (!url.includes("select=id%2Cdecision%2Cthreat_name") || !url.includes("decision=eq.pending")) {
      throw new Error(`projeção/filtro pedidos não chegaram ao banco externo: ${url}`);
    }
  } finally {
    stub.restore();
  }
});

// ─── O ramo de update não mudou ────────────────────────────────────────────

Deno.test("SEC-EDGE_FUNCTIONS-02: update continua com validação (400) antes do papel (403)", async () => {
  const stub = installFetch(
    () => jsonResponse(false),
    () => jsonResponse([{ id: "q1" }]),
  );
  try {
    // Corpo malformado (sem `match`) → 400, mesmo sem papel: ordem preservada.
    const malformed = await callHandler({
      action: "update",
      table: "media_quarantine",
      data: { decision: "allowed", reviewed_at: "2026-10-09T00:00:00.000Z" },
    });
    if (malformed.status !== 400) {
      throw new Error(`corpo inválido devia ser 400, veio ${malformed.status}: ${malformed.raw}`);
    }

    // Corpo válido sem papel → 403, sem tocar o banco externo.
    const forbidden = await callHandler({
      action: "update",
      table: "media_quarantine",
      data: { decision: "allowed", reviewed_at: "2026-10-09T00:00:00.000Z" },
      match: { id: "q1" },
    });
    if (forbidden.status !== 403) {
      throw new Error(`update sem papel devia ser 403, veio ${forbidden.status}: ${forbidden.raw}`);
    }
    if (stub.externalUrls.length !== 0) {
      throw new Error(`update sem papel tocou o banco externo: ${stub.externalUrls.join(", ")}`);
    }
  } finally {
    stub.restore();
  }
});

Deno.test("SEC-EDGE_FUNCTIONS-02: admin atualiza a quarentena como antes", async () => {
  const updated = [{ id: "q1", decision: "allowed" }];
  const stub = installFetch(
    () => jsonResponse(true),
    () => jsonResponse(updated),
  );
  try {
    const result = await callHandler({
      action: "update",
      table: "media_quarantine",
      data: { decision: "allowed", reviewed_at: "2026-10-09T00:00:00.000Z" },
      match: { id: "q1" },
    });
    if (result.status !== 200) throw new Error(`admin devia atualizar (200), veio ${result.status}: ${result.raw}`);
    if (!Array.isArray(result.body.data)) throw new Error(`update sem linhas: ${result.raw}`);
    if (stub.externalUrls.length !== 1 || !stub.externalUrls[0].includes("id=eq.q1")) {
      throw new Error(`match do update não chegou ao banco externo: ${stub.externalUrls.join(", ")}`);
    }
  } finally {
    stub.restore();
  }
});
