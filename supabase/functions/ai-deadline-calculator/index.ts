import { handleCors, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { z, MessageSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

// CV-111–120: calculadora de prazo — extrai prazo pedido e monta rascunho de proposta.
const BodySchema = z.object({
  conversationId: z.string().uuid(),
  contactId: z.string().uuid().optional().nullable(),
  messages: z.array(MessageSchema).max(30).optional().default([]),
  latestMessage: z.string().max(2000).optional(),
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const __guard = await enforceAiGuards({ functionName: "ai-deadline-calculator", userId: __uid, req });
  if (__guard) return __guard;

  const log = new Logger("ai-deadline-calculator");
  const _userId = extractUserIdFromRequest(req);

  try {
    const parsed = parseBody(BodySchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);
    const { messages, latestMessage } = parsed.data;

    const conversationText = messages
      .map((m) => `${m.sender === "agent" ? "Vendedor" : "Cliente"}: ${m.content ?? ""}`)
      .join("\n");

    const systemPrompt = `Você é um especialista em logística e planejamento de entrega B2B.
Analise a conversa para identificar prazos solicitados e viabilidade de entrega.
Responda APENAS em JSON válido com os campos:
- deadline: objeto {
    requestedDate: string (data solicitada pelo cliente se mencionada),
    feasibleDate: string (data viável estimada),
    workingDays: number (dias úteis necessários),
    bottleneck: string (principal gargalo se houver)
  }
- impossibleDeadline: boolean (true se o prazo pedido é inviável)
- impossibleReason: string (motivo da inviabilidade, se aplicável)
- quoteDraft: objeto { items: array de {description: string, quantity: number, unit: string}, totalEstimate: string } (opcional)
- freightEstimate: objeto { type: string, estimatedDays: number, estimatedCost: string } (opcional)`;

    const userPrompt = `Conversa:\n${conversationText}\n\nÚltima mensagem: "${latestMessage ?? ""}"`;

    const result = await generateWithRouting({
      systemPrompt,
      userPrompt,
      responseFormat: "json",
      maxTokens: 700,
      functionName: "ai-deadline-calculator",
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
