/**
 * Entrada de ÁUDIO para modelos que ouvem (IA-131 — IA-AUDIO-001).
 *
 * Por que este módulo existe: o bucket `audio-memes` guarda o meme em MP3 e o app
 * manda ao classificador apenas a URL e o nome do arquivo. Classificar por
 * metadados não é ouvir: o `finding IA-AUDIO-001` exige que o conteúdo sonoro
 * chegue ao modelo quando o critério é o som. Como o provedor não busca o objeto
 * pela rede (o payload de áudio é base64), o arquivo é baixado AQUI, no servidor,
 * sob a identidade explícita do chamador, e embutido na mensagem como a parte
 * `{ type: 'input_audio', input_audio: { data, format } }` — a MESMA forma que o
 * `ai-proxy` já reconhece como modalidade `audio_stt`.
 *
 * Contrato (fail-closed, nunca improvisar):
 *  1. só objeto do Storage DESTE projeto (`/object/public/<bucket>/<path>` ou
 *     `/object/sign/<bucket>/<path>`) em bucket da allowlist — a URL crua NUNCA é
 *     buscada: o download usa o endpoint AUTENTICADO
 *     (`/storage/v1/object/<bucket>/<path>`), sob a identidade EXIGIDA em
 *     `storageIdentity` (usuário: anon key + JWT do chamador, a policy de
 *     `storage.objects` decide; serviço: service role, fluxo interno). Sem
 *     identidade o download falha FECHADO antes de qualquer rede;
 *  2. limite de `MAX_INLINE_AUDIO_BYTES` (5 MiB, o mesmo teto que o app impõe ao
 *     subir o meme) conferido no `content-length` antes de ler o corpo e
 *     CONFIRMADO nos bytes reais;
 *  3. `content-type` precisa ser `audio/*` e o formato precisa ser um dos que o
 *     provedor aceita (`mp3`/`wav`); qualquer outro é erro tipado — o chamador
 *     decide degradar, nunca envia payload que o provedor recusaria;
 *  4. sucesso devolve `data` (base64 puro, sem prefixo `data:`), `format`, `mime`,
 *     `bytes` e a origem (bucket/path) para a trilha.
 *
 * Dependências: só `./ssrf.ts` (parser já testado e fechado de URL de Storage).
 * Sem `esm.sh`, `Deno.serve` ou cliente Supabase — o download é `fetch` cru no
 * endpoint autenticado, o que mantém o módulo importável no vitest.
 */

import { parseApprovedStorageUrl } from "./ssrf.ts";

/** Teto do áudio embutido: 5 MiB — o mesmo limite que o app aplica ao subir o meme. */
export const MAX_INLINE_AUDIO_BYTES = 5 * 1024 * 1024;

/** Buckets dos quais esta função aceita áudio (allowlist do parser de URL). */
export const ALLOWED_AUDIO_BUCKETS: readonly string[] = [
  "audio-memes",
  "audio-messages",
  "whatsapp-media",
];

/** Formatos aceitos pelo provedor na parte `input_audio`. */
export type AudioInputFormat = "mp3" | "wav";

/** Códigos tipados: o chamador decide o desfecho (hoje: degradar para metadados). */
export type AiAudioInputErrorCode =
  | "AUDIO_URL_INVALID"
  | "AUDIO_STORAGE_UNAVAILABLE"
  | "AUDIO_DOWNLOAD_FAILED"
  | "AUDIO_TOO_LARGE"
  | "AUDIO_TYPE_INVALID"
  | "AUDIO_FORMAT_UNSUPPORTED";

/** Status HTTP sugerido para cada código, para o endpoint mapear sem tabela própria. */
const ERROR_STATUS: Record<AiAudioInputErrorCode, number> = {
  AUDIO_URL_INVALID: 400,
  AUDIO_STORAGE_UNAVAILABLE: 500,
  AUDIO_DOWNLOAD_FAILED: 502,
  AUDIO_TOO_LARGE: 413,
  AUDIO_TYPE_INVALID: 415,
  AUDIO_FORMAT_UNSUPPORTED: 415,
};

/** Teto de tempo do download (o classificador roda com timeoutMs 15000). */
const DEFAULT_TIMEOUT_MS = 15_000;

/** O que a mensagem de erro carrega (a URL completa NUNCA entra: pode ter token). */
export interface AiAudioInputErrorDetails {
  bytes?: number | null;
  limitBytes?: number | null;
  contentType?: string | null;
  status?: number | null;
  bucket?: string | null;
  path?: string | null;
}

/**
 * Erro TIPADO do módulo (nunca string solta). `instanceof` funciona, `code` é
 * estável e `toJSON()` dá o corpo pronto para log/`jsonResponse`.
 */
export class AiAudioInputError extends Error {
  readonly code: AiAudioInputErrorCode;
  readonly status: number;
  readonly bytes: number | null;
  readonly limitBytes: number | null;
  readonly contentType: string | null;
  readonly status_http: number | null;
  readonly bucket: string | null;
  readonly path: string | null;

  constructor(
    code: AiAudioInputErrorCode,
    message: string,
    details: AiAudioInputErrorDetails = {},
  ) {
    super(message);
    this.name = "AiAudioInputError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.bytes = details.bytes ?? null;
    this.limitBytes = details.limitBytes ?? null;
    this.contentType = details.contentType ?? null;
    this.status_http = details.status ?? null;
    this.bucket = details.bucket ?? null;
    this.path = details.path ?? null;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      status: this.status,
      message: this.message,
      bytes: this.bytes,
      limitBytes: this.limitBytes,
      contentType: this.contentType,
      httpStatus: this.status_http,
      bucket: this.bucket,
      path: this.path,
    };
  }
}

/** Áudio pronto para embutir na mensagem do provedor. */
export interface InlineAudio {
  /** Base64 puro (sem `data:`): valor de `input_audio.data`. */
  data: string;
  /** Formato aceito pelo provedor: `mp3` ou `wav`. */
  format: AudioInputFormat;
  mime: string;
  bytes: number;
  /** De onde veio (o objeto do Storage). */
  bucket: string;
  path: string;
}

/**
 * Identidade sob a qual o objeto do Storage é baixado (mesma decisão R2-INF-022
 * do caminho de imagem): `user` = anon key + JWT do chamador, sujeito à policy de
 * `storage.objects`; `service` = service role, fluxo interno. Sem identidade não
 * existe credencial implícita.
 */
export type StorageIdentity =
  | { kind: "user"; bearerToken: string; anonKey?: string }
  | { kind: "service" };

/** Ajustes opcionais (os padrões vêm do ambiente da função). */
export interface InlineAudioOptions {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  allowedBuckets?: readonly string[];
  maxBytes?: number;
  timeoutMs?: number;
  storageIdentity?: StorageIdentity;
  /** Injeção para teste; o padrão é o `fetch` global resolvido na hora da chamada. */
  fetchImpl?: typeof fetch;
}

/**
 * Lê o ambiente da função. Usa o `Deno` do escopo global (runtime Edge) em vez de
 * `Deno.env` direto para (a) não explodir quando a variável não existe e (b)
 * permitir ao contrato em vitest injetar o ambiente sem tocar o módulo.
 */
function readEnv(name: string): string | undefined {
  const scope = globalThis as unknown as {
    Deno?: { env?: { get?: (name: string) => string | undefined } };
  };
  const value = scope.Deno?.env?.get?.(name);
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Texto legível de um erro desconhecido (nunca "undefined"). */
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** `audio/<sub>` normalizado (`audio/mpeg; charset=...` → `audio/mpeg`) ou null. */
function normalizeAudioMime(rawValue: string | null): string | null {
  if (typeof rawValue !== "string") return null;
  const mime = rawValue.split(";")[0].trim().toLowerCase();
  return /^audio\/[a-z0-9][a-z0-9.+-]*$/.test(mime) ? mime : null;
}

/**
 * Formato aceito pelo provedor para o mime declarado, ou null quando o provedor
 * não aceita (o chamador degrada em vez de mandar payload que seria recusado).
 */
function formatForMime(mime: string): AudioInputFormat | null {
  if (mime === "audio/mpeg" || mime === "audio/mp3") return "mp3";
  if (mime === "audio/wav" || mime === "audio/wave" || mime === "audio/x-wav") return "wav";
  return null;
}

/** `content-length` em bytes; null quando ausente/ilegível (aí o corpo decide). */
function parseContentLength(rawValue: string | null): number | null {
  if (typeof rawValue !== "string") return null;
  const value = Number(rawValue.trim());
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Base64 de um Uint8Array em blocos (espalhar 5 MiB em argumentos estoura a pilha). */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let index = 0; index < bytes.length; index += CHUNK) {
    const chunk = bytes.subarray(index, index + CHUNK);
    // `apply` em array-like: evita o protocolo de iteração (o target TS do repo é antigo).
    parts.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
  }
  return btoa(parts.join(""));
}

/** Endpoint AUTENTICADO do objeto. Nunca `/object/public/`. */
function buildObjectEndpoint(supabaseUrl: string, bucket: string, path: string): string {
  const base = new URL(supabaseUrl).origin;
  const encodedPath = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
}

/** Libera o corpo quando a resposta é descartada (não segura o socket). */
function releaseBody(response: Response): void {
  try {
    void response.body?.cancel?.();
  } catch {
    // Cancelar é higiene: falha aqui não muda o desfecho já decidido.
  }
}

/** Erro de limite com o tamanho MEDIDO e o limite vigente. */
function tooLarge(
  bytes: number,
  limitBytes: number,
  bucket: string | null,
  path: string | null,
): AiAudioInputError {
  return new AiAudioInputError(
    "AUDIO_TOO_LARGE",
    `Áudio de ${bytes} bytes excede o limite de ${limitBytes} bytes para embutir na mensagem.`,
    { bytes, limitBytes, bucket, path },
  );
}

/** Marcador interno: a leitura do corpo foi abortada pelo timeout do download. */
class AudioReadAborted extends Error {
  constructor() {
    super("leitura do corpo abortada pelo timeout");
    this.name = "AudioReadAborted";
  }
}

/**
 * Um `reader.read()` corrido contra o sinal do AbortController do download.
 * Repassar o `signal` ao `fetch` não basta — um fetch injetado pode ignorá-lo e
 * o corpo continuaria pendente para sempre: se o prazo estourar com o `read()`
 * em espera (ou já tiver estourado), o reader é cancelado e a promessa rejeita
 * com o marcador, que o chamador traduz para `AUDIO_DOWNLOAD_FAILED`.
 */
function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) return Promise.reject(new AudioReadAborted());
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      reject(new AudioReadAborted());
      try {
        void reader.cancel().catch(() => undefined);
      } catch {
        // Cancelar é higiene: a rejeição por abort já está decidida.
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (err: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(err instanceof Error ? err : new Error(errorText(err)));
      },
    );
  });
}

/**
 * Lê o corpo por streaming, contabilizando os bytes a cada pedaço. Passou do
 * teto, cancela a leitura na hora — o restante do corpo NUNCA é materializado —
 * e rejeita com `AUDIO_TOO_LARGE`. O cancelamento é DISPARADO, não aguardado:
 * a rejeição não depende de a origem fechar (um `cancel()` pendente não prende a
 * função). Abort/erro do stream viram `AUDIO_DOWNLOAD_FAILED`. `body === null`
 * devolve corpo vazio (mesmo desfecho do "objeto vazio" de antes).
 */
async function readBodyWithLimit(
  response: Response,
  signal: AbortSignal,
  maxBytes: number,
  timeoutMs: number,
  bucket: string,
  path: string,
): Promise<Uint8Array> {
  const body = response.body;
  if (body === null) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await readChunk(reader, signal);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        // O cancelamento é PEDIDO, nunca aguardado: um `cancel()` que devolve
        // promessa pendente (origem travada) prenderia a função para sempre —
        // e o timer do download já pode ter sido limpo, sem ninguém para
        // destravá-la. Dispara sem `await`, rejeita na hora e a falha do
        // cancelamento não muda o desfecho já decidido.
        try {
          void reader.cancel().catch(() => undefined);
        } catch {
          // Cancelar é higiene: o desfecho já é o erro de tamanho.
        }
        throw tooLarge(total, maxBytes, bucket, path);
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof AiAudioInputError) throw err;
    if (err instanceof AudioReadAborted) {
      throw new AiAudioInputError(
        "AUDIO_DOWNLOAD_FAILED",
        `Download do audio abortado: timeout de ${timeoutMs} ms na leitura do corpo (${bucket}/${path}).`,
        { bucket, path },
      );
    }
    throw new AiAudioInputError(
      "AUDIO_DOWNLOAD_FAILED",
      `Falha ao ler o corpo do audio do Storage (${bucket}/${path}): ${errorText(err)}`,
      { bucket, path },
    );
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Baixa o áudio AUTORIZADO do Storage do próprio projeto e o devolve embutido
 * (base64 + formato) para a parte `input_audio` da mensagem. Lança SEMPRE
 * `AiAudioInputError` em falha — nunca string solta, nunca resposta pela metade.
 */
export async function toInlineAudio(
  audioUrl: string,
  options: InlineAudioOptions = {},
): Promise<InlineAudio> {
  const rawUrl = typeof audioUrl === "string" ? audioUrl.trim() : "";
  if (rawUrl === "") {
    throw new AiAudioInputError("AUDIO_URL_INVALID", "audio_url ausente ou vazia.");
  }
  // `data:` NÃO é aceito aqui: o objeto do meme mora no Storage e é lá que a
  // allowlist de bucket e a identidade explícita valem. Fora disso, sem download.
  if (/^data:/i.test(rawUrl)) {
    throw new AiAudioInputError(
      "AUDIO_URL_INVALID",
      "data URL não é aceita: o áudio precisa ser um objeto do Storage do projeto.",
    );
  }

  const maxBytes = options.maxBytes ?? MAX_INLINE_AUDIO_BYTES;
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new AiAudioInputError("AUDIO_URL_INVALID", "maxBytes deve ser um numero positivo.");
  }

  const supabaseUrl = options.supabaseUrl ?? readEnv("SUPABASE_URL");
  if (!supabaseUrl) {
    throw new AiAudioInputError(
      "AUDIO_STORAGE_UNAVAILABLE",
      "SUPABASE_URL ausente: sem origem nao ha download autenticado.",
    );
  }

  const identity = options.storageIdentity;
  if (!identity) {
    throw new AiAudioInputError(
      "AUDIO_STORAGE_UNAVAILABLE",
      "storageIdentity ausente: o download exige identidade explicita ('user' ou 'service').",
    );
  }

  // Credencial do GET: usuário → anon key + JWT do chamador; serviço → service
  // role. Ausência/inconsistência falha FECHADA aqui, antes de qualquer rede.
  let apikey: string;
  let authorization: string;
  if (identity.kind === "user") {
    const bearerToken = typeof identity.bearerToken === "string" ? identity.bearerToken.trim() : "";
    const anonKeyRaw = identity.anonKey ?? readEnv("SUPABASE_ANON_KEY");
    const anonKey = typeof anonKeyRaw === "string" ? anonKeyRaw.trim() : "";
    if (!bearerToken || !anonKey) {
      throw new AiAudioInputError(
        "AUDIO_STORAGE_UNAVAILABLE",
        "Identidade de usuario sem bearerToken ou anon key: download nao autorizado.",
      );
    }
    apikey = anonKey;
    authorization = `Bearer ${bearerToken}`;
  } else {
    const serviceRoleKeyRaw = options.serviceRoleKey ?? readEnv("SUPABASE_SERVICE_ROLE_KEY");
    const serviceRoleKey = typeof serviceRoleKeyRaw === "string" ? serviceRoleKeyRaw.trim() : "";
    if (!serviceRoleKey) {
      throw new AiAudioInputError(
        "AUDIO_STORAGE_UNAVAILABLE",
        "SUPABASE_SERVICE_ROLE_KEY ausente: sem credencial nao ha download autenticado.",
      );
    }
    apikey = serviceRoleKey;
    authorization = `Bearer ${serviceRoleKey}`;
  }

  // Só objeto do Storage DESTE projeto, em bucket da allowlist.
  const object = parseApprovedStorageUrl(
    rawUrl,
    supabaseUrl,
    options.allowedBuckets ?? ALLOWED_AUDIO_BUCKETS,
  );
  if (!object) {
    throw new AiAudioInputError(
      "AUDIO_URL_INVALID",
      "URL de audio nao e um objeto do Storage deste projeto em bucket autorizado.",
    );
  }
  const { bucket, path } = object;

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ??
    ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // O prazo vale para o download INTEIRO: requisição, validação dos headers e
  // leitura/montagem do corpo. Por isso o timer só morre neste finally externo —
  // toda saída (sucesso ou AiAudioInputError) passa por ele uma única vez.
  try {
    let response: Response;
    try {
      response = await fetchImpl(buildObjectEndpoint(supabaseUrl, bucket, path), {
        method: "GET",
        headers: { apikey, Authorization: authorization },
        signal: controller.signal,
      });
    } catch (err) {
      throw new AiAudioInputError(
        "AUDIO_DOWNLOAD_FAILED",
        `Falha ao baixar o audio do Storage (${bucket}/${path}): ${errorText(err)}`,
        { bucket, path },
      );
    }

    if (!response.ok) {
      releaseBody(response);
      throw new AiAudioInputError(
        "AUDIO_DOWNLOAD_FAILED",
        `Storage respondeu HTTP ${response.status} para ${bucket}/${path}.`,
        { status: response.status, bucket, path },
      );
    }

    // Tipo antes de embutir.
    const declaredType = response.headers.get("content-type");
    const mime = normalizeAudioMime(declaredType);
    if (!mime) {
      releaseBody(response);
      throw new AiAudioInputError(
        "AUDIO_TYPE_INVALID",
        `content-type nao e audio: ${declaredType ?? "(ausente)"} (${bucket}/${path}).`,
        { contentType: declaredType, bucket, path },
      );
    }

    // Formato aceito pelo provedor — o payload nunca sai com formato que ele recusaria.
    const format = formatForMime(mime);
    if (!format) {
      releaseBody(response);
      throw new AiAudioInputError(
        "AUDIO_FORMAT_UNSUPPORTED",
        `Formato de audio nao aceito pelo provedor: ${mime} (${bucket}/${path}).`,
        { contentType: mime, bucket, path },
      );
    }

    // Limite ANTES do corpo quando o provedor informa content-length...
    const announcedBytes = parseContentLength(response.headers.get("content-length"));
    if (announcedBytes !== null && announcedBytes > maxBytes) {
      releaseBody(response);
      throw tooLarge(announcedBytes, maxBytes, bucket, path);
    }

    // ...e CONFIRMADO nos bytes reais, lidos por streaming: sem content-length
    // (ou com valor falso) a contagem para no primeiro pedaço que estoura o
    // teto — o restante do corpo é cancelado, nunca materializado.
    const bytes = await readBodyWithLimit(
      response,
      controller.signal,
      maxBytes,
      timeoutMs,
      bucket,
      path,
    );
    if (bytes.byteLength === 0) {
      throw new AiAudioInputError(
        "AUDIO_DOWNLOAD_FAILED",
        `Objeto vazio no Storage (${bucket}/${path}).`,
        { bytes: 0, bucket, path },
      );
    }

    return {
      data: bytesToBase64(bytes),
      format,
      mime,
      bytes: bytes.byteLength,
      bucket,
      path,
    };
  } finally {
    clearTimeout(timer);
  }
}
