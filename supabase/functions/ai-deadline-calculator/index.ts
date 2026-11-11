import { handleCors, errorResponse, jsonResponse, requireAuth, Logger } from "../_shared/validation.ts";
import { parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { generateWithRouting, type GenerateParams, type GenerateResult } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { DeadlineCalculatorEnvelope, buildAiEnvelope, parseModelOutput } from "../_shared/ai-response-contracts.ts";
import { AiDeadlineCalculatorSchema } from "../_shared/schemas.ts";

export interface AiDeadlineCalculatorDeps {
  authorize?: (req: Request) => Promise<{ userId: string } | Response>;
  enforceGuards?: (opts: { functionName: string; userId: string; req: Request }) => Promise<Response | null>;
  generate?: (params: GenerateParams) => Promise<GenerateResult>;
}

export async function handleAiDeadlineCalculator(
  req: Request,
  deps: AiDeadlineCalculatorDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  const authorize = deps.authorize ?? requireAuth;
  const authCheck = await authorize(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const guards = deps.enforceGuards ?? enforceAiGuards;
  const __guard = await guards({ functionName: "ai-deadline-calculator", userId: __uid, req });
  if (__guard) return __guard;

  const log = new Logger("ai-deadline-calculator");
  const userId = extractUserIdFromRequest(req);

  try {
    const parsed = parseBody(AiDeadlineCalculatorSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { messages, eventDate, productType, context } = parsed.data;
    const requestId = parsed.data.requestId ?? null;
    const today = new Date().toISOString().split('T')[0];

    const systemPrompt = `Você é um especialista em prazos de produção de brindes corporativos. Hoje é ${today}.

PRAZOS MÉDIOS DE PRODUÇÃO (dias úteis):
- caneta: 5 dias
- caneca: 7 dias
- camiseta: 10 dias
- squeeze: 8 dias
- mochila: 12 dias
- produto simples (estoque): 2-3 dias
- produto padrão: 10 dias

${eventDate ? `Data do evento: ${eventDate}` : ''}
${productType ? `Tipo de produto: ${productType}` : ''}
${context ? `Contexto: ${context}` : ''}

Analise a conversa, extraia a data do evento (se mencionada) e calcule a viabilidade.
Responda APENAS em JSON:
{
  "feasibility": "<ok|tight|impossible>",
  "productionDays": <número de dias de produção>,
  "daysUntilEvent": <dias até o evento ou null>,
  "lastOrderDate": "<YYYY-MM-DD ou null>",
  "message": "<mensagem clara sobre o prazo>",
  "alternatives": ["<alternativa 1>", "<alternativa 2>"],
  "urgencyLevel": "<low|medium|high|critical>"
}`;

    const conversationHistory = Array.isArray(messages)
      ? messages.slice(-10).map((m) => ({
          role: m.sender === 'agent' ? 'assistant' : 'user',
          content: String(m.content || ''),
        }))
      : [];

    const generateParams: GenerateParams = {
      purpose: 'copilot',
      functionName: 'ai-deadline-calculator',
      userId,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: "user", content: "Calcule a viabilidade do prazo para este pedido." },
      ],
      temperature: 0.1,
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

    const validated = parseModelOutput(DeadlineCalculatorEnvelope, rawOutput);
    if (!validated.ok) {
      log.warn("Model output rejected by contract", {
        errors: validated.errors.map((i) => `${i.path}: ${i.message}`).slice(0, 8),
      });
      return jsonResponse(buildAiEnvelope({
        capability: 'ai-deadline-calculator',
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
  Deno.serve((req) => handleAiDeadlineCalculator(req));
}
