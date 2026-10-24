import { handleCors, errorResponse, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { generateWithRouting, type GenerateParams } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

export async function handleAiProductRecommendation(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const { userId } = authCheck as { userId: string };
  const guard = await enforceAiGuards({ functionName: "ai-product-recommendation", userId, req });
  if (guard) return guard;

  const log = new Logger("ai-product-recommendation");
  try {
    const body = await req.json();
    const { messages = [], latestMessage = "", currentFunnelStage = "" } = body;

    const conversationHistory = Array.isArray(messages)
      ? messages.slice(-20).map((m: { content: string; sender: string }) => ({
          role: m.sender === "agent" ? "assistant" : "user",
          content: String(m.content || ""),
        }))
      : [];

    const systemPrompt = `Você é especialista em recomendação de produtos para vendas B2B em distribuidora/comercial via WhatsApp.
${currentFunnelStage ? `Estágio do funil atual: ${currentFunnelStage}.` : ""}

Baseado na conversa, sugira os produtos mais adequados para o cliente.

Tipos de recomendação:
- "primary": produto principal que atende à necessidade explícita
- "cross_sell": produto complementar que vai bem com o principal
- "upsell": versão superior ou maior quantidade com melhor custo-benefício
- "kit": kit ou combinação de produtos com benefício especial

Responda APENAS em JSON:
{
  "recommendations": [
    {
      "productId": "id_do_produto_ou_null_se_desconhecido",
      "productName": "nome do produto recomendado",
      "reason": "motivo da recomendação baseado na conversa",
      "type": "primary|cross_sell|upsell|kit",
      "occasion": "ocasião ou evento que justifica (se aplicável, ex: Natal, Dia das Mães)"
    }
  ]
}`;

    const generateParams: GenerateParams = {
      purpose: "copilot",
      functionName: "ai-product-recommendation",
      userId,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: "user", content: `Última mensagem: "${latestMessage}"\n\nSugira produtos adequados para este cliente.` },
      ],
      temperature: 0.5,
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
  Deno.serve((req) => handleAiProductRecommendation(req));
}
