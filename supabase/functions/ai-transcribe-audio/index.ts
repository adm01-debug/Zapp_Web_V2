import { enforceAiGuards } from "../_shared/ai-guards.ts";
import {
  checkRateLimit,
  errorResponse,
  getClientIP,
  handleCors,
  jsonResponse,
  Logger,
  requireAuth,
  requireEnv,
} from "../_shared/validation.ts";
import {
  parseBody,
  TranscribeAudioSchema,
  validationErrorResponse,
} from "../_shared/schemas.ts";
import { parseApprovedStorageUrl } from "../_shared/ssrf.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB
const APPROVED_AUDIO_BUCKETS = [
  "whatsapp-media",
  "audio-messages",
  "audio-memes",
] as const;

/**
 * Only accepts an exact URL for the project's approved media buckets.
 * Service-role storage reads must never be reachable through an arbitrary URL.
 */
async function downloadAudio(
  audioUrl: string,
  log: Logger,
): Promise<{ buffer: ArrayBuffer; contentType: string } | { error: string }> {
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

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const __guard = await enforceAiGuards({
    functionName: "ai-transcribe-audio",
    userId: __uid,
    req,
  });
  if (__guard) return __guard;

  const log = new Logger("ai-transcribe-audio");

  try {
    const ip = getClientIP(req);
    const { allowed } = checkRateLimit(`transcribe:${ip}`, 10, 60_000);
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
      audioUrl,
      messageId,
      languageCode,
      enableDiarization,
      tagAudioEvents,
    } = parsed.data;

    log.info("Starting transcription", { messageId, languageCode });
    const ELEVENLABS_API_KEY = requireEnv("ELEVENLABS_API_KEY");

    // Download audio (prefers service-role storage download for own URLs)
    const downloadResult = await downloadAudio(audioUrl, log);
    if ("error" in downloadResult) {
      return errorResponse(downloadResult.error, 400, req);
    }

    const { buffer: audioBuffer, contentType } = downloadResult;

    if (audioBuffer.byteLength > MAX_AUDIO_SIZE) {
      return errorResponse("Audio file too large (max 25MB)", 400, req);
    }

    // Determine correct MIME type and file extension
    let mimeType = "audio/mpeg";
    let fileName = "audio.mp3";

    if (contentType.includes("ogg") || audioUrl.includes(".ogg")) {
      mimeType = "audio/ogg";
      fileName = "audio.ogg";
    } else if (contentType.includes("webm") || audioUrl.includes(".webm")) {
      mimeType = "audio/webm";
      fileName = "audio.webm";
    } else if (contentType.includes("wav") || audioUrl.includes(".wav")) {
      mimeType = "audio/wav";
      fileName = "audio.wav";
    } else if (
      contentType.includes("m4a") || contentType.includes("mp4") ||
      audioUrl.includes(".m4a")
    ) {
      mimeType = "audio/mp4";
      fileName = "audio.m4a";
    } else if (contentType.includes("mpeg") || audioUrl.includes(".mp3")) {
      mimeType = "audio/mpeg";
      fileName = "audio.mp3";
    }

    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    log.info("Audio downloaded", {
      size: audioBlob.size,
      type: mimeType,
      originalType: contentType,
    });

    const formData = new FormData();
    formData.append("file", audioBlob, fileName);
    formData.append("model_id", "scribe_v2");
    formData.append("language_code", languageCode ?? "pt");
    formData.append("tag_audio_events", String(tagAudioEvents));
    formData.append("diarize", String(enableDiarization));

    const response = await fetch(
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
});
