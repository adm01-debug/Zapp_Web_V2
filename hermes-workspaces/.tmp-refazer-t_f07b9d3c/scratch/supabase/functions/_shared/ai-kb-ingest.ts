/**
 * Ingestão da Base de Conhecimento (R2-API-054 / item 227).
 *
 * Por que este módulo existe:
 *  - o upload gravava os bytes e criava `knowledge_base_files`, mas NADA
 *    transformava o documento em conhecimento: `article_id`/`extracted_text`
 *    ficavam nulos, `processing_status` parava em `pending`, e o contexto da IA
 *    (que lê `knowledge_base_articles` PUBLICADOS) nunca via o arquivo;
 *  - este é o lado PURO do pipeline: resolve o objeto de storage por LISTA DE
 *    PERMITIDOS, extrai o texto dos formatos que o produto sabe ler e monta o
 *    artigo. Quem grava é o handler `ai-kb-ingest`, com o cliente Supabase.
 *
 * Regras não negociáveis:
 *  1. O documento só é anunciado como conhecimento depois de VIRAR artigo
 *     publicado e recuperável pela busca (`search_knowledge_base`/contexto IA).
 *  2. Formato sem extrator local NÃO vira artigo: o arquivo fica "somente
 *     armazenado" (`unsupported`) e a tela diz isso — nada de promessa falsa.
 *  3. `file_url` de host/bucket fora do PERMITIDO é recusada SEM nenhum fetch
 *     (a resolução é a lista de permitidos, nunca uma lista de proibidos).
 */

/** Bucket, único de onde este pipeline aceita baixar (lista de PERMITIDOS). */
export const KB_INGEST_BUCKET = "whatsapp-media";

/** Estados de `knowledge_base_files.processing_status` usados pelo pipeline. */
export const KB_FILE_PROCESSING_STATUSES = [
  "pending",
  "processing",
  "completed",
  "unsupported",
  "failed",
] as const;

export type KbFileProcessingStatus = (typeof KB_FILE_PROCESSING_STATUSES)[number];

/** Extensões que o extrator LOCAL dá conta (texto puro, sem dependência nova). */
export const KB_TEXT_EXTENSIONS = [
  "txt",
  "text",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "xml",
  "html",
  "htm",
  "log",
  "yml",
  "yaml",
] as const;

/** Teto do texto extraído que vira artigo (o resto é descartado com honestidade). */
export const KB_MAX_TEXT_CHARS = 200_000;

const MIME_TO_EXT: Record<string, string> = {
  "text/plain": "txt",
  "text/markdown": "md",
  "text/x-markdown": "md",
  "text/csv": "csv",
  "text/tab-separated-values": "tsv",
  "application/json": "json",
  "application/xml": "xml",
  "text/xml": "xml",
  "text/html": "html",
  "text/yaml": "yml",
  "application/x-yaml": "yml",
};

/**
 * Extensão (minúscula, sem ponto) do arquivo. Cai no MIME quando o nome não
 * tem extensão. Devolve `""` quando não dá para saber — e aí o formato é
 * tratado como não suportado.
 */
export function kbExtension(fileName: string, fileType: string | null): string {
  const name = typeof fileName === "string" ? fileName.trim() : "";
  const dot = name.lastIndexOf(".");
  if (dot > 0 && dot < name.length - 1) {
    return name.slice(dot + 1).toLowerCase();
  }
  const mime = (fileType ?? "").split(";")[0].trim().toLowerCase();
  return MIME_TO_EXT[mime] ?? "";
}

/** `true` quando o extrator local sabe transformar a extensão em texto. */
export function isKbTextExtractable(ext: string): boolean {
  return (KB_TEXT_EXTENSIONS as readonly string[]).includes(ext);
}

export interface KbStorageObject {
  bucket: string;
  objectPath: string;
}

/**
 * Resolve `{bucket, objectPath}` a partir de uma URL de storage DESTE projeto.
 *
 * Devolve `null` (recusa) quando: a URL é inválida, não é https, o host difere
 * do projeto, o bucket não está na lista de PERMITIDOS ou o caminho tenta sair
 * do bucket (`..`). Quem chama NÃO deve baixar nada quando isto devolve `null`.
 */
export function resolveKbStorageObject(
  fileUrl: string,
  supabaseUrl: string,
  allowedBuckets: readonly string[] = [KB_INGEST_BUCKET],
): KbStorageObject | null {
  let url: URL;
  let base: URL;
  try {
    url = new URL(fileUrl);
    base = new URL(supabaseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.host !== base.host) return null;

  const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
  if (!match) return null;

  const bucket = match[1];
  if (!allowedBuckets.includes(bucket)) return null;

  let objectPath: string;
  try {
    objectPath = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (!objectPath || objectPath.includes("..")) return null;

  return { bucket, objectPath };
}

export interface KbExtraction {
  ok: boolean;
  text: string;
  reason: "ok" | "unsupported" | "empty";
}

/**
 * Extrai texto dos bytes de um arquivo cuja extensão é suportada.
 *
 * HTML perde `script`/`style`/marcação (o que interessa ao retrieval é o
 * texto). Espaço em branco puro conta como "nada recuperável" (`empty`).
 */
export function extractKbText(bytes: Uint8Array, ext: string): KbExtraction {
  if (!isKbTextExtractable(ext)) {
    return { ok: false, text: "", reason: "unsupported" };
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return { ok: false, text: "", reason: "unsupported" };
  }

  text = text.replace(/^\uFEFF/, "");
  if (ext === "html" || ext === "htm") {
    text = text
      .replace(/<(script|style).*?<\/\1>/gis, " ")
      .replace(/<[^>]+>/g, " ");
  }
  text = text.replace(/\r\n?/g, "\n").trim();
  if (text.length === 0) {
    return { ok: false, text: "", reason: "empty" };
  }
  if (text.length > KB_MAX_TEXT_CHARS) {
    text = text.slice(0, KB_MAX_TEXT_CHARS);
  }
  return { ok: true, text, reason: "ok" };
}

/**
 * Monta o artigo publicado a partir do arquivo. O título é o nome sem
 * extensão; o conteúdo é o texto extraído (o `search_vector` é gerado pelo
 * banco, então o artigo já nasce recuperável pela busca).
 */
export function buildKbArticle(fileName: string, text: string): { title: string; content: string } {
  const name = typeof fileName === "string" ? fileName.trim() : "";
  const withoutExt = name.replace(/\.[^.]+$/, "").trim();
  const title = (withoutExt || name || "Documento enviado").slice(0, 200);
  return { title, content: text };
}
