import { handleCors, errorResponse, jsonResponse, requireAuth, Logger } from "../_shared/validation.ts";
import { parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { generateWithRouting, type GenerateParams, type GenerateResult } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { parseJsonObject } from "../_shared/ai-json.ts";
import { ProductRecommendationEnvelope, buildAiEnvelope, parseModelOutput } from "../_shared/ai-response-contracts.ts";
import { AiProductRecommendationSchema } from "../_shared/schemas.ts";

export interface AiProductRecommendationDeps {
  authorize?: (req: Request) => Promise<{ userId: string } | Response>;
  enforceGuards?: (opts: { functionName: string; userId: string; req: Request }) => Promise<Response | null>;
  generate?: (params: GenerateParams) => Promise<GenerateResult>;
}

export async function handleAiProductRecommendation(
  req: Request,
  deps: AiProductRecommendationDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  const authorize = deps.authorize ?? requireAuth;
  const authCheck = await authorize(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const guards = deps.enforceGuards ?? enforceAiGuards;
  const __guard = await guards({ functionName: "ai-product-recommendation", userId: __uid, req });
  if (__guard) return __guard;

  const log = new Logger("ai-product-recommendation");
  const userId = extractUserIdFromRequest(req);

  try {
    const parsed = parseBody(AiProductRecommendationSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { messages, eventType, budget, quantity, context } = parsed.data;
    const requestId = parsed.data.requestId ?? null;

    const systemPrompt = `Você é um consultor especialista em brindes corporativos B2B. Sua missão é recomendar os produtos mais adequados com base no contexto da conversa.

CATEGORIAS DE BRINDES:
- Escritório: caneta, bloco, mousepad, porta-cartão, agenda
- Bebidas: caneca, squeeze, copo térmico, garrafa
- Vestuário: camiseta, boné, jaleco, mochila
- Tecnologia: pendrive, carregador portátil, cabo USB
- Decoração: porta-retrato, chaveiro, porta-objetos
- Premium: kit de vinho, caixa personalizada, relógio

${eventType ? `Tipo de evento: ${eventType}` : ''}
${budget ? `Orçamento por unidade: R$ ${budget}` : ''}
${quantity ? `Quantidade: ${quantity} unidades` : ''}
${context ? `Contexto adicional: ${context}` : ''}

Analise a conversa e recomende produtos. Responda APENAS em JSON:
{
  "recommendations": [
    {
      "product": "<nome do produto>",
      "category": "<categoria>",
      "reasoning": "<por que é ideal para este caso>",
      "estimatedPrice": "<faixa de preço em R$>",
      "confidence": <0 a 1>,
      "urgency": "<low|medium|high>"
    }
  ],
  "topPick": "<nome do produto mais recomendado>",
  "upsellOpportunity": "<sugestão de upgrade ou complemento>"
}

Máximo 3 recomendações, ordenadas por relevância.`;

    const conversationHistory = Array.isArray(messages)
      ? messages.slice(-15).map((m) => ({
          role: m.sender === 'agent' ? 'assistant' : 'user',
          content: String(m.content || ''),
        }))
      : [];

    const generateParams: GenerateParams = {
      purpose: 'copilot',
      functionName: 'ai-product-recommendation',
      userId,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: "user", content: "Qual produto recomendar para este cliente?" },
      ],
      temperature: 0.4,
    };

    const generate = deps.generate;
    const { response, data } = generate
      ? await generate({ ...generateParams, requestId })
      : await generateWithRouting({ ...generateParams, requestId });

    if (!response.ok || !data) {
      if (response.status === 429) return errorResponse("Limite de requisicoes excedido.", 429, req);
      if (response.status === 402) return errorResponse("Creditos insuficientes.", 402, req);
      throw new Error(`AI gateway error [${response.status}]`);
    }

    const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })
      .choices?.[0]?.message?.content;

    const rawOutput = parseJsonObject(content as string);

    const validated = parseModelOutput(ProductRecommendationEnvelope, rawOutput);
    if (!validated.ok) {
      log.warn("Model output rejected by contract", {
        errors: validated.errors.map((i) => `${i.path}: ${i.message}`).slice(0, 8),
      });
      return jsonResponse(buildAiEnvelope({
        capability: 'ai-product-recommendation',
        status: 'error',
        error: 'Resposta do modelo fora do contrato.',
        evidence: { errors: validated.errors },
      }), 502, req);
    }

    log.done(200);
    return jsonResponse({ ...validated.data, requestId: requestId ?? undefined }, 200, req);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Unhandled error", { error: errorMessage });
    return errorResponse(errorMessage, 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleAiProductRecommendation(req));
}
