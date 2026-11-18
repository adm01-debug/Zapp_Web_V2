import { handleCors, errorResponse, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const guard = await enforceAiGuards({ functionName: "ai-deadline-calculator", userId: auth.userId, req });
  if (guard) return guard;

  const log = new Logger("ai-deadline-calculator");

  try {
    const body = await req.json();
    const { messages = [], requestedDeadline = "", productionDays = null } = body;

    const ctx = [
      requestedDeadline ? `Prazo solicitado pelo cliente: ${requestedDeadline}` : "",
      productionDays != null ? `Dias de produção necessários: ${productionDays}` : "",
    ].filter(Boolean).join("\n");

    const system = `Você é um copiloto de vendas especialista em gestão de prazos e cronogramas.
Analise a conversa e avalie a viabilidade do prazo solicitado pelo cliente.

${ctx}

Considere: tempo de produção, entrega, imprevistos e datas comemorativas próximas.

Responda APENAS em JSON:
{
  "feasible": <true|false>,
  "suggestedDeadline": "<prazo sugerido mais realista>",
  "riskLevel": "<low|medium|high>",
  "rushFeeApplicable": <true|false>,
  "negotiationScript": "<script para negociar o prazo com o cliente>",
  "alternativeOptions": ["<opção 1>", "<opção 2>"]
}`;

    const history = messages.slice(-10).map((m: { content: string; sender: string }) => ({
      role: m.sender === "agent" ? "assistant" : "user",
      content: String(m.content || ""),
    }));

    const { response, data } = await generateWithRouting({
      purpose: "copilot",
      functionName: "ai-deadline-calculator",
      userId: auth.userId,
      system,
      messages: [
        ...history,
        { role: "user", content: "Avalie o prazo solicitado e sugira como negociá-lo." },
      ],
      temperature: 0.3,
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
