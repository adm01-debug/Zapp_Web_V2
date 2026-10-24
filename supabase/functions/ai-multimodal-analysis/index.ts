import { handleCors, errorResponse, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { generateWithRouting, type GenerateParams } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

export async function handleAiMultimodalAnalysis(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const { userId } = authCheck as { userId: string };
  const guard = await enforceAiGuards({ functionName: "ai-multimodal-analysis", userId, req });
  if (guard) return guard;

  const log = new Logger("ai-multimodal-analysis");
  try {
    const body = await req.json();
    const { contactId, mediaUrl, mediaType = "image", analysisHint } = body;

    const analysisTypes = [
      "audio_transcription", "audio_sentiment", "image_description",
      "logo_detection", "ocr", "pdf_catalog", "competitor_print",
      "label_reader", "chart_extractor",
    ];

    const hint = analysisTypes.includes(analysisHint) ? analysisHint : null;
    const contactContext = contactId ? `Contact ID: ${contactId}.` : "";

    const systemPrompt = `Você é especialista em análise multimodal de mídia para vendas B2B via WhatsApp (distribuidora/comercial).
${contactContext}

Tipo de mídia recebida: ${mediaType}.
${hint ? `Tipo de análise solicitada: ${hint}.` : "Detecte automaticamente o melhor tipo de análise."}

Tipos de análise disponíveis:
- audio_transcription: transcrever áudio para texto
- audio_sentiment: analisar sentimento/emoção no áudio
- image_description: descrever imagem em detalhes
- logo_detection: detectar logotipo de concorrente na imagem
- ocr: extrair texto da imagem
- pdf_catalog: extrair produtos/preços de catálogo PDF
- competitor_print: identificar material impresso de concorrente
- label_reader: ler rótulo/etiqueta de produto
- chart_extractor: extrair dados de gráfico

URL da mídia: ${mediaUrl}

Responda APENAS em JSON:
{
  "results": [
    {
      "type": "um dos tipos acima",
      "text": "resultado textual da análise",
      "confidence": número de 0 a 1,
      "metadata": {}
    }
  ],
  "competitorLogoDetected": true/false,
  "competitorName": "nome do concorrente detectado ou null",
  "contextSnippet": "trecho relevante para usar na conversa ou null"
}`;

    const generateParams: GenerateParams = {
      purpose: "copilot",
      functionName: "ai-multimodal-analysis",
      userId,
      system: systemPrompt,
      messages: [
        { role: "user", content: `Analise a mídia (${mediaType}) disponível em: ${mediaUrl}` },
      ],
      temperature: 0.2,
    };

    const { response, data } = await generateWithRouting(generateParams);
    if (!response.ok || !data) {
      if (response.status === 429) return errorResponse("Limite de requisicoes excedido. Tente novamente.", 429, req);
      if (response.status === 402) return errorResponse("Creditos insuficientes. Adicione creditos.", 402, req);
      throw new Error(`AI gateway error [${response.status}]`);
    }

    const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })
      .choices?.[0]?.message?.content;
    let result: unknown = null;
    try {
      const jsonMatch = (content as string).match(/\{[\s\S]*\}/);
      if (jsonMatch) result = JSON.parse(jsonMatch[0]);
    } catch { result = null; }

    log.done(200);
    return jsonResponse(result ?? {}, 200, req);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log.error("Unhandled error", { error: msg });
    return errorResponse(msg, 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleAiMultimodalAnalysis(req));
}
