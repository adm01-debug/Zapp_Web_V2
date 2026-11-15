import { handleCors, errorResponse, jsonResponse, requireAuth, Logger } from "../_shared/validation.ts";
import { parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { generateWithRouting, type GenerateParams, type GenerateResult } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { parseJsonObject } from "../_shared/ai-json.ts";
import { LossRiskEnvelope, buildAiEnvelope, parseModelOutput } from "../_shared/ai-response-contracts.ts";
import { AiLossRiskSchema } from "../_shared/schemas.ts";

export interface AiLossRiskDeps {
  authorize?: (req: Request) => Promise<{ userId: string } | Response>;
  enforceGuards?: (opts: { functionName: string; userId: string; req: Request }) => Promise<Response | null>;
  generate?: (params: GenerateParams) => Promise<GenerateResult>;
}

export async function handleAiLossRisk(
  req: Request,
  deps: AiLossRiskDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  const authorize = deps.authorize ?? requireAuth;
  const authCheck = await authorize(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const guards = deps.enforceGuards ?? enforceAiGuards;
  const __guard = await guards({ functionName: "ai-loss-risk", userId: __uid, req });
  if (__guard) return __guard;

  const log = new Logger("ai-loss-risk");
  const userId = extractUserIdFromRequest(req);

  try {
    const parsed = parseBody(AiLossRiskSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { messages, daysSinceLastContact, context } = parsed.data;
    const requestId = parsed.data.requestId ?? null;

    const systemPrompt = `Você é um especialista em retenção de clientes B2B de brindes. Analise a conversa e sinais de comportamento para detectar risco de perda da venda.

SINAIS DE ALTO RISCO: cancelamento, desistência, fechou com outro, já comprou em outro lugar, obrigado mesmo assim
SINAIS DE MÉDIO RISCO: vou pensar, cotando em outros, comparando preços, não decidi, semana que vem
SINAIS DE BAIXO RISCO: demora, resposta lenta, adiamento sem motivo

${daysSinceLastContact != null ? `Dias sem contato: ${daysSinceLastContact}` : ''}
${context ? `Contexto: ${context}` : ''}

Analise e responda APENAS em JSON:
{
  "level": "<low|medium|high>",
  "riskScore": <0 a 100>,
  "signals": ["<sinal 1>", "<sinal 2>"],
  "recoveryAction": "<ação imediata para o vendedor>",
  "script": "<mensagem sugerida para o cliente, ou string vazia se risco baixo>",
  "urgency": "<now|today|this_week|monitor>"
}`;

    const conversationHistory = Array.isArray(messages)
      ? messages.slice(-15).map((m) => ({
          role: m.sender === 'agent' ? 'assistant' : 'user',
          content: String(m.content || ''),
        }))
      : [];

    const generateParams: GenerateParams = {
      purpose: 'copilot',
      functionName: 'ai-loss-risk',
      userId,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: "user", content: "Analise o risco de perda desta venda com base na conversa acima." },
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

    const rawOutput = parseJsonObject(content as string);

    const validated = parseModelOutput(LossRiskEnvelope, rawOutput);
    if (!validated.ok) {
      log.warn("Model output rejected by contract", {
        errors: validated.errors.map((i) => `${i.path}: ${i.message}`).slice(0, 8),
      });
      return jsonResponse(buildAiEnvelope({
        capability: 'ai-loss-risk',
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
  Deno.serve((req) => handleAiLossRisk(req));
}
