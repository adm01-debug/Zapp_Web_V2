// Montagem da requisicao ao ElevenLabs. A geracao musical usa outro contrato:
// POST /v1/music recebe `prompt` + `music_length_ms` (milissegundos), enquanto
// POST /v1/sound-generation recebe `text` + `duration_seconds` (segundos).

export type ElevenLabsMode = "sfx" | "music";

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
