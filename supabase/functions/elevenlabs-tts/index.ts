import { handleCors, errorResponse, internalErrorResponse, jsonResponse, requireEnv, Logger, getCorsHeaders, enforceRateLimit, requireAuth } from "../_shared/validation.ts";
import { ElevenLabsTTSSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { logAiUsageDetached } from "../_shared/ai-usage.ts";

/**
 * G5 — teto da chamada PAGA de TTS ao provedor (`POST /v1/text-to-speech`).
 *
 * Sem ele o `fetch` fica pendurado para sempre quando o provedor não responde:
 * o handler não tem prazo nenhum e a requisição fica presa até o gateway cortar.
 */
export const TTS_TIMEOUT_MS = 30_000;

/**
 * G5 — corrida entre a promessa e o `AbortSignal` do prazo.
 *
 * O sinal também vai ao `fetch` real (abort nativo). Este invólucro garante que
 * um `fetch` PENDURADO — ou uma implementação que ignore o `signal` do `init` —
 * não trave o handler: o prazo rejeita a promessa de fora.
 */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/** Estouro de prazo (ou abort de rede) — vira 504 em vez de 500 genérico. */
function isTimeoutError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "TimeoutError" || error.name === "AbortError";
  }
  return error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError");
}

/**
 * SL-013 / IA-003 B6 — chamada PAGA ao provedor sem registro é consumo que não
 * aparece no relatório de custo (IA-058). A unidade cobrada aqui é CARACTERE, não
 * token: a medição vai em `metadata` e as colunas de token ficam NULL com
 * `usage_unknown: true` (IA-053 — "não medi" nunca vira 0).
 *
 * G5 — a linha sai por TENTATIVA, inclusive a que estourou o prazo: o provedor
 * pode ter sido cobrado antes do abort, e a tentativa abortada não pode virar
 * consumo invisível. `http_status: null` distingue "não houve resposta".
 */
async function registrarConsumoTts(args: {
  userId: string;
  model: string;
  durationMs: number;
  ok: boolean;
  httpStatus: number | null;
  errorMessage: string | null;
  textLength: number;
}): Promise<void> {
  await logAiUsageDetached({
    functionName: "elevenlabs-tts",
    userId: args.userId,
    model: args.model,
    durationMs: args.durationMs,
    status: args.ok ? "success" : "error",
    errorMessage: args.errorMessage,
    usageUnknown: true,
    metadata: {
      provider: "elevenlabs",
      endpoint: "/v1/text-to-speech",
      billing_unit: "character",
      billing_quantity: args.textLength,
      http_status: args.httpStatus,
    },
  });
}

/**
 * Seam de teste (mesmo padrão das outras edge functions): o `fetch` ao provedor
 * e o prazo podem ser injetados. Em produção nada é passado e o handler usa as
 * implementações reais — por isso o teste chama o handler REAL.
 */
export interface ElevenLabsTtsDeps {
  /** `fetch` para o provedor de TTS (default: o global). */
  fetch?: typeof fetch;
  /** G5 — teto da chamada em ms (default: `TTS_TIMEOUT_MS`). */
  ttsTimeoutMs?: number;
}

export async function handleElevenLabsTts(
  req: Request,
  deps: ElevenLabsTtsDeps = {},
): Promise<Response> {
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
    const ELEVENLABS_API_KEY = requireEnv("ELEVENLABS_API_KEY");

    const selectedVoiceId = voiceId || 'TY3h8ANhQUsJaa0Bga5F';
    const selectedModel = modelId || 'eleven_v3';

    // F16: sem trecho do texto — o roteiro e conteudo do cliente e nao pode
    // aparecer em log. Tamanho basta para diagnostico.
    log.info(`TTS: ${text.length} caracteres, voice: ${selectedVoiceId}, model: ${selectedModel}`);

    const doFetch = deps.fetch ?? fetch;
    const timeoutMs = deps.ttsTimeoutMs ?? TTS_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const iniciadoEm = Date.now();

    let response: Response;
    try {
      // G5 — a chamada PAGA tem teto: provedor pendurado vira 504 em vez de
      // prender o handler. O `signal` também vai no `init` (abort nativo).
      response = await abortable(
        doFetch(
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
            signal: controller.signal,
          },
        ),
        controller.signal,
      );
    } catch (error) {
      clearTimeout(timer);
      const timedOut = isTimeoutError(error);
      await registrarConsumoTts({
        userId: auth.userId,
        model: selectedModel,
        durationMs: Date.now() - iniciadoEm,
        ok: false,
        httpStatus: null,
        errorMessage: timedOut
          ? "provider_timeout"
          : (error instanceof Error ? error.message : "provider_fetch_failed"),
        textLength: text.length,
      });
      if (timedOut) {
        log.error("ElevenLabs TTS timed out", { timeoutMs });
        return errorResponse("ElevenLabs provider timed out", 504, req);
      }
      throw error;
    }

    // G5 — o prazo vale só até os CABEÇALHOS chegarem e é desarmado AQUI. Não se
    // usa `AbortSignal.timeout` porque ele continuaria armado durante a leitura do
    // corpo: uma síntese longa (`arrayBuffer()` demorado) seria cortada no meio.
    clearTimeout(timer);

    await registrarConsumoTts({
      userId: auth.userId,
      model: selectedModel,
      durationMs: Date.now() - iniciadoEm,
      ok: response.ok,
      httpStatus: response.status,
      errorMessage: response.ok ? null : `ElevenLabs HTTP ${response.status}`,
      textLength: text.length,
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
    // G5 — 500 sem detalhe interno: o `error.message` não vai ao cliente.
    return internalErrorResponse(error, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleElevenLabsTts(req));
}
