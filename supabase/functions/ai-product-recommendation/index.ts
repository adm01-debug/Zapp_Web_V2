import { handleCors, errorResponse, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const guard = await enforceAiGuards({ functionName: "ai-product-recommendation", userId: auth.userId, req });
  if (guard) return guard;

  const log = new Logger("ai-product-recommendation");

  try {
    const body = await req.json();
    const { messages = [], currentProduct = "", catalog = [] } = body;

    const catalogCtx = catalog.length > 0
      ? `Catálogo disponível:\n${(catalog as Array<{ name: string; price?: number; description?: string }>).slice(0, 20).map((p) => `- ${p.name}${p.price != null ? ` (R$ ${p.price})` : ""}${p.description ? `: ${p.description}` : ""}`).join("\n")}`
      : "";

    const system = `Você é um copiloto de vendas especialista em recomendação de produtos.
Analise a conversa e identifique oportunidades de oferecer produtos complementares ou substitutos.

${currentProduct ? `Produto atual em negociação: ${currentProduct}` : ""}
${catalogCtx}

Responda APENAS em JSON:
{
  "recommendations": [
    {
      "productName": "<nome do produto>",
      "reason": "<por que recomendar agora>",
      "script": "<script de abordagem>",
      "upsell": <true|false>
    }
  ],
  "crossSellOpportunity": "<oportunidade de venda cruzada identificada ou null>",
  "timingNote": "<melhor momento para fazer a sugestão>"
}`;

    const history = messages.slice(-10).map((m: { content: string; sender: string }) => ({
      role: m.sender === "agent" ? "assistant" : "user",
      content: String(m.content || ""),
    }));

    const { response, data } = await generateWithRouting({
      purpose: "copilot",
      functionName: "ai-product-recommendation",
      userId: auth.userId,
      system,
      messages: [
        ...history,
        { role: "user", content: "Identifique oportunidades de recomendação de produto para esta conversa." },
      ],
      temperature: 0.5,
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
