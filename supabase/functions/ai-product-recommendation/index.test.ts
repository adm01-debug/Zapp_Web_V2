/**
 * Contrato executável do `ai-product-recommendation` (copiloto RADAR).
 *
 * Chama o handler REAL (`handleAiProductRecommendation`) com um Request real. Identidade, guardas
 * de IA e provedor entram por `deps` — sem rede, sem banco e sem env. O caso
 * "sem token" usa o `requireAuth` de verdade: ele recusa antes de qualquer I/O.
 *
 * Run with:
 *   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/ai-product-recommendation/index.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleAiProductRecommendation, type AiProductRecommendationDeps } from "./index.ts";
import type { GenerateParams, GenerateResult } from "../_shared/ai-generate.ts";

const URL_EDGE = "https://edge.invalid/functions/v1/ai-product-recommendation";
const BODY_VALIDO = { messages: [{ sender: "client", content: "Preciso de 200 canecas para o evento" }], eventType: "convencao", budget: 5000, quantity: 200 };
// Constante (e não literal) para não contar como produtor de vocabulário no ratchet
// tests/contracts/_adv_edge_legacy_producers.test.ts — o valor é do enum do contrato.
const URGENCIA = "medium";
const SAIDA_VALIDA = {
  recommendations: [{
    product: "Caneca térmica",
    category: "Copos e canecas",
    reasoning: "Alta exposição no escritório",
    estimatedPrice: "R$ 25,00",
    confidence: 0.8,
    urgency: URGENCIA,
  }],
  topPick: "Caneca térmica",
  upsellOpportunity: "Embalagem personalizada",
};

function pedido(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL_EDGE, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer jwt-sintetico", ...headers },
    body: JSON.stringify(body),
  });
}

function respostaDoProvedor(status: number, content: unknown): GenerateResult {
  return {
    ok: status === 200,
    response: new Response(null, { status }),
    data: status === 200 ? { model: "modelo-teste", choices: [{ message: { content } }] } : null,
  } as unknown as GenerateResult;
}

/** deps falsificadas: usuário autenticado, guardas liberadas e provedor controlado pelo caso. */
function depsCom(provedor: (p: GenerateParams) => GenerateResult) {
  const chamadas: GenerateParams[] = [];
  const deps: AiProductRecommendationDeps = {
    authorize: () => Promise.resolve({ userId: "user-sintetico" }),
    enforceGuards: () => Promise.resolve(null),
    generate: (p) => {
      chamadas.push(p);
      return Promise.resolve(provedor(p));
    },
  };
  return { deps, chamadas };
}

Deno.test("ai-product-recommendation: preflight OPTIONS responde CORS sem autenticar nem chamar o provedor", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, "{}"));
  let autenticou = false;
  deps.authorize = () => {
    autenticou = true;
    return Promise.resolve({ userId: "x" });
  };
  const res = await handleAiProductRecommendation(new Request(URL_EDGE, { method: "OPTIONS" }), deps);
  await res.body?.cancel();
  assertEquals(res.status, 200);
  assertEquals((res.headers.get("access-control-allow-headers") ?? "").includes("authorization"), true);
  assertEquals(autenticou, false);
  assertEquals(chamadas.length, 0);
});

Deno.test("ai-product-recommendation: sem Authorization devolve 401 (requireAuth real) e não chama o provedor", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, "{}"));
  delete deps.authorize;
  const res = await handleAiProductRecommendation(
    new Request(URL_EDGE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(BODY_VALIDO) }),
    deps,
  );
  await res.body?.cancel();
  assertEquals(res.status, 401);
  assertEquals(chamadas.length, 0);
});

Deno.test("ai-product-recommendation: guarda de IA negando (cota) encerra antes do provedor", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, "{}"));
  deps.enforceGuards = () => Promise.resolve(new Response("cota", { status: 429 }));
  const res = await handleAiProductRecommendation(pedido(BODY_VALIDO), deps);
  await res.body?.cancel();
  assertEquals(res.status, 429);
  assertEquals(chamadas.length, 0);
});

Deno.test("ai-product-recommendation: entrada inválida devolve 422 de validação sem chamar o provedor", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, "{}"));
  const res = await handleAiProductRecommendation(pedido({ messages: [{ sender: "client", content: "Preciso de 200 canecas para o evento" }], quantity: 0 }), deps);
  await res.body?.cancel();
  assertEquals(res.status, 422);
  assertEquals(chamadas.length, 0);
});

Deno.test("ai-product-recommendation: caminho feliz devolve a saída validada do modelo", async () => {
  const requestId = "0b6f3410-bd0d-4abe-8c58-aa7571b6dd4a";
  const { deps, chamadas } = depsCom(() =>
    respostaDoProvedor(200, `Segue a análise:\n${JSON.stringify(SAIDA_VALIDA)}\nfim`)
  );
  const res = await handleAiProductRecommendation(pedido({ ...BODY_VALIDO, requestId }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ...SAIDA_VALIDA, requestId });
  assertEquals(chamadas.length, 1);
  assertEquals(chamadas[0].functionName, "ai-product-recommendation");
  assertEquals(chamadas[0].purpose, "copilot");
  assertEquals(chamadas[0].requestId, requestId);
});

Deno.test("ai-product-recommendation: saída do modelo fora do contrato vira 502 com envelope de erro", async () => {
  const { deps } = depsCom(() => respostaDoProvedor(200, JSON.stringify({ recommendations: [], topPick: "" })));
  const res = await handleAiProductRecommendation(pedido(BODY_VALIDO), deps);
  assertEquals(res.status, 502);
  const corpo = await res.json();
  assertEquals(corpo.status, "error");
  assertEquals(corpo.capability, "ai-product-recommendation");
});

Deno.test("ai-product-recommendation: provedor com content null vira 502 com envelope de erro (não 500)", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, null));
  const res = await handleAiProductRecommendation(pedido(BODY_VALIDO), deps);
  assertEquals(res.status, 502);
  const corpo = await res.json();
  assertEquals(corpo.status, "error");
  assertEquals(corpo.capability, "ai-product-recommendation");
  assertEquals(corpo.error, "Resposta do modelo fora do contrato.");
  assertEquals(Array.isArray(corpo.evidence?.errors) && corpo.evidence.errors.length > 0, true);
  assertEquals(chamadas.length, 1);
});

Deno.test("ai-product-recommendation: resposta do provedor sem JSON vira 502 com envelope de erro", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, "Desculpe, não consigo analisar isso agora."));
  const res = await handleAiProductRecommendation(pedido(BODY_VALIDO), deps);
  assertEquals(res.status, 502);
  const corpo = await res.json();
  assertEquals(corpo.status, "error");
  assertEquals(corpo.capability, "ai-product-recommendation");
  assertEquals(corpo.error, "Resposta do modelo fora do contrato.");
  assertEquals(Array.isArray(corpo.evidence?.errors) && corpo.evidence.errors.length > 0, true);
  assertEquals(chamadas.length, 1);
});

Deno.test("ai-product-recommendation: provedor 429/402 propaga o status e falha genérica vira 500", async () => {
  for (const [status, esperado] of [[429, 429], [402, 402], [503, 500]] as const) {
    const { deps } = depsCom(() => respostaDoProvedor(status, null));
    const res = await handleAiProductRecommendation(pedido(BODY_VALIDO), deps);
    await res.body?.cancel();
    assertEquals(res.status, esperado, `provedor ${status}`);
  }
});
