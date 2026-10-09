import { handleCors, errorResponse, requireEnv, Logger, getCorsHeaders, requireAuth, enforceRateLimit } from "../_shared/validation.ts";
import { logAiUsageDetached } from "../_shared/ai-usage.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-sts");

  // JWT ja e validado pelo gateway (verify_jwt=true); aqui o usuario vira a
  // chave do rate limit persistente — cota paga (ElevenLabs/Mapbox) por usuario.
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const rl = await enforceRateLimit(`elevenlabs-sts:${auth.userId}`, 10, 60_000);
  if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

  try {
    const ELEVENLABS_API_KEY = requireEnv('ELEVENLABS_API_KEY');

    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    const voiceId = formData.get('voiceId') as string;
    const modelId = formData.get('modelId') as string;

    if (!audioFile) return errorResponse('Audio file is required', 400, req);
    if (!voiceId || voiceId.length > 100) return errorResponse('Valid voice ID is required', 400, req);

    const selectedModel = (modelId && modelId.length <= 100) ? modelId : 'eleven_multilingual_sts_v2';

    log.info("Converting audio", { size: audioFile.size, voiceId, model: selectedModel });

    const apiFormData = new FormData();
    apiFormData.append('audio', audioFile);
    apiFormData.append('model_id', selectedModel);

    const iniciadoEm = Date.now();
    const response = await fetch(
      `https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY },
        body: apiFormData,
      }
    );

    // SL-013 / IA-003 B6 — conversão paga (speech-to-speech) sem linha no
    // ledger é consumo invisível no relatório de custo. A unidade cobrada é o
    // SEGUNDO de áudio; a duração não é medida aqui (o arquivo chega em bytes),
    // então a linha declara `usage_unknown: true` — ausência declarada, nunca
    // zero medido (IA-053).
    await logAiUsageDetached({
      functionName: "elevenlabs-sts",
      userId: auth.userId,
      model: selectedModel,
      durationMs: Date.now() - iniciadoEm,
      status: response.ok ? "success" : "error",
      errorMessage: response.ok ? null : `ElevenLabs HTTP ${response.status}`,
      usageUnknown: true,
      metadata: {
        provider: "elevenlabs",
        endpoint: "/v1/speech-to-speech",
        billing_unit: "second",
        billing_quantity: null,
        input_bytes: audioFile.size,
        http_status: response.status,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error("ElevenLabs STS error", { status: response.status, detail: errorText.substring(0, 300) });
      if (response.status === 401) return errorResponse('Invalid ElevenLabs API key', 401, req);
      if (response.status === 429) return errorResponse('Rate limit exceeded', 429, req);
      throw new Error(`ElevenLabs STS error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    log.done(200, { outputSize: audioBuffer.byteLength });

    return new Response(audioBuffer, {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'audio/mpeg' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error("Unhandled error", { error: errorMessage });
    return errorResponse(errorMessage, 500, req);
  }
});
