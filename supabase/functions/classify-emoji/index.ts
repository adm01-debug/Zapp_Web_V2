import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { ClassifyEmojiSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

const EMOJI_CATEGORIES = [
  'sorriso', 'riso', 'amor', 'triste', 'raiva',
  'surpresa', 'medo', 'nojo', 'pensativo', 'legal',
  'festa', 'comida', 'animal', 'natureza', 'esporte',
  'trabalho', 'música', 'tech', 'viagem', 'meme',
  'deboche', 'fofo', 'fantasía', 'bandeira', 'outros'
];

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("classify-emoji");

  try {
    const parsed = parseBody(ClassifyEmojiSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { image_url, file_name } = parsed.data;

    if (!image_url && !file_name) {
      log.warn("Empty input, defaulting to outros");
      return jsonResponse({ category: 'outros' }, 200, req);
    }

    const lovableApiKey = requireEnv('LOVABLE_API_KEY');

    const prompt = `Você é um classificador de emojis/emoticons customizados para uma plataforma de atendimento via WhatsApp.
Analise a imagem e o nome do arquivo "${file_name || 'emoji'}" para classificar em EXATAMENTE UMA das categorias abaixo.
Responda APENAS com o nome da categoria, sem explicação.

Categorias: ${EMOJI_CATEGORIES.join(', ')}`;

    type ContentPart = { type: 'image_url'; image_url: { url: string } } | { type: 'text'; text: string };
    const contentParts: ContentPart[] = [];

    if (image_url) {
      contentParts.push({ type: 'image_url', image_url: { url: image_url } });
    }
    contentParts.push({ type: 'text', text: prompt });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: contentParts }],
        max_tokens: 20,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errText = await response.text();
      log.error(`API error ${response.status}`, { detail: errText.substring(0, 200) });
      return jsonResponse({ category: 'outros' }, 200, req);
    }

    const result = await response.json();
    const rawCategory = (result.choices?.[0]?.message?.content || 'outros')
      .trim().toLowerCase().replace(/[^a-záàãâéêíóôõúç ]/g, '').trim();

    const category = EMOJI_CATEGORIES.includes(rawCategory) ? rawCategory : 'outros';

    log.done(200, { category });
    return jsonResponse({ category }, 200, req);
  } catch (err: unknown) {
    log.error("Error", { error: err instanceof Error ? err.message : String(err) });
    return jsonResponse({ category: 'outros' }, 200, req);
  }
});
