import { handleCors, errorResponse, getCorsHeaders, Logger, requireEnv, requireAuth, enforceRateLimit } from "../_shared/validation.ts";

const VOICE_PRESETS: Record<string, { voiceId: string; label: string }> = {
  // Masculinas
  'grave':      { voiceId: 'JBFqnCBsd6RMkjVDRZzb', label: 'George (Grave)' },
  'roger':      { voiceId: 'CwhRBWXzGAHq8TQ4Fs17', label: 'Roger (Narrador)' },
  'animado':    { voiceId: 'TX3LPaxmHKxFdv7VOQHJ', label: 'Liam (Animado)' },
  'misterioso': { voiceId: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel (Misterioso)' },
  'brian':      { voiceId: 'nPczCjzI2devNBz1zQrb', label: 'Brian' },
  'bill':       { voiceId: 'pqHfZKP75CvOlQylNhV4', label: 'Bill' },
  'eric':       { voiceId: 'cjVigY5qzO86Huf0OWal', label: 'Eric' },
  'will':       { voiceId: 'bIHbv24MWmeRgasZH58o', label: 'Will' },
  'callum':     { voiceId: 'N2lVS1w4EtoT3dr4eOWO', label: 'Callum' },
  'charlie':    { voiceId: 'IKne3meq5aSn9XLyUdCD', label: 'Charlie' },
  // Femininas
  'feminina':   { voiceId: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah' },
  'laura':      { voiceId: 'FGY2WhTYpPnrIDTdsKH5', label: 'Laura' },
  'alice':      { voiceId: 'Xb7hH8MSUJpSbSDYk0k2', label: 'Alice' },
  'matilda':    { voiceId: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda' },
  'jessica':    { voiceId: 'cgSgspJ2msm6clMCkdW9', label: 'Jessica' },
  'lily':       { voiceId: 'pFZP5JQG7iQjIQuC4Bku', label: 'Lily' },
  // Neutras/Especiais
  'river':      { voiceId: 'SAz9YHcvj6GT2YYXdXww', label: 'River' },
  'robo':       { voiceId: 'iP95p4xoKVk53GoZ742B', label: 'Chris (Robô)' },
  'glitch':     { voiceId: 'kPtEHAvRnjUJFv7SK9WI', label: 'Glitch' },
  // Temáticas
  'santa':      { voiceId: 'MDLAMJ0jxkpYkjXbmG4t', label: 'Papai Noel' },
  'mrs_claus':  { voiceId: 'SAhdygBsjizE9aIj39dz', label: 'Mamãe Noel' },
  'elf':        { voiceId: 'e79twtVS2278lVZZQiAD', label: 'Elfo' },
  'reindeer':   { voiceId: 'h6u4tPKmcPlxUdZOaVpH', label: 'Rena' },
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("voice-changer");

  // JWT ja e validado pelo gateway (verify_jwt=true); aqui o usuario vira a
  // chave do rate limit persistente — cota paga (ElevenLabs/Mapbox) por usuario.
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const rl = await enforceRateLimit(`voice-changer:${auth.userId}`, 10, 60_000);
  if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

  try {
    const elevenlabsKey = requireEnv('ELEVENLABS_API_KEY');
    
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;
    const voicePreset = formData.get('voice_preset') as string || 'grave';

    if (!audioFile) {
      return errorResponse('Audio file is required', 400, req);
    }

    if (audioFile.size > 10 * 1024 * 1024) {
      return errorResponse('Audio file exceeds 10MB limit', 400, req);
    }

    const preset = VOICE_PRESETS[voicePreset];
    if (!preset) {
      return errorResponse(`Invalid voice preset: ${voicePreset}`, 400, req);
    }

    log.info('Processing voice change', { preset: voicePreset, size: audioFile.size });

    const apiFormData = new FormData();
    apiFormData.append('audio', audioFile);
    apiFormData.append('model_id', 'eleven_multilingual_sts_v2');
    apiFormData.append('voice_settings', JSON.stringify({
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
    }));

    const response = await fetch(
      `https://api.elevenlabs.io/v1/speech-to-speech/${preset.voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': elevenlabsKey,
        },
        body: apiFormData,
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      log.error(`ElevenLabs STS error ${response.status}`, { detail: errText.substring(0, 300) });
      return errorResponse(`Voice transformation failed: ${response.status}`, 502, req);
    }

    const audioBuffer = await response.arrayBuffer();
    log.done(200, { outputSize: audioBuffer.byteLength });

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    });
  } catch (err: unknown) {
    log.error("Voice changer error", { error: err instanceof Error ? err.message : String(err) });
    return errorResponse('Internal error processing voice change', 500, req);
  }
});
