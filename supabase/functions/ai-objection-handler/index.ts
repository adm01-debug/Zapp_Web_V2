import { handleCors, errorResponse, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const guard = await enforceAiGuards({ functionName: "ai-objection-handler", userId: auth.userId, req });
  if (guard) return guard;

  const log = new Logger("ai-objection-handler");

  try {
    const body = await req.json();
    const { messages = [], latestMessage = "" } = body;

    const system = `Você é um copiloto de vendas especialista em superar objeções.
Analise a última mensagem do cliente e identifique o tipo de objeção.

Tipos de objeção possíveis: price (preço muito alto), competitor (prefere concorrente),
delay (prazo não atende), min_quantity (quantidade mínima alta), hard_no (recusa firme),
trade_in (quer trocar produto antigo), other (outro tipo).

Responda APENAS em JSON:
{
  "objectionType": "<tipo>",
  "treatmentScript": "<script de tratamento>",
  "battlecard": null,
  "tradeInOffer": null,
  "smallerLotSuggestion": null,
  "postNoRecovery": null
}

Para objection competitor, preencha battlecard: { "competitorName": "", "ourAdvantages": [], "theirWeaknesses": [], "talkingPoints": [] }
Para trade_in, preencha tradeInOffer.
Para min_quantity, preencha smallerLotSuggestion.
Para hard_no, preencha postNoRecovery.`;

    const history = messages.slice(-10).map((m: { content: string; sender: string }) => ({
      role: m.sender === "agent" ? "assistant" : "user",
      content: String(m.content || ""),
    }));

    const { response, data } = await generateWithRouting({
      purpose: "copilot",
      functionName: "ai-objection-handler",
      userId: auth.userId,
      system,
      messages: [
        ...history,
        { role: "user", content: `Última mensagem do cliente: "${latestMessage}"\n\nIdentifique a objeção e gere o tratamento.` },
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
