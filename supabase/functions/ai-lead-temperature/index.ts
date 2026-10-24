import { handleCors, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { z, MessageSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

// CV-131–140 (fase 14): temperatura do lead — avalia engajamento e urgência de compra.
const BodySchema = z.object({
  conversationId: z.string().uuid(),
  contactId: z.string().uuid().optional().nullable(),
  messages: z.array(MessageSchema).max(30).optional().default([]),
  silenceThresholdMinutes: z.number().min(0).optional().default(60),
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const __guard = await enforceAiGuards({ functionName: "ai-lead-temperature", userId: __uid, req });
  if (__guard) return __guard;

  const log = new Logger("ai-lead-temperature");
  const _userId = extractUserIdFromRequest(req);

  try {
    const parsed = parseBody(BodySchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);
    const { messages, silenceThresholdMinutes } = parsed.data;

    const conversationText = messages
      .map((m) => `${m.sender === "agent" ? "Vendedor" : "Cliente"}: ${m.content ?? ""}`)
      .join("\n");

    const systemPrompt = `Você é um especialista em qualificação de leads B2B.
Analise a conversa para avaliar o nível de interesse e urgência de compra do cliente.
Threshold de silêncio configurado: ${silenceThresholdMinutes} minutos.
Responda APENAS em JSON válido com os campos:
- score: pontuação de 0 a 100 (temperatura do lead)
- signals: array de objetos { type: string, description: string, weight: "positive"|"negative" }
- speedToLeadMinutes: tempo ideal de resposta em minutos para manter o lead quente
- firstResponseStructure: estrutura sugerida para a próxima mensagem do vendedor (template)
- followUp: objeto { delayMinutes: number, message: string } (sugestão de follow-up)
- silenceAlertMinutes: após quantos minutos de silêncio alertar o vendedor`;

    const userPrompt = `Conversa:\n${conversationText}`;

    const result = await generateWithRouting({
      systemPrompt,
      userPrompt,
      responseFormat: "json",
      maxTokens: 700,
      functionName: "ai-lead-temperature",
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
