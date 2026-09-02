import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { ElevenLabsVoiceDesignPreviewSchema, ElevenLabsVoiceDesignCreateSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-voice-design");

  try {
    const ELEVENLABS_API_KEY = requireEnv('ELEVENLABS_API_KEY');
    const body = await req.json();
    const action = body.action || 'preview';

    if (action === 'preview') {
      const parsed = parseBody(ElevenLabsVoiceDesignPreviewSchema, body);
      if (!parsed.success) return validationErrorResponse(parsed, req);

      const { description, text } = parsed.data;
      const previewText = text || 'Olá, esta é uma prévia da minha voz. Como posso te ajudar hoje?';

      log.info("Generating voice preview", { descLen: description.length });

      const response = await fetch('https://api.elevenlabs.io/v1/text-to-voice/create-previews', {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_description: description, text: previewText }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error("Preview error", { status: response.status, detail: errorText.substring(0, 300) });
        throw new Error(`Voice preview error: ${response.status}`);
      }

      const data = await response.json();
      log.done(200);
      return jsonResponse(data, 200, req);
    }

    if (action === 'create') {
      const parsed = parseBody(ElevenLabsVoiceDesignCreateSchema, body);
      if (!parsed.success) return validationErrorResponse(parsed, req);

      const { voice_name, voice_description, generated_voice_id, labels } = parsed.data;

      log.info("Creating voice", { voice_name });

      const response = await fetch('https://api.elevenlabs.io/v1/text-to-voice/create-voice-from-preview', {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_name, voice_description: voice_description || '', generated_voice_id, labels: labels || {} }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error("Create error", { status: response.status, detail: errorText.substring(0, 300) });
        throw new Error(`Voice creation error: ${response.status}`);
      }

      const data = await response.json();
      log.done(200, { voiceId: data.voice_id });
      return jsonResponse(data, 200, req);
    }

    // List available voices
    log.info("Listing voices");
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    });

    if (!response.ok) throw new Error(`List voices error: ${response.status}`);

    const data = await response.json();
    log.done(200);
    return jsonResponse(data, 200, req);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error("Unhandled error", { error: errorMessage });
    return errorResponse(errorMessage, 500, req);
  }
});
