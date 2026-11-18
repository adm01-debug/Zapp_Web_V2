import { handleCors, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { z, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

// CV-141–150 (fase 15): análise multimodal — interpreta imagens/áudios enviados pelo cliente.
const BodySchema = z.object({
  conversationId: z.string().uuid(),
  contactId: z.string().uuid().optional().nullable(),
  mediaUrl: z.string().url().max(2048),
  mediaType: z.enum(["image", "audio", "document", "video"]),
  analysisHint: z.string().max(500).optional(),
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const __guard = await enforceAiGuards({ functionName: "ai-multimodal-analysis", userId: __uid, req });
  if (__guard) return __guard;

  const log = new Logger("ai-multimodal-analysis");
  const _userId = extractUserIdFromRequest(req);

  try {
    const parsed = parseBody(BodySchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);
    const { mediaUrl, mediaType, analysisHint } = parsed.data;

    const systemPrompt = `Você é um analista especialista em mídia para vendas B2B.
Analise o conteúdo de mídia descrito e extraia informações relevantes para o contexto de vendas.
Tipo de mídia: ${mediaType}.
Dica de análise: ${analysisHint ?? "extrair informações relevantes para vendas"}.
Responda APENAS em JSON válido com os campos:
- results: array de objetos {
    type: "product"|"document"|"competitor"|"complaint"|"request"|"other",
    description: string (descrição do que foi identificado),
    actionable: string (ação sugerida para o vendedor)
  }
- competitorLogoDetected: boolean
- competitorName: string (nome do concorrente se identificado)
- contextSnippet: string (trecho de texto extraído da mídia se aplicável)`;

    const userPrompt = `URL da mídia: ${mediaUrl}\nTipo: ${mediaType}`;

    const result = await generateWithRouting({
      systemPrompt,
      userPrompt,
      responseFormat: "json",
      maxTokens: 600,
      functionName: "ai-multimodal-analysis",
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
