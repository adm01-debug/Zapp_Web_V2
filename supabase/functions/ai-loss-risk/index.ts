import { handleCors, errorResponse, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { generateWithRouting, type GenerateParams } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

export async function handleAiLossRisk(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const { userId } = authCheck as { userId: string };
  const guard = await enforceAiGuards({ functionName: "ai-loss-risk", userId, req });
  if (guard) return guard;

  const log = new Logger("ai-loss-risk");
  try {
    const body = await req.json();
    const { messages = [], triggerThreshold = 50 } = body;

    const conversationHistory = Array.isArray(messages)
      ? messages.slice(-20).map((m: { content: string; sender: string; timestamp?: string }) => ({
          role: m.sender === "agent" ? "assistant" : "user",
          content: String(m.content || ""),
        }))
      : [];

    const systemPrompt = `Você é especialista em detecção de risco de perda de venda via análise de conversas WhatsApp B2B.

Avalie os sinais de risco presentes na conversa. Score de 0 (sem risco) a 100 (perda iminente).
Threshold de alerta configurado: ${triggerThreshold}.

Sinais de risco que você detecta:
- "response_time": demora longa nas respostas do cliente
- "engagement_drop": mensagens mais curtas, menos perguntas
- "competitor_mention": cliente menciona concorrente
- "stall_phrase": frases de procrastinação ("vou pensar", "depois", "está caro")
- "silence": cliente parou de responder

Responda APENAS em JSON:
{
  "riskScore": número de 0 a 100,
  "signals": [
    {
      "type": "response_time|engagement_drop|competitor_mention|stall_phrase|silence",
      "weight": número de 1 a 10 (importância do sinal),
      "description": "descrição do sinal detectado"
    }
  ],
  "recoveryAction": "ação de recuperação recomendada ao vendedor"
}`;

    const generateParams: GenerateParams = {
      purpose: "copilot",
      functionName: "ai-loss-risk",
      userId,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: "user", content: "Analise os sinais de risco de perda desta conversa e calcule o score." },
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
  Deno.serve((req) => handleAiLossRisk(req));
}
