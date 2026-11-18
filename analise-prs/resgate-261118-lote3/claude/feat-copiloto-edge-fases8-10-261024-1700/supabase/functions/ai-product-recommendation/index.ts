import { handleCors, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { z, MessageSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

// CV-101–110: recomendação de produto — sugere cross-sell/upsell com base no contexto.
const BodySchema = z.object({
  conversationId: z.string().uuid(),
  contactId: z.string().uuid().optional().nullable(),
  messages: z.array(MessageSchema).max(30).optional().default([]),
  latestMessage: z.string().max(2000).optional(),
  currentFunnelStage: z.string().max(50).optional(),
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const __guard = await enforceAiGuards({ functionName: "ai-product-recommendation", userId: __uid, req });
  if (__guard) return __guard;

  const log = new Logger("ai-product-recommendation");
  const _userId = extractUserIdFromRequest(req);

  try {
    const parsed = parseBody(BodySchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);
    const { messages, latestMessage, currentFunnelStage } = parsed.data;

    const conversationText = messages
      .map((m) => `${m.sender === "agent" ? "Vendedor" : "Cliente"}: ${m.content ?? ""}`)
      .join("\n");

    const systemPrompt = `Você é um consultor de vendas especialista em cross-sell e upsell B2B.
Analise a conversa para identificar oportunidades de recomendar produtos complementares.
Estágio atual do funil: ${currentFunnelStage ?? "não informado"}.
Responda APENAS em JSON válido com o campo:
- recommendations: array de objetos {
    productName: string,
    type: "cross_sell"|"upsell"|"bundle",
    rationale: string (por que este produto faz sentido),
    pitch: string (como apresentar ao cliente, 1-2 frases)
  }`;

    const userPrompt = `Conversa:\n${conversationText}\n\nÚltima mensagem: "${latestMessage ?? ""}"`;

    const result = await generateWithRouting({
      systemPrompt,
      userPrompt,
      responseFormat: "json",
      maxTokens: 700,
      functionName: "ai-product-recommendation",
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
