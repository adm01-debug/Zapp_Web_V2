import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, getCorsHeaders, requireAuth, enforceRateLimit } from "../_shared/validation.ts";
import { ElevenLabsDialogueSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { logAiUsageDetached } from "../_shared/ai-usage.ts";

/**
 * R2-API-024 (P2) — Diálogo ElevenLabs envia `script` e omite `inputs`.
 *
 * O contrato do provedor (POST /v1/text-to-dialogue) exige `inputs`, a lista de
 * {text, voice_id}; o adaptador repassava o nome interno `script`, então a
 * requisição nunca batia com o contrato e a geração não podia valer.
 */

/** Contrato do provedor: no máximo 10 voice_ids distintos por requisição. */
export const MAX_DIALOGUE_VOICES = 10;
/** Contrato do provedor: até 2.000 caracteres somados em `inputs[].text`. */
export const MAX_DIALOGUE_CHARS = 2000;

export interface DialogueLine {
  voice_id: string;
  text: string;
}

/** Traduz o contrato interno (`script`) para o do provedor (`inputs`). */
export function toDialogueInputs(script: DialogueLine[]): Array<{ text: string; voice_id: string }> {
  return script.map((line) => ({ text: line.text, voice_id: line.voice_id }));
}

/** Mensagem de recusa quando o script fura os limites agregados do provedor. */
export function dialogueLimitError(script: DialogueLine[]): string | null {
  const voices = new Set(script.map((line) => line.voice_id));
  if (voices.size > MAX_DIALOGUE_VOICES) {
    return `O provedor aceita no máximo ${MAX_DIALOGUE_VOICES} vozes distintas por diálogo (recebidas ${voices.size})`;
  }
  const totalChars = script.reduce((acc, line) => acc + line.text.length, 0);
  if (totalChars > MAX_DIALOGUE_CHARS) {
    return `O provedor aceita até ${MAX_DIALOGUE_CHARS} caracteres somados por diálogo (recebidos ${totalChars})`;
  }
  return null;
}

export async function handleElevenLabsDialogue(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-dialogue");

  // JWT ja e validado pelo gateway (verify_jwt=true); aqui o usuario vira a
  // chave do rate limit persistente — cota paga (ElevenLabs/Mapbox) por usuario.
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const rl = await enforceRateLimit(`elevenlabs-dialogue:${auth.userId}`, 20, 60_000);
  if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

  try {
    const parsed = parseBody(ElevenLabsDialogueSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { script, languageCode } = parsed.data;

    // Limites agregados do provedor: recusa ANTES do POST. Sem isso a
    // requisição sai só para o provedor rejeitar (422) ou cortar a geração.
    const limitError = dialogueLimitError(script);
    if (limitError) return errorResponse(limitError, 400, req);

    const ELEVENLABS_API_KEY = requireEnv("ELEVENLABS_API_KEY");

    log.info(`Generating dialogue with ${script.length} lines`);

    const iniciadoEm = Date.now();
    const response = await fetch(
      'https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128',
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: 'eleven_v3',
          // O provedor exige `inputs` ({text, voice_id}); `script` é o nome do
          // contrato INTERNO e não existe do lado de fora.
          inputs: toDialogueInputs(script),
          language_code: languageCode,
        }),
      }
    );

    // SL-013 / IA-003 B6 — a geração PAGA de diálogo tem de deixar linha em
    // `ai_usage_logs`: sem ela o relatório de custo (IA-058) não enxerga este
    // consumo. Unidade cobrada = CARACTERE somado do roteiro (não token): a
    // medição vai em `metadata`; as colunas de token ficam NULL com
    // `usage_unknown: true` (IA-053 — "não medi" nunca vira zero medido).
    await logAiUsageDetached({
      functionName: "elevenlabs-dialogue",
      userId: auth.userId,
      model: "eleven_v3",
      durationMs: Date.now() - iniciadoEm,
      status: response.ok ? "success" : "error",
      errorMessage: response.ok ? null : `ElevenLabs HTTP ${response.status}`,
      usageUnknown: true,
      metadata: {
        provider: "elevenlabs",
        endpoint: "/v1/text-to-dialogue",
        billing_unit: "character",
        billing_quantity: script.reduce((acc, line) => acc + line.text.length, 0),
        http_status: response.status,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error(`API error ${response.status}`, { detail: errorText.substring(0, 300) });

      if (response.status === 401) return errorResponse("Invalid ElevenLabs API key", 401, req);
      if (response.status === 429) return errorResponse("Rate limit exceeded", 429, req);
      return errorResponse(`ElevenLabs Dialogue API error: ${response.status}`, response.status, req);
    }

    const audioBuffer = await response.arrayBuffer();
    log.done(200, { bytes: audioBuffer.byteLength });

    return new Response(audioBuffer, {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'audio/mpeg' },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    log.error("Unhandled error", { error: errorMessage });
    return errorResponse(errorMessage, 500, req);
  }
}

if (import.meta.main) {
  Deno.serve(handleElevenLabsDialogue);
}
