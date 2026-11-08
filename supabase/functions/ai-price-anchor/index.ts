import { handleCors, errorResponse, jsonResponse, requireAuth, Logger } from "../_shared/validation.ts";
import { parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { generateWithRouting, type GenerateParams, type GenerateResult } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { PriceAnchorEnvelope, buildAiEnvelope, parseModelOutput } from "../_shared/ai-response-contracts.ts";
import { AiPriceAnchorSchema } from "../_shared/schemas.ts";

export interface AiPriceAnchorDeps {
  authorize?: (req: Request) => Promise<{ userId: string } | Response>;
  enforceGuards?: (opts: { functionName: string; userId: string; req: Request }) => Promise<Response | null>;
  generate?: (params: GenerateParams) => Promise<GenerateResult>;
}

export async function handleAiPriceAnchor(
  req: Request,
  deps: AiPriceAnchorDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  const authorize = deps.authorize ?? requireAuth;
  const authCheck = await authorize(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const guards = deps.enforceGuards ?? enforceAiGuards;
  const __guard = await guards({ functionName: "ai-price-anchor", userId: __uid, req });
  if (__guard) return __guard;

  const log = new Logger("ai-price-anchor");
  const userId = extractUserIdFromRequest(req);

  try {
    const parsed = parseBody(AiPriceAnchorSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { clientText, messages, productType, unitPrice, context } = parsed.data;
    const requestId = parsed.data.requestId ?? null;

    const systemPrompt = `Você é um especialista em técnicas de ancoragem de preço para vendas B2B de brindes corporativos.

TÉCNICAS DISPONÍVEIS:
1. Âncora alta: mostre o premium antes do preço real
2. Custo por uso: divida pelo número de impressões/usos
3. Custo por pessoa: divida pelo número de participantes do evento
4. Comparação de valor: compare com o impacto de marca gerado
5. Valor agregado: destaque o que está incluso no preço

${unitPrice ? `Preço unitário: R$ ${unitPrice}` : ''}
${productType ? `Tipo de produto: ${productType}` : ''}
${context ? `Contexto: ${context}` : ''}

Analise a situação e responda APENAS em JSON:
{
  "triggered": <boolean — há sensibilidade a preço?>,
  "strategy": "<anchor_high|cost_per_use|cost_per_person|value_comparison|bundle_value>",
  "anchorScript": "<frase para apresentar o preço com âncora>",
  "costPerUseScript": "<cálculo mostrando custo mínimo por uso/impressão>",
  "reframing": "<como reposicionar o valor na cabeça do cliente>",
  "confidence": <0 a 1>
}`;

    const conversationHistory = Array.isArray(messages)
      ? messages.slice(-10).map((m) => ({
          role: m.sender === 'agent' ? 'assistant' : 'user',
          content: String(m.content || ''),
        }))
      : [];

    const generateParams: GenerateParams = {
      purpose: 'copilot',
      functionName: 'ai-price-anchor',
      userId,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: "user", content: `Texto do cliente: "${clientText}"` },
      ],
      temperature: 0.3,
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

    let rawOutput: unknown = null;
    try {
      const jsonMatch = (content as string).match(/\{[\s\S]*\}/);
      if (jsonMatch) rawOutput = JSON.parse(jsonMatch[0]);
    } catch { rawOutput = null; }

    const validated = parseModelOutput(PriceAnchorEnvelope, rawOutput);
    if (!validated.ok) {
      log.warn("Model output rejected by contract", {
        errors: validated.errors.map((i) => `${i.path}: ${i.message}`).slice(0, 8),
      });
      return jsonResponse(buildAiEnvelope({
        capability: 'ai-price-anchor',
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
  Deno.serve((req) => handleAiPriceAnchor(req));
}
