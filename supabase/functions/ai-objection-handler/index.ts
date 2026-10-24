import { handleCors, jsonResponse, requireEnv, Logger, requireAuth } from "../_shared/validation.ts";
import { z, MessageSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

// CV-071–080: handler de objeções de vendas — sugere script de tratamento e battlecard.
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
  const __guard = await enforceAiGuards({ functionName: "ai-objection-handler", userId: __uid, req });
  if (__guard) return __guard;

  const log = new Logger("ai-objection-handler");
  const _userId = extractUserIdFromRequest(req);

  try {
    const parsed = parseBody(BodySchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);
    const { messages, latestMessage } = parsed.data;

    const conversationText = messages
      .map((m) => `${m.sender === "agent" ? "Vendedor" : "Cliente"}: ${m.content ?? ""}`)
      .join("\n");

    const systemPrompt = `Você é um especialista em vendas B2B que ajuda vendedores a superar objeções de clientes.
Analise a conversa e a última mensagem do cliente para identificar a objeção e sugerir o melhor tratamento.
Responda APENAS em JSON válido com os campos:
- objectionType: tipo da objeção (ex: "price", "time", "need", "trust", "competitor", "no_budget")
- treatmentScript: script de resposta para o vendedor (2-4 frases)
- battlecard: objeto com { headline, keyPoints (array de strings), closingLine }
- tradeInOffer: sugestão de troca/substituição quando aplicável (opcional)
- smallerLotSuggestion: sugestão de lote menor quando objeção é custo (opcional)
- postNoRecovery: mensagem de recuperação para objeção de "já decidi não" (opcional)`;

    const userPrompt = `Conversa:\n${conversationText}\n\nÚltima mensagem do cliente: "${latestMessage ?? ""}"`;

    const result = await generateWithRouting({
      systemPrompt,
      userPrompt,
      responseFormat: "json",
      maxTokens: 800,
      functionName: "ai-objection-handler",
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
