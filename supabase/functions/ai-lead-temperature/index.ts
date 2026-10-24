import { handleCors, errorResponse, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { generateWithRouting, type GenerateParams } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

export async function handleAiLeadTemperature(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const { userId } = authCheck as { userId: string };
  const guard = await enforceAiGuards({ functionName: "ai-lead-temperature", userId, req });
  if (guard) return guard;

  const log = new Logger("ai-lead-temperature");
  try {
    const body = await req.json();
    const { messages = [], silenceThresholdMinutes = 60 } = body;

    const conversationHistory = Array.isArray(messages)
      ? messages.slice(-20).map((m: { content: string; sender: string }) => ({
          role: m.sender === "agent" ? "assistant" : "user",
          content: String(m.content || ""),
        }))
      : [];

    const systemPrompt = `Você é especialista em qualificação de leads B2B via análise de conversas WhatsApp para distribuidora/comercial.

Avalie a temperatura do lead: score de 0 (frio/sem interesse) a 100 (quente/pronto para comprar).
Threshold de alerta de silêncio: ${silenceThresholdMinutes} minutos.

Sinais de compra que você detecta:
- "urgency": menciona prazo, evento, urgência
- "budget_confirmed": confirma orçamento disponível
- "decision_authority": identifica-se como decisor
- "specific_need": detalha necessidade específica (produto, quantidade, personalizações)
- "timeline": menciona data ou prazo específico

Responda APENAS em JSON:
{
  "score": número de 0 a 100,
  "signals": [
    {
      "type": "urgency|budget_confirmed|decision_authority|specific_need|timeline",
      "excerpt": "trecho da mensagem que evidencia o sinal",
      "strength": "weak|moderate|strong"
    }
  ],
  "speedToLeadMinutes": minutos desde a primeira mensagem até a primeira resposta do agente (ou null),
  "firstResponseStructure": "estrutura sugerida para primeira resposta se ainda não respondeu (ou null)",
  "followUp": {
    "suggestedAt": "YYYY-MM-DDTHH:mm:ssZ timestamp sugerido para follow-up",
    "delayHours": horas de delay recomendadas,
    "angle": "ângulo ou abordagem do follow-up",
    "template": "template de mensagem de follow-up"
  },
  "silenceAlertMinutes": minutos de silêncio que devem disparar alerta (ou null)
}`;

    const generateParams: GenerateParams = {
      purpose: "copilot",
      functionName: "ai-lead-temperature",
      userId,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: "user", content: "Avalie a temperatura deste lead e os sinais de compra presentes." },
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
  Deno.serve((req) => handleAiLeadTemperature(req));
}
