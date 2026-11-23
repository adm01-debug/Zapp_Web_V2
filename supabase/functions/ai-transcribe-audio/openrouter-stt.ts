/**
 * Fallback de STT pelo OpenRouter.
 *
 * Motivo (2026-11-23): a credencial `ELEVENLABS_API_KEY` em produção está
 * recusada — 1.414 chamadas no mês, 100% HTTP 401, zero transcrições desde
 * 14/11. A rota `/v1/speech-to-text` cobra por segundo e não devolve a
 * quantidade faturada; já o OpenRouter aceita o áudio como `input_audio` em um
 * modelo multimodal e devolve `usage` com tokens REAIS, que é o que
 * `ai_usage_logs` sabe medir.
 *
 * O módulo é separado do handler para ser testável sem rede: monta o corpo,
 * converte o áudio e interpreta a resposta; o `fetch` é injetável.
 */

export const OPENROUTER_STT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** Modelo com `audio` nas modalidades de entrada, já tarifado em `ai_model_prices`. */
export const OPENROUTER_STT_MODEL_PADRAO = "google/gemini-3.8-flash";

/**
 * Extensão aceita pelo campo `input_audio.format`. Os containers que a edge
 * reconhece (mp3, ogg, wav, m4a, flac, aac, webm) são repassados como estão: se
 * o provedor recusar um deles, a recusa é registrada e devolvida honestamente —
 * converter formato no servidor exigiria transcodificar o arquivo.
 */
const FORMATO_POR_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/flac": "flac",
  "audio/aac": "aac",
  "audio/webm": "webm",
};

export function formatoDeAudioParaOpenRouter(mimeType: string): string | null {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return FORMATO_POR_MIME[base] ?? null;
}

/** Base64 do áudio. `btoa` do runtime exige string binária em blocos. */
export function audioParaBase64(bytes: Uint8Array): string {
  let binario = "";
  const bloco = 0x8000;
  for (let i = 0; i < bytes.length; i += bloco) {
    binario += String.fromCharCode(...bytes.subarray(i, i + bloco));
  }
  return btoa(binario);
}

export function montarPromptTranscricao(idioma: string | null | undefined): string {
  const lingua = (idioma ?? "pt").toLowerCase().startsWith("pt")
    ? "português do Brasil"
    : `o idioma ${idioma}`;
  return (
    `Transcreva literalmente, em ${lingua}, o áudio a seguir. ` +
    "Devolva SOMENTE o texto falado, sem aspas, sem rótulo, sem comentário e sem pontuação inventada. " +
    "Não descreva o áudio e não traduza. Se não houver fala inteligível, devolva uma string vazia."
  );
}

export interface CorpoOpenRouterArgs {
  audioBase64: string;
  formato: string;
  prompt: string;
  modelo: string;
}

export function montarCorpoOpenRouter(args: CorpoOpenRouterArgs): Record<string, unknown> {
  return {
    model: args.modelo,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: args.prompt },
          { type: "input_audio", input_audio: { data: args.audioBase64, format: args.formato } },
        ],
      },
    ],
  };
}

export interface RespostaInterpretada {
  texto: string;
  tokensIn: number | null;
  tokensOut: number | null;
}

function textoDaMensagem(conteudo: unknown): string {
  if (typeof conteudo === "string") return conteudo;
  if (Array.isArray(conteudo)) {
    return conteudo
      .map((parte) => {
        if (typeof parte === "string") return parte;
        if (parte && typeof parte === "object" && typeof (parte as { text?: unknown }).text === "string") {
          return (parte as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  if (conteudo && typeof conteudo === "object") {
    const obj = conteudo as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.transcription === "string") return obj.transcription;
  }
  return "";
}

/** Ausência de `usage` vira `null` (não medido), nunca zero. */
export function interpretarRespostaOpenRouter(payload: unknown): RespostaInterpretada | null {
  if (!payload || typeof payload !== "object") return null;
  const corpo = payload as Record<string, unknown>;
  const escolhas = corpo.choices;
  if (!Array.isArray(escolhas) || escolhas.length === 0) return null;
  const primeira = escolhas[0] as Record<string, unknown> | null;
  const mensagem = primeira?.message as Record<string, unknown> | undefined;
  if (!mensagem) return null;

  const texto = textoDaMensagem(mensagem.content).trim();
  const uso = corpo.usage as Record<string, unknown> | undefined;
  const numero = (valor: unknown): number | null =>
    typeof valor === "number" && Number.isFinite(valor) && valor >= 0 ? valor : null;

  return {
    texto,
    tokensIn: uso ? numero(uso.prompt_tokens) : null,
    tokensOut: uso ? numero(uso.completion_tokens) : null,
  };
}

export type TranscreverOpenRouterResultado =
  | { ok: true; texto: string; modelo: string; tokensIn: number | null; tokensOut: number | null }
  | { ok: false; motivo: "sem_formato" | "http" | "rede" | "resposta"; httpStatus: number | null; detalhe: string };

export interface TranscreverOpenRouterArgs {
  audio: Uint8Array;
  mimeType: string;
  idioma?: string | null;
  apiKey: string;
  modelo?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export async function transcreverViaOpenRouter(
  args: TranscreverOpenRouterArgs,
): Promise<TranscreverOpenRouterResultado> {
  const formato = formatoDeAudioParaOpenRouter(args.mimeType);
  if (!formato) {
    return {
      ok: false,
      motivo: "sem_formato",
      httpStatus: null,
      detalhe: `formato_nao_suportado:${args.mimeType}`,
    };
  }

  const modelo = args.modelo?.trim() || OPENROUTER_STT_MODEL_PADRAO;
  const corpo = montarCorpoOpenRouter({
    audioBase64: audioParaBase64(args.audio),
    formato,
    prompt: montarPromptTranscricao(args.idioma),
    modelo,
  });

  const doFetch = args.fetchImpl ?? fetch;
  let resposta: Response;
  try {
    resposta = await doFetch(OPENROUTER_STT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(corpo),
      signal: args.signal,
    });
  } catch (erro) {
    return {
      ok: false,
      motivo: "rede",
      httpStatus: null,
      detalhe: erro instanceof Error ? erro.message : "fetch_failed",
    };
  }

  if (!resposta.ok) {
    const detalhe = (await resposta.text().catch(() => "")).substring(0, 300);
    return { ok: false, motivo: "http", httpStatus: resposta.status, detalhe };
  }

  let payload: unknown;
  try {
    payload = await resposta.json();
  } catch {
    return { ok: false, motivo: "resposta", httpStatus: resposta.status, detalhe: "json_invalido" };
  }

  const interpretada = interpretarRespostaOpenRouter(payload);
  if (!interpretada) {
    return { ok: false, motivo: "resposta", httpStatus: resposta.status, detalhe: "sem_choices" };
  }

  return {
    ok: true,
    texto: interpretada.texto,
    modelo,
    tokensIn: interpretada.tokensIn,
    tokensOut: interpretada.tokensOut,
  };
}
