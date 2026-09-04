import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { ClassifyAudioMemeSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

const AUDIO_CATEGORIES = [
  'risada', 'aplausos', 'suspense', 'vitória', 'falha',
  'surpresa', 'triste', 'raiva', 'romântico', 'medo',
  'deboche', 'narração', 'bordão', 'efeito sonoro', 'viral',
  'cumprimento', 'despedida', 'animação', 'drama', 'gospel', 'outros'
];

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("classify-audio-meme");

  try {
    const parsed = parseBody(ClassifyAudioMemeSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { audio_url, file_name } = parsed.data;

    if (!audio_url && !file_name) {
      log.warn("Empty input, defaulting to outros");
      return jsonResponse({ category: 'outros' }, 200, req);
    }

    const lovableApiKey = requireEnv('LOVABLE_API_KEY');

    const prompt = `Você é um classificador de áudios meme/sons engraçados para uma biblioteca de atendimento via WhatsApp. 
Com base no nome do arquivo "${file_name || 'audio'}" e na URL "${audio_url}", classifique em EXATAMENTE UMA das categorias abaixo.
Responda APENAS com o nome da categoria, sem explicação.

Categorias: ${AUDIO_CATEGORIES.join(', ')}

REGRA IMPORTANTE: A categoria "viral" deve ser usada SOMENTE para sons que são tendências ATUAIS de TikTok/Reels. Memes brasileiros conhecidos, bordões de TV, frases famosas de celebridades devem ser classificados como "bordão". Sons cômicos e engraçados devem ser "risada" ou "deboche".`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: prompt }],
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

    const category = AUDIO_CATEGORIES.includes(rawCategory) ? rawCategory : 'outros';

    log.done(200, { category });
    return jsonResponse({ category }, 200, req);
  } catch (err: unknown) {
    log.error("Error", { error: err instanceof Error ? err.message : String(err) });
    return jsonResponse({ category: 'outros' }, 200, req);
  }
});
