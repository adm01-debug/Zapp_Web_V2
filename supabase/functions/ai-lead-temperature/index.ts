import { handleCors, errorResponse, jsonResponse, requireAuth, Logger } from "../_shared/validation.ts";
import { parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { generateWithRouting, type GenerateParams, type GenerateResult } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { LeadTemperatureEnvelope, buildAiEnvelope, parseModelOutput } from "../_shared/ai-response-contracts.ts";
import { AiLeadTemperatureSchema } from "../_shared/schemas.ts";

export interface AiLeadTemperatureDeps {
  authorize?: (req: Request) => Promise<{ userId: string } | Response>;
  enforceGuards?: (opts: { functionName: string; userId: string; req: Request }) => Promise<Response | null>;
  generate?: (params: GenerateParams) => Promise<GenerateResult>;
}

export async function handleAiLeadTemperature(
  req: Request,
  deps: AiLeadTemperatureDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  const authorize = deps.authorize ?? requireAuth;
  const authCheck = await authorize(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const guards = deps.enforceGuards ?? enforceAiGuards;
  const __guard = await guards({ functionName: "ai-lead-temperature", userId: __uid, req });
  if (__guard) return __guard;

  const log = new Logger("ai-lead-temperature");
  const userId = extractUserIdFromRequest(req);

  try {
    const parsed = parseBody(AiLeadTemperatureSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { messages, context } = parsed.data;
    const requestId = parsed.data.requestId ?? null;

    const systemPrompt = `Você é um especialista em qualificação de leads B2B de brindes corporativos.

Analise a conversa completa e calcule a temperatura do lead em 3 dimensões:
1. Interesse (0-100): quão engajado está o cliente
2. Urgência (0-100): quão próximo está o evento/necessidade
3. Capacidade (0-100): sinais de orçamento e poder de decisão

SINAIS QUENTES: "quero fechar", "pode fazer o pedido", "preciso agora", "aprovado"
SINAIS MORNOS: "gostei", "pode ser", "me manda mais detalhes", "qual o prazo"
SINAIS FRIOS: "vou pensar", "talvez", "semana que vem", "não sei"

${context ? `Contexto: ${context}` : ''}

Responda APENAS em JSON:
{
  "temperature": <0 a 100>,
  "temperatureLabel": "<cold|warm|hot>",
  "interestScore": <0 a 100>,
  "urgencyScore": <0 a 100>,
  "capacityScore": <0 a 100>,
  "signals": ["<sinal positivo ou negativo observado>"],
  "recommendedAction": "<próximo passo recomendado para o vendedor>",
  "nextBestOffer": "<oferta ou pergunta ideal para este momento>"
}`;

    const conversationHistory = Array.isArray(messages)
      ? messages.slice(-20).map((m) => ({
          role: m.sender === 'agent' ? 'assistant' : 'user',
          content: String(m.content || ''),
        }))
      : [];

    const generateParams: GenerateParams = {
      purpose: 'copilot',
      functionName: 'ai-lead-temperature',
      userId,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: "user", content: "Qual a temperatura deste lead? Calcule com base na conversa." },
      ],
      temperature: 0.2,
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

    const validated = parseModelOutput(LeadTemperatureEnvelope, rawOutput);
    if (!validated.ok) {
      log.warn("Model output rejected by contract", {
        errors: validated.errors.map((i) => `${i.path}: ${i.message}`).slice(0, 8),
      });
      return jsonResponse(buildAiEnvelope({
        capability: 'ai-lead-temperature',
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
  Deno.serve((req) => handleAiLeadTemperature(req));
}
