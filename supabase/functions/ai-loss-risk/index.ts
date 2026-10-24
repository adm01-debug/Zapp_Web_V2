import { handleCors, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { z, MessageSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

// CV-091–100: risco de perda — avalia sinais de desengajamento e sugere ação de recuperação.
const BodySchema = z.object({
  conversationId: z.string().uuid(),
  contactId: z.string().uuid().optional().nullable(),
  messages: z.array(MessageSchema).max(30).optional().default([]),
  triggerThreshold: z.number().min(0).max(100).optional().default(50),
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const __guard = await enforceAiGuards({ functionName: "ai-loss-risk", userId: __uid, req });
  if (__guard) return __guard;

  const log = new Logger("ai-loss-risk");
  const _userId = extractUserIdFromRequest(req);

  try {
    const parsed = parseBody(BodySchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);
    const { messages, triggerThreshold } = parsed.data;

    const conversationText = messages
      .map((m) => `${m.sender === "agent" ? "Vendedor" : "Cliente"}: ${m.content ?? ""}`)
      .join("\n");

    const systemPrompt = `Você é um especialista em retenção de clientes B2B.
Analise a conversa para detectar sinais de risco de perda do negócio.
Threshold configurado: ${triggerThreshold}% (acima disso o risco é considerado alto).
Responda APENAS em JSON válido com os campos:
- riskScore: pontuação de risco de 0 a 100
- signals: array de objetos { type: string, description: string, severity: "low"|"medium"|"high" }
- recoveryAction: ação imediata recomendada para o vendedor (1-2 frases)`;

    const userPrompt = `Conversa:\n${conversationText}`;

    const result = await generateWithRouting({
      systemPrompt,
      userPrompt,
      responseFormat: "json",
      maxTokens: 600,
      functionName: "ai-loss-risk",
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
