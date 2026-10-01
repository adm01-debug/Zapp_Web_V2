/**
 * Entrada de imagem para modelos de VISÃO (Bloco 04 / PR-4 — IA-033).
 *
 * Por que este módulo existe (decisão do Joaquim `20261001-195235-aa8c`):
 *  - o bucket `whatsapp-media` é **PRIVADO** (medido: `public=false`) e 971 de 971
 *    figurinhas guardam URL `/object/public/whatsapp-media/...`, que devolve HTTP 400
 *    para terceiros — o modelo NÃO consegue buscar a imagem;
 *  - tornar o bucket público foi DESCARTADO (exporia mídia de clientes).
 *
 * Então a imagem é **baixada no servidor** com a service role e embutida na mensagem
 * como data URL base64 (`data:<mime>;base64,<...>`) — o valor de
 * `content: [{ type:'image_url', image_url:{ url } }]` enviado ao provedor.
 *
 * Contrato (fail-closed, nunca improvisar):
 *  1. URL `data:` pronta volta COMO ESTÁ, sem nenhuma chamada de rede;
 *  2. URL de Storage do PRÓPRIO projeto (`/object/public/<bucket>/<path>` ou
 *     `/object/sign/<bucket>/<path>`) vira leitura AUTENTICADA
 *     (`/storage/v1/object/<bucket>/<path>` + service role): a URL pública crua
 *     NUNCA é usada para o download;
 *  3. origem de outro projeto, bucket fora da allowlist, travessia de caminho
 *     (`..`, `\`, NUL) ou URL que não é do Storage → `AiImageInputError`;
 *  4. LIMITE de `MAX_INLINE_IMAGE_BYTES` (4 MiB): conferido no `content-length` ANTES
 *     de ler o corpo e CONFIRMADO nos bytes reais (o cabeçalho não decide sozinho);
 *  5. `content-type` precisa ser `image/*`; qualquer outro é erro tipado;
 *  6. sucesso devolve também `mime` e `bytes`, para quem chama registrar no consumo
 *     (`ai_usage_logs`).
 *
 * Dependências: só `./ssrf.ts` (parser já testado e fechado de URL de Storage). Nada de
 * `esm.sh`, `Deno.serve` ou cliente Supabase — o download é `fetch` cru no endpoint
 * autenticado do Storage, o que mantém o módulo importável no vitest (contrato em
 * `tests/contracts/ai-image-input.contract.test.ts`) e evita SDK pesado na função.
 */

import { parseApprovedStorageUrl } from "./ssrf.ts";

/** Teto de imagem embutida (a decisão do Joaquim): 4 MiB. */
export const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Buckets dos quais esta função aceita imagem. É a allowlist do parser de URL: uma URL
 * de outro bucket (mesmo do próprio projeto) não é baixada com service role.
 */
export const ALLOWED_IMAGE_BUCKETS: readonly string[] = [
  "whatsapp-media",
  "stickers",
  "custom-emojis",
];

/** Teto de tempo do download (o classificador roda com timeoutMs 15000). */
const DEFAULT_TIMEOUT_MS = 15_000;

/** Códigos tipados: o chamador decide o desfecho (hoje: degradar para 'outros'). */
export type AiImageInputErrorCode =
  | "IMAGE_URL_INVALID"
  | "IMAGE_STORAGE_UNAVAILABLE"
  | "IMAGE_DOWNLOAD_FAILED"
  | "IMAGE_TOO_LARGE"
  | "IMAGE_TYPE_INVALID";

/** Status HTTP sugerido para cada código, para o endpoint mapear sem tabela própria. */
const ERROR_STATUS: Record<AiImageInputErrorCode, number> = {
  IMAGE_URL_INVALID: 400,
  IMAGE_STORAGE_UNAVAILABLE: 500,
  IMAGE_DOWNLOAD_FAILED: 502,
  IMAGE_TOO_LARGE: 413,
  IMAGE_TYPE_INVALID: 415,
};

/** O que a mensagem de erro carrega (a URL completa NUNCA entra: pode ter token). */
export interface AiImageInputErrorDetails {
  bytes?: number | null;
  limitBytes?: number | null;
  contentType?: string | null;
  status?: number | null;
  bucket?: string | null;
  path?: string | null;
}

/**
 * Erro TIPADO do módulo (nunca string solta). `instanceof` funciona, `code` é estável e
 * `toJSON()` dá o corpo pronto para log/`jsonResponse`.
 */
export class AiImageInputError extends Error {
  readonly code: AiImageInputErrorCode;
  readonly status: number;
  /** Tamanho medido (bytes) — preenchido em TOO_LARGE e em DOWNLOAD_FAILED vazio. */
  readonly bytes: number | null;
  /** Limite vigente (bytes) — preenchido em TOO_LARGE. */
  readonly limitBytes: number | null;
  readonly contentType: string | null;
  /** Status HTTP do Storage, quando houve resposta. */
  readonly status_http: number | null;
  readonly bucket: string | null;
  readonly path: string | null;

  constructor(
    code: AiImageInputErrorCode,
    message: string,
    details: AiImageInputErrorDetails = {},
  ) {
    super(message);
    this.name = "AiImageInputError";
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

/** Imagem pronta para embutir na mensagem do provedor. */
export interface InlineImage {
  /** `data:<mime>;base64,<...>` — valor de `image_url.url`. */
  dataUrl: string;
  mime: string;
  bytes: number;
  /** De onde veio (null quando a entrada já era `data:`). */
  bucket: string | null;
  path: string | null;
}

/** Ajustes opcionais (os padrões vêm do ambiente da função). */
export interface InlineImageOptions {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  allowedBuckets?: readonly string[];
  maxBytes?: number;
  timeoutMs?: number;
  /** Injeção para teste; o padrão é o `fetch` global resolvido na hora da chamada. */
  fetchImpl?: typeof fetch;
}

/**
 * Lê o ambiente da função. Usa o `Deno` do escopo global (runtime Edge) em vez de
 * `Deno.env` direto para (a) não explodir quando a variável não existe e (b) permitir
 * ao contrato em vitest injetar o ambiente sem tocar no módulo.
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

/** `image/<sub>` normalizado (`image/webp; charset=...` → `image/webp`) ou null. */
function normalizeImageMime(rawValue: string | null): string | null {
  if (typeof rawValue !== "string") return null;
  const mime = rawValue.split(";")[0].trim().toLowerCase();
  return /^image\/[a-z0-9][a-z0-9.+-]*$/.test(mime) ? mime : null;
}

/** `content-length` em bytes; null quando ausente/ilegível (aí o corpo decide). */
function parseContentLength(rawValue: string | null): number | null {
  if (typeof rawValue !== "string") return null;
  const value = Number(rawValue.trim());
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Base64 de um Uint8Array em blocos (espalhar 4 MiB em argumentos estoura a pilha). */
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

/** Endpoint AUTENTICADO do objeto. Nunca `/object/public/`: o bucket segue privado. */
function buildObjectEndpoint(supabaseUrl: string, bucket: string, path: string): string {
  const base = new URL(supabaseUrl).origin;
  const encodedPath = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
}

/** Libera o corpo quando a resposta é descartada (não segura o socket). */
function releaseBody(response: Response): void {
  try {
    // `body.cancel()` é opcional no tipo Response; mock/edge podem não ter.
    response.body?.cancel?.();
  } catch {
    // Cancelar é higiene: falha aqui não muda o desfecho já decidido.
  }
}

/** Erro de limite com o tamanho MEDIDO e o limite vigente, como manda a decisão. */
function tooLarge(
  bytes: number,
  limitBytes: number,
  bucket: string | null,
  path: string | null,
): AiImageInputError {
  return new AiImageInputError(
    "IMAGE_TOO_LARGE",
    `Imagem de ${bytes} bytes excede o limite de ${limitBytes} bytes para embutir na mensagem.`,
    { bytes, limitBytes, bucket, path },
  );
}

/** Bytes de um payload base64 (sem decodificar: só o tamanho, para o limite). */
function base64ByteLength(payload: string): number {
  const semEspaco = payload.replace(/\s+/g, "");
  const padding = semEspaco.endsWith("==") ? 2 : semEspaco.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((semEspaco.length * 3) / 4) - padding);
}

/**
 * `data:` já pronto: não re-codifica e NÃO faz rede, mas ainda passa pelas mesmas
 * guardas (mime de imagem e limite de tamanho) — um data URL gigante quebra o payload
 * do provedor do mesmo jeito que um objeto gigante.
 */
function inlineFromDataUrl(url: string, maxBytes: number): InlineImage {
  const separator = url.indexOf(",");
  const meta = separator >= 0 ? url.slice(5, separator) : "";
  const payload = separator >= 0 ? url.slice(separator + 1) : "";
  const parts = meta.split(";").map((part) => part.trim());
  const declaredMime = (parts[0] ?? "").toLowerCase();
  const isBase64 = parts.some((part) => part.toLowerCase() === "base64");

  const mime = normalizeImageMime(declaredMime);
  if (!mime || !declaredMime.startsWith("image/")) {
    throw new AiImageInputError(
      "IMAGE_TYPE_INVALID",
      `data URL com tipo nao-imagem: ${declaredMime || "(vazio)"}.`,
      { contentType: declaredMime || null },
    );
  }

  let bytes: number;
  if (isBase64) {
    bytes = base64ByteLength(payload);
  } else {
    try {
      bytes = new TextEncoder().encode(decodeURIComponent(payload)).length;
    } catch {
      throw new AiImageInputError("IMAGE_URL_INVALID", "data URL com payload ilegivel.");
    }
  }

  if (bytes > maxBytes) throw tooLarge(bytes, maxBytes, null, null);
  if (bytes === 0) {
    throw new AiImageInputError("IMAGE_DOWNLOAD_FAILED", "data URL de imagem vazia.", {
      bytes: 0,
    });
  }

  return { dataUrl: url, mime, bytes, bucket: null, path: null };
}

/**
 * Converte a URL que o app manda hoje numa imagem EMBUTIDA (data URL base64), baixando
 * o objeto no servidor com a service role. Lança SEMPRE `AiImageInputError` em falha —
 * nunca string solta, nunca resposta pela metade.
 */
export async function toInlineImage(
  imageUrl: string,
  options: InlineImageOptions = {},
): Promise<InlineImage> {
  const rawUrl = typeof imageUrl === "string" ? imageUrl.trim() : "";
  if (rawUrl === "") {
    throw new AiImageInputError("IMAGE_URL_INVALID", "image_url ausente ou vazia.");
  }

  const maxBytes = options.maxBytes ?? MAX_INLINE_IMAGE_BYTES;
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new AiImageInputError("IMAGE_URL_INVALID", "maxBytes deve ser um numero positivo.");
  }

  // (1) data URL pronta: devolvida como está, sem rede.
  if (/^data:/i.test(rawUrl)) return inlineFromDataUrl(rawUrl, maxBytes);

  // (2) credencial de serviço do ambiente da função (a mesma das funções de IA).
  const supabaseUrl = options.supabaseUrl ?? readEnv("SUPABASE_URL");
  const serviceRoleKey = options.serviceRoleKey ?? readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new AiImageInputError(
      "IMAGE_STORAGE_UNAVAILABLE",
      "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes: sem credencial nao ha download autenticado.",
    );
  }

  // (3) só objeto do Storage DESTE projeto, em bucket da allowlist.
  const object = parseApprovedStorageUrl(
    rawUrl,
    supabaseUrl,
    options.allowedBuckets ?? ALLOWED_IMAGE_BUCKETS,
  );
  if (!object) {
    throw new AiImageInputError(
      "IMAGE_URL_INVALID",
      "URL de imagem nao e um objeto do Storage deste projeto em bucket autorizado.",
    );
  }
  const { bucket, path } = object;

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ??
    ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    // (2) leitura AUTENTICADA: /storage/v1/object/<bucket>/<path> + service role.
    response = await fetchImpl(buildObjectEndpoint(supabaseUrl, bucket, path), {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      signal: controller.signal,
    });
  } catch (err) {
    throw new AiImageInputError(
      "IMAGE_DOWNLOAD_FAILED",
      `Falha ao baixar a imagem do Storage (${bucket}/${path}): ${errorText(err)}`,
      { bucket, path },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    releaseBody(response);
    throw new AiImageInputError(
      "IMAGE_DOWNLOAD_FAILED",
      `Storage respondeu HTTP ${response.status} para ${bucket}/${path}.`,
      { status: response.status, bucket, path },
    );
  }

  // (5) tipo antes de embutir.
  const declaredType = response.headers.get("content-type");
  const mime = normalizeImageMime(declaredType);
  if (!mime) {
    releaseBody(response);
    throw new AiImageInputError(
      "IMAGE_TYPE_INVALID",
      `content-type nao e imagem: ${declaredType ?? "(ausente)"} (${bucket}/${path}).`,
      { contentType: declaredType, bucket, path },
    );
  }

  // (4) limite ANTES do corpo quando o provedor informa content-length...
  const announcedBytes = parseContentLength(response.headers.get("content-length"));
  if (announcedBytes !== null && announcedBytes > maxBytes) {
    releaseBody(response);
    throw tooLarge(announcedBytes, maxBytes, bucket, path);
  }

  // ...e CONFIRMADO nos bytes reais (cabeçalho mentiroso não passa).
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw tooLarge(bytes.byteLength, maxBytes, bucket, path);
  }
  if (bytes.byteLength === 0) {
    throw new AiImageInputError(
      "IMAGE_DOWNLOAD_FAILED",
      `Objeto vazio no Storage (${bucket}/${path}).`,
      { bytes: 0, bucket, path },
    );
  }

  // (6) sucesso: data URL pronta + mime + bytes para o registro de consumo.
  return {
    dataUrl: `data:${mime};base64,${bytesToBase64(bytes)}`,
    mime,
    bytes: bytes.byteLength,
    bucket,
    path,
  };
}
