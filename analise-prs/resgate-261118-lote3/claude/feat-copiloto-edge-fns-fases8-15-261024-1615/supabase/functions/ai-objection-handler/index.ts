import { handleCors, errorResponse, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { generateWithRouting, type GenerateParams } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

export async function handleAiObjectionHandler(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const { userId } = authCheck as { userId: string };
  const guard = await enforceAiGuards({ functionName: "ai-objection-handler", userId, req });
  if (guard) return guard;

  const log = new Logger("ai-objection-handler");
  try {
    const body = await req.json();
    const { messages = [], latestMessage = "" } = body;

    const conversationHistory = Array.isArray(messages)
      ? messages.slice(-20).map((m: { content: string; sender: string }) => ({
          role: m.sender === "agent" ? "assistant" : "user",
          content: String(m.content || ""),
        }))
      : [];

    const systemPrompt = `Você é um especialista em tratamento de objeções de vendas B2B via WhatsApp para distribuidora/comercial.

Categorias de objeção reconhecidas:
- "price": custo alto, sem budget, negociação de preço
- "competitor": menção a concorrente, comparação
- "delay": prazo longo, urgência não atendida
- "min_quantity": quantidade mínima do pedido acima do desejado
- "hard_no": recusa definitiva
- "trade_in": proposta de permuta ou barter
- "other": outra objeção

Analise a conversa e a última mensagem. Se houver objeção, gere o tratamento.
Se não houver objeção, retorne objectionType null.

Responda APENAS em JSON:
{
  "objectionType": "price|competitor|delay|min_quantity|hard_no|trade_in|other|null",
  "treatmentScript": "script de resposta persuasivo para tratar a objeção (null se sem objeção)",
  "battlecard": {
    "competitorName": "nome do concorrente mencionado ou null",
    "ourAdvantages": ["vantagem 1", "vantagem 2"],
    "theirWeaknesses": ["fraqueza 1"],
    "talkingPoints": ["ponto de conversa 1", "ponto 2"]
  },
  "tradeInOffer": "proposta de permuta se aplicável, ou null",
  "smallerLotSuggestion": "sugestão de lote menor se quantidade for objeção, ou null",
  "postNoRecovery": "mensagem de recuperação após recusa definitiva, ou null"
}`;

    const generateParams: GenerateParams = {
      purpose: "copilot",
      functionName: "ai-objection-handler",
      userId,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: "user", content: `Última mensagem: "${latestMessage}"\n\nIdentifique a objeção e gere o tratamento.` },
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
  Deno.serve((req) => handleAiObjectionHandler(req));
}
