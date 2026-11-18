import { handleCors, errorResponse, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const guard = await enforceAiGuards({ functionName: "ai-lead-temperature", userId: auth.userId, req });
  if (guard) return guard;

  const log = new Logger("ai-lead-temperature");

  try {
    const body = await req.json();
    const { messages = [], silenceThresholdMinutes = 60 } = body;

    const system = `Você é um copiloto de vendas especialista em qualificação de leads.
Analise a conversa e meça a "temperatura" do lead — o nível de interesse e proximidade de fechar.

Sinais de temperatura alta: perguntas sobre preço/prazo/entrega, pedido de proposta, urgência declarada,
confirmação de decisor, menção a orçamento disponível.

Sinais de temperatura baixa: respostas monossilábicas, longos silêncios, comparações genéricas,
sem perguntas de avanço.

Limiar de silêncio: ${silenceThresholdMinutes} minutos.

Responda APENAS em JSON:
{
  "score": <0-100>,
  "temperature": "<cold|warm|hot|boiling>",
  "signals": [
    { "type": "<urgency|budget_confirmed|decision_authority|specific_need|timeline>", "excerpt": "<trecho da mensagem>", "strength": "<weak|moderate|strong>" }
  ],
  "speedToLeadMinutes": <null ou minutos médios de resposta>,
  "followUp": {
    "suggestedAt": "<ISO 8601 ou descrição relativa>",
    "delayHours": <número>,
    "angle": "<ângulo de follow-up>",
    "template": "<mensagem sugerida>"
  },
  "silenceAlertMinutes": <null ou minutos desde última mensagem do cliente>
}`;

    const history = messages.slice(-15).map((m: { content: string; sender: string }) => ({
      role: m.sender === "agent" ? "assistant" : "user",
      content: String(m.content || ""),
    }));

    const { response, data } = await generateWithRouting({
      purpose: "copilot",
      functionName: "ai-lead-temperature",
      userId: auth.userId,
      system,
      messages: [
        ...history,
        { role: "user", content: "Avalie a temperatura deste lead e recomende a próxima ação." },
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
