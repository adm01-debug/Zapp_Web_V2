import { handleCors, errorResponse, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { generateWithRouting, type GenerateParams } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

export async function handleAiDeadlineCalculator(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const { userId } = authCheck as { userId: string };
  const guard = await enforceAiGuards({ functionName: "ai-deadline-calculator", userId, req });
  if (guard) return guard;

  const log = new Logger("ai-deadline-calculator");
  try {
    const body = await req.json();
    const { messages = [], latestMessage = "" } = body;

    const conversationHistory = Array.isArray(messages)
      ? messages.slice(-20).map((m: { content: string; sender: string }) => ({
          role: m.sender === "agent" ? "assistant" : "user",
          content: String(m.content || ""),
        }))
      : [];

    const today = new Date().toISOString().split("T")[0];
    const systemPrompt = `Você é especialista em cálculo de prazos de produção e entrega para distribuidora/comercial de brindes e produtos personalizados.
Data de hoje: ${today}.

Baseado na conversa, calcule:
1. Se o prazo solicitado pelo cliente é viável
2. O detalhamento dos dias necessários (produção + frete + buffer)
3. A data limite para fazer o pedido para chegar a tempo
4. Estimativa de frete se houver informações de distância/região
5. Esboço de orçamento se houver informações de produto/quantidade

Responda APENAS em JSON:
{
  "deadline": {
    "productionDays": número de dias de produção estimados,
    "shippingDays": número de dias de entrega estimados,
    "bufferDays": dias de buffer para imprevistos,
    "latestOrderDate": "YYYY-MM-DD data limite para fazer o pedido",
    "eventDate": "YYYY-MM-DD data do evento/entrega desejada pelo cliente (ou null)",
    "feasible": true/false se o prazo é viável
  },
  "impossibleDeadline": true/false se o prazo é impossível de atender,
  "impossibleReason": "motivo pelo qual o prazo não é viável (ou null)",
  "quoteDraft": {
    "productName": "nome do produto (ou null)",
    "quantity": número ou null,
    "unitPrice": número ou null,
    "total": número ou null,
    "notes": "observações do orçamento (ou null)"
  },
  "freightEstimate": {
    "minDays": número mínimo de dias de frete,
    "maxDays": número máximo de dias de frete,
    "estimatedCost": número estimado em reais ou null,
    "carrier": "transportadora sugerida ou null"
  }
}`;

    const generateParams: GenerateParams = {
      purpose: "copilot",
      functionName: "ai-deadline-calculator",
      userId,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: "user", content: `Última mensagem: "${latestMessage}"\n\nCalcule o prazo e viabilidade do pedido.` },
      ],
      temperature: 0.3,
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
  Deno.serve((req) => handleAiDeadlineCalculator(req));
}
