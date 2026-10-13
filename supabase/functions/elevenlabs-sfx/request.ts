// Montagem da requisicao ao ElevenLabs. A geracao musical usa outro contrato:
// POST /v1/music recebe `prompt` + `music_length_ms` (milissegundos), enquanto
// POST /v1/sound-generation recebe `text` + `duration_seconds` (segundos).

import { jsonResponse } from "../_shared/validation.ts";
import { aiCapabilityFlagKey, readCapabilityFlag } from "../_shared/ai-feature-flags.ts";

export type ElevenLabsMode = "sfx" | "music";

// IA-009 / SL-010b (decisão do cartão t_98090b40; entrega t_1266b773): o kill
// switch de voz/áudio é lido no SERVIDOR, ANTES de montar/tocar o provedor pago.
// A família de voz/áudio inteira responde à chave única `ai.capability.voice`;
// desligada (ou leitura não confiável) NEGA. Devolve a resposta 503 pronta, ou
// `null` para seguir. Fica junto do contrato do provedor para `index.ts` só
// orquestrar. `jsonResponse` (nunca `errorResponse` em 5xx: acima de 500 o corpo
// vira "Internal server error" e o consumidor perderia o código).
export async function voiceAiDisabledResponse(req: Request): Promise<Response | null> {
  const enabled = await readCapabilityFlag(aiCapabilityFlagKey("voice"));
  if (enabled === true) return null;
  return jsonResponse(
    { error: { code: "AI_DISABLED", message: "IA de voz desativada por flag." } },
    503,
    req,
  );
}

export interface ElevenLabsRequestSpec {
  url: string;
  body: Record<string, unknown>;
}

export function buildElevenLabsRequest(input: {
  prompt: string;
  duration?: number;
  mode?: ElevenLabsMode;
}): ElevenLabsRequestSpec {
  const { prompt, duration, mode = "sfx" } = input;
  if (mode === "music") {
    return {
      url: "https://api.elevenlabs.io/v1/music",
      body: { prompt, music_length_ms: (duration ?? 15) * 1000 },
    };
  }
  return {
    url: "https://api.elevenlabs.io/v1/sound-generation",
    body: { text: prompt, duration_seconds: duration ?? 5, prompt_influence: 0.3 },
  };
}
