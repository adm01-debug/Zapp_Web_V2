import { handleCors, errorResponse, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { generateWithRouting, type GenerateParams } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

export async function handleAiPriceAnchor(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const { userId } = authCheck as { userId: string };
  const guard = await enforceAiGuards({ functionName: "ai-price-anchor", userId, req });
  if (guard) return guard;

  const log = new Logger("ai-price-anchor");
  try {
    const body = await req.json();
    const { messages = [], latestMessage = "", sellerMaxDiscountPct } = body;
    const maxDiscount = typeof sellerMaxDiscountPct === "number" ? sellerMaxDiscountPct : null;

    const conversationHistory = Array.isArray(messages)
      ? messages.slice(-20).map((m: { content: string; sender: string }) => ({
          role: m.sender === "agent" ? "assistant" : "user",
          content: String(m.content || ""),
        }))
      : [];

    const systemPrompt = `Você é especialista em ancoragem de preço e percepção de valor para vendas B2B via WhatsApp.

Sua função é ajudar o vendedor a reposicionar o valor do produto antes de considerar desconto.
${maxDiscount !== null ? `Desconto máximo que o vendedor pode conceder: ${maxDiscount}%.` : ""}

Estrategias de ancoragem que você usa:
- Comparar com custo de não ter o produto (perda, multa, atraso)
- Destacar diferencial vs. alternativas mais baratas (qualidade, suporte, prazo)
- Mostrar ROI ou economia gerada pelo produto
- Dividir por unidade, dia ou mês para diminuir a percepção de custo
- Propor desconto menor que o máximo disponível, preservando margem

Responda APENAS em JSON:
{
  "valueFraming": "argumentação de valor para reposicionar a percepção de preço",
  "anchorComparison": "comparação de âncora (ex: custo por dia, ROI, alternativa pior)",
  "maxDiscountPct": ${maxDiscount !== null ? maxDiscount : "null"},
  "proposedDiscountPct": número com o desconto sugerido (<=maxDiscountPct, ou null se não aplicável)
}`;

    const generateParams: GenerateParams = {
      purpose: "copilot",
      functionName: "ai-price-anchor",
      userId,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: "user", content: `Última mensagem: "${latestMessage}"\n\nGere o enquadramento de valor e ancoragem de preço.` },
      ],
      temperature: 0.4,
    };

    const { response, data } = await generateWithRouting(generateParams);
    if (!response.ok || !data) {
      if (response.status === 429) return errorResponse("Limite de requisicoes excedido. Tente novamente.", 429, req);
      if (response.status === 402) return errorResponse("Creditos insuficientes. Adicione creditos.", 402, req);
      throw new Error(`AI gateway error [${response.status}]`);
    }

    const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })
      .choices?.[0]?.message?.content;
    let result: unknown = null;
    try {
      const jsonMatch = (content as string).match(/\{[\s\S]*\}/);
      if (jsonMatch) result = JSON.parse(jsonMatch[0]);
    } catch { result = null; }

    log.done(200);
    return jsonResponse(result ?? {}, 200, req);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log.error("Unhandled error", { error: msg });
    return errorResponse(msg, 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleAiPriceAnchor(req));
}
