import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, getCorsHeaders, requireAuth, enforceRateLimit } from "../_shared/validation.ts";
import { ElevenLabsTTSSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { logAiUsageDetached } from "../_shared/ai-usage.ts";

// LAC P2 (doc 07, achado de voz): o streaming ao provedor PAGO não tinha teto —
// uma rede travada deixava a request pendurada até o gateway cortar, e o consumo
// pago só entrava no ledger quando havia resposta (no erro, sumia). O prazo
// abaixo aborta a chamada, devolve 504 claro e registra o consumo no ledger
// mesmo quando o provedor não responde.
const ELEVENLABS_TTS_TIMEOUT_MS = 30_000;

/** O estouro de prazo chega como `AbortError` ou `TimeoutError` — mesma causa. */
function isTimeoutError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const name = (err as { name?: unknown }).name;
    return name === "AbortError" || name === "TimeoutError";
  }
  return false;
}

/**
 * `fetch` com prazo: devolve a resposta OU a causa da falha sem resposta
 * (`timedOut`: prazo estourado × erro de rede). Não engole o erro — só o
 * classifica, para o chamador decidir o status e o ledger.
 */
async function fetchComPrazo(
  input: string,
  init: RequestInit,
): Promise<{ response: Response } | { timedOut: boolean }> {
  try {
    return { response: await fetch(input, init) };
  } catch (err) {
    return { timedOut: isTimeoutError(err) };
  }
}

export async function handleElevenLabsTtsStream(req: Request): Promise<Response> {
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
    const envio = await fetchComPrazo(
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
        signal: AbortSignal.timeout(ELEVENLABS_TTS_TIMEOUT_MS),
      }
    );
    const response = "response" in envio ? envio.response : null;
    const prazoEstourou = "timedOut" in envio ? envio.timedOut : false;

    // SL-013 / IA-003 B6 — consumo PAGO (streaming) também entra no ledger:
    // antes, a geração paga saía sem nenhuma linha em `ai_usage_logs`.
    // Unidade cobrada = CARACTERE: a medição vai em `metadata`, com as colunas
    // de token NULL e `usage_unknown: true` (IA-053). A linha é escrita TAMBÉM
    // no caminho de erro (timeout/rede): quando o provedor não respondeu, a
    // quantidade fica NULL (não afirmamos um consumo que não medimos) e o motivo
    // vai em `errorMessage`.
    await logAiUsageDetached({
      functionName: "elevenlabs-tts-stream",
      userId: auth.userId,
      model: selectedModel,
      durationMs: Date.now() - iniciadoEm,
      status: response?.ok ? "success" : "error",
      errorMessage: response === null
        ? (prazoEstourou
          ? `ElevenLabs timeout (${ELEVENLABS_TTS_TIMEOUT_MS}ms)`
          : "ElevenLabs network error")
        : (response.ok ? null : `ElevenLabs HTTP ${response.status}`),
      usageUnknown: true,
      metadata: {
        provider: "elevenlabs",
        endpoint: "/v1/text-to-speech/stream",
        billing_unit: "character",
        billing_quantity: response === null ? null : text.length,
        http_status: response?.status ?? null,
      },
    });

    if (response === null) {
      log.error("ElevenLabs unreachable", { timeout: prazoEstourou });
      // 504 claro e SEM vazar detalhe interno (`errorResponse` mascararia o corpo
      // de um 5xx para "Internal server error").
      if (prazoEstourou) {
        return jsonResponse(
          { error: { code: "AI_TIMEOUT", message: "O provedor de voz demorou para responder. Tente novamente." } },
          504,
          req,
        );
      }
      return jsonResponse(
        { error: { code: "AI_PROVIDER_UNREACHABLE", message: "Não foi possível falar com o provedor de voz. Tente novamente." } },
        502,
        req,
      );
    }

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
}

if (import.meta.main) {
  Deno.serve(handleElevenLabsTtsStream);
}
