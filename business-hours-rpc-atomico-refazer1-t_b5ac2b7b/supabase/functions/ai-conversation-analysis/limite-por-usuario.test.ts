// IA-LIMITE-001 — o limite das IAs é POR USUÁRIO, não por IP em memória.
//
// Defeito do cartão: as quatro edges de IA (ai-conversation-analysis,
// ai-conversation-summary, ai-suggest-reply e ai-proxy) chamavam
// `checkRateLimit("<fn>:" + getClientIP(req), …)` — um contador EM MEMÓRIA, por
// isolate, chaveado pelo IP de quem chama. Dois efeitos ruins:
//   - colegas atrás do MESMO IP (mesmo escritório/NAT) dividiam a cota de um só;
//   - o contador zerava a cada cold start e não era a fonte de verdade.
//
// O limite POR USUÁRIO já existe e é autoritativo desde a IA-043, dentro de
// `enforceAiGuards` (pré-filtro local por usuário + contador compartilhado e
// atômico em `edge_rate_limits` + cota diária em `ai_usage_logs`). O certo é
// cada edge passar por ele e o contador por IP SAIR.
//
// Estes testes provam:
//   (a) fiação — as quatro edges chamam `enforceAiGuards` com o próprio slug e
//       NÃO têm mais o contador por IP (`checkRateLimit`/`getClientIP`);
//   (b) runtime — a guarda nega por USUÁRIO: o segundo envio do MESMO usuário
//       leva 429 em português, sem trocar IP nenhum.
//
// Sem rede real: `globalThis.fetch` é substituído por um espião que responde ao
// PostgREST do supabase-js (mesmo padrão de `_shared/__tests__/ai-quota-*.test.ts`).
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//   supabase/functions/ai-conversation-analysis/limite-por-usuario.test.ts

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

const EDGES: Array<{ slug: string; arquivo: string }> = [
  { slug: "ai-conversation-analysis", arquivo: "./index.ts" },
  { slug: "ai-conversation-summary", arquivo: "../ai-conversation-summary/index.ts" },
  { slug: "ai-suggest-reply", arquivo: "../ai-suggest-reply/index.ts" },
  { slug: "ai-proxy", arquivo: "../ai-proxy/index.ts" },
];

// ---------------------------------------------------------------------------
// (a) fiação: cada edge passa pela guarda por usuário e não tem o contador por IP
// ---------------------------------------------------------------------------
for (const { slug, arquivo } of EDGES) {
  Deno.test(`${slug}: limita pelo enforceAiGuards (por usuário) e não por IP em memória`, async () => {
    const fonte = await Deno.readTextFile(new URL(arquivo, import.meta.url));

    assert(
      fonte.includes("enforceAiGuards"),
      `${slug} não passa mais pela guarda por usuário (o código mudou?)`,
    );
    assert(
      fonte.includes(`functionName: "${slug}"`),
      `${slug}: a guarda tem de usar o próprio slug "${slug}" como functionName`,
    );

    // O contador em memória por IP saiu de vez: nenhuma edge pode voltar a usá-lo.
    assert(!fonte.includes("checkRateLimit("), `${slug} ainda usa checkRateLimit (contador por IP em memória)`);
    assert(!fonte.includes("getClientIP("), `${slug} ainda usa getClientIP (contador por IP em memória)`);
  });
}

// ---------------------------------------------------------------------------
// (b) runtime: a guarda nega por USUÁRIO, 429 em português
// ---------------------------------------------------------------------------
const USUARIO = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

function stubEnv(): () => void {
  const prevUrl = Deno.env.get("SUPABASE_URL");
  const prevKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_URL", "https://projeto-teste.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-key-de-teste");
  return () => {
    if (prevUrl === undefined) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", prevUrl);
    if (prevKey === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", prevKey);
  };
}

/** PostgREST falso: flag ausente = LIGADA, contador compartilhado em 0, cota em 0. */
function stubFetch(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/rest/v1/feature_flags")) {
      return Promise.resolve(new Response("null", { status: 200, headers: { "content-type": "application/json" } }));
    }
    if (url.includes("/rpc/ai_rate_limit_hit")) {
      // hit count numérico: 0 <= limite -> permitido pela fonte de verdade
      return Promise.resolve(new Response("0", { status: 200, headers: { "content-type": "application/json" } }));
    }
    // ai_usage_logs (cota diária): count 0
    return Promise.resolve(
      new Response("[]", { status: 200, headers: { "content-type": "application/json", "content-range": "*/0" } }),
    );
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

Deno.test("enforceAiGuards: o MESMO usuário é negado no limite (429 pt-BR), sem trocar de IP", async () => {
  const restaurarEnv = stubEnv();
  const restaurarFetch = stubFetch();
  try {
    const req = new Request("https://exemplo.test/functions/v1/ai-conversation-analysis", { method: "POST" });

    const primeiro = await enforceAiGuards({
      functionName: "ai-conversation-analysis",
      userId: USUARIO,
      req,
      perUserPerMinute: 1,
    });
    assertEquals(primeiro, null, "o primeiro envio do usuário tem de passar");

    const segundo = await enforceAiGuards({
      functionName: "ai-conversation-analysis",
      userId: USUARIO,
      req,
      perUserPerMinute: 1,
    });
    assert(segundo instanceof Response, "o segundo envio do mesmo usuário tem de ser negado pela guarda");
    assertEquals(segundo!.status, 429, "o limite por usuário tem de responder 429");
    const corpo = await segundo!.text();
    assertStringIncludes(corpo, "por usuário");
    assertStringIncludes(corpo, "Limite");
  } finally {
    restaurarFetch();
    restaurarEnv();
  }
});

Deno.test("enforceAiGuards: outro usuário NÃO é punido pela cota de quem já bateu no limite", async () => {
  const restaurarEnv = stubEnv();
  const restaurarFetch = stubFetch();
  try {
    const req = new Request("https://exemplo.test/functions/v1/ai-conversation-analysis", { method: "POST" });
    const bateu = "aaaa1111-2222-4333-8444-555555555555";
    const outro = "9f4c1e2a-1b3d-4c5e-8a7b-0d1e2f3a4b5c";

    const negado = await enforceAiGuards({
      functionName: "ai-conversation-analysis",
      userId: bateu,
      req,
      perUserPerMinute: 1,
    });
    await enforceAiGuards({ functionName: "ai-conversation-analysis", userId: bateu, req, perUserPerMinute: 1 });
    assertEquals(negado, null);

    const liberado = await enforceAiGuards({
      functionName: "ai-conversation-analysis",
      userId: outro,
      req,
      perUserPerMinute: 1,
    });
    assertEquals(liberado, null, "a cota por usuário não pode vazar para outro usuário (era o defeito do IP)");
  } finally {
    restaurarFetch();
    restaurarEnv();
  }
});
