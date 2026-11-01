import { handleCors, errorResponse, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const guard = await enforceAiGuards({ functionName: "ai-multimodal-analysis", userId: auth.userId, req });
  if (guard) return guard;

  const log = new Logger("ai-multimodal-analysis");

  try {
    const body = await req.json();
    const { messages = [], mediaUrl = "", mediaType = "image" } = body;

    const mediaCtx = mediaUrl
      ? `Mídia recebida (${mediaType}): ${mediaUrl}`
      : "Nenhuma mídia anexada.";

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

    const { response, data } = await generateWithRouting({
      purpose: "copilot",
      functionName: "ai-multimodal-analysis",
      userId: auth.userId,
      system,
      messages: [
        ...history,
        { role: "user", content: `Analise a mídia recebida e extraia informações relevantes para a negociação. ${mediaCtx}` },
      ],
      temperature: 0.4,
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

    log.done(200);
    return jsonResponse(result ?? {}, 200, req);
  } catch (err) {
    log.error("unhandled", { msg: err instanceof Error ? err.message : String(err) });
    return errorResponse("Internal server error", 500, req);
  }
});
