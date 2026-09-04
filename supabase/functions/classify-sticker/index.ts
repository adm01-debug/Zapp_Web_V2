import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { ClassifyStickerSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

const STICKER_CATEGORIES = [
  'comemoração', 'riso', 'chorando', 'amor', 'raiva',
  'surpresa', 'pensativo', 'cumprimento', 'despedida', 'concordância',
  'negação', 'sono', 'fome', 'medo', 'vergonha',
  'deboche', 'fofo', 'triste', 'animado', 'engraçado', 'outros'
];

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("classify-sticker");

  try {
    const parsed = parseBody(ClassifyStickerSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { image_url } = parsed.data;

    if (!image_url) {
      return jsonResponse({ category: 'outros' }, 200, req);
    }

    const lovableApiKey = requireEnv('LOVABLE_API_KEY');

    const prompt = `Analise esta figurinha/sticker e classifique em EXATAMENTE UMA das categorias abaixo. Responda APENAS com o nome da categoria, sem explicação.

Categorias: ${STICKER_CATEGORIES.join(', ')}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: image_url } },
            { type: 'text', text: prompt },
          ],
        }],
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

    const category = STICKER_CATEGORIES.includes(rawCategory) ? rawCategory : 'outros';

    log.done(200, { category });
    return jsonResponse({ category }, 200, req);
  } catch (err: unknown) {
    log.error("Error", { error: err instanceof Error ? err.message : String(err) });
    return jsonResponse({ category: 'outros' }, 200, req);
  }
});
