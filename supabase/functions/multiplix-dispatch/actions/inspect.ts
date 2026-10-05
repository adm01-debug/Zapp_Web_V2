/**
 * F48/F49/F50 (Bloco E) — acoes de REVISAO da API de dominio do Multiplix.
 *
 * Este modulo responde as tres perguntas que o operador faz ANTES de confirmar
 * um disparo, e responde com DADO REAL — nunca com estimativa inventada:
 *
 *   F48 `preview`  — o texto final e o ativo exato de CADA bloco para UM
 *                    destinatario. O texto sai da MESMA funcao que o worker usa
 *                    (`personalize` do kernel `_shared/messaging`), com os
 *                    MESMOS insumos por destinatario (nome da empresa e
 *                    `variables_snapshot`) — e por isso `preview === payload do
 *                    worker`, nao "parece certo".
 *   F48 `validate` — placeholder desconhecido, variavel em bloco `same_audio` e
 *                    campo ausente. Cada placeholder vira `substituicao_aprovada`
 *                    (com o dado REAL da fonte) ou `exclusao` (com `raw_value:
 *                    null`) — NUNCA um valor inventado. Erros nomeados.
 *   F49 `summary`  — `{total, eligible, no_destination, suppressed,
 *                    out_of_scope, company_without_person}` + frase legivel da
 *                    consulta + `inclusion_reason` por linha. Os cinco baldes
 *                    SOMAM `count(*)`: toda linha cai em exatamente um balde
 *                    (`bucketForRecipient`), inclusive as classes transitorias
 *                    do enum (`media_pending`, `connection_unavailable`,
 *                    `requires_template`), que sao destinatarios aptos barrados
 *                    por uma condicao operacional que se resolve sozinha — por
 *                    isso contam como `eligible` e aparecem no detalhe
 *                    `transient`.
 *   F50 `estimate` — TRES numeros de dado real: mensagens (aptos x blocos),
 *                    versoes de roteiro (DISTINCT dos roteiros FINAIS, ja
 *                    renderizados) e consumo de voz (caracteres a sintetizar e
 *                    quantas renderizacoes o TTS vai precisar).
 *
 * Por que `personalize` (kernel) e nao `personalizeMultiplix`: o worker
 * (`multiplix-send/index.ts`) chama `personalize(template, { company }, ...)` e
 * o dialeto do Multiplix (`{{saudacao}}`/`{{empresa}}`) e um SUBCONJUNTO dos
 * built-ins que ele resolve. Aplicar a MESMA funcao e o que garante a paridade
 * que o F48 exige.
 *
 * Escopo: quem escreve aqui NAO escreve no roteador — o lider liga as acoes em
 * `index.ts`. O unico import de `../index.ts` e o tipo `ActionContext` e a
 * classe `DispatchError` (usada so dentro das funcoes, nunca na avaliacao do
 * modulo), para o `instanceof` do roteador continuar valendo.
 */

import { z } from 'https://esm.sh/zod@3.23.8';
import { errorResponse, jsonResponse } from '../../_shared/validation.ts';
import { DispatchError, type ActionContext } from '../index.ts';
import { DEFAULT_SCHEDULE_TIMEZONE } from '../../_shared/talkx-window.ts';
import { MULTIPLIX_ELIGIBILITY_VALUES, type MultiplixEligibility } from '../../_shared/multiplix-eligibility.ts';
import { eligibility, getGreeting, personalize } from '../../_shared/messaging/index.ts';

// ---------------------------------------------------------------------------
// Contratos de entrada
// ---------------------------------------------------------------------------

const UuidSchema = z.string().uuid();

const PreviewSchema = z.object({
  dispatch_id: UuidSchema,
  recipient_id: UuidSchema,
});

const ValidateSchema = z.object({
  dispatch_id: UuidSchema,
  /** Destinatario de amostra; sem ele, o primeiro do disparo. */
  recipient_id: UuidSchema.optional(),
});

/** Filtros da consulta de audiencia — apenas para a FRASE legivel do F49. */
const AudienceSchema = z.object({
  roles: z.array(z.enum(['cliente', 'fornecedor', 'transportadora'])).max(3).optional(),
  uf: z.string().length(2).optional(),
  ramo: z.string().max(200).optional(),
  search: z.string().max(200).optional(),
  /** Nome da lista de exclusao (a "lista X" que a frase cita). */
  exclude_list: z.string().max(200).optional(),
}).optional();

const SummarySchema = z.object({
  dispatch_id: UuidSchema,
  audience: AudienceSchema,
});

const EstimateSchema = z.object({
  dispatch_id: UuidSchema,
  audience: AudienceSchema,
});

export type AudienceFilters = z.infer<typeof AudienceSchema>;

// ---------------------------------------------------------------------------
// Linhas do banco (subconjunto que estas acoes leem)
// ---------------------------------------------------------------------------

export interface DispatchRow {
  id: string;
  created_by?: string | null;
  schedule_timezone?: string | null;
  message_template?: string | null;
  media_url?: string | null;
  media_type?: string | null;
}

export interface BlockRow {
  id: string;
  block_order?: number | null;
  block_type?: string | null;
  content?: Record<string, unknown> | null;
  personalization_mode?: string | null;
  content_version?: number | null;
  asset_id?: string | null;
}

export interface RecipientRow {
  id: string;
  dispatch_id?: unknown;
  company_id?: unknown;
  company_name_snapshot?: unknown;
  destino_e164?: unknown;
  singu_contact_id?: unknown;
  eligibility?: unknown;
  eligibility_reason?: unknown;
  inclusion_reason?: unknown;
  status?: unknown;
  variables_snapshot?: unknown;
}

const BLOCK_TYPES = ['text', 'voice_ai', 'audio_recorded', 'file'] as const;
type BlockType = (typeof BLOCK_TYPES)[number];

const MEDIA_KINDS = ['image', 'document', 'audio', 'video'] as const;
type MediaKind = (typeof MEDIA_KINDS)[number];

// ---------------------------------------------------------------------------
// Leitura do banco + escopo (dono do disparo)
// ---------------------------------------------------------------------------

type Result<T> = { data: T; error: { message?: string } | null };

/**
 * Resolve o `profiles.id` do usuario autenticado.
 *
 * `multiplix_dispatches.created_by` guarda o `profiles.id` (F31), e o RLS do
 * modulo compara com o profile do JWT — comparar com o `auth.uid()` direto
 * daria 404 para o proprio dono. Mesma resolucao que `multiplix-send` faz em
 * `authProfile()`.
 */
async function resolveProfileId(ctx: ActionContext): Promise<string | null> {
  const { data, error } = await ctx.supabase
    .from('profiles')
    .select('id')
    .eq('user_id', ctx.userId)
    .maybeSingle() as Result<{ id?: string } | null>;
  if (error) throw new DispatchError('MULTIPLIX_PROFILE_LOOKUP', error.message ?? 'profile lookup failed', 502);
  return typeof data?.id === 'string' ? data.id : null;
}

/** Carrega o disparo SO se for do dono; qualquer outro caso e 404 (nao vaza existencia). */
async function loadOwnedDispatch(ctx: ActionContext, dispatchId: string): Promise<DispatchRow> {
  const profileId = await resolveProfileId(ctx);
  if (!profileId) return notFoundDispatch();

  const { data, error } = await ctx.supabase
    .from('multiplix_dispatches')
    .select('id, created_by, schedule_timezone, message_template, media_url, media_type')
    .eq('id', dispatchId)
    .maybeSingle() as Result<DispatchRow | null>;
  if (error) throw new DispatchError('MULTIPLIX_DISPATCH_LOOKUP', error.message ?? 'dispatch lookup failed', 502);
  if (!data || data.created_by !== profileId) return notFoundDispatch();
  return data;
}

export function notFoundDispatch(): never {
  throw new DispatchError('multiplix_dispatch_not_found', 'Disparo nao encontrado', 404);
}

async function loadBlocks(ctx: ActionContext, dispatchId: string): Promise<BlockRow[]> {
  const { data, error } = await ctx.supabase
    .from('multiplix_blocks')
    .select('id, block_order, block_type, content, personalization_mode, content_version, asset_id')
    .eq('dispatch_id', dispatchId)
    .order('block_order') as Result<BlockRow[] | null>;
  if (error) throw new DispatchError('MULTIPLIX_BLOCKS_LOOKUP', error.message ?? 'blocks lookup failed', 502);
  return Array.isArray(data) ? data : [];
}

async function loadRecipients(ctx: ActionContext, dispatchId: string): Promise<RecipientRow[]> {
  const { data, error } = await ctx.supabase
    .from('multiplix_recipients')
    .select('id, company_id, company_name_snapshot, destino_e164, singu_contact_id, eligibility, eligibility_reason, inclusion_reason, status, variables_snapshot')
    .eq('dispatch_id', dispatchId) as Result<RecipientRow[] | null>;
  if (error) throw new DispatchError('MULTIPLIX_RECIPIENTS_LOOKUP', error.message ?? 'recipients lookup failed', 502);
  return Array.isArray(data) ? data : [];
}

/**
 * Carrega UM destinatario SO se pertencer ao disparo informado (R2-API-029):
 * o filtro por `dispatch_id` faz destinatario de outro disparo cair no mesmo
 * 404 de inexistente — nao vaza existencia. `dispatch_id` vai no select para a
 * guarda de `handlePreview` continuar valendo como defesa em profundidade.
 */
async function loadRecipientForDispatch(
  ctx: ActionContext,
  dispatchId: string,
  recipientId: string,
): Promise<RecipientRow> {
  const { data, error } = await ctx.supabase
    .from('multiplix_recipients')
    .select('id, dispatch_id, company_id, company_name_snapshot, destino_e164, singu_contact_id, eligibility, eligibility_reason, inclusion_reason, status, variables_snapshot')
    .eq('id', recipientId)
    .eq('dispatch_id', dispatchId)
    .maybeSingle() as Result<RecipientRow | null>;
  if (error) throw new DispatchError('MULTIPLIX_RECIPIENT_LOOKUP', error.message ?? 'recipient lookup failed', 502);
  if (!data) throw new DispatchError('multiplix_recipient_not_found', 'Destinatario nao encontrado', 404);
  return data;
}

// ---------------------------------------------------------------------------
// Helpers de forma (jsonb `content`, tipos de bloco)
// ---------------------------------------------------------------------------

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isBlockType(value: unknown): value is BlockType {
  return typeof value === 'string' && (BLOCK_TYPES as readonly string[]).includes(value);
}

function contentOf(block: BlockRow): Record<string, unknown> {
  return asRecord(block.content);
}

/** Roteiro de um bloco de voz (`content.voice.script`). */
function voiceScriptOf(block: BlockRow): string | null {
  const voice = asRecord(contentOf(block).voice);
  return asString(voice.script);
}

function voiceIdOf(block: BlockRow): string | null {
  const voice = asRecord(contentOf(block).voice);
  return asString(voice.voice_id);
}

/** URL do ativo de midia (`content.media.url`). */
function mediaUrlOf(block: BlockRow): string | null {
  const media = asRecord(contentOf(block).media);
  return asString(media.url);
}

function mediaCaptionOf(block: BlockRow): string | null {
  const media = asRecord(contentOf(block).media);
  return asString(media.caption);
}

/** Texto do bloco (`content.text`), quando houver. */
function blockTextOf(block: BlockRow): string | null {
  return asString(contentOf(block).text);
}

/**
 * Bloco `same_audio`: UM audio para todos os destinatarios. Nao pode carregar
 * placeholder nenhum — o audio e renderizado uma vez e o mesmo arquivo serve
 * para o disparo inteiro (F33/f32a `personalization_mode`).
 */
function isSharedAudio(block: BlockRow): boolean {
  const mode = asString(block.personalization_mode);
  if (mode === 'same_audio') return true;
  if (mode === 'personalized') return false;
  // Sem modo explicito: bloco de voz com `asset_id` congelado e um ativo
  // compartilhado; qualquer outro caso e personalizado.
  return isVoiceBlock(block) && asString(block.asset_id) !== null;
}

function isVoiceBlock(block: BlockRow): boolean {
  return block.block_type === 'voice_ai' || block.block_type === 'audio_recorded';
}

/** Tipo real do ativo a partir da URL (sem rede: so a extensao). */
function mediaKindFromUrl(url: string | null): MediaKind {
  if (!url) return 'document';
  const path = url.split('?')[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp|heic|avif)$/.test(path)) return 'image';
  if (/\.(mp3|ogg|wav|flac|aac|m4a)$/.test(path)) return 'audio';
  if (/\.(mp4|webm|mov|avi)$/.test(path)) return 'video';
  return 'document';
}

/** `variables_snapshot` do destinatario, quando for um mapa de strings. */
function variablesOf(recipient: RecipientRow | null | undefined): Record<string, string> {
  const raw = asRecord(recipient?.variables_snapshot);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

function timezoneOf(dispatch: DispatchRow): string {
  return asString(dispatch.schedule_timezone) ?? DEFAULT_SCHEDULE_TIMEZONE;
}

/**
 * Blocos que participam da revisao. Sem blocos persistidos, cai no
 * `message_template` do disparo — o MESMO insumo que o worker atual
 * (`multiplix-send/index.ts`) usa, para o preview continuar fiel durante a
 * migracao para o modelo de blocos.
 */
export function blocksForReview(blocks: BlockRow[], dispatch: DispatchRow): BlockRow[] {
  if (blocks.length > 0) return blocks;
  const template = asString(dispatch.message_template);
  if (!template) return [];
  const mediaUrl = asString(dispatch.media_url);
  const mediaType = asString(dispatch.media_type);
  const content: Record<string, unknown> = { text: template };
  if (mediaUrl) content.media = { url: mediaUrl, caption: template };
  return [{
    id: 'dispatch-template',
    block_order: 0,
    block_type: mediaUrl ? 'file' : 'text',
    content,
    personalization_mode: 'personalized',
    content_version: 1,
    asset_id: null,
  }];
}

// ---------------------------------------------------------------------------
// F48 — personalizacao: a MESMA chamada do worker
// ---------------------------------------------------------------------------

/**
 * Renderiza um texto para um destinatario com a MESMA funcao e a MESMA ordem de
 * argumentos que o worker usa (`multiplix-send/index.ts`: `personalize(template,
 * { company }, customValues, timezone)`). O nome da empresa entra por
 * `contact.company` — o campo consumido por `{{empresa}}`.
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
  kind: 'voice' | 'audio' | MediaKind;
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

function buildAsset(block: BlockRow, renderedCaption: string | null, script: string | null): BlockAsset | null {
  const assetId = asString(block.asset_id);
  const shared = isSharedAudio(block);

  if (block.block_type === 'voice_ai') {
    return {
      kind: 'voice',
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
  if (block.block_type === 'audio_recorded') {
    const url = mediaUrlOf(block);
    return {
      kind: 'audio',
      url,
      caption: null,
      file_name: asString(asRecord(contentOf(block).media).file_name),
      voice_id: null,
      script: null,
      asset_id: assetId,
      shared,
      frozen: assetId !== null,
    };
  }
  if (block.block_type === 'file') {
    const url = mediaUrlOf(block);
    if (!url) return null;
    return {
      kind: mediaKindFromUrl(url),
      url,
      caption: renderedCaption,
      file_name: asString(asRecord(contentOf(block).media).file_name),
      voice_id: null,
      script: null,
      asset_id: assetId,
      shared,
      frozen: assetId !== null,
    };
  }
  return null;
}

/** Bloco de preview: texto final + ativo exato. */
export interface PreviewBlock {
  block_id: string;
  block_order: number | null;
  block_type: BlockType;
  personalization_mode: string | null;
  content_version: number | null;
  /** Texto final do bloco (ou o roteiro final, em bloco de voz). */
  text: string;
  asset: BlockAsset | null;
}

export function buildPreviewBlocks(
  blocks: BlockRow[],
  recipient: RecipientRow,
  timezone: string,
): PreviewBlock[] {
  const company = recipient.company_name_snapshot;
  const variables = variablesOf(recipient);

  return blocks.map((block) => {
    const type: BlockType = isBlockType(block.block_type) ? block.block_type : 'text';
    const shared = isSharedAudio(block);
    // Ativo compartilhado (same_audio) nao personaliza: renderiza uma vez, sem
    // contato — o mesmo audio vale para o disparo inteiro.
    const companyForBlock = shared ? null : company;
    const variablesForBlock = shared ? {} : variables;

    const template = type === 'voice_ai' || type === 'audio_recorded'
      ? (type === 'voice_ai' ? voiceScriptOf(block) : null)
      : (blockTextOf(block) ?? mediaCaptionOf(block) ?? '');

    const text = template === null
      ? ''
      : renderForRecipient(template, companyForBlock, variablesForBlock, timezone);

    const captionTemplate = mediaCaptionOf(block);
    const caption = captionTemplate === null
      ? null
      : renderForRecipient(captionTemplate, companyForBlock, variablesForBlock, timezone);

    return {
      block_id: block.id,
      block_order: typeof block.block_order === 'number' ? block.block_order : null,
      block_type: type,
      personalization_mode: asString(block.personalization_mode),
      content_version: typeof block.content_version === 'number' ? block.content_version : null,
      text,
      asset: buildAsset(block, caption, type === 'voice_ai' ? text : null),
    };
  });
}

/**
 * F48 `preview(recipient_id)`: texto final e ativo exato por bloco.
 *
 * `text` no topo e o texto do disparo inteiro (blocos de texto concatenados),
 * para o painel de bolhas (F79) poder mostrar "o que sai" sem remontar nada.
 */
export async function handlePreview(ctx: ActionContext): Promise<Response> {
  const parsed = PreviewSchema.safeParse(ctx.payload);
  if (!parsed.success) {
    return errorResponse('preview: dispatch_id e recipient_id obrigatorios (uuid)', 400, ctx.req);
  }
  const { dispatch_id, recipient_id } = parsed.data;

  const dispatch = await loadOwnedDispatch(ctx, dispatch_id);
  const recipient = await loadRecipientForDispatch(ctx, dispatch_id, recipient_id);
  const recipientDispatch = asString(recipient.dispatch_id);
  if (recipientDispatch !== null && recipientDispatch !== dispatch_id) {
    throw new DispatchError('multiplix_recipient_not_found', 'Destinatario nao pertence ao disparo', 404);
  }

  const blocks = blocksForReview(await loadBlocks(ctx, dispatch_id), dispatch);
  const timezone = timezoneOf(dispatch);
  const previewBlocks = buildPreviewBlocks(blocks, recipient, timezone);

  return jsonResponse({
    data: {
      dispatch_id,
      recipient_id,
      recipient: {
        id: recipient.id,
        company_name: asString(recipient.company_name_snapshot),
        destino_e164: asString(recipient.destino_e164),
      },
      timezone,
      blocks: previewBlocks,
      text: previewBlocks
        .filter((block) => block.block_type === 'text')
        .map((block) => block.text)
        .join('\n\n'),
    },
  }, 200, ctx.req);
}

// ---------------------------------------------------------------------------
// F48 — validate: nunca inventa valor
// ---------------------------------------------------------------------------

export type PlaceholderSource = 'builtin' | 'variable' | 'unknown';
export type PlaceholderDisposition = 'substituicao_aprovada' | 'exclusao';

export interface PlaceholderReport {
  key: string;
  normalized: string;
  source: PlaceholderSource;
  /** Valor REAL da fonte; `null` = a fonte nao tem o dado. Nunca inventado. */
  raw_value: string | null;
  /** O que o kernel produz para esta chave (a verdade do worker). */
  renders_to: string;
  disposition: PlaceholderDisposition;
  /** Codigo nomeado quando ha problema; `null` quando esta tudo certo. */
  code: string | null;
}

export interface ValidateIssue {
  code: string;
  block_id: string;
  placeholder?: string;
  message: string;
}

/** Codigos nomeados do validate. */
export const VALIDATE_CODES = {
  unknownPlaceholder: 'multiplix_unknown_placeholder',
  sameAudioPlaceholder: 'multiplix_same_audio_placeholder',
  missingField: 'multiplix_missing_field',
} as const;

/** Built-ins que `personalize` resolve (o conjunto que o worker enxerga). */
const BUILTIN_KEYS = new Set(['saudacao', 'nome', 'nome_completo', 'apelido', 'empresa', 'link']);

const PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g;

/** Chaves distintas de um texto, preservando a ordem de aparicao. */
function placeholderKeys(text: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER_RE)) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Avalia UM placeholder contra as fontes reais.
 *
 * Regra dura: `raw_value` e o dado da fonte ou `null`. Quando nao ha dado, a
 * disposicao e `exclusao` — a saida do kernel para essa chave (o fallback
 * `[variavel]` ou vazio) e registrada em `renders_to`, mas NUNCA vira
 * `raw_value`: inventar um valor aqui seria mandar dado falso ao cliente.
 */
function evaluatePlaceholder(
  rawKey: string,
  companyName: string | null,
  variables: Record<string, string>,
  timezone: string,
  sharedAudio: boolean,
): PlaceholderReport {
  const key = rawKey.toLowerCase();
  // O que o kernel realmente produz para esta chave — a fonte da verdade.
  const rendersTo = personalize(`{{${rawKey}}}`, { company: companyName }, variables, timezone).text;

  if (sharedAudio) {
    return {
      key: rawKey,
      normalized: key,
      source: BUILTIN_KEYS.has(key) ? 'builtin' : (Object.prototype.hasOwnProperty.call(variables, key) ? 'variable' : 'unknown'),
      raw_value: null,
      renders_to: rendersTo,
      disposition: 'exclusao',
      code: VALIDATE_CODES.sameAudioPlaceholder,
    };
  }

  if (key === 'saudacao') {
    return {
      key: rawKey,
      normalized: key,
      source: 'builtin',
      raw_value: getGreeting(timezone),
      renders_to: rendersTo,
      disposition: 'substituicao_aprovada',
      code: null,
    };
  }

  if (key === 'empresa') {
    const value = companyName ?? null;
    return {
      key: rawKey,
      normalized: key,
      source: 'builtin',
      raw_value: value,
      renders_to: rendersTo,
      disposition: value === null ? 'exclusao' : 'substituicao_aprovada',
      code: value === null ? VALIDATE_CODES.missingField : null,
    };
  }

  if (key === 'nome' || key === 'nome_completo' || key === 'apelido' || key === 'link') {
    // Built-ins do dialeto TalkX que o Multiplix nao alimenta (nao ha pessoa, nem
    // link de rastreamento): a fonte nao tem o dado -> exclusao, nunca invencao.
    return {
      key: rawKey,
      normalized: key,
      source: 'builtin',
      raw_value: null,
      renders_to: rendersTo,
      disposition: 'exclusao',
      code: VALIDATE_CODES.missingField,
    };
  }

  if (Object.prototype.hasOwnProperty.call(variables, key)) {
    const value = variables[key];
    const temValor = typeof value === 'string' && value.length > 0;
    return {
      key: rawKey,
      normalized: key,
      source: 'variable',
      raw_value: temValor ? value : null,
      renders_to: rendersTo,
      disposition: temValor ? 'substituicao_aprovada' : 'exclusao',
      code: temValor ? null : VALIDATE_CODES.missingField,
    };
  }

  return {
    key: rawKey,
    normalized: key,
    source: 'unknown',
    raw_value: null,
    renders_to: rendersTo,
    disposition: 'exclusao',
    code: VALIDATE_CODES.unknownPlaceholder,
  };
}

export interface ValidatedBlock {
  block_id: string;
  block_type: BlockType;
  personalization_mode: string | null;
  shared_audio: boolean;
  /** Texto que o kernel produz para o destinatario de amostra. */
  rendered_text: string;
  placeholders: PlaceholderReport[];
}

export interface ValidateResult {
  ok: boolean;
  dispatch_id: string;
  sample_recipient_id: string | null;
  placeholders: PlaceholderReport[];
  blocks: ValidatedBlock[];
  errors: ValidateIssue[];
  warnings: ValidateIssue[];
  summary: {
    substituicao_aprovada: number;
    exclusao: number;
    unknown_placeholder: number;
    same_audio_placeholder: number;
    missing_field: number;
  };
}

/** Avalia um bloco inteiro: placeholders + texto renderizado pelo kernel. */
export function validateBlock(
  block: BlockRow,
  recipient: RecipientRow | null,
  timezone: string,
): ValidatedBlock {
  const type: BlockType = isBlockType(block.block_type) ? block.block_type : 'text';
  const sharedAudio = isSharedAudio(block);
  const company = sharedAudio ? null : (asString(recipient?.company_name_snapshot) ?? null);
  const variables = sharedAudio ? {} : variablesOf(recipient);

  const isVoice = type === 'voice_ai' || type === 'audio_recorded';
  const templates: string[] = [];
  if (isVoice) {
    const script = type === 'voice_ai' ? voiceScriptOf(block) : null;
    if (script) templates.push(script);
  } else {
    const text = blockTextOf(block) ?? mediaCaptionOf(block) ?? '';
    if (text) templates.push(text);
  }
  const caption = mediaCaptionOf(block);
  if (!isVoice && caption && (blockTextOf(block) ?? '') !== caption) templates.push(caption);

  const source = templates.join('\n');
  const placeholders: PlaceholderReport[] = [];
  for (const key of placeholderKeys(source)) {
    placeholders.push(evaluatePlaceholder(key, company, variables, timezone, sharedAudio));
  }

  return {
    block_id: block.id,
    block_type: type,
    personalization_mode: asString(block.personalization_mode),
    shared_audio: sharedAudio,
    rendered_text: source === '' ? '' : renderForRecipient(source, company, variables, timezone),
    placeholders,
  };
}

/**
 * F48 `validate`: placeholder desconhecido, variavel em bloco `same_audio` e
 * campo ausente. Responde 200 com o resultado ESTRUTURADO (o cliente precisa do
 * detalhe por placeholder para o modal "quem entra"); so payload invalido vira
 * 400, e falha de banco vira 502 nomeado.
 */
export async function handleValidate(ctx: ActionContext): Promise<Response> {
  const parsed = ValidateSchema.safeParse(ctx.payload);
  if (!parsed.success) {
    return errorResponse('validate: dispatch_id obrigatorio (uuid)', 400, ctx.req);
  }
  const { dispatch_id, recipient_id } = parsed.data;

  const dispatch = await loadOwnedDispatch(ctx, dispatch_id);
  const recipients = await loadRecipients(ctx, dispatch_id);
  const sample = recipient_id
    ? await loadRecipientForDispatch(ctx, dispatch_id, recipient_id)
    : (recipients[0] ?? null);

  const blocks = blocksForReview(await loadBlocks(ctx, dispatch_id), dispatch);
  const timezone = timezoneOf(dispatch);

  const validated = blocks.map((block) => validateBlock(block, sample, timezone));

  const errors: ValidateIssue[] = [];
  const warnings: ValidateIssue[] = [];
  for (const block of validated) {
    for (const ph of block.placeholders) {
      if (ph.code === VALIDATE_CODES.unknownPlaceholder) {
        errors.push({
          code: VALIDATE_CODES.unknownPlaceholder,
          block_id: block.block_id,
          placeholder: ph.key,
          message: `Placeholder desconhecido {{${ph.key}}}: o kernel nao resolve e ele nao vira valor nenhum`,
        });
      } else if (ph.code === VALIDATE_CODES.sameAudioPlaceholder) {
        errors.push({
          code: VALIDATE_CODES.sameAudioPlaceholder,
          block_id: block.block_id,
          placeholder: ph.key,
          message: `Bloco same_audio com variavel {{${ph.key}}}: o audio e um so para todos e nao pode variar por destinatario`,
        });
      } else if (ph.code === VALIDATE_CODES.missingField) {
        warnings.push({
          code: VALIDATE_CODES.missingField,
          block_id: block.block_id,
          placeholder: ph.key,
          message: `Campo ausente para {{${ph.key}}}: variavel excluida (nenhum valor foi inventado)`,
        });
      }
    }
  }

  const allPlaceholders = validated.flatMap((block) => block.placeholders);
  const count = (predicate: (ph: PlaceholderReport) => boolean) => allPlaceholders.filter(predicate).length;

  const result: ValidateResult = {
    ok: errors.length === 0,
    dispatch_id,
    sample_recipient_id: sample?.id ?? null,
    placeholders: allPlaceholders,
    blocks: validated,
    errors,
    warnings,
    summary: {
      substituicao_aprovada: count((ph) => ph.disposition === 'substituicao_aprovada'),
      exclusao: count((ph) => ph.disposition === 'exclusao'),
      unknown_placeholder: count((ph) => ph.code === VALIDATE_CODES.unknownPlaceholder),
      same_audio_placeholder: count((ph) => ph.code === VALIDATE_CODES.sameAudioPlaceholder),
      missing_field: count((ph) => ph.code === VALIDATE_CODES.missingField),
    },
  };

  return jsonResponse({ data: result }, 200, ctx.req);
}

// ---------------------------------------------------------------------------
// F49 — eligibility.summary
// ---------------------------------------------------------------------------

/** Os cinco baldes do painel de aptidao (F79). Somam `count(*)`. */
export type EligibilityBucket =
  | 'eligible'
  | 'no_destination'
  | 'suppressed'
  | 'out_of_scope'
  | 'company_without_person';

const BUCKET_KEYS: readonly EligibilityBucket[] = [
  'eligible', 'no_destination', 'suppressed', 'out_of_scope', 'company_without_person',
];

function storedClass(row: RecipientRow): MultiplixEligibility | null {
  const raw = row.eligibility;
  if (typeof raw === 'string' && (MULTIPLIX_ELIGIBILITY_VALUES as readonly string[]).includes(raw)) {
    return raw as MultiplixEligibility;
  }
  return null;
}

/** A empresa existe? */
function hasCompany(row: RecipientRow): boolean {
  return asString(row.company_id) !== null;
}

/**
 * A pessoa existe? O sinal e o contato resolvido (`singu_contact_id`) ou o
 * proprio destino: o publico resolve empresa -> contato -> telefone, entao
 * "empresa sem pessoa" e a empresa que chegou SEM contato nenhum.
 */
function hasPerson(row: RecipientRow): boolean {
  return asString(row.singu_contact_id) !== null || asString(row.destino_e164) !== null;
}

/**
 * Classe canonica da linha.
 *
 * A coluna `eligibility` (F31, NOT NULL) e o veredito PERSISTIDO do resolvedor —
 * e a fonte de verdade. So quando ela esta ausente/invalida a decisao e
 * recomputada pelo kernel `eligibility()`, para nao existir uma segunda regra.
 */
export function classOf(row: RecipientRow): MultiplixEligibility {
  const stored = storedClass(row);
  if (stored) return stored;
  return eligibility({ destination: asString(row.destino_e164) }, {}).class;
}

/**
 * F49: todo destinatario cai em EXATAMENTE um dos cinco baldes.
 *
 * As classes transitorias do enum (`media_pending`, `connection_unavailable`,
 * `requires_template`) sao destinatarios APTOS barrados por uma condicao
 * operacional que se resolve sozinha — contam como `eligible` e aparecem no
 * detalhe `transient`. Assim `sum(baldes) === total` sem sobrar linha, que e o
 * criterio de aceite do F49.
 */
export function bucketForRecipient(row: RecipientRow): EligibilityBucket {
  const klass = classOf(row);
  switch (klass) {
    case 'suppressed':
      return 'suppressed';
    case 'out_of_scope':
      return 'out_of_scope';
    case 'no_destination':
      return hasCompany(row) && !hasPerson(row) ? 'company_without_person' : 'no_destination';
    case 'eligible':
    case 'media_pending':
    case 'connection_unavailable':
    case 'requires_template': {
      // Sem pessoa nenhuma o destinatario nunca sera alcancavel: e empresa sem pessoa,
      // mesmo que a coluna tenha ficado no default 'eligible'.
      if (hasCompany(row) && !hasPerson(row)) return 'company_without_person';
      return 'eligible';
    }
    default:
      return 'eligible';
  }
}

/** Motivo legivel da linha. O valor armazenado manda; senao deriva da classe. */
export function inclusionReasonFor(row: RecipientRow, bucket: EligibilityBucket): string {
  const stored = asString(row.inclusion_reason);
  if (stored) return stored;
  switch (bucket) {
    case 'eligible':
      return 'Apto: destinatario com destino valido e dentro do escopo';
    case 'no_destination':
      return 'Excluído: sem destino de WhatsApp';
    case 'suppressed':
      return 'Excluído: pedido de descadastro (lista de supressão)';
    case 'out_of_scope':
      return 'Excluído: fora do escopo da consulta';
    case 'company_without_person':
      return 'Excluído: empresa sem pessoa vinculada';
  }
}

const ROLE_LABELS: Readonly<Record<string, string>> = {
  cliente: 'cliente',
  fornecedor: 'fornecedor',
  transportadora: 'transportadora',
};

/**
 * Frase legivel da consulta (F49). Descreve os filtros REAIS que produziram o
 * publico; sem filtro, devolve a frase honesta de "todos os contatos" — nunca um
 * recorte inventado.
 */
export function buildQueryPhrase(filters: AudienceFilters | null): string {
  if (!filters) return 'Todos os contatos do disparo';

  const partes: string[] = [];

  const roles = filters.roles ?? [];
  if (roles.length > 0) {
    const labels = roles.map((role, index) => {
      const label = ROLE_LABELS[role] ?? role;
      return index === 0 ? label.charAt(0).toUpperCase() + label.slice(1) : label;
    });
    partes.push(labels.join(' OU '));
  }
  if (filters.uf) partes.push(filters.uf);
  if (filters.ramo) partes.push(`ramo ${filters.ramo}`);
  if (filters.search) partes.push(`busca "${filters.search}"`);
  if (filters.exclude_list) partes.push(`excluir lista ${filters.exclude_list}`);

  if (partes.length === 0) return 'Todos os contatos do disparo';
  return partes.join(' · ');
}

/** Linha do summary — o "quem entra" por destinatario (F79). */
export interface SummaryRow {
  recipient_id: string;
  company_name: string | null;
  destino_e164: string | null;
  bucket: EligibilityBucket;
  class: MultiplixEligibility;
  eligibility_reason: string | null;
  inclusion_reason: string;
}

export interface EligibilitySummary {
  total: number;
  eligible: number;
  no_destination: number;
  suppressed: number;
  out_of_scope: number;
  company_without_person: number;
  query_phrase: string;
  /** Detalhe dos aptos barrados por condicao transitoria (subconjunto de `eligible`). */
  transient: { media_pending: number; connection_unavailable: number; requires_template: number };
  rows: SummaryRow[];
}

export function summarize(recipients: RecipientRow[], filters: AudienceFilters): EligibilitySummary {
  const buckets = {
    eligible: 0,
    no_destination: 0,
    suppressed: 0,
    out_of_scope: 0,
    company_without_person: 0,
  };
  const transient = { media_pending: 0, connection_unavailable: 0, requires_template: 0 };
  const rows: SummaryRow[] = [];

  for (const row of recipients) {
    const bucket = bucketForRecipient(row);
    buckets[bucket] += 1;
    const klass = classOf(row);
    if (klass === 'media_pending') transient.media_pending += 1;
    else if (klass === 'connection_unavailable') transient.connection_unavailable += 1;
    else if (klass === 'requires_template') transient.requires_template += 1;

    rows.push({
      recipient_id: row.id,
      company_name: asString(row.company_name_snapshot),
      destino_e164: asString(row.destino_e164),
      bucket,
      class: klass,
      eligibility_reason: asString(row.eligibility_reason),
      inclusion_reason: inclusionReasonFor(row, bucket),
    });
  }

  return {
    total: recipients.length,
    ...buckets,
    query_phrase: buildQueryPhrase(filters),
    transient,
    rows,
  };
}

/** F49 `eligibility.summary`. */
export async function handleEligibilitySummary(ctx: ActionContext): Promise<Response> {
  const parsed = SummarySchema.safeParse(ctx.payload);
  if (!parsed.success) {
    return errorResponse('eligibility.summary: dispatch_id obrigatorio (uuid)', 400, ctx.req);
  }
  const { dispatch_id, audience } = parsed.data;

  await loadOwnedDispatch(ctx, dispatch_id);
  const recipients = await loadRecipients(ctx, dispatch_id);
  const summary = summarize(recipients, audience);

  // Invariante do F49: os numeros TEM de somar o total. Se nao somarem, e bug de
  // classificacao — falha alto em vez de devolver um painel que nao fecha.
  const soma = BUCKET_KEYS.reduce((acc, key) => acc + summary[key], 0);
  if (soma !== summary.total) {
    throw new DispatchError(
      'MULTIPLIX_SUMMARY_MISMATCH',
      `summary nao fecha: baldes=${soma} total=${summary.total}`,
      502,
    );
  }

  return jsonResponse({ data: summary }, 200, ctx.req);
}

// ---------------------------------------------------------------------------
// F50 — estimate
// ---------------------------------------------------------------------------

export interface EstimateResult {
  /** Mensagens a enviar: destinatarios aptos x blocos. */
  messages: number;
  /** Versoes DISTINTAS dos roteiros finais (ja renderizados). */
  script_versions: number;
  /** Consumo de voz: caracteres a sintetizar e renderizacoes de TTS. */
  voice: { characters: number; renderings: number };
  eligible_recipients: number;
  blocks: number;
}

/**
 * F50 `estimate`: tres numeros, todos derivados do dado real (blocos +
 * destinatarios), com o MESMO `personalize` que o worker usa.
 *
 *  - mensagens: aptos x blocos (cada par destinatario x bloco e uma mensagem).
 *  - versoes de roteiro: DISTINCT dos roteiros FINAIS. Um bloco `same_audio`
 *    contribui com UMA versao (o audio e compartilhado); um bloco personalizado
 *    contribui com uma versao por destinatario apto.
 *  - consumo de voz: caracteres a sintetizar e quantas renderizacoes o TTS
 *    precisa — a base do teto de consumo antes de confirmar.
 */
export function estimate(blocks: BlockRow[], eligibleRecipients: RecipientRow[], timezone: string): EstimateResult {
  const scripts = new Set<string>();
  let characters = 0;
  let renderings = 0;

  // Sem destinatario apto NADA e produzido: nenhuma mensagem sai e nenhum TTS
  // e sintetizado. Contar o audio compartilhado aqui seria inventar consumo.
  if (eligibleRecipients.length === 0) {
    return {
      messages: 0,
      script_versions: 0,
      voice: { characters: 0, renderings: 0 },
      eligible_recipients: 0,
      blocks: blocks.length,
    };
  }

  for (const block of blocks) {
    if (block.block_type !== 'voice_ai') continue;
    const script = voiceScriptOf(block);
    if (!script) continue;

    if (isSharedAudio(block)) {
      // Um render para todos: o ativo e o mesmo arquivo.
      const finalScript = renderForRecipient(script, null, {}, timezone);
      scripts.add(finalScript);
      characters += finalScript.length;
      renderings += 1;
      continue;
    }

    for (const recipient of eligibleRecipients) {
      const finalScript = renderForRecipient(
        script,
        recipient.company_name_snapshot,
        variablesOf(recipient),
        timezone,
      );
      scripts.add(finalScript);
      characters += finalScript.length;
      renderings += 1;
    }
  }

  return {
    messages: eligibleRecipients.length * blocks.length,
    script_versions: scripts.size,
    voice: { characters, renderings },
    eligible_recipients: eligibleRecipients.length,
    blocks: blocks.length,
  };
}

/** F50 `estimate`. */
export async function handleEstimate(ctx: ActionContext): Promise<Response> {
  const parsed = EstimateSchema.safeParse(ctx.payload);
  if (!parsed.success) {
    return errorResponse('estimate: dispatch_id obrigatorio (uuid)', 400, ctx.req);
  }
  const { dispatch_id } = parsed.data;

  const dispatch = await loadOwnedDispatch(ctx, dispatch_id);
  const recipients = await loadRecipients(ctx, dispatch_id);
  const blocks = blocksForReview(await loadBlocks(ctx, dispatch_id), dispatch);

  const eligibleRecipients = recipients.filter((row) => bucketForRecipient(row) === 'eligible');
  const result = estimate(blocks, eligibleRecipients, timezoneOf(dispatch));

  return jsonResponse({ data: result }, 200, ctx.req);
}
