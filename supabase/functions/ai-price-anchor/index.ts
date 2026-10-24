import { handleCors, errorResponse, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const guard = await enforceAiGuards({ functionName: "ai-price-anchor", userId: auth.userId, req });
  if (guard) return guard;

  const log = new Logger("ai-price-anchor");

  try {
    const body = await req.json();
    const { messages = [], product = "", currentPrice, targetPrice } = body;

    const priceCtx = [
      product ? `Produto: ${product}` : "",
      currentPrice != null ? `Preço atual mencionado: R$ ${currentPrice}` : "",
      targetPrice != null ? `Meta de preço: R$ ${targetPrice}` : "",
    ].filter(Boolean).join("\n");

    const system = `Você é um copiloto de vendas especialista em ancoragem de preço.
A ancoragem de preço consiste em apresentar um valor de referência maior para que o preço
real pareça mais atraente. Analise o contexto e crie uma estratégia de ancoragem.

${priceCtx}

Responda APENAS em JSON:
{
  "anchorSuggestion": "<preço âncora sugerido com justificativa>",
  "anchorScript": "<script de abordagem com o âncora>",
  "psychologyNote": "<por que essa âncora funciona neste contexto>",
  "alternatives": ["<alternativa 1>", "<alternativa 2>"]
}`;

    const history = messages.slice(-10).map((m: { content: string; sender: string }) => ({
      role: m.sender === "agent" ? "assistant" : "user",
      content: String(m.content || ""),
    }));

    const { response, data } = await generateWithRouting({
      purpose: "copilot",
      functionName: "ai-price-anchor",
      userId: auth.userId,
      system,
      messages: [
        ...history,
        { role: "user", content: "Crie uma estratégia de ancoragem de preço para esta negociação." },
      ],
      temperature: 0.6,
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
