/**
 * Contrato executável do `ai-objection-handler` (copiloto RADAR).
 *
 * Chama o handler REAL (`handleAiObjectionHandler`) com um Request real. Identidade, guardas
 * de IA e provedor entram por `deps` — sem rede, sem banco e sem env. O caso
 * "sem token" usa o `requireAuth` de verdade: ele recusa antes de qualquer I/O.
 *
 * Run with:
 *   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/ai-objection-handler/index.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleAiObjectionHandler, type AiObjectionHandlerDeps } from "./index.ts";
import type { GenerateParams, GenerateResult } from "../_shared/ai-generate.ts";

const URL_EDGE = "https://edge.invalid/functions/v1/ai-objection-handler";
const BODY_VALIDO = { messages: [{ sender: "client", content: "Preciso de 200 canecas para o evento" }], clientText: "Achei caro" };
const SAIDA_VALIDA = {
  objectionType: "preco",
  isSmokescreen: false,
  confidence: 0.8,
  brindeLetter: "B",
  script: ["Entendo a preocupação com o valor."],
  suggestedReply: "Posso mostrar o custo por uso?",
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
  const deps: AiObjectionHandlerDeps = {
    authorize: () => Promise.resolve({ userId: "user-sintetico" }),
    enforceGuards: () => Promise.resolve(null),
    generate: (p) => {
      chamadas.push(p);
      return Promise.resolve(provedor(p));
    },
  };
  return { deps, chamadas };
}

Deno.test("ai-objection-handler: preflight OPTIONS responde CORS sem autenticar nem chamar o provedor", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, "{}"));
  let autenticou = false;
  deps.authorize = () => {
    autenticou = true;
    return Promise.resolve({ userId: "x" });
  };
  const res = await handleAiObjectionHandler(new Request(URL_EDGE, { method: "OPTIONS" }), deps);
  await res.body?.cancel();
  assertEquals(res.status, 200);
  assertEquals((res.headers.get("access-control-allow-headers") ?? "").includes("authorization"), true);
  assertEquals(autenticou, false);
  assertEquals(chamadas.length, 0);
});

Deno.test("ai-objection-handler: sem Authorization devolve 401 (requireAuth real) e não chama o provedor", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, "{}"));
  delete deps.authorize;
  const res = await handleAiObjectionHandler(
    new Request(URL_EDGE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(BODY_VALIDO) }),
    deps,
  );
  await res.body?.cancel();
  assertEquals(res.status, 401);
  assertEquals(chamadas.length, 0);
});

Deno.test("ai-objection-handler: guarda de IA negando (cota) encerra antes do provedor", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, "{}"));
  deps.enforceGuards = () => Promise.resolve(new Response("cota", { status: 429 }));
  const res = await handleAiObjectionHandler(pedido(BODY_VALIDO), deps);
  await res.body?.cancel();
  assertEquals(res.status, 429);
  assertEquals(chamadas.length, 0);
});

Deno.test("ai-objection-handler: entrada inválida devolve 422 de validação sem chamar o provedor", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, "{}"));
  const res = await handleAiObjectionHandler(pedido({ messages: [{ sender: "client", content: "Preciso de 200 canecas para o evento" }], clientText: 42 }), deps);
  await res.body?.cancel();
  assertEquals(res.status, 422);
  assertEquals(chamadas.length, 0);
});

Deno.test("ai-objection-handler: caminho feliz devolve a saída validada do modelo", async () => {
  const requestId = "0b6f3410-bd0d-4abe-8c58-aa7571b6dd4a";
  const { deps, chamadas } = depsCom(() =>
    respostaDoProvedor(200, `Segue a análise:\n${JSON.stringify(SAIDA_VALIDA)}\nfim`)
  );
  const res = await handleAiObjectionHandler(pedido({ ...BODY_VALIDO, requestId }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ...SAIDA_VALIDA, treatmentSteps: SAIDA_VALIDA.script, requestId });
  assertEquals(chamadas.length, 1);
  assertEquals(chamadas[0].functionName, "ai-objection-handler");
  assertEquals(chamadas[0].purpose, "copilot");
  assertEquals(chamadas[0].requestId, requestId);
});

Deno.test("ai-objection-handler: saída do modelo fora do contrato vira 502 com envelope de erro", async () => {
  const { deps } = depsCom(() => respostaDoProvedor(200, JSON.stringify({ objectionType: "desconhecida", script: [] })));
  const res = await handleAiObjectionHandler(pedido(BODY_VALIDO), deps);
  assertEquals(res.status, 502);
  const corpo = await res.json();
  assertEquals(corpo.status, "error");
  assertEquals(corpo.capability, "ai-objection-handler");
});

Deno.test("ai-objection-handler: provedor com content null vira 502 com envelope de erro (não 500)", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, null));
  const res = await handleAiObjectionHandler(pedido(BODY_VALIDO), deps);
  assertEquals(res.status, 502);
  const corpo = await res.json();
  assertEquals(corpo.status, "error");
  assertEquals(corpo.capability, "ai-objection-handler");
  assertEquals(corpo.error, "Resposta do modelo fora do contrato.");
  assertEquals(Array.isArray(corpo.evidence?.errors) && corpo.evidence.errors.length > 0, true);
  assertEquals(chamadas.length, 1);
});

Deno.test("ai-objection-handler: resposta do provedor sem JSON vira 502 com envelope de erro", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, "Desculpe, não consigo analisar isso agora."));
  const res = await handleAiObjectionHandler(pedido(BODY_VALIDO), deps);
  assertEquals(res.status, 502);
  const corpo = await res.json();
  assertEquals(corpo.status, "error");
  assertEquals(corpo.capability, "ai-objection-handler");
  assertEquals(corpo.error, "Resposta do modelo fora do contrato.");
  assertEquals(Array.isArray(corpo.evidence?.errors) && corpo.evidence.errors.length > 0, true);
  assertEquals(chamadas.length, 1);
});

Deno.test("ai-objection-handler: provedor 429/402 propaga o status e falha genérica vira 500", async () => {
  for (const [status, esperado] of [[429, 429], [402, 402], [503, 500]] as const) {
    const { deps } = depsCom(() => respostaDoProvedor(status, null));
    const res = await handleAiObjectionHandler(pedido(BODY_VALIDO), deps);
    await res.body?.cancel();
    assertEquals(res.status, esperado, `provedor ${status}`);
  }
});
