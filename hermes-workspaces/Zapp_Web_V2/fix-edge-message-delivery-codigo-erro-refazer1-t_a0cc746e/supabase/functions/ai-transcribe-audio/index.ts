import { requireAiIdentityOrService, type AiIdentity } from "../_shared/ai-auth.ts";
import {
  assertMessageVisibleToCaller,
  resolveAuthorizedAudioUrl,
  type AudioObjectAuthzResult,
} from "../_shared/ai-audio-authz.ts";
import {
  checkRateLimit,
  errorResponse,
  getClientIP,
  handleCors,
  jsonResponse,
  Logger,
  requireEnv,
} from "../_shared/validation.ts";
import {
  parseBody,
  TranscribeAudioSchema,
  validationErrorResponse,
} from "../_shared/schemas.ts";
import { parseApprovedStorageUrl } from "../_shared/ssrf.ts";
import { detectMediaKind } from "../_shared/messaging/media.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB
const APPROVED_AUDIO_BUCKETS = [
  "whatsapp-media",
  "audio-messages",
  "audio-memes",
] as const;

type DownloadAudioResult =
  | { buffer: ArrayBuffer; contentType: string }
  | { error: string };

/**
 * Only accepts an exact URL for the project's approved media buckets.
 * Service-role storage reads must never be reachable through an arbitrary URL.
 */
async function downloadAudio(
  audioUrl: string,
  log: Logger,
): Promise<DownloadAudioResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return { error: "Audio storage is unavailable" };
  }

  const storageObject = parseApprovedStorageUrl(
    audioUrl,
    supabaseUrl,
    APPROVED_AUDIO_BUCKETS,
  );
  if (!storageObject) return { error: "Untrusted audio URL" };
  const { bucket, path } = storageObject;

  log.info("Downloading approved storage audio", { bucket, path });
  const sb = createClient(supabaseUrl, serviceKey);
  const { data, error } = await sb.storage.from(bucket).download(path);
  if (error || !data) {
    log.error("Storage download failed", { error: error?.message });
    return { error: "Audio storage download failed" };
  }
  const buffer = await data.arrayBuffer();
  if (buffer.byteLength > MAX_AUDIO_SIZE) {
    return { error: "Audio file too large (max 25MB)" };
  }
  return { buffer, contentType: data.type || "audio/ogg" };
}

/** Tipo de arquivo que será enviado ao provedor de transcrição. */
export interface TranscriptionAudioFormat {
  mimeType: string;
  fileName: string;
  /** De onde veio a decisão: magic bytes do ARQUIVO ou metadado declarado. */
  source: "magic" | "metadata";
}

/** Extensão de arquivo para o mime REAL reconhecido pelos magic bytes. */
const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
  "audio/flac": "flac",
  "audio/aac": "aac",
  "audio/webm": "webm",
};

/**
 * Containers que o detector classifica como vídeo, mas que neste endpoint são
 * áudio: WebM gravado pelo navegador e MP4/M4A (`ftyp`) do WhatsApp/iOS.
 */
const AUDIO_CONTAINER_BY_VIDEO_MIME: Record<string, string> = {
  "video/webm": "audio/webm",
  "video/mp4": "audio/mp4",
};

/** Tipo declarado (content-type informado + extensão da URL) — fallback. */
function formatFromMetadata(
  audioUrl: string,
  contentType: string,
): { mimeType: string; fileName: string } {
  if (contentType.includes("ogg") || audioUrl.includes(".ogg")) {
    return { mimeType: "audio/ogg", fileName: "audio.ogg" };
  }
  if (contentType.includes("webm") || audioUrl.includes(".webm")) {
    return { mimeType: "audio/webm", fileName: "audio.webm" };
  }
  if (contentType.includes("wav") || audioUrl.includes(".wav")) {
    return { mimeType: "audio/wav", fileName: "audio.wav" };
  }
  if (
    contentType.includes("m4a") || contentType.includes("mp4") ||
    audioUrl.includes(".m4a")
  ) {
    return { mimeType: "audio/mp4", fileName: "audio.m4a" };
  }
  if (contentType.includes("mpeg") || audioUrl.includes(".mp3")) {
    return { mimeType: "audio/mpeg", fileName: "audio.mp3" };
  }
  return { mimeType: "audio/mpeg", fileName: "audio.mp3" };
}

/**
 * SL-195a — escolhe o tipo enviado ao STT pelos MAGIC BYTES do arquivo.
 *
 * O `content-type` informado e a extensão da URL são entradas NÃO confiáveis: um
 * `.mp3`/`audio/mpeg` que serve um OGG era enviado ao provedor com o tipo
 * errado. O detector real (`detectMediaKind`) decide primeiro; só quando ele não
 * reconhece um ÁUDIO conhecido (assinatura desconhecida ou de outro tipo) o
 * metadado declarado é usado.
 *
 * Os containers EBML/WebM e ISO-BMFF/MP4 (`ftyp`) são classificados como VÍDEO
 * pelo detector por serem ambíguos; neste endpoint, que só transcreve áudio, eles
 * são a gravação de áudio do navegador (`audio/webm`) e o áudio M4A do
 * WhatsApp/iOS (`audio/mp4` + `audio.m4a`).
 *
 * Só vale o resultado do detector que é um áudio conhecido (`EXTENSION_BY_MIME`):
 * assinatura de outro tipo (imagem, PDF, texto...) com metadado de áudio cai no
 * metadado declarado — nunca sai um mime arbitrário nem `audio.bin`.
 *
 * Não precisa do arquivo inteiro: os primeiros bytes já carregam a assinatura.
 */
export function resolveTranscriptionAudioFormat(
  audioUrl: string,
  contentType: string,
  bytes: Uint8Array,
): TranscriptionAudioFormat {
  const detected = detectMediaKind(bytes);
  const detectedMime = detected
    ? (AUDIO_CONTAINER_BY_VIDEO_MIME[detected.mime] ?? detected.mime)
    : null;
  const extension = detectedMime ? EXTENSION_BY_MIME[detectedMime] : undefined;
  if (detectedMime && extension) {
    // SL-195a: os magic bytes do ARQUIVO vencem o `content-type` informado e a
    // extensão da URL — os dois são entradas não confiáveis (um `.mp3` que serve
    // OGG era enviado como audio/mpeg).
    return { mimeType: detectedMime, fileName: `audio.${extension}`, source: "magic" };
  }
  const { mimeType, fileName } = formatFromMetadata(audioUrl, contentType);
  return { mimeType, fileName, source: "metadata" };
}

/**
 * Seam de teste (mesmo padrão das outras edge functions): tudo que o handler
 * precisa do mundo externo (auth, rate limit, env, download do objeto e o
 * `fetch` ao provedor) pode ser injetado. Em produção nada é passado e o handler
 * usa as implementações reais — por isso o teste chama o handler REAL.
 */
export interface TranscribeAudioDeps {
  /** Resolve a identidade do chamador (default: `requireAiIdentityOrService`). */
  authorize?: (req: Request) => Promise<AiIdentity | Response>;
  /** Rate limit local por IP (default: `checkRateLimit`). */
  rateLimit?: (key: string, max: number, windowMs: number) => { allowed: boolean };
  /** IP do chamador (default: `getClientIP(req)`). */
  clientIp?: string;
  /** Leitura de env (default: `requireEnv`). */
  env?: (key: string) => string | undefined;
  /** Download do objeto autorizado (default: `downloadAudio`). */
  downloadAudio?: (audioUrl: string, log: Logger) => Promise<DownloadAudioResult>;
  /** Checagem de visibilidade da mensagem (default: `assertMessageVisibleToCaller`). */
  assertMessageVisible?: (
    req: Request,
    messageId?: string | null,
  ) => Promise<AudioObjectAuthzResult>;
  /** `fetch` para o provedor de STT (default: o global). */
  fetch?: typeof fetch;
}

export async function handleTranscribeAudio(
  req: Request,
  deps: TranscribeAudioDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const authorize = deps.authorize ??
    ((r: Request) =>
      requireAiIdentityOrService(r, "ai-transcribe-audio", {
        perUserPerMinute: 10,
      }));

  // IA-011/IA-012: caminho de usuário com identidade verificada + cota; caminho de
  // serviço (evolution-webhook, auto-transcrição) reconhecido por comparação em
  // tempo constante e limitado por IP. A comparação `===` que existia aqui vazava
  // o segredo pelo tempo de resposta e não tinha limite nenhum.
  const identity = await authorize(req);
  if (identity instanceof Response) return identity;

  const log = new Logger("ai-transcribe-audio");

  try {
    const rateLimit = deps.rateLimit ?? checkRateLimit;
    const ip = deps.clientIp ?? getClientIP(req);
    const { allowed } = rateLimit(`transcribe:${ip}`, 10, 60_000);
    if (!allowed) {
      return errorResponse(
        "Limite de transcrições excedido. Tente novamente em 1 minuto.",
        429,
        req,
      );
    }

    const parsed = parseBody(TranscribeAudioSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const {
      audioUrl: requestedAudioUrl,
      messageId,
      languageCode,
      enableDiarization,
      tagAudioEvents,
    } = parsed.data;

    // IA-014: antes de baixar com service_role, provar com o JWT do chamador que
    // a mensagem é visível para ele. No caminho de serviço (worker de entrada) a
    // autorização do objeto pertence ao pipeline que já validou a origem.
    let audioUrl = requestedAudioUrl;
    if (identity.kind === "user") {
      // `deps` só é usado pelo teste offline (SL-195a). Sem injeção — o caminho de
      // PRODUÇÃO — a chamada real fica literal no código, porque o contrato de
      // ordem do repositório (tests/contracts/ai-endpoints-auth.contract.test.ts)
      // lê o FONTE: exige a checagem de visibilidade ANTES do download do objeto.
      const objectAuthz = deps.assertMessageVisible
        ? await deps.assertMessageVisible(req, messageId)
        : await assertMessageVisibleToCaller(req, messageId);
      if (!objectAuthz.ok) {
        return errorResponse(objectAuthz.error, objectAuthz.status, req);
      }
      // R2-API-027: a `media_url` do registro é a ÚNICA fonte autorizada do objeto
      // no caminho de usuário. Mensagem visível sem mídia não tem objeto para
      // transcrever: recusar em vez de baixar a URL escolhida pelo cliente.
      const authorized = resolveAuthorizedAudioUrl(objectAuthz.mediaUrl);
      if (!authorized.ok) {
        return errorResponse(authorized.error, authorized.status, req);
      }
      audioUrl = authorized.url;
    }

    log.info("Starting transcription", { messageId, languageCode });
    const readEnv = deps.env ?? requireEnv;
    const ELEVENLABS_API_KEY = readEnv("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      return errorResponse("Transcription provider is unavailable", 500, req);
    }

    // Download audio (prefers service-role storage download for own URLs)
    // Sem injeção (caminho de PRODUÇÃO) a chamada real fica literal — é o que o
    // contrato de ordem acima confere no fonte.
    const downloadResult = deps.downloadAudio
      ? await deps.downloadAudio(audioUrl, log)
      : await downloadAudio(audioUrl, log);
    if ("error" in downloadResult) {
      return errorResponse(downloadResult.error, 400, req);
    }

    const { buffer: audioBuffer, contentType } = downloadResult;

    if (audioBuffer.byteLength > MAX_AUDIO_SIZE) {
      return errorResponse("Audio file too large (max 25MB)", 400, req);
    }

    // Determine correct MIME type and file extension — SL-195a: os magic bytes do
    // ARQUIVO decidem; `contentType` e extensão da URL só entram quando o
    // detector não reconhece um áudio conhecido.
    const { mimeType, fileName, source } = resolveTranscriptionAudioFormat(
      audioUrl,
      contentType,
      new Uint8Array(audioBuffer),
    );

    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    log.info("Audio downloaded", {
      size: audioBlob.size,
      type: mimeType,
      originalType: contentType,
      typeSource: source,
    });

    const formData = new FormData();
    formData.append("file", audioBlob, fileName);
    formData.append("model_id", "scribe_v2");
    formData.append("language_code", languageCode ?? "pt");
    formData.append("tag_audio_events", String(tagAudioEvents));
    formData.append("diarize", String(enableDiarization));

    const doFetch = deps.fetch ?? fetch;
    const response = await doFetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      log.error("ElevenLabs STT error", {
        status: response.status,
        detail: errorText.substring(0, 300),
      });
      if (response.status === 429) {
        return errorResponse("Rate limit exceeded.", 429, req);
      }
      if (response.status === 401) {
        return errorResponse("Invalid ElevenLabs API key.", 401, req);
      }

      if (response.status === 400) {
        return jsonResponse(
          {
            transcription: "",
            messageId,
            words: [],
            audio_events: [],
            speakers: [],
            fallback: true,
            error: "INVALID_AUDIO",
            errorMessage:
              "Não foi possível transcrever este áudio. O formato pode não ser suportado.",
          },
          200,
          req,
        );
      }
      return errorResponse("Failed to transcribe audio", 500, req);
    }

    const data = await response.json();
    log.done(200, { transcriptionLength: data.text?.length || 0 });

    return jsonResponse(
      {
        transcription: data.text || "",
        messageId,
        words: data.words || [],
        audio_events: data.audio_events || [],
        speakers: data.speakers || [],
      },
      200,
      req,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log.error("Unhandled error", { error: msg });
    return errorResponse(msg, 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleTranscribeAudio(req));
}
