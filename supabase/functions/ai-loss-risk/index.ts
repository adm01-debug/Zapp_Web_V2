import { handleCors, errorResponse, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const guard = await enforceAiGuards({ functionName: "ai-loss-risk", userId: auth.userId, req });
  if (guard) return guard;

  const log = new Logger("ai-loss-risk");

  try {
    const body = await req.json();
    const { messages = [], lastActivityAt } = body;

    const silenceCtx = lastActivityAt
      ? `Última atividade: ${lastActivityAt}`
      : "";

    const system = `Você é um copiloto de vendas especialista em detectar risco de perda de negócio.
Analise a conversa e avalie a probabilidade de perda do cliente/negócio.

${silenceCtx}

Sinais de risco: silêncio prolongado, objeções não resolvidas, comparações com concorrentes,
pedidos sem resposta, tom decrescente de interesse.

Responda APENAS em JSON:
{
  "riskScore": <0-100>,
  "riskLevel": "<low|medium|high|critical>",
  "riskFactors": ["<fator 1>", "<fator 2>"],
  "recoveryScript": "<script de recuperação>",
  "interventionUrgency": "<immediate|within_24h|within_week|monitor>"
}`;

    const history = messages.slice(-15).map((m: { content: string; sender: string }) => ({
      role: m.sender === "agent" ? "assistant" : "user",
      content: String(m.content || ""),
    }));

    const { response, data } = await generateWithRouting({
      purpose: "copilot",
      functionName: "ai-loss-risk",
      userId: auth.userId,
      system,
      messages: [
        ...history,
        { role: "user", content: "Avalie o risco de perda desta negociação e sugira ação de recuperação." },
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
