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
import { AiImageInputError } from "../_shared/ai-image-input.ts";

const URL_EDGE = "https://edge.invalid/functions/v1/ai-multimodal-analysis";
/** URL CRUA que o app manda: objeto do bucket PRIVADO `whatsapp-media`. */
const URL_CRUA = "https://projeto.teste.supabase.co/storage/v1/object/public/whatsapp-media/midia/logo.png";
const BODY_VALIDO = { imageUrl: URL_CRUA, conversationContext: "cliente mandou o logo" };
/** Data URL que o helper devolve: é ESTE valor que pode ir ao provedor. */
const DATA_URL = "data:image/png;base64,iVBORw0KGgo=";
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

/**
 * deps falsificadas: usuário autenticado, guardas liberadas, download da imagem
 * dublado (o bucket é privado — sem rede aqui) e provedor controlado pelo caso.
 */
function depsCom(provedor: (p: GenerateParams) => GenerateResult) {
  const chamadas: GenerateParams[] = [];
  const baixadas: Array<{ imageUrl: string; bearerToken: string }> = [];
  const deps: AiMultimodalAnalysisDeps = {
    authorize: () => Promise.resolve({ userId: "user-sintetico" }),
    enforceGuards: () => Promise.resolve(null),
    inlineImage: (imageUrl, options) => {
      const identidade = options?.storageIdentity;
      baixadas.push({
        imageUrl,
        bearerToken: identidade?.kind === "user" ? identidade.bearerToken : "",
      });
      return Promise.resolve({
        dataUrl: DATA_URL,
        mime: "image/png",
        bytes: 8,
        bucket: "whatsapp-media",
        path: "midia/logo.png",
      });
    },
    generate: (p) => {
      chamadas.push(p);
      return Promise.resolve(provedor(p));
    },
  };
  return { deps, chamadas, baixadas };
}

/** Primeira parte `image_url` da mensagem de visão enviada ao provedor. */
function urlDaImagemEnviada(params: GenerateParams): string {
  const conteudo = (params.messages?.[0] as { content?: unknown } | undefined)?.content;
  const partes = Array.isArray(conteudo) ? conteudo : [];
  for (const parte of partes as Array<{ type?: string; image_url?: { url?: string } }>) {
    if (parte?.type === "image_url") return parte.image_url?.url ?? "";
  }
  return "";
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

Deno.test("ai-multimodal-analysis: imagem vai EMBUTIDA como data URL — a URL crua do bucket privado nunca chega ao provedor", async () => {
  const { deps, chamadas, baixadas } = depsCom(() => respostaDoProvedor(200, JSON.stringify(SAIDA_VALIDA)));
  const res = await handleAiMultimodalAnalysis(pedido(BODY_VALIDO), deps);
  await res.body?.cancel();
  assertEquals(res.status, 200);
  // O download rodou sob a identidade do CHAMADOR (JWT do pedido), com a URL crua.
  assertEquals(baixadas.length, 1);
  assertEquals(baixadas[0].imageUrl, URL_CRUA);
  assertEquals(baixadas[0].bearerToken, "jwt-sintetico");
  // E o provedor recebeu a data URL, não a URL do bucket privado.
  assertEquals(chamadas.length, 1);
  assertEquals(urlDaImagemEnviada(chamadas[0]), DATA_URL);
  assertEquals(JSON.stringify(chamadas[0].messages).includes(URL_CRUA), false);
});

Deno.test("ai-multimodal-analysis: imagem que não pôde ser baixada devolve 422 e não chama o provedor", async () => {
  const { deps, chamadas } = depsCom(() => respostaDoProvedor(200, JSON.stringify(SAIDA_VALIDA)));
  deps.inlineImage = () =>
    Promise.reject(new AiImageInputError("IMAGE_DOWNLOAD_FAILED", "HTTP 403 em whatsapp-media/midia/logo.png."));
  const res = await handleAiMultimodalAnalysis(pedido(BODY_VALIDO), deps);
  const corpo = await res.text();
  assertEquals(res.status, 422);
  // O locator do objeto privado (`<bucket>/<path>`) não vaza na resposta.
  assertEquals(corpo.includes("whatsapp-media"), false);
  assertEquals(chamadas.length, 0);
});
