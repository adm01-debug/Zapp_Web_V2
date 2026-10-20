import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, requireAuth, enforceRateLimit } from "../_shared/validation.ts";
import { ElevenLabsSFXSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { logAiUsageDetached } from "../_shared/ai-usage.ts";
import { buildElevenLabsRequest } from "./request.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-sfx");

  // JWT ja e validado pelo gateway (verify_jwt=true); aqui o usuario vira a
  // chave do rate limit persistente — cota paga (ElevenLabs/Mapbox) por usuario.
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const rl = await enforceRateLimit(`elevenlabs-sfx:${auth.userId}`, 10, 60_000);
  if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

  try {
    const parsed = parseBody(ElevenLabsSFXSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { prompt, duration, mode } = parsed.data;
    const ELEVENLABS_API_KEY = requireEnv("ELEVENLABS_API_KEY");

    const isMusic = mode === "music";
    const spec = buildElevenLabsRequest({ prompt, duration, mode });

    log.info(`Generating ${isMusic ? "music" : "sfx"}: "${prompt}" (${duration || (isMusic ? 15 : 5)}s)`);

    const iniciadoEm = Date.now();
    const response = await fetch(spec.url, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(spec.body),
    });

    // SL-013 / IA-003 B6 — geração paga de efeito/música sem linha no ledger é
    // consumo invisível no relatório de custo. Unidade cobrada = REQUISIÇÃO
    // (uma por geração); o provedor não devolve tokens, então as colunas de
    // token ficam NULL com `usage_unknown: true` (IA-053).
    await logAiUsageDetached({
      functionName: "elevenlabs-sfx",
      userId: auth.userId,
      model: null,
      durationMs: Date.now() - iniciadoEm,
      status: response.ok ? "success" : "error",
      errorMessage: response.ok ? null : `ElevenLabs HTTP ${response.status}`,
      usageUnknown: true,
      metadata: {
        provider: "elevenlabs",
        endpoint: isMusic ? "/v1/music" : "/v1/sound-generation",
        billing_unit: "request",
        billing_quantity: 1,
        requested_seconds: duration || (isMusic ? 15 : 5),
        http_status: response.status,
      },
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
