import { handleCors, jsonResponse, requireEnv, Logger, requireAuth } from "../_shared/validation.ts";
import { z, MessageSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

// CV-081–090: âncora de preço — enquadra valor, sugere desconto máximo permitido.
const BodySchema = z.object({
  conversationId: z.string().uuid(),
  contactId: z.string().uuid().optional().nullable(),
  messages: z.array(MessageSchema).max(30).optional().default([]),
  latestMessage: z.string().max(2000).optional(),
  sellerMaxDiscountPct: z.number().min(0).max(100).optional(),
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const __guard = await enforceAiGuards({ functionName: "ai-price-anchor", userId: __uid, req });
  if (__guard) return __guard;

  const log = new Logger("ai-price-anchor");
  const _userId = extractUserIdFromRequest(req);

  try {
    const parsed = parseBody(BodySchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);
    const { messages, latestMessage, sellerMaxDiscountPct } = parsed.data;

    const conversationText = messages
      .map((m) => `${m.sender === "agent" ? "Vendedor" : "Cliente"}: ${m.content ?? ""}`)
      .join("\n");

    const systemPrompt = `Você é um consultor especialista em precificação e negociação B2B.
Analise a conversa para identificar sensibilidade ao preço e sugerir estratégia de ancoragem.
O desconto máximo permitido pelo vendedor é: ${sellerMaxDiscountPct ?? "não informado"}%.
Responda APENAS em JSON válido com os campos:
- valueFraming: argumento de valor para justificar o preço (2-3 frases)
- anchorComparison: comparação com alternativas ou concorrentes (1-2 frases)
- maxDiscountPct: desconto máximo sugerido (número, respeitando o limite do vendedor)
- proposedDiscountPct: desconto inicial sugerido para negociação (número)`;

    const userPrompt = `Conversa:\n${conversationText}\n\nÚltima mensagem: "${latestMessage ?? ""}"`;

    const result = await generateWithRouting({
      systemPrompt,
      userPrompt,
      responseFormat: "json",
      maxTokens: 600,
      functionName: "ai-price-anchor",
    });

    if (!result.content) {
      log.warn("modelo não retornou conteúdo");
      return jsonResponse({ error: "no_content" }, 422, req);
    }

    let parsed2: Record<string, unknown>;
    try {
      parsed2 = JSON.parse(result.content);
    } catch {
      log.warn("resposta do modelo não é JSON válido");
      return jsonResponse({ error: "invalid_json" }, 422, req);
    }

    return jsonResponse(parsed2, 200, req);
  } catch (err) {
    log.warn("erro inesperado", { msg: err instanceof Error ? err.message : String(err) });
    return jsonResponse({ error: "internal_error" }, 500, req);
  }
});
