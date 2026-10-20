/**
 * MX02 (item 46/P1) — resolucao de conteudo do bloco, COMPARTILHADA entre a
 * previa/validacao/estimativa (`multiplix-dispatch/actions/inspect.ts`) e o motor
 * de envio (`multiplix-send/index.ts`).
 *
 * O defeito: o worker reconstruia a mensagem pelos campos GLOBAIS do disparo
 * (`message_template`, `media_url`, `media_type`) enquanto a previa resolvia por
 * BLOCO e pelo `variables_snapshot` do destinatario. Para o MESMO item os dois
 * lados respondiam coisas diferentes — o operador revisava "BLOCO CORRETO
 * {{empresa}}" e saia "GLOBAL Empresa 1" (probe local da auditoria). Nao ha mais
 * duas resolucoes: o worker envia e a previa mostra pelo MESMO resolvedor daqui.
 *
 * Forma do `content` (F33, migration 20261001241230): so as chaves com valor
 * aparecem — {"text": string, "voice": {"script", "voice_id"},
 * "media": {"url", "caption", "file_name"|"fileName"}, "asset": {"asset_id"}}.
 *
 * O nome do arquivo aparece nas DUAS grafias porque as duas existem no repo: a
 * previa lia `media.file_name` e o worker lia `media.fileName` — a segunda metade
 * do MX02. `mediaFileNameOf` aceita as duas (snake primeiro, que e a forma que a
 * previa publica).
 */

import { personalize } from "./messaging/index.ts";
import { DEFAULT_SCHEDULE_TIMEZONE } from "./talkx-window.ts";

export const BLOCK_TYPES = ["text", "voice_ai", "audio_recorded", "file"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const MEDIA_KINDS = ["image", "document", "audio", "video"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Bucket PRIVADO dos ativos de voz renderizados (F64/F65) — so sai URL assinada. */
export const VOICE_ASSETS_BUCKET = "multiplix-voice";

/** Linha de `multiplix_blocks` (subconjunto que a resolucao le). */
export interface ContentBlockRow {
  id: string;
  block_order?: number | null;
  block_type?: string | null;
  content?: Record<string, unknown> | null;
  personalization_mode?: string | null;
  content_version?: number | null;
  asset_id?: string | null;
}

/** Campos do disparo que a resolucao usa (timezone + fallback legado). */
export interface ContentDispatchRow {
  message_template?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  schedule_timezone?: string | null;
}

/** Insumos por destinatario (nome da empresa e variaveis congeladas no item). */
export interface ContentRecipient {
  company_name_snapshot?: unknown;
  variables_snapshot?: unknown;
}

// ---------------------------------------------------------------------------
// Helpers de forma (jsonb `content`, tipos de bloco)
// ---------------------------------------------------------------------------

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function isBlockType(value: unknown): value is BlockType {
  return typeof value === "string" && (BLOCK_TYPES as readonly string[]).includes(value);
}

/** Tipo do bloco, com o default honesto `text` quando a coluna vem ausente. */
export function blockTypeOf(block: ContentBlockRow): BlockType {
  return isBlockType(block.block_type) ? block.block_type : "text";
}

export function contentOf(block: ContentBlockRow): Record<string, unknown> {
  return asRecord(block.content);
}

/** Roteiro de um bloco de voz (`content.voice.script`). */
export function voiceScriptOf(block: ContentBlockRow): string | null {
  const voice = asRecord(contentOf(block).voice);
  return asString(voice.script);
}

export function voiceIdOf(block: ContentBlockRow): string | null {
  const voice = asRecord(contentOf(block).voice);
  return asString(voice.voice_id);
}

/** URL do ativo de midia (`content.media.url`). */
export function mediaUrlOf(block: ContentBlockRow): string | null {
  const media = asRecord(contentOf(block).media);
  return asString(media.url);
}

export function mediaCaptionOf(block: ContentBlockRow): string | null {
  const media = asRecord(contentOf(block).media);
  return asString(media.caption);
}

/**
 * Nome do arquivo do documento. Aceita as DUAS grafias gravadas no repo
 * (`file_name`, que a previa publica, e `fileName`, que o worker exigia) — a
 * divergencia de grafia era parte do MX02.
 */
export function mediaFileNameOf(block: ContentBlockRow): string | null {
  const media = asRecord(contentOf(block).media);
  return asString(media.file_name) ?? asString(media.fileName);
}

/** Texto do bloco (`content.text`), quando houver. */
export function blockTextOf(block: ContentBlockRow): string | null {
  return asString(contentOf(block).text);
}

export function isVoiceBlock(block: ContentBlockRow): boolean {
  return block.block_type === "voice_ai" || block.block_type === "audio_recorded";
}

/**
 * Bloco `same_audio`: UM audio para todos os destinatarios. Nao pode carregar
 * placeholder nenhum — o audio e renderizado uma vez e o mesmo arquivo serve
 * para o disparo inteiro (F33/f32a `personalization_mode`).
 */
export function isSharedAudio(block: ContentBlockRow): boolean {
  const mode = asString(block.personalization_mode);
  if (mode === "same_audio") return true;
  if (mode === "personalized") return false;
  // Sem modo explicito: bloco de voz com `asset_id` congelado e um ativo
  // compartilhado; qualquer outro caso e personalizado.
  return isVoiceBlock(block) && asString(block.asset_id) !== null;
}

/** Tipo real do ativo a partir da URL (sem rede: so a extensao). */
export function mediaKindFromUrl(url: string | null): MediaKind {
  if (!url) return "document";
  const path = url.split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp|heic|avif)$/.test(path)) return "image";
  if (/\.(mp3|ogg|wav|flac|aac|m4a)$/.test(path)) return "audio";
  if (/\.(mp4|webm|mov|avi)$/.test(path)) return "video";
  return "document";
}

/** `variables_snapshot` do destinatario, quando for um mapa de strings. */
export function variablesOf(recipient: ContentRecipient | null | undefined): Record<string, string> {
  const raw = asRecord(recipient?.variables_snapshot);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export function timezoneOf(dispatch: ContentDispatchRow): string {
  return asString(dispatch.schedule_timezone) ?? DEFAULT_SCHEDULE_TIMEZONE;
}

/**
 * Blocos que participam da revisao. Sem blocos persistidos, cai no
 * `message_template` do disparo — o insumo do caminho LEGADO. O worker nunca
 * cai aqui: todo item da fila referencia um bloco (`multiplix_delivery_items`
 * = destinatario x bloco), entao no envio o bloco sempre existe.
 */
export function blocksForReview(blocks: ContentBlockRow[], dispatch: ContentDispatchRow): ContentBlockRow[] {
  if (blocks.length > 0) return blocks;
  const template = asString(dispatch.message_template);
  if (!template) return [];
  const mediaUrl = asString(dispatch.media_url);
  const content: Record<string, unknown> = { text: template };
  if (mediaUrl) content.media = { url: mediaUrl, caption: template };
  return [{
    id: "dispatch-template",
    block_order: 0,
    block_type: mediaUrl ? "file" : "text",
    content,
    personalization_mode: "personalized",
    content_version: 1,
    asset_id: null,
  }];
}

// ---------------------------------------------------------------------------
// F48 — personalizacao: a MESMA chamada do worker
// ---------------------------------------------------------------------------

/**
 * Renderiza um texto para um destinatario com a MESMA funcao e a MESMA ordem de
 * argumentos que o worker usa (`personalize(template, { company }, custom,
 * timezone)`). O nome da empresa entra por `contact.company` — o campo consumido
 * por `{{empresa}}`.
 */
export function renderForRecipient(
  template: string,
  companyName: unknown,
  variables: Record<string, string>,
  timezone: string,
): string {
  return personalize(template, { company: asString(companyName) }, variables, timezone).text;
}

/** Ativo exato do bloco (o que o worker enviaria). */
export interface BlockAsset {
  kind: "voice" | MediaKind;
  url: string | null;
  caption: string | null;
  file_name: string | null;
  voice_id: string | null;
  script: string | null;
  asset_id: string | null;
  /** `same_audio`: o MESMO arquivo serve para todos os destinatarios. */
  shared: boolean;
  /** `asset_id` presente: o ativo esta congelado (F45 invalida ao mudar roteiro). */
  frozen: boolean;
}

export function buildAsset(
  block: ContentBlockRow,
  renderedCaption: string | null,
  script: string | null,
): BlockAsset | null {
  const assetId = asString(block.asset_id);
  const shared = isSharedAudio(block);

  if (block.block_type === "voice_ai") {
    return {
      kind: "voice",
      url: null,
      caption: null,
      file_name: null,
      voice_id: voiceIdOf(block),
      script,
      asset_id: assetId,
      shared,
      frozen: assetId !== null,
    };
  }
  if (block.block_type === "audio_recorded") {
    const url = mediaUrlOf(block);
    return {
      kind: "audio",
      url,
      caption: null,
      file_name: mediaFileNameOf(block),
      voice_id: null,
      script: null,
      asset_id: assetId,
      shared,
      frozen: assetId !== null,
    };
  }
  if (block.block_type === "file") {
    const url = mediaUrlOf(block);
    if (!url) return null;
    return {
      kind: mediaKindFromUrl(url),
      url,
      caption: renderedCaption,
      file_name: mediaFileNameOf(block),
      voice_id: null,
      script: null,
      asset_id: assetId,
      shared,
      frozen: assetId !== null,
    };
  }
  return null;
}

/** Um bloco resolvido: texto final + ativo exato. */
export interface ResolvedBlock {
  block_id: string;
  block_order: number | null;
  block_type: BlockType;
  personalization_mode: string | null;
  content_version: number | null;
  /** Texto final do bloco (ou o roteiro final, em bloco de voz). */
  text: string;
  asset: BlockAsset | null;
}

/**
 * O relatorio completo da resolucao: o bloco resolvido MAIS o veredito do kernel
 * sobre os placeholders (`missing`/`unknown` de `personalize`, unidos entre o
 * texto e a legenda, ordenados). O WORKER consome esta forma — o MX06 exige o
 * relatorio para pular o item em vez de mandar lacuna; a previa segue recebendo
 * so `ResolvedBlock` (o payload publico nao muda).
 */
export interface BlockResolution {
  block: ResolvedBlock;
  /** Chaves conhecidas sem valor e sem padrao (exclusao do validate). */
  missing: string[];
  /** Placeholders fora do conjunto que o kernel resolve. */
  unknown: string[];
}

/**
 * Resolve UM bloco para UM destinatario e devolve o relatorio completo. E a
 * definicao unica do contrato "previa === payload do worker": mesma funcao de
 * personalizacao, mesmos insumos (nome da empresa e `variables_snapshot`),
 * mesma regra de `same_audio` — e agora tambem o MESMO relatorio de
 * missing/unknown que o validate usa para excluir campo ausente.
 */
export function resolveBlockResolution(
  block: ContentBlockRow,
  recipient: ContentRecipient | null | undefined,
  timezone: string,
): BlockResolution {
  const type = blockTypeOf(block);
  const shared = isSharedAudio(block);
  // Ativo compartilhado (same_audio) nao personaliza: renderiza uma vez, sem
  // contato — o mesmo audio vale para o disparo inteiro.
  const company = shared ? null : recipient?.company_name_snapshot;
  const variables = shared ? {} : variablesOf(recipient);
  const companyName = asString(company);

  const template = type === "voice_ai" || type === "audio_recorded"
    ? (type === "voice_ai" ? voiceScriptOf(block) : null)
    : (blockTextOf(block) ?? mediaCaptionOf(block) ?? "");

  const textResult = template === null
    ? null
    : personalize(template, { company: companyName }, variables, timezone);
  const text = textResult?.text ?? "";

  const captionTemplate = mediaCaptionOf(block);
  const captionResult = captionTemplate === null
    ? null
    : personalize(captionTemplate, { company: companyName }, variables, timezone);
  const caption = captionResult?.text ?? null;

  const missing = [...new Set([...(textResult?.missing ?? []), ...(captionResult?.missing ?? [])])].sort();
  const unknown = [...new Set([...(textResult?.unknown ?? []), ...(captionResult?.unknown ?? [])])].sort();

  return {
    block: {
      block_id: block.id,
      block_order: typeof block.block_order === "number" ? block.block_order : null,
      block_type: type,
      personalization_mode: asString(block.personalization_mode),
      content_version: typeof block.content_version === "number" ? block.content_version : null,
      text,
      asset: buildAsset(block, caption, type === "voice_ai" ? text : null),
    },
    missing,
    unknown,
  };
}

export function resolveBlockContent(
  block: ContentBlockRow,
  recipient: ContentRecipient | null | undefined,
  timezone: string,
): ResolvedBlock {
  return resolveBlockResolution(block, recipient, timezone).block;
}

/** Todos os blocos resolvidos para um destinatario (a previa do F48). */
export function buildPreviewBlocks(
  blocks: ContentBlockRow[],
  recipient: ContentRecipient | null | undefined,
  timezone: string,
): ResolvedBlock[] {
  return blocks.map((block) => resolveBlockContent(block, recipient, timezone));
}
