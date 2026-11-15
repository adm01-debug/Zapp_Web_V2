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
import { AiImageInputError, type InlineImage } from "../_shared/ai-image-input.ts";

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

/** PNG 1x1 embutido — o que o preparo de imagem devolve no lugar da URL privada. */
const DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4z8AAAAMBAQAY3Y2wAAAAAElFTkSuQmCC";
const IMAGEM_EMBUTIDA: InlineImage = {
  dataUrl: DATA_URL,
  mime: "image/png",
  bytes: 70,
  bucket: "whatsapp-media",
  path: "conversa/foto.png",
};

/** deps falsificadas: usuário autenticado, guardas liberadas, preparo de imagem e provedor controlados pelo caso. */
function depsCom(provedor: (p: GenerateParams) => GenerateResult) {
  const chamadas: GenerateParams[] = [];
  const imagens: string[] = [];
  const deps: AiMultimodalAnalysisDeps = {
    authorize: () => Promise.resolve({ userId: "user-sintetico" }),
    enforceGuards: () => Promise.resolve(null),
    prepareImage: (url) => {
      imagens.push(url);
      return Promise.resolve(IMAGEM_EMBUTIDA);
    },
    generate: (p) => {
      chamadas.push(p);
      return Promise.resolve(provedor(p));
    },
  };
  return { deps, chamadas, imagens };
}

/** Primeira parte `image_url` da mensagem de visão que foi ao provedor. */
function urlDaImagemEnviada(p: GenerateParams): string {
  const partes = (p.messages as Array<{ content: Array<Record<string, unknown>> }>)[0].content;
  const parte = partes.find((c) => c.type === "image_url") as { image_url: { url: string } } | undefined;
  return parte?.image_url.url ?? "";
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

Deno.test("ai-multimodal-analysis: provedor com content null vira 502 com envelope de erro (não 500)", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, null));
  const res = await handleAiMultimodalAnalysis(pedido(BODY_VALIDO), deps);
  assertEquals(res.status, 502);
  const corpo = await res.json();
  assertEquals(corpo.status, "error");
  assertEquals(corpo.capability, "ai-multimodal-analysis");
  assertEquals(corpo.error, "Resposta do modelo fora do contrato.");
  assertEquals(Array.isArray(corpo.evidence?.errors) && corpo.evidence.errors.length > 0, true);
  assertEquals(chamadas.length, 1);
});

Deno.test("ai-multimodal-analysis: resposta do provedor sem JSON vira 502 com envelope de erro", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, "Desculpe, não consigo analisar isso agora."));
  const res = await handleAiMultimodalAnalysis(pedido(BODY_VALIDO), deps);
  assertEquals(res.status, 502);
  const corpo = await res.json();
  assertEquals(corpo.status, "error");
  assertEquals(corpo.capability, "ai-multimodal-analysis");
  assertEquals(corpo.error, "Resposta do modelo fora do contrato.");
  assertEquals(Array.isArray(corpo.evidence?.errors) && corpo.evidence.errors.length > 0, true);
  assertEquals(chamadas.length, 1);
});

Deno.test("ai-multimodal-analysis: provedor 429/402 propaga o status e falha genérica vira 500", async () => {
  for (const [status, esperado] of [[429, 429], [402, 402], [503, 500]] as const) {
    const { deps } = depsCom(() => respostaDoProvedor(status, null));
    const res = await handleAiMultimodalAnalysis(pedido(BODY_VALIDO), deps);
    await res.body?.cancel();
    assertEquals(res.status, esperado, `provedor ${status}`);
  }
});

Deno.test("ai-multimodal-analysis: o provedor recebe a imagem EMBUTIDA, nunca a URL do bucket privado", async () => {
  const { deps, chamadas, imagens } = depsCom(() => respostaDoProvedor(200, JSON.stringify(SAIDA_VALIDA)));
  const urlPrivada = "https://proj.supabase.co/storage/v1/object/whatsapp-media/conversa/foto.png";
  const res = await handleAiMultimodalAnalysis(pedido({ ...BODY_VALIDO, imageUrl: urlPrivada }), deps);
  await res.body?.cancel();
  assertEquals(res.status, 200);
  assertEquals(imagens, [urlPrivada], "a URL crua tem de ir para o preparo");
  assertEquals(chamadas.length, 1);
  assertEquals(urlDaImagemEnviada(chamadas[0]), DATA_URL, "o modelo tem de receber data URL");
  assertEquals(urlDaImagemEnviada(chamadas[0]).startsWith("http"), false, "URL de storage nao pode chegar ao modelo");
});

Deno.test("ai-multimodal-analysis: imagem recusada no preparo devolve o status tipado e nao gasta provedor", async () => {
  for (const [code, esperado] of [["IMAGE_URL_INVALID", 400], ["IMAGE_TOO_LARGE", 413], ["IMAGE_TYPE_INVALID", 415]] as const) {
    const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, JSON.stringify(SAIDA_VALIDA)));
    deps.prepareImage = () => Promise.reject(new AiImageInputError(code, "whatsapp-media/conversa/foto.png recusada"));
    const res = await handleAiMultimodalAnalysis(pedido(BODY_VALIDO), deps);
    const corpo = await res.text();
    assertEquals(res.status, esperado, code);
    assertEquals(corpo.includes(code), true, `o codigo tipado tem de sair na resposta (${code})`);
    assertEquals(corpo.includes("conversa/foto.png"), false, "locator do objeto privado nao pode vazar");
    assertEquals(chamadas.length, 0, `provedor nao pode ser chamado (${code})`);
  }
});

Deno.test("ai-multimodal-analysis: a identidade de download e a do CHAMADOR (JWT do pedido), nunca service role", async () => {
  const { deps } = depsCom(() => respostaDoProvedor(200, JSON.stringify(SAIDA_VALIDA)));
  let identidade: unknown = null;
  deps.prepareImage = (_url, options) => {
    identidade = options.storageIdentity;
    return Promise.resolve(IMAGEM_EMBUTIDA);
  };
  const res = await handleAiMultimodalAnalysis(pedido(BODY_VALIDO), deps);
  await res.body?.cancel();
  assertEquals(res.status, 200);
  assertEquals(identidade, { kind: "user", bearerToken: "jwt-sintetico" });
});
