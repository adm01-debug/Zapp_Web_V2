import { handleCors, errorResponse, jsonResponse, Logger } from "../_shared/validation.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { ClassifyAudioMemeSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { requireAiIdentity } from "../_shared/ai-auth.ts";

const AUDIO_CATEGORIES = [
  'risada', 'aplausos', 'suspense', 'vitória', 'falha',
  'surpresa', 'triste', 'raiva', 'romântico', 'medo',
  'deboche', 'narração', 'bordão', 'efeito sonoro', 'viral',
  'cumprimento', 'despedida', 'animação', 'drama', 'gospel', 'outros'
];

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // IA-011: identidade de usuário verificada + cota antes de gastar provedor.
  const identity = await requireAiIdentity(req, "classify-audio-meme");
  if (identity instanceof Response) return identity;

  const log = new Logger("classify-audio-meme");

  try {
    const parsed = parseBody(ClassifyAudioMemeSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { audio_url, file_name } = parsed.data;

    if (!audio_url && !file_name) {
      log.warn("Empty input, defaulting to outros");
      return jsonResponse({ category: 'outros' }, 200, req);
    }

    const prompt = `Você é um classificador de áudios meme/sons engraçados para uma biblioteca de atendimento via WhatsApp. 
Com base no nome do arquivo "${file_name || 'audio'}" e na URL "${audio_url}", classifique em EXATAMENTE UMA das categorias abaixo.
Responda APENAS com o nome da categoria, sem explicação.

Categorias: ${AUDIO_CATEGORIES.join(', ')}

REGRA IMPORTANTE: A categoria "viral" deve ser usada SOMENTE para sons que são tendências ATUAIS de TikTok/Reels. Memes brasileiros conhecidos, bordões de TV, frases famosas de celebridades devem ser classificados como "bordão". Sons cômicos e engraçados devem ser "risada" ou "deboche".`;

    // Despacho central (auditoria do Bloco 05): sem URL fixa do gateway, sem modelo
    // fixo e sem chave fixa no consumidor. O provedor e o modelo são decididos no
    // servidor a partir da finalidade.
    const gen = await generateWithRouting({
      purpose: 'tagging',
      functionName: 'classify-audio-meme',
      userId: identity.userId,
      messages: [{ role: 'user', content: prompt }],
      extraBody: { max_tokens: 20 },
      temperature: 0.1,
      timeoutMs: 15000,
    });

    // Degradação preservada: falha de roteamento/provedor/HTTP vira 'outros' (200),
    // nunca 500. O despacho central JÁ registra todo desfecho de erro em
    // ai_usage_logs, então nada degrada para 'outros' sem trilha.
    if (!gen.ok || !gen.data) {
      log.error(`API error ${gen.response.status}`, { detail: gen.errorCode ?? 'unknown' });
      return jsonResponse({ category: 'outros' }, 200, req);
    }

    const result = gen.data as { choices?: Array<{ message?: { content?: string } }> };
    const rawCategory = (result.choices?.[0]?.message?.content || 'outros')
      .trim().toLowerCase().replace(/[^a-záàãâéêíóôõúç ]/g, '').trim();

    const category = AUDIO_CATEGORIES.includes(rawCategory) ? rawCategory : 'outros';

    log.done(200, { category });
    return jsonResponse({ category }, 200, req);
  } catch (err: unknown) {
    log.error("Error", { error: err instanceof Error ? err.message : String(err) });
    return jsonResponse({ category: 'outros' }, 200, req);
  }
});
