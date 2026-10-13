import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, getCorsHeaders, enforceRateLimit, requireAuth } from "../_shared/validation.ts";
import { ElevenLabsTTSSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { logAiUsageDetached } from "../_shared/ai-usage.ts";
import { aiCapabilityFlagKey, readCapabilityFlag } from "../_shared/ai-feature-flags.ts";

// `import.meta.main` (mesmo padrão de `elevenlabs-sts`/`elevenlabs-dialogue`): o
// handler pode ser importado por teste sem subir o servidor.
export async function handleElevenLabsTts(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-tts");

  // Cota paga (ElevenLabs) por usuario, nao por IP: o front manda o token da sessao.
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const rl = await enforceRateLimit(`elevenlabs-tts:${auth.userId}`, 20, 60_000);
  if (!rl.allowed) return errorResponse('Rate limit exceeded', 429, req);

  try {
    const parsed = parseBody(ElevenLabsTTSSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { text, voiceId, modelId, languageCode, applyTextNormalization } = parsed.data;

    // IA-009 / SL-010b (decisão do cartão t_98090b40): kill switch de voz lido no
    // SERVIDOR antes de tocar o provedor pago. A família de voz/áudio inteira
    // responde à chave única `ai.capability.voice`; desligada (ou leitura não
    // confiável) NEGA — nenhuma chamada à ElevenLabs. `jsonResponse` (nunca
    // `errorResponse` em 5xx: acima de 500 o corpo vira "Internal server error" e
    // o consumidor perderia o código).
    const voiceEnabled = await readCapabilityFlag(aiCapabilityFlagKey("voice"));
    if (voiceEnabled !== true) {
      log.warn("IA de voz desativada por flag — provedor nao chamado");
      return jsonResponse(
        { error: { code: "AI_DISABLED", message: "IA de voz desativada por flag." } },
        503,
        req,
      );
    }

    const ELEVENLABS_API_KEY = requireEnv("ELEVENLABS_API_KEY");

    const selectedVoiceId = voiceId || 'TY3h8ANhQUsJaa0Bga5F';
    const selectedModel = modelId || 'eleven_v3';

    // F16: sem trecho do texto — o roteiro e conteudo do cliente e nao pode
    // aparecer em log. Tamanho basta para diagnostico.
    log.info(`TTS: ${text.length} caracteres, voice: ${selectedVoiceId}, model: ${selectedModel}`);

    const iniciadoEm = Date.now();
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

    // SL-013 / IA-003 B6 — chamada PAGA ao provedor sem registro é consumo que
    // não aparece no relatório de custo (IA-058). A unidade cobrada aqui é
    // CARACTERE, não token: a medição vai em `metadata` e as colunas de token
    // ficam NULL com `usage_unknown: true` (IA-053 — "não medi" nunca vira 0).
    await logAiUsageDetached({
      functionName: "elevenlabs-tts",
      userId: auth.userId,
      model: selectedModel,
      durationMs: Date.now() - iniciadoEm,
      status: response.ok ? "success" : "error",
      errorMessage: response.ok ? null : `ElevenLabs HTTP ${response.status}`,
      usageUnknown: true,
      metadata: {
        provider: "elevenlabs",
        endpoint: "/v1/text-to-speech",
        billing_unit: "character",
        billing_quantity: text.length,
        http_status: response.status,
      },
    });

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
}

if (import.meta.main) {
  Deno.serve(handleElevenLabsTts);
}
