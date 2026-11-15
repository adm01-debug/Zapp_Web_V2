import { handleCors, errorResponse, jsonResponse, requireAuth, Logger } from "../_shared/validation.ts";
import { parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { generateWithRouting, type GenerateParams, type GenerateResult } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { parseJsonObject } from "../_shared/ai-json.ts";
import { MultimodalAnalysisEnvelope, buildAiEnvelope, parseModelOutput } from "../_shared/ai-response-contracts.ts";
import { AiMultimodalAnalysisSchema } from "../_shared/schemas.ts";
import { AiImageInputError, toInlineImage } from "../_shared/ai-image-input.ts";

export interface AiMultimodalAnalysisDeps {
  authorize?: (req: Request) => Promise<{ userId: string } | Response>;
  enforceGuards?: (opts: { functionName: string; userId: string; req: Request }) => Promise<Response | null>;
  generate?: (params: GenerateParams) => Promise<GenerateResult>;
  /** Injeção para teste; em produção o download real do objeto do Storage. */
  inlineImage?: typeof toInlineImage;
}

/**
 * JWT do chamador, extraído do header `Authorization` (`Bearer <jwt>`,
 * case-insensitive). É ele que autoriza o download do objeto PRIVADO sob a
 * identidade do usuário — a policy de `storage.objects` decide (R2-INF-022).
 */
function bearerTokenDoPedido(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

export async function handleAiMultimodalAnalysis(
  req: Request,
  deps: AiMultimodalAnalysisDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  const authorize = deps.authorize ?? requireAuth;
  const authCheck = await authorize(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const guards = deps.enforceGuards ?? enforceAiGuards;
  const __guard = await guards({ functionName: "ai-multimodal-analysis", userId: __uid, req });
  if (__guard) return __guard;

  const log = new Logger("ai-multimodal-analysis");
  const userId = extractUserIdFromRequest(req);

  try {
    const parsed = parseBody(AiMultimodalAnalysisSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { imageUrl, context, conversationContext } = parsed.data;
    const requestId = parsed.data.requestId ?? null;

    const systemPrompt = `Você é um especialista em análise visual de imagens no contexto de vendas B2B de brindes corporativos.

Analise a imagem fornecida e identifique:
1. O que é o produto/objeto na imagem
2. Texto visível (logos, marcas, inscrições)
3. Cores e estilo visual dominantes
4. Oportunidades de personalização de brinde
5. Sugestão de resposta relevante para a conversa de vendas

${context ? `Contexto adicional: ${context}` : ''}

Responda APENAS em JSON:
{
  "description": "<descrição clara do conteúdo da imagem>",
  "extractedText": ["<texto 1>", "<texto 2>"],
  "dominantColors": ["<cor 1>", "<cor 2>"],
  "keyElements": ["<elemento 1>", "<elemento 2>"],
  "brandingOpportunity": "<como isso pode ser usado em brindes>",
  "suggestedReply": "<resposta sugerida para o agente baseada na imagem>",
  "confidence": <0 a 1>
}`;

    // O bucket `whatsapp-media` é PRIVADO (`public=false`): a URL
    // `/object/public/...` devolve HTTP 400 para terceiros e o modelo NÃO
    // consegue buscar a imagem. Então o objeto é baixado no servidor sob a
    // identidade do CHAMADOR (anon key + JWT do pedido) e vai EMBUTIDO como
    // data URL — o mesmo caminho de `classify-emoji`/`classify-sticker`.
    const inlineImage = deps.inlineImage ?? toInlineImage;
    let imageDataUrl: string;
    try {
      const inline = await inlineImage(imageUrl, {
        storageIdentity: {
          kind: "user",
          bearerToken: bearerTokenDoPedido(req),
          anonKey: Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
        },
      });
      imageDataUrl = inline.dataUrl;
    } catch (err) {
      // O `message` do `AiImageInputError` carrega `<bucket>/<path>` — locator
      // de objeto privado que não pode ir para o log; registra-se só o código
      // tipado (estável). Sem imagem não há análise: recusa em 422, antes de
      // qualquer chamada ao provedor pago.
      log.error("image-input-failed", {
        code: err instanceof AiImageInputError ? err.code : "IMAGE_INPUT_UNKNOWN",
      });
      return errorResponse("Imagem nao pode ser obtida para analise.", 422, req);
    }

    // Mensagem com imagem no formato vision
    const visionMessage = {
      role: "user" as const,
      content: [
        {
          type: "image_url",
          image_url: { url: imageDataUrl },
        },
        {
          type: "text",
          text: conversationContext
            ? `Esta imagem foi enviada pelo cliente. Contexto da conversa: ${conversationContext}`
            : "Analise esta imagem enviada pelo cliente.",
        },
      ],
    };

    const generateParams: GenerateParams = {
      purpose: 'copilot',
      functionName: 'ai-multimodal-analysis',
      userId,
      system: systemPrompt,
      messages: [visionMessage],
      temperature: 0.3,
      // Vision requer modelo específico — o roteador seleciona por `need`
      need: { modality: 'vision' },
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

    const validated = parseModelOutput(MultimodalAnalysisEnvelope, rawOutput);
    if (!validated.ok) {
      log.warn("Model output rejected by contract", {
        errors: validated.errors.map((i) => `${i.path}: ${i.message}`).slice(0, 8),
      });
      return jsonResponse(buildAiEnvelope({
        capability: 'ai-multimodal-analysis',
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
  Deno.serve((req) => handleAiMultimodalAnalysis(req));
}
