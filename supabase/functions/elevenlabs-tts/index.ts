import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, getCorsHeaders, enforceRateLimit, getClientIP } from "../_shared/validation.ts";
import { ElevenLabsTTSSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-tts");

  const ip = getClientIP(req);
  const rl = await enforceRateLimit(`tts:${ip}`, 20, 60_000);
  if (!rl.allowed) return errorResponse('Rate limit exceeded', 429, req);

  try {
    const parsed = parseBody(ElevenLabsTTSSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { text, voiceId, modelId, languageCode, applyTextNormalization } = parsed.data;
    const ELEVENLABS_API_KEY = requireEnv("ELEVENLABS_API_KEY");

    const selectedVoiceId = voiceId || 'TY3h8ANhQUsJaa0Bga5F';
    const selectedModel = modelId || 'eleven_v3';

    log.info(`TTS: "${text.substring(0, 50)}..." voice: ${selectedVoiceId}, model: ${selectedModel}`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}?output_format=mp3_44100_128`,
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

    if (!response.ok) {
      const errorText = await response.text();
      log.error("ElevenLabs API error", { status: response.status, detail: errorText.substring(0, 300) });
      if (response.status === 401) return errorResponse("Invalid ElevenLabs API key", 401, req);
      if (response.status === 429) return errorResponse("Rate limit exceeded", 429, req);
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    log.done(200, { bytes: audioBuffer.byteLength });

    return new Response(audioBuffer, {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'audio/mpeg' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error("Unhandled error", { error: errorMessage });
    return errorResponse(errorMessage, 500, req);
  }
});
