import { handleCors, errorResponse, requireEnv, Logger, getCorsHeaders, requireAuth, enforceRateLimit } from "../_shared/validation.ts";
import { logAiUsageDetached } from "../_shared/ai-usage.ts";

/**
 * IA-122/IA-128 (Bloco 13 — Voz, transcrição, TTS e comandos).
 *
 * O que faltava: este handler repassava ao provedor PAGO
 * (`POST /v1/speech-to-speech/{voiceId}`) qualquer upload do cliente. `req.formData()`
 * materializava o corpo inteiro na memória sem teto, e o arquivo seguia sem nenhuma
 * conferência de conteúdo — um blob que só DIZ ser áudio (ou um arquivo de centenas
 * de MB) gastava memória e crédito do provedor antes de qualquer recusa.
 *
 * Aqui a recusa acontece em duas fronteiras:
 *  1. no `content-length`, ANTES de `req.formData()` — o corpo abusivo nunca é lido;
 *  2. no `size` real do `File` e na ASSINATURA do container (magic bytes) — o
 *     `File.type` vem do cliente e pode mentir, então o tipo é provado nos bytes.
 * Mesmo teto do STT (`ai-transcribe-audio`, 25 MiB).
 */

/** Teto do upload aceito, igual ao do caminho de STT. */
export const MAX_STS_AUDIO_BYTES = 25 * 1024 * 1024;

/** Containers que o app envia (gravador webm/opus, wav, m4a, mp3) e o provedor aceita. */
export type StsAudioFormat = "mp3" | "wav" | "ogg" | "webm" | "m4a";

/** Bytes lidos para identificar o container (ID3 + cabeçalho de frame mp3 já bastam). */
export const STS_SNIFF_BYTES = 16;

function startsWith(bytes: Uint8Array, ascii: string): boolean {
  if (bytes.length < ascii.length) return false;
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Identifica o container pelos BYTES reais. Devolve `null` quando não é nenhum
 * áudio reconhecido — o chamador recusa em vez de mandar payload que o provedor
 * recusaria (ou, pior, tratar como áudio).
 */
export function sniffStsAudioFormat(bytes: Uint8Array): StsAudioFormat | null {
  if (bytes.length >= 12 && startsWith(bytes, "RIFF") && startsWith(bytes.subarray(8), "WAVE")) {
    return "wav";
  }
  if (startsWith(bytes, "OggS")) return "ogg";
  // EBML (webm/mkv): 0x1A 0x45 0xDF 0xA3
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "webm";
  }
  // ISO-BMFF (mp4/m4a): "ftyp" no offset 4.
  if (bytes.length >= 8 && startsWith(bytes.subarray(4), "ftyp")) return "m4a";
  if (startsWith(bytes, "ID3")) return "mp3";
  // Frame MPEG sem tag ID3: sincronismo de 11 bits (0xFF + top 3 bits em 1).
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mp3";
  return null;
}

/** Recusa tipada do upload (status + mensagem), ou `null` quando pode seguir. */
export interface StsUploadRejection {
  status: number;
  error: string;
}

/** Lê só os primeiros bytes do arquivo — o suficiente para o container. */
async function readHead(file: File): Promise<Uint8Array> {
  const head = await file.slice(0, STS_SNIFF_BYTES).arrayBuffer();
  return new Uint8Array(head);
}

/**
 * Confere tamanho real e conteúdo ANTES de gastar o provedor. O `File.type`
 * declarado NÃO é fonte de verdade: a prova do tipo é a assinatura dos bytes.
 */
export async function validateStsUpload(file: File): Promise<StsUploadRejection | null> {
  if (file.size === 0) {
    return { status: 400, error: "Arquivo de áudio vazio" };
  }
  if (file.size > MAX_STS_AUDIO_BYTES) {
    return {
      status: 413,
      error: `Audio file too large (max ${MAX_STS_AUDIO_BYTES} bytes)`,
    };
  }
  if (!sniffStsAudioFormat(await readHead(file))) {
    return { status: 415, error: "Conteúdo não é um áudio reconhecido" };
  }
  return null;
}

export async function handleElevenLabsSts(req: Request): Promise<Response> {
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

    // Teto no cabeçalho ANTES de `req.formData()`: o corpo abusivo não chega a
    // ser lido para a memória (o `content-length` pode mentir para baixo, e aí o
    // `size` real do File decide no passo seguinte).
    const announced = Number(req.headers.get("content-length") ?? "");
    if (Number.isFinite(announced) && announced > MAX_STS_AUDIO_BYTES) {
      return errorResponse(`Audio file too large (max ${MAX_STS_AUDIO_BYTES} bytes)`, 413, req);
    }

    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;
    const voiceId = formData.get('voiceId') as string;
    const modelId = formData.get('modelId') as string;

    if (!audioFile) return errorResponse('Audio file is required', 400, req);
    if (!voiceId || voiceId.length > 100) return errorResponse('Valid voice ID is required', 400, req);

    const uploadRejection = await validateStsUpload(audioFile);
    if (uploadRejection) {
      log.info("Upload recusado antes do provedor", {
        status: uploadRejection.status,
        size: audioFile.size,
      });
      return errorResponse(uploadRejection.error, uploadRejection.status, req);
    }

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
}

if (import.meta.main) {
  Deno.serve(handleElevenLabsSts);
}
