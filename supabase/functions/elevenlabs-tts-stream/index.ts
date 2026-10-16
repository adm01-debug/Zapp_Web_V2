import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, getCorsHeaders, requireAuth, enforceRateLimit } from "../_shared/validation.ts";
import { ElevenLabsTTSSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { logAiUsageDetached } from "../_shared/ai-usage.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-tts-stream");

  // JWT ja e validado pelo gateway (verify_jwt=true); aqui o usuario vira a
  // chave do rate limit persistente — cota paga (ElevenLabs/Mapbox) por usuario.
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const rl = await enforceRateLimit(`elevenlabs-tts-stream:${auth.userId}`, 30, 60_000);
  if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

  try {
    const parsed = parseBody(ElevenLabsTTSSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { text, voiceId, modelId, languageCode, applyTextNormalization } = parsed.data;
    const ELEVENLABS_API_KEY = requireEnv("ELEVENLABS_API_KEY");

    const selectedVoiceId = voiceId || 'TY3h8ANhQUsJaa0Bga5F';
    const selectedModel = modelId || 'eleven_flash_v2_5';

    // F16 (mesma classe do fix em elevenlabs-tts): log nunca carrega o roteiro
    // do usuario — apenas metadados.
    log.info(`Streaming TTS: ${text.length} caracteres, voice: ${selectedVoiceId}`);

    const iniciadoEm = Date.now();
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}/stream?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: selectedModel,
          language_code: languageCode,
          apply_text_normalization: applyTextNormalization || 'auto',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    // SL-013 / IA-003 B6 — consumo PAGO (streaming) também entra no ledger:
    // antes, a geração paga saía sem nenhuma linha em `ai_usage_logs`.
    // Unidade cobrada = CARACTERE: a medição vai em `metadata`, com as colunas
    // de token NULL e `usage_unknown: true` (IA-053).
    await logAiUsageDetached({
      functionName: "elevenlabs-tts-stream",
      userId: auth.userId,
      model: selectedModel,
      durationMs: Date.now() - iniciadoEm,
      status: response.ok ? "success" : "error",
      errorMessage: response.ok ? null : `ElevenLabs HTTP ${response.status}`,
      usageUnknown: true,
      metadata: {
        provider: "elevenlabs",
        endpoint: "/v1/text-to-speech/stream",
        billing_unit: "character",
        billing_quantity: text.length,
        http_status: response.status,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error("Streaming API error", { status: response.status, detail: errorText.substring(0, 300) });
      if (response.status === 401) return errorResponse("Invalid ElevenLabs API key", 401, req);
      if (response.status === 429) return errorResponse("Rate limit exceeded", 429, req);
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    log.done(200);
    return new Response(response.body, {
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error("Unhandled error", { error: errorMessage });
    return errorResponse(errorMessage, 500, req);
  }
});
