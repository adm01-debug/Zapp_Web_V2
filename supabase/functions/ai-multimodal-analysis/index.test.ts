/**
 * Contrato executável do `ai-multimodal-analysis` (copiloto RADAR).
 *
 * Chama o handler REAL (`handleAiMultimodalAnalysis`) com um Request real. Identidade, guardas
 * de IA e provedor entram por `deps` — sem rede, sem banco e sem env. O caso
 * "sem token" usa o `requireAuth` de verdade: ele recusa antes de qualquer I/O.
 *
 * Run with:
 *   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/ai-multimodal-analysis/index.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleAiMultimodalAnalysis, type AiMultimodalAnalysisDeps } from "./index.ts";
import type { GenerateParams, GenerateResult } from "../_shared/ai-generate.ts";

const URL_EDGE = "https://edge.invalid/functions/v1/ai-multimodal-analysis";
const BODY_VALIDO = { imageUrl: "https://cdn.exemplo.test/logo.png", conversationContext: "cliente mandou o logo" };
const SAIDA_VALIDA = {
  description: "Logo azul com a palavra ACME",
  extractedText: ["ACME"],
  dominantColors: ["azul"],
  keyElements: ["logo"],
  brandingOpportunity: "Gravação a laser em caneta metálica",
  suggestedReply: "Podemos gravar esse logo nas canetas.",
  confidence: 0.9,
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
  const deps: AiMultimodalAnalysisDeps = {
    authorize: () => Promise.resolve({ userId: "user-sintetico" }),
    enforceGuards: () => Promise.resolve(null),
    generate: (p) => {
      chamadas.push(p);
      return Promise.resolve(provedor(p));
    },
  };
  return { deps, chamadas };
}

Deno.test("ai-multimodal-analysis: preflight OPTIONS responde CORS sem autenticar nem chamar o provedor", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, "{}"));
  let autenticou = false;
  deps.authorize = () => {
    autenticou = true;
    return Promise.resolve({ userId: "x" });
  };
  const res = await handleAiMultimodalAnalysis(new Request(URL_EDGE, { method: "OPTIONS" }), deps);
  await res.body?.cancel();
  assertEquals(res.status, 200);
  assertEquals((res.headers.get("access-control-allow-headers") ?? "").includes("authorization"), true);
  assertEquals(autenticou, false);
  assertEquals(chamadas.length, 0);
});

Deno.test("ai-multimodal-analysis: sem Authorization devolve 401 (requireAuth real) e não chama o provedor", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, "{}"));
  delete deps.authorize;
  const res = await handleAiMultimodalAnalysis(
    new Request(URL_EDGE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(BODY_VALIDO) }),
    deps,
  );
  await res.body?.cancel();
  assertEquals(res.status, 401);
  assertEquals(chamadas.length, 0);
});

Deno.test("ai-multimodal-analysis: guarda de IA negando (cota) encerra antes do provedor", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, "{}"));
  deps.enforceGuards = () => Promise.resolve(new Response("cota", { status: 429 }));
  const res = await handleAiMultimodalAnalysis(pedido(BODY_VALIDO), deps);
  await res.body?.cancel();
  assertEquals(res.status, 429);
  assertEquals(chamadas.length, 0);
});

Deno.test("ai-multimodal-analysis: entrada inválida devolve 422 de validação sem chamar o provedor", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, "{}"));
  const res = await handleAiMultimodalAnalysis(pedido({ imageUrl: "nao-e-url" }), deps);
  await res.body?.cancel();
  assertEquals(res.status, 422);
  assertEquals(chamadas.length, 0);
});

Deno.test("ai-multimodal-analysis: caminho feliz devolve a saída validada do modelo", async () => {
  const requestId = "0b6f3410-bd0d-4abe-8c58-aa7571b6dd4a";
  const { deps, chamadas } = depsCom(() =>
    respostaDoProvedor(200, `Segue a análise:\n${JSON.stringify(SAIDA_VALIDA)}\nfim`)
  );
  const res = await handleAiMultimodalAnalysis(pedido({ ...BODY_VALIDO, requestId }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ...SAIDA_VALIDA, requestId });
  assertEquals(chamadas.length, 1);
  assertEquals(chamadas[0].functionName, "ai-multimodal-analysis");
  assertEquals(chamadas[0].purpose, "copilot");
  assertEquals(chamadas[0].requestId, requestId);
});

Deno.test("ai-multimodal-analysis: saída do modelo fora do contrato vira 502 com envelope de erro", async () => {
  const { deps } = depsCom(() => respostaDoProvedor(200, JSON.stringify({ description: "", confidence: 7 })));
  const res = await handleAiMultimodalAnalysis(pedido(BODY_VALIDO), deps);
  assertEquals(res.status, 502);
  const corpo = await res.json();
  assertEquals(corpo.status, "error");
  assertEquals(corpo.capability, "ai-multimodal-analysis");
});

Deno.test("ai-multimodal-analysis: provedor 429/402 propaga o status e falha genérica vira 500", async () => {
  for (const [status, esperado] of [[429, 429], [402, 402], [503, 500]] as const) {
    const { deps } = depsCom(() => respostaDoProvedor(status, null));
    const res = await handleAiMultimodalAnalysis(pedido(BODY_VALIDO), deps);
    await res.body?.cancel();
    assertEquals(res.status, esperado, `provedor ${status}`);
  }
});
