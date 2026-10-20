/**
 * Núcleo de PREPARAÇÃO DE MÍDIA do kernel de mensageria (bloco D / F40).
 *
 * `prepareMedia(url, opts)` é o ÚNICO ponto do Zapp que decide se um arquivo de
 * mídia pode entrar num envio. Ele responde a quatro perguntas, nesta ordem, e
 * para na primeira que reprovar:
 *
 *   1. ACESSIBILIDADE — o arquivo existe e responde? (HEAD antes de aceitar; um
 *      `404/410` — o caso do signed URL expirado — reprova aqui).
 *   2. TAMANHO — cabe no limite configurável? (default sensato de 16 MiB).
 *   3. TIPO REAL — o que os MAGIC BYTES dizem? NUNCA a extensão nem o
 *      `Content-Type` declarado: os dois são entradas não confiáveis. Um
 *      `/foto.png` que serve um PDF é classificado como `document`.
 *   4. SEMÂNTICA — `fileName` é OBRIGATÓRIO quando o tipo real é `document`
 *      (o WhatsApp só entrega documento com nome); opcional nos demais.
 *
 * Falha de mídia NÃO é erro de rede genérico: o contrato devolve
 * `{ ok: false, reason, detail }` e a classe de elegibilidade que o F39 consome
 * (`media_pending` — o item fica pendente, nunca é descartado em silêncio).
 * Um `{ ok: true }` devolve `{ kind, mime, sizeBytes, fileName, url, signedUrl }`.
 *
 * Signed URL: quando o arquivo vive na NOSSA storage e a URL é assinada, o
 * token JWT carrega um `exp`. Se ele expira ANTES do fim da janela de envio
 * (`ttlSeconds`), o item seria enviado com a URL já morta — então re-assinamos
 * via `opts.sign` (o adaptador do Storage) e amarramos o TTL ao envio. Sem
 * assinador e com token vencido, reprovamos com `signed_url_expired` em vez de
 * aceitar uma URL que morre no meio do caminho.
 *
 * Escopo deliberado: este módulo NÃO é um fetcher arbitrário. As URLs que
 * chegam aqui vêm da storage do projeto ou do CDN da Evolution, e a validação
 * de host/SSRF de páginas de usuário é responsabilidade de `../ssrf.ts` e
 * `../secure-egress.ts` — que ele reaproveita para reconhecer a storage própria.
 * Só `http:`/`https:` são aceitos.
 */
import { parseApprovedStorageUrl } from "../ssrf.ts";

/** Tipo REAL do arquivo, derivado dos magic bytes (nunca da extensão). */
export type MediaKind = "image" | "document" | "audio" | "video";

/** Motivo tipado de reprovação — cada um mapeia para `media_pending` no F39. */
export type PrepareMediaFailureReason =
  | "invalid_url"
  | "unreachable"
  | "not_found"
  | "access_denied"
  | "too_large"
  | "empty"
  | "unsupported_type"
  | "missing_file_name"
  | "invalid_file_name"
  | "signed_url_expired"
  | "signed_url_failed";

/** Classe de elegibilidade que o F39 devolve ao banco para uma mídia reprovada. */
export const MEDIA_PENDING_ELIGIBILITY = "media_pending" as const;

/** Limite default de tamanho (16 MiB) — o teto prático de mídia enviada 1:1. */
export const DEFAULT_MAX_MEDIA_BYTES = 16 * 1024 * 1024;

/** Janela default de validade da URL até o envio, em segundos. */
export const DEFAULT_MEDIA_TTL_SECONDS = 300;

/** Bytes de prefixo lidos para reconhecer os magic bytes. */
export const DEFAULT_PROBE_BYTES = 512;

/** Fetcher injetável — default é o `fetch` global. */
export type MediaFetcher = (input: string, init: RequestInit) => Promise<Response>;

/** Pedido de assinatura de URL feito ao adaptador do Storage. */
export interface SignedUrlRequest {
  bucket: string;
  path: string;
  expiresIn: number;
}

/** Assinador injetado (Supabase `storage.from(b).createSignedUrl(path, ttl)`). */
export type SignedUrlResolver = (
  request: SignedUrlRequest,
) => Promise<string | null>;

export interface PrepareMediaOptions {
  /** Tamanho máximo em bytes. Default: `MESSAGING_MEDIA_MAX_BYTES` ou 16 MiB. */
  maxBytes?: number;
  /** Validade mínima da URL até o envio, em segundos. Default 300. */
  ttlSeconds?: number;
  /** Nome do arquivo. OBRIGATÓRIO quando o tipo real for `document`. */
  fileName?: string;
  /** Instante atual em ms (injetável para testar expiração). */
  now?: number;
  /** Quantos bytes ler para reconhecer o tipo. Default 512. */
  probeBytes?: number;
  /** Timeout das requisições HTTP, em ms. Default 15000. */
  timeoutMs?: number;
  /** Fetcher alternativo (testes); default = `fetch`. */
  fetcher?: MediaFetcher;
  /** Assinador do Storage, usado quando o arquivo é nosso e a URL expira. */
  sign?: SignedUrlResolver;
  /** URL base do projeto Supabase — habilita o reconhecimento de storage própria. */
  storageProjectUrl?: string;
  /** Buckets aceitos. Só tem efeito com `storageProjectUrl`. */
  allowedBuckets?: readonly string[];
}

/** Resultado aprovado: já pronto para virar um item de envio. */
export interface PrepareMediaSuccess {
  ok: true;
  media: {
    kind: MediaKind;
    mime: string;
    sizeBytes: number;
    fileName: string;
    /** URL original recebida. */
    url: string;
    /** URL que o envio deve usar (signed, com TTL amarrado ao envio). */
    signedUrl: string;
  };
}

/** Resultado reprovado: bloqueia o item com `media_pending`. */
export interface PrepareMediaFailure {
  ok: false;
  reason: PrepareMediaFailureReason;
  detail: string;
  eligibility: typeof MEDIA_PENDING_ELIGIBILITY;
}

export type PrepareMediaResult = PrepareMediaSuccess | PrepareMediaFailure;

// ─────────────────────────── reconhecimento por magic bytes ──────────────────

function bytesAt(bytes: Uint8Array, offset: number, values: readonly number[]): boolean {
  if (bytes.length < offset + values.length) return false;
  for (let i = 0; i < values.length; i++) {
    if (bytes[offset + i] !== values[i]) return false;
  }
  return true;
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function asciiLower(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";
  for (let i = 0; i < length; i++) {
    const byte = bytes[offset + i];
    if (byte === undefined) return "";
    value += String.fromCharCode(byte);
  }
  return value.toLowerCase();
}

/** Texto ASCII simples (sem NUL, sem controle) — fallback de documento `text/plain`. */
function isLikelyAsciiText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  for (const byte of bytes) {
    if (byte === 0) return false;
    const printable = byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126);
    if (!printable) return false;
  }
  return true;
}

const HEIC_BRANDS = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);

/**
 * Descobre o TIPO REAL a partir dos primeiros bytes do arquivo.
 *
 * A ordem importa: as famílias com contêiner (RIFF, ISO-BMFF/`ftyp`) são
 * resolvidas antes das assinaturas soltas, e o fallback de texto só entra depois
 * de TODO binário conhecido ter sido descartado. Assinatura desconhecida devolve
 * `null` — o chamador reprova com `unsupported_type` em vez de adivinhar.
 */
export function detectMediaKind(bytes: Uint8Array): { kind: MediaKind; mime: string } | null {
  // Imagens
  if (bytesAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: "image", mime: "image/png" };
  }
  if (bytesAt(bytes, 0, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg" };
  if (asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a")) {
    return { kind: "image", mime: "image/gif" };
  }

  // Contêiner RIFF (WEBP imagem, WAVE áudio, AVI vídeo)
  if (asciiAt(bytes, 0, "RIFF")) {
    if (asciiAt(bytes, 8, "WEBP")) return { kind: "image", mime: "image/webp" };
    if (asciiAt(bytes, 8, "WAVE")) return { kind: "audio", mime: "audio/wav" };
    if (asciiAt(bytes, 8, "AVI ")) return { kind: "video", mime: "video/x-msvideo" };
    return null;
  }

  // ISO-BMFF (MP4/MOV/M4A/HEIC/AVIF): caixa `ftyp` no offset 4.
  if (asciiAt(bytes, 4, "ftyp")) {
    const brand = asciiLower(bytes, 8, 4);
    if (brand === "m4a " || brand === "m4b " || brand === "m4p ") {
      return { kind: "audio", mime: "audio/mp4" };
    }
    if (brand === "avif" || brand === "avis") return { kind: "image", mime: "image/avif" };
    if (HEIC_BRANDS.has(brand)) return { kind: "image", mime: "image/heic" };
    if (brand === "qt  ") return { kind: "video", mime: "video/quicktime" };
    return { kind: "video", mime: "video/mp4" };
  }

  // Áudio
  if (asciiAt(bytes, 0, "OggS")) return { kind: "audio", mime: "audio/ogg" };
  if (asciiAt(bytes, 0, "fLaC")) return { kind: "audio", mime: "audio/flac" };
  if (asciiAt(bytes, 0, "ID3")) return { kind: "audio", mime: "audio/mpeg" };
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    // Layer == 0 => ADTS (AAC); layer != 0 => frame MPEG audio (MP3).
    return (bytes[1] & 0x06) === 0
      ? { kind: "audio", mime: "audio/aac" }
      : { kind: "audio", mime: "audio/mpeg" };
  }

  // Vídeo (EBML: WebM/Matroska)
  if (bytesAt(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3])) return { kind: "video", mime: "video/webm" };

  // Documentos
  if (asciiAt(bytes, 0, "%PDF")) return { kind: "document", mime: "application/pdf" };
  if (
    bytesAt(bytes, 0, [0x50, 0x4b, 0x03, 0x04]) ||
    bytesAt(bytes, 0, [0x50, 0x4b, 0x05, 0x06]) ||
    bytesAt(bytes, 0, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return { kind: "document", mime: "application/zip" };
  }
  if (bytesAt(bytes, 0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return { kind: "document", mime: "application/x-ole-storage" };
  }
  if (asciiAt(bytes, 0, "{\\rtf")) return { kind: "document", mime: "application/rtf" };

  // Último recurso: texto ASCII puro (sem assinatura binária) é documento.
  if (isLikelyAsciiText(bytes)) return { kind: "document", mime: "text/plain" };

  return null;
}

// ─────────────────────────────── helpers de contrato ─────────────────────────

function fail(reason: PrepareMediaFailureReason, detail: string): PrepareMediaFailure {
  return { ok: false, reason, detail, eligibility: MEDIA_PENDING_ELIGIBILITY };
}

function failFromStatus(status: number, context: string): PrepareMediaFailure {
  if (status === 404 || status === 410) {
    return fail("not_found", `Mídia indisponível (${context}) — arquivo expirado ou removido.`);
  }
  if (status === 401 || status === 403) {
    return fail("access_denied", `Acesso negado à mídia (${context}).`);
  }
  if (status === 408 || status === 429 || status >= 500) {
    return fail("unreachable", `Mídia temporariamente indisponível (${context}).`);
  }
  return fail("unreachable", `Resposta inesperada do servidor de mídia (${context}).`);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseContentRangeTotal(value: string | null): number | null {
  if (!value) return null;
  const slash = value.lastIndexOf("/");
  if (slash < 0) return null;
  const total = value.slice(slash + 1).trim();
  if (total === "*" || total === "") return null;
  const parsed = Number.parseInt(total, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function resolveMaxBytes(options: PrepareMediaOptions): number {
  if (typeof options.maxBytes === "number" && Number.isFinite(options.maxBytes) && options.maxBytes > 0) {
    return Math.floor(options.maxBytes);
  }
  // Permissão de env ausente não pode derrubar a função: cai no default.
  try {
    const env = Deno.env.get("MESSAGING_MEDIA_MAX_BYTES");
    if (env) {
      const parsed = Number.parseInt(env, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // sem --allow-env: usa o default constante.
  }
  return DEFAULT_MAX_MEDIA_BYTES;
}

function resolveTtlSeconds(options: PrepareMediaOptions): number {
  if (
    typeof options.ttlSeconds === "number" && Number.isFinite(options.ttlSeconds) &&
    options.ttlSeconds > 0
  ) {
    return Math.floor(options.ttlSeconds);
  }
  return DEFAULT_MEDIA_TTL_SECONDS;
}

function resolveProbeBytes(options: PrepareMediaOptions): number {
  if (
    typeof options.probeBytes === "number" && Number.isFinite(options.probeBytes) &&
    options.probeBytes > 0
  ) {
    return Math.floor(options.probeBytes);
  }
  return DEFAULT_PROBE_BYTES;
}

function resolveTimeoutMs(options: PrepareMediaOptions): number {
  if (typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
    return Math.floor(options.timeoutMs);
  }
  return 15000;
}

const MIME_EXTENSION: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/avif": "avif",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/flac": "flac",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/rtf": "rtf",
  "text/plain": "txt",
};

/** Nome seguro: sem separador de caminho, sem NUL, sem controle, 1..255 chars. */
export function isSafeMediaFileName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 255) return false;
  if (trimmed === "." || trimmed === "..") return false;
  if (trimmed.includes("/") || trimmed.includes("\\")) return false;
  return !hasControlChars(trimmed);
}

/**
 * Checa caractere de controle (C0 e DEL) por code point, de proposito sem regex.
 *
 * `no-control-regex` (eslint do repo) recusa a classe de controle e o `deno-lint-ignore`
 * NAO vale para o eslint — o hook de pre-commit acusa as duas formas. A varredura por
 * code point e equivalente e nao precisa de supressao nenhuma.
 */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** Remove controles do nome derivado da URL (mesmo motivo de `hasControlChars`). */
function stripControlChars(value: string): string {
  let limpo = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) continue;
    limpo += value[i];
  }
  return limpo;
}

function resolveFileName(
  kind: MediaKind,
  mime: string,
  provided: string | undefined,
  parsed: URL,
): string | PrepareMediaFailure {
  const trimmed = typeof provided === "string" ? provided.trim() : "";

  if (trimmed.length > 0) {
    if (!isSafeMediaFileName(trimmed)) {
      return fail("invalid_file_name", `fileName contém caminho ou caractere inválido: ${JSON.stringify(provided)}`);
    }
    return trimmed;
  }

  // Documento SEM nome é bloqueio duro — o WhatsApp não entrega documento sem nome.
  if (kind === "document") {
    return fail("missing_file_name", "Documento exige fileName: o tipo real é documento e nenhum nome foi informado.");
  }

  // Nos demais tipos o nome é opcional: deriva do path da URL, com fallback seguro.
  let base = "";
  try {
    base = decodeURIComponent(parsed.pathname.split("/").pop() ?? "");
  } catch {
    base = parsed.pathname.split("/").pop() ?? "";
  }
  const clean = stripControlChars(base).trim();
  if (isSafeMediaFileName(clean)) return clean;
  return `midia.${MIME_EXTENSION[mime] ?? "bin"}`;
}

// ────────────────────────────── signed URL / TTL ─────────────────────────────

/** Lê o `exp` (segundos) de um JWT de signed URL do Storage. `null` se ilegível. */
export function decodeSignedUrlExpiryMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(padded);
    const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Normaliza a URL devolvida pelo assinador (pode vir relativa ao projeto). */
function normalizeSignedUrl(signed: string, storageProjectUrl: string): string {
  const value = signed.trim();
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  const base = storageProjectUrl.replace(/\/+$/, "");
  return `${base}${value.startsWith("/") ? "" : "/"}${value}`;
}

type SignedUrlOutcome = { ok: true; signedUrl: string } | { ok: false; failure: PrepareMediaFailure };

/**
 * Decide a URL que o envio deve usar.
 * Storage própria (reconhecida por `ssrf.parseApprovedStorageUrl`) tem o token
 * conferido contra a janela de envio; URL externa passa direto.
 */
async function resolveFetchUrl(
  rawUrl: string,
  parsed: URL,
  options: PrepareMediaOptions,
  ttlSeconds: number,
  nowMs: number,
): Promise<SignedUrlOutcome> {
  const { storageProjectUrl, allowedBuckets, sign } = options;
  if (!storageProjectUrl || !allowedBuckets || allowedBuckets.length === 0) {
    return { ok: true, signedUrl: rawUrl };
  }

  const approved = parseApprovedStorageUrl(rawUrl, storageProjectUrl, allowedBuckets);
  if (!approved) return { ok: true, signedUrl: rawUrl };

  const isSignedPath = parsed.pathname.includes("/storage/v1/object/sign/");
  const token = parsed.searchParams.get("token");

  if (isSignedPath && token) {
    const expiryMs = decodeSignedUrlExpiryMs(token);
    // Token ilegível (ex.: JWT opaco): sem assinador, confiamos na URL.
    if (expiryMs === null && !sign) return { ok: true, signedUrl: rawUrl };
    // Token legível e que cobre a janela de envio: serve como está.
    if (expiryMs !== null && expiryMs >= nowMs + ttlSeconds * 1000) {
      return { ok: true, signedUrl: rawUrl };
    }
  }

  if (sign) {
    try {
      const signed = await sign({ bucket: approved.bucket, path: approved.path, expiresIn: ttlSeconds });
      if (typeof signed === "string" && signed.trim().length > 0) {
        return { ok: true, signedUrl: normalizeSignedUrl(signed, storageProjectUrl) };
      }
    } catch (error) {
      return {
        ok: false,
        failure: fail("signed_url_failed", `Falha ao assinar a URL do storage: ${describeError(error)}`),
      };
    }
    return { ok: false, failure: fail("signed_url_failed", "O assinador do storage não devolveu uma URL.") };
  }

  // Sem assinador: signed URL vencida não pode seguir para o envio.
  if (isSignedPath) {
    return {
      ok: false,
      failure: fail(
        "signed_url_expired",
        `Signed URL do storage expira antes do envio (TTL exigido de ${ttlSeconds}s).`,
      ),
    };
  }
  return { ok: true, signedUrl: rawUrl };
}

// ─────────────────────────────────── leitura ──────────────────────────────────

interface BodyRead {
  prefix: Uint8Array;
  total: number;
  exceeded: boolean;
}

/** Lê o prefixo para magic bytes; conta tudo só quando o tamanho é desconhecido. */
async function readBody(
  response: Response,
  probeBytes: number,
  countUpTo: number | null,
): Promise<BodyRead> {
  const body = response.body;
  if (!body) return { prefix: new Uint8Array(0), total: 0, exceeded: false };

  const reader = body.getReader();
  let prefix = new Uint8Array(0);
  let total = 0;
  let exceeded = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;

      if (prefix.length < probeBytes) {
        const take = value.subarray(0, Math.min(probeBytes - prefix.length, value.length));
        const merged = new Uint8Array(prefix.length + take.length);
        merged.set(prefix);
        merged.set(take, prefix.length);
        prefix = merged;
      }
      total += value.length;

      if (countUpTo !== null && total > countUpTo) {
        exceeded = true;
        break;
      }
      // Modo "só prefixo": o tamanho veio declarado, não há o que contar.
      if (countUpTo === null && prefix.length >= probeBytes) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { prefix, total, exceeded };
}

function hexPreview(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, 8))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

// ─────────────────────────────────── API ─────────────────────────────────────

/**
 * Prepara uma mídia para envio. Nunca lança: toda falha é um
 * `PrepareMediaFailure` com `eligibility: "media_pending"`.
 */
export async function prepareMedia(
  url: string,
  options: PrepareMediaOptions = {},
): Promise<PrepareMediaResult> {
  const rawUrl = typeof url === "string" ? url.trim() : "";
  if (rawUrl.length === 0) return fail("invalid_url", "URL de mídia ausente.");

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return fail("invalid_url", `URL de mídia malformada: ${JSON.stringify(url)}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return fail("invalid_url", `Protocolo não suportado para mídia: ${parsed.protocol}`);
  }

  const maxBytes = resolveMaxBytes(options);
  const ttlSeconds = resolveTtlSeconds(options);
  const probeBytes = resolveProbeBytes(options);
  const timeoutMs = resolveTimeoutMs(options);
  const nowMs = options.now ?? Date.now();
  const fetcher: MediaFetcher = options.fetcher ?? ((input, init) => fetch(input, init));

  // 1) URL que o envio vai usar (signed URL com TTL amarrado, se for nossa storage).
  const signed = await resolveFetchUrl(rawUrl, parsed, options, ttlSeconds, nowMs);
  if (!signed.ok) return signed.failure;
  const fetchUrl = signed.signedUrl;

  // 2) Acessibilidade + tamanho declarado (HEAD antes de aceitar).
  let declaredTotal: number | null = null;
  try {
    const head = await fetcher(fetchUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (head.ok) {
      declaredTotal = parseContentLength(head.headers.get("content-length"));
    } else if (head.status !== 405 && head.status !== 501) {
      // Servidor não aceitou HEAD por motivo real (404/403/5xx): reprova.
      await head.body?.cancel().catch(() => {});
      return failFromStatus(head.status, `HEAD ${head.status}`);
    }
    await head.body?.cancel().catch(() => {});
  } catch (error) {
    return fail("unreachable", `Falha na checagem de acessibilidade (HEAD): ${describeError(error)}`);
  }

  if (declaredTotal !== null && declaredTotal > maxBytes) {
    return fail("too_large", `Mídia tem ${declaredTotal} bytes e excede o limite de ${maxBytes} bytes.`);
  }
  if (declaredTotal === 0) return fail("empty", "Mídia vazia (0 bytes).");

  // 3) GET do prefixo para os magic bytes.
  let getResponse: Response;
  try {
    getResponse = await fetcher(fetchUrl, {
      method: "GET",
      headers: { Range: `bytes=0-${probeBytes - 1}` },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return fail("unreachable", `Falha ao baixar a mídia: ${describeError(error)}`);
  }
  if (!getResponse.ok) {
    await getResponse.body?.cancel().catch(() => {});
    return failFromStatus(getResponse.status, `GET ${getResponse.status}`);
  }
  if (declaredTotal === null) {
    const rangeTotal = parseContentRangeTotal(getResponse.headers.get("content-range"));
    if (rangeTotal !== null) declaredTotal = rangeTotal;
  }

  // Tamanho conhecido => lê só o prefixo; desconhecido => conta até estourar.
  const read = await readBody(
    getResponse,
    probeBytes,
    declaredTotal === null ? maxBytes : null,
  );
  if (read.exceeded) {
    return fail("too_large", `Mídia excede o limite de ${maxBytes} bytes.`);
  }
  const sizeBytes = declaredTotal ?? read.total;
  if (sizeBytes > maxBytes) {
    return fail("too_large", `Mídia tem ${sizeBytes} bytes e excede o limite de ${maxBytes} bytes.`);
  }
  if (sizeBytes === 0 || read.prefix.length === 0) return fail("empty", "Mídia vazia (0 bytes).");

  // 4) Tipo REAL por magic bytes — extensão e Content-Type declarados são ignorados.
  const detected = detectMediaKind(read.prefix);
  if (!detected) {
    return fail(
      "unsupported_type",
      `Magic bytes não reconhecidos como imagem/documento/áudio/vídeo (${hexPreview(read.prefix)}).`,
    );
  }

  // 5) fileName obrigatório para documento.
  const fileName = resolveFileName(detected.kind, detected.mime, options.fileName, parsed);
  if (typeof fileName !== "string") return fileName;

  return {
    ok: true,
    media: {
      kind: detected.kind,
      mime: detected.mime,
      sizeBytes,
      fileName,
      url: rawUrl,
      signedUrl: fetchUrl,
    },
  };
}
