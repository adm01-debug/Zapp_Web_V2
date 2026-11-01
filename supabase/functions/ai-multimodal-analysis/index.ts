import { handleCors, errorResponse, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { toInlineImage, AiImageInputError } from "../_shared/ai-image-input.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const guard = await enforceAiGuards({ functionName: "ai-multimodal-analysis", userId: auth.userId, req });
  if (guard) return guard;

  const bearerToken = (req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "").replace(/^bearer /i, "").trim();
  const log = new Logger("ai-multimodal-analysis");

  try {
    const body = await req.json();
    const { messages = [], mediaUrl = "", mediaType = "image" } = body;

    const mediaCtxFallback = mediaUrl
      ? `Mídia recebida (${mediaType}): [referência de mídia]`
      : "Nenhuma mídia anexada.";

    const isVisualMedia = (mediaType === "image" || mediaType === "sticker") && !!mediaUrl;
    let imageDataUrl = "";
    if (isVisualMedia) {
      try {
        const inline = await toInlineImage(mediaUrl, {
          storageIdentity: {
            kind: "user",
            bearerToken,
            anonKey: Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
          },
        });
        imageDataUrl = inline.dataUrl;
      } catch (err) {
        if (err instanceof AiImageInputError) {
          log.error("image-download", { code: err.code, msg: err.message });
        }
        imageDataUrl = "";
      }
    }

    if (isVisualMedia && !imageDataUrl) {
      return errorResponse("Imagem não pôde ser obtida para análise.", 422, req);
    }

    if (imageDataUrl.length > 200_000) {
      return errorResponse("Imagem muito grande para análise de IA (máx. ~150 KB).", 413, req);
    }

    const mediaCtx = imageDataUrl
      ? `Mídia recebida (${mediaType}): [processado inline]`
      : mediaCtxFallback;

    const system = `Você é um copiloto de vendas especialista em análise de mídia e documentos.
Analise o conteúdo da mídia enviada pelo cliente no contexto da negociação.

${mediaCtx}

Extraia informações relevantes para a venda: especificações de produto, quantidades,
referências visuais, documentos de pedido, logos para personalização, etc.

Responda APENAS em JSON:
{
  "mediaDescription": "<descrição do conteúdo da mídia>",
  "extractedData": {
    "productSpecs": "<especificações extraídas ou null>",
    "quantity": <número ou null>,
    "references": ["<referência 1>", "<referência 2>"],
    "customizationDetails": "<detalhes de personalização ou null>"
  },
  "salesContext": "<como esta mídia se relaciona com a negociação>",
  "suggestedNextAction": "<próxima ação recomendada para o vendedor>",
  "scriptWithMedia": "<script usando a mídia como gancho>"
}`;

    const history = messages.slice(-10).map((m: { content: string; sender: string }) => ({
      role: m.sender === "agent" ? "assistant" : "user",
      content: String(m.content || ""),
    }));

    const lastUserContent = isVisualMedia && imageDataUrl
      ? [
          { type: "image_url" as const, image_url: { url: imageDataUrl } },
          { type: "text" as const, text: "Analise a mídia recebida e extraia informações relevantes para a negociação." },
        ]
      : `Analise a mídia recebida e extraia informações relevantes para a negociação. ${mediaCtx}`;

    const { response, data } = await generateWithRouting({
      purpose: "copilot",
      functionName: "ai-multimodal-analysis",
      userId: auth.userId,
      system,
      messages: [
        ...history,
        { role: "user", content: lastUserContent },
      ],
      temperature: 0.4,
      ...(isVisualMedia && imageDataUrl ? { need: { modality: "vision" as const } } : {}),
    });

    if (!response.ok || !data) {
      if (response.status === 429) return errorResponse("Limite excedido.", 429, req);
      if (response.status === 402) return errorResponse("Creditos insuficientes.", 402, req);
      throw new Error(`AI gateway error [${response.status}]`);
    }

    const content = (data as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    let result: Record<string, unknown> | null = null;
    try {
      const m = (content as string).match(/\{[\s\S]*\}/);
      if (m) result = JSON.parse(m[0]);
    } catch { result = null; }

    if (!result) return errorResponse("Resposta do modelo inválida.", 502, req);
    log.done(200);
    return jsonResponse(result, 200, req);
  } catch (err) {
    log.error("unhandled", { msg: err instanceof Error ? err.message : String(err) });
    return errorResponse("Internal server error", 500, req);
  }
});
