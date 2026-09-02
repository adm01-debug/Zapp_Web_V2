import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { ElevenLabsSFXSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-sfx");

  try {
    const parsed = parseBody(ElevenLabsSFXSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { prompt, duration, mode } = parsed.data;
    const ELEVENLABS_API_KEY = requireEnv("ELEVENLABS_API_KEY");

    const isMusic = mode === "music";
    const url = isMusic
      ? "https://api.elevenlabs.io/v1/music"
      : "https://api.elevenlabs.io/v1/sound-generation";

    const body = isMusic
      ? { prompt, duration_seconds: duration || 15 }
      : { text: prompt, duration_seconds: duration || 5, prompt_influence: 0.3 };

    log.info(`Generating ${isMusic ? "music" : "sfx"}: "${prompt}" (${duration || (isMusic ? 15 : 5)}s)`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      log.error(`API error ${response.status}`, { detail: errText.substring(0, 300) });
      return errorResponse(`ElevenLabs API error: ${response.status}`, response.status, req);
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = base64Encode(audioBuffer);

    log.done(200, { bytes: audioBuffer.byteLength });
    return jsonResponse({ audioContent: audioBase64 }, 200, req);
  } catch (err: unknown) {
    log.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
    return errorResponse("Internal server error", 500, req);
  }
});
