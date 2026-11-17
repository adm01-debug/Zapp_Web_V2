import { handleCors, errorResponse, jsonResponse, requireAuth } from "../_shared/validation.ts";
import { parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { generateWithRouting, type GenerateParams, type GenerateResult } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { parseJsonObject } from "../_shared/ai-json.ts";
import { ObjectionHandlerEnvelope, buildAiEnvelope, parseModelOutput } from "../_shared/ai-response-contracts.ts";
import { AiObjectionHandlerSchema } from "../_shared/schemas.ts";
import { Logger } from "../_shared/validation.ts";

export interface AiObjectionHandlerDeps {
  authorize?: (req: Request) => Promise<{ userId: string } | Response>;
  enforceGuards?: (opts: { functionName: string; userId: string; req: Request }) => Promise<Response | null>;
  generate?: (params: GenerateParams) => Promise<GenerateResult>;
}

export async function handleAiObjectionHandler(
  req: Request,
  deps: AiObjectionHandlerDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  const authorize = deps.authorize ?? requireAuth;
  const authCheck = await authorize(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const guards = deps.enforceGuards ?? enforceAiGuards;
  const __guard = await guards({ functionName: "ai-objection-handler", userId: __uid, req });
  if (__guard) return __guard;

  const log = new Logger("ai-objection-handler");
  const userId = extractUserIdFromRequest(req);

  try {
    const parsed = parseBody(AiObjectionHandlerSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { messages, context } = parsed.data;
    const requestId = parsed.data.requestId ?? null;
    const clientText = parsed.data.clientText ??
      messages.filter((m) => m.sender !== 'agent').map((m) => m.content).join(' ').trim().slice(0, 500);

    const systemPrompt = `Você é um especialista em vendas B2B de brindes corporativos. Sua tarefa é detectar objeções de compra e gerar roteiros de tratamento usando a metodologia B·R·I·N·D·E.

METODOLOGIA B·R·I·N·D·E:
B — Baixe a guarda (acolha o cliente, não discuta)
R — Repita (confirme entendeu a objeção)
I — Investigue (pergunte a causa real)
N — Neutralize (mostre o valor)
D — Demonstre (comprove com dados/exemplos)
E — Encaminhe (conduza para o fechamento)

TIPOS DE OBJEÇÃO:
- preco: menção a preço alto, caro, orçamento
- prazo: urgência, data limite, demora
- quantidade_minima: mínimo de pedido alto
- concorrente: outros fornecedores, comparação
- chefe: necessidade de aprovação
- qualidade: dúvida sobre material/acabamento
- frete: custo de envio
- generica: indecisão, "vou pensar"

Analise o texto do cliente e responda APENAS em JSON:
{
  "objectionType": "<tipo ou null>",
  "isSmokescreen": <boolean>,
  "confidence": <0 a 1>,
  "brindeLetter": "<B|R|I|N|D|E — qual etapa aplicar agora>",
  "script": ["<passo 1>", "<passo 2>", "<passo 3>"],
  "suggestedReply": "<mensagem sugerida para o cliente>",
  "coaching": "<dica interna para o vendedor>"
}

isSmokescreen = true quando há sinal de compra junto à objeção (ex: "gostei mas tá caro").
confidence = 0 quando não há objeção.
${context ? `Contexto adicional: ${context}` : ''}`;

    const conversationHistory = Array.isArray(messages)
      ? messages.slice(-10).map((m) => ({
          role: m.sender === 'agent' ? 'assistant' : 'user',
          content: String(m.content || ''),
        }))
      : [];

    const generateParams: GenerateParams = {
      purpose: 'copilot',
      functionName: 'ai-objection-handler',
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

    const rawOutput = parseJsonObject(content as string);

    const validated = parseModelOutput(ObjectionHandlerEnvelope, rawOutput);
    if (!validated.ok) {
      log.warn("Model output rejected by contract", {
        errors: validated.errors.map((i) => `${i.path}: ${i.message}`).slice(0, 8),
      });
      return jsonResponse(buildAiEnvelope({
        capability: 'ai-objection-handler',
        status: 'error',
        error: 'Resposta do modelo fora do contrato.',
        evidence: { errors: validated.errors },
      }), 502, req);
    }

    log.done(200);
    return jsonResponse(
      { ...validated.data, treatmentSteps: validated.data.script, requestId: requestId ?? undefined },
      200,
      req,
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Unhandled error", { error: errorMessage });
    return errorResponse(errorMessage, 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleAiObjectionHandler(req));
}
