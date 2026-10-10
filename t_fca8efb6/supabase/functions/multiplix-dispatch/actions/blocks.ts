/**
 * F45 — Bloco E: blocos do dispatch (`blocks.upsert` | `blocks.delete` | `blocks.reorder`).
 *
 * Cada handler recebe o `ActionContext` resolvido pelo roteador (F44) e devolve
 * uma `Response`, no mesmo estilo de `draft.*`. Toda mutacao:
 *
 *   1. confere que o dispatch e do `ctx.userId` E esta em `draft` (leitura antes
 *      de qualquer escrita; o trigger `enforce_multiplix_dispatch_mutability` do
 *      Bloco A continua sendo a rede de seguranca do banco, mas o `WHERE` daqui
 *      nao depende so dele);
 *   2. so entao escreve.
 *
 * Versionamento (F33 + F45):
 *   - `content_version` e a versao do payload do bloco. Qualquer edicao que mude
 *     `content` / `block_type` / `personalization_mode` incrementa a versao.
 *   - `asset_id` aponta para o ativo RENDERIZADO (audio gerado pelo F65, arquivo
 *     enviado etc.). Ele so e invalidado (`= NULL`) quando mudam as ENTRADAS da
 *     renderizacao: o ROTEIRO (`content.voice.script`), a VOZ
 *     (`content.voice.voice_id`) ou o PARAMETRO (`personalization_mode`). Mudar
 *     so o TITULO/texto (`content.text`), a legenda (`content.media.caption`) ou a
 *     URL de midia NAO invalida o ativo — a versao sobe, o ativo fica.
 *
 *   A implementacao ingenua (zerar `asset_id` a cada edicao) esta errada por isso:
 *   um ajuste de titulo forcaria regerar a voz de todos os destinatarios.
 *
 * Reordenacao: NUNCA reimplementada em TS. Delega a RPC atomica do F33
 * `reorder_multiplix_blocks(p_dispatch_id, p_block_ids)` (SECURITY DEFINER,
 * service_role), que remove buraco/duplicata em `(dispatch_id, block_order)`.
 */

import { z } from 'https://esm.sh/zod@3.23.8';
import { type ActionContext, DispatchError } from '../index.ts';
import { errorResponse, jsonResponse } from '../../_shared/validation.ts';

// Ordem de code-unit UTF-16 (identica a `.sort()` sem argumento) DE PROPOSITO: e a
// ordem estavel do `stableStringify` — NAO trocar por `localeCompare`, que depende do
// locale do runtime e mudaria a ordem entre ambientes.
const compararCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------------------
// Contratos de entrada.
// ---------------------------------------------------------------------------

const BlockTypeSchema = z.enum(['text', 'voice_ai', 'audio_recorded', 'file']);
const PersonalizationModeSchema = z.enum(['same_audio', 'personalized']);

// A forma do `content` e a do F33 (documentada na migration): so as chaves com
// valor aparecem. `.passthrough()` preserva chaves futuras sem rejeitar o bloco.
const VoiceSchema = z
  .object({
    script: z.string().max(20_000).nullish(),
    voice_id: z.string().max(200).nullish(),
  })
  .passthrough();

const MediaSchema = z
  .object({
    url: z.string().max(4_000).nullish(),
    caption: z.string().max(4_000).nullish(),
  })
  .passthrough();

const AssetSchema = z.object({ asset_id: z.string().uuid().nullish() }).passthrough();

const ContentSchema = z
  .object({
    text: z.string().max(20_000).nullish(),
    voice: VoiceSchema.nullish(),
    media: MediaSchema.nullish(),
    asset: AssetSchema.nullish(),
  })
  .passthrough();

const BlocksUpsertSchema = z.object({
  dispatch_id: z.string().uuid(),
  block_id: z.string().uuid().optional(),
  block_type: BlockTypeSchema.optional(),
  content: ContentSchema.optional(),
  personalization_mode: PersonalizationModeSchema.nullish(),
  asset_id: z.string().uuid().nullish(),
});

const BlocksDeleteSchema = z.object({
  dispatch_id: z.string().uuid(),
  block_id: z.string().uuid(),
});

const BlocksReorderSchema = z.object({
  dispatch_id: z.string().uuid(),
  block_ids: z.array(z.string().uuid()).min(1),
});

const BLOCK_COLUMNS =
  'id,dispatch_id,block_type,block_order,content,content_version,asset_id,personalization_mode';

type JsonObject = Record<string, unknown>;

interface BlockRow {
  id: string;
  dispatch_id: string;
  block_type: string;
  block_order: number;
  content: unknown;
  content_version: number | null;
  asset_id: string | null;
  personalization_mode: string | null;
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

/** Compara jsonb sem depender da ordem de insercao das chaves. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as JsonObject;
    return `{${Object.keys(obj)
      .sort(compararCodeUnit)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Merge de patch sobre o `content` existente; `null` limpa uma secao. */
function mergeContent(prev: unknown, patch: JsonObject): JsonObject {
  const out: JsonObject = { ...asObject(prev) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) {
      delete out[key];
      continue;
    }
    if ((key === 'voice' || key === 'media' || key === 'asset') && typeof value === 'object') {
      const base = asObject(out[key]);
      const merged: JsonObject = { ...base };
      for (const [nestedKey, nestedValue] of Object.entries(value as JsonObject)) {
        if (nestedValue === undefined) continue;
        if (nestedValue === null) delete merged[nestedKey];
        else merged[nestedKey] = nestedValue;
      }
      out[key] = merged;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * As ENTRADAS da renderizacao mudaram? Roteiro (`voice.script`), voz
 * (`voice.voice_id`) ou parametro (`personalization_mode`) -> o ativo deixa de
 * valer. Titulo/texto, legenda e url de midia NAO invalidam o ativo.
 */
function assetInputsChanged(
  prev: JsonObject,
  next: JsonObject,
  prevMode: string | null,
  nextMode: string | null,
): boolean {
  if (prevMode !== nextMode) return true;
  const prevVoice = asObject(prev.voice);
  const nextVoice = asObject(next.voice);
  return (prevVoice.script ?? null) !== (nextVoice.script ?? null) ||
    (prevVoice.voice_id ?? null) !== (nextVoice.voice_id ?? null);
}

/**
 * Le o dispatch e garante escopo: dono E `draft`. Devolve uma `Response` de erro
 * nomeado quando a mutacao nao pode seguir — nesse caso NENHUMA escrita ocorre.
 */
async function guardEditableDispatch(
  ctx: ActionContext,
  dispatchId: string,
): Promise<Response | null> {
  const { data, error } = await ctx.supabase
    .from('multiplix_dispatches')
    .select('id,status,created_by')
    .eq('id', dispatchId)
    .maybeSingle();

  if (error) throw new DispatchError('MULTIPLIX_BLOCKS_DISPATCH', error.message, 502);
  const row = data as { status?: string; created_by?: string } | null;
  if (!row || row.created_by !== ctx.userId || row.status !== 'draft') {
    // Mesmo codigo para "nao e seu" e "nao esta em draft": nao revela a
    // existencia de rascunho de outro usuario em rota de mutacao.
    return errorResponse('multiplix_dispatch_not_editable', 409, ctx.req);
  }
  return null;
}

async function nextBlockOrder(ctx: ActionContext, dispatchId: string): Promise<number> {
  const { data, error } = await ctx.supabase
    .from('multiplix_blocks')
    .select('block_order')
    .eq('dispatch_id', dispatchId)
    .order('block_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new DispatchError('MULTIPLIX_BLOCKS_ORDER', error.message, 502);
  const row = data as { block_order?: number } | null;
  return row ? Number(row.block_order) + 1 : 0;
}

// ---------------------------------------------------------------------------
// Acoes.
// ---------------------------------------------------------------------------

/** `blocks.upsert` — cria (`block_id` ausente) ou edita um bloco do rascunho. */
export async function handleBlocksUpsert(ctx: ActionContext): Promise<Response> {
  const parsed = BlocksUpsertSchema.safeParse(ctx.payload);
  if (!parsed.success) return errorResponse('multiplix_block_invalid', 400, ctx.req);
  const p = parsed.data;

  const guard = await guardEditableDispatch(ctx, p.dispatch_id);
  if (guard) return guard;

  if (!p.block_id) {
    if (!p.block_type) return errorResponse('multiplix_block_invalid', 400, ctx.req);
    const row = {
      dispatch_id: p.dispatch_id,
      block_type: p.block_type,
      block_order: await nextBlockOrder(ctx, p.dispatch_id),
      content: p.content ?? {},
      content_version: 1,
      personalization_mode: p.personalization_mode ?? null,
      asset_id: p.asset_id ?? null,
    };
    const { data, error } = await ctx.supabase
      .from('multiplix_blocks')
      .insert(row)
      .select(BLOCK_COLUMNS)
      .maybeSingle();

    if (error) {
      if (error.code === '23505' || error.message.includes('multiplix_blocks_dispatch_order')) {
        return errorResponse('multiplix_block_invalid', 409, ctx.req);
      }
      throw new DispatchError('MULTIPLIX_BLOCKS_UPSERT', error.message, 502);
    }
    if (!data) throw new DispatchError('MULTIPLIX_BLOCKS_UPSERT', 'insert sem retorno', 502);
    return jsonResponse({ data }, 200, ctx.req);
  }

  const { data: existingData, error: readError } = await ctx.supabase
    .from('multiplix_blocks')
    .select(BLOCK_COLUMNS)
    .eq('id', p.block_id)
    .eq('dispatch_id', p.dispatch_id)
    .maybeSingle();

  if (readError) throw new DispatchError('MULTIPLIX_BLOCKS_UPSERT', readError.message, 502);
  if (!existingData) return errorResponse('multiplix_block_not_found', 404, ctx.req);
  const existing = existingData as unknown as BlockRow;

  const prevContent = asObject(existing.content);
  const nextContent = mergeContent(prevContent, asObject(p.content ?? {}));
  const prevMode = existing.personalization_mode ?? null;
  const nextMode = p.personalization_mode === undefined ? prevMode : (p.personalization_mode ?? null);
  const nextType = p.block_type ?? existing.block_type;

  const contentChanged = stableStringify(nextContent) !== stableStringify(prevContent);
  const modeChanged = prevMode !== nextMode;
  const typeChanged = existing.block_type !== nextType;

  // So as ENTRADAS da renderizacao (roteiro/voz/parametro) invalidam o ativo.
  const invalidatesAsset =
    assetInputsChanged(prevContent, nextContent, prevMode, nextMode);

  const patch: JsonObject = {};
  if (contentChanged || modeChanged || typeChanged) {
    patch.content = nextContent;
    patch.content_version = (Number(existing.content_version) || 1) + 1;
  }
  if (typeChanged) patch.block_type = nextType;
  if (modeChanged) patch.personalization_mode = nextMode;

  if (invalidatesAsset) {
    // Roteiro/voz/parametro mudaram -> o ativo renderizado deixa de valer.
    patch.asset_id = null;
  } else if (p.asset_id !== undefined) {
    patch.asset_id = p.asset_id;
  }

  if (Object.keys(patch).length === 0) {
    return jsonResponse({ data: existingData }, 200, ctx.req);
  }

  const { data, error } = await ctx.supabase
    .from('multiplix_blocks')
    .update(patch)
    .eq('id', p.block_id)
    .eq('dispatch_id', p.dispatch_id)
    .select(BLOCK_COLUMNS)
    .maybeSingle();

  if (error) throw new DispatchError('MULTIPLIX_BLOCKS_UPSERT', error.message, 502);
  if (!data) return errorResponse('multiplix_block_not_found', 404, ctx.req);
  return jsonResponse({ data }, 200, ctx.req);
}

/** `blocks.delete` — remove um bloco do rascunho do usuario. */
export async function handleBlocksDelete(ctx: ActionContext): Promise<Response> {
  const parsed = BlocksDeleteSchema.safeParse(ctx.payload);
  if (!parsed.success) return errorResponse('multiplix_block_invalid', 400, ctx.req);
  const { dispatch_id, block_id } = parsed.data;

  const guard = await guardEditableDispatch(ctx, dispatch_id);
  if (guard) return guard;

  const { data, error } = await ctx.supabase
    .from('multiplix_blocks')
    .delete()
    .eq('id', block_id)
    .eq('dispatch_id', dispatch_id)
    .select('id')
    .maybeSingle();

  if (error) throw new DispatchError('MULTIPLIX_BLOCKS_DELETE', error.message, 502);
  if (!data) return errorResponse('multiplix_block_not_found', 404, ctx.req);
  return jsonResponse({ data: { block_id, deleted: true } }, 200, ctx.req);
}

/** `blocks.reorder` — delega a RPC atomica do F33 (nunca reordena em TS). */
export async function handleBlocksReorder(ctx: ActionContext): Promise<Response> {
  const parsed = BlocksReorderSchema.safeParse(ctx.payload);
  if (!parsed.success) return errorResponse('multiplix_block_invalid', 400, ctx.req);
  const { dispatch_id, block_ids } = parsed.data;

  if (new Set(block_ids).size !== block_ids.length) {
    return errorResponse('multiplix_block_invalid', 400, ctx.req);
  }

  const guard = await guardEditableDispatch(ctx, dispatch_id);
  if (guard) return guard;

  const { data, error } = await ctx.supabase.rpc('reorder_multiplix_blocks', {
    p_dispatch_id: dispatch_id,
    p_block_ids: block_ids,
  });

  if (error) {
    const message = String(error.message ?? '');
    if (/multiplix_block_reorder|invalid_multiplix_block_reorder|service_role_required/i.test(message)) {
      return errorResponse('multiplix_block_invalid', 409, ctx.req);
    }
    throw new DispatchError('MULTIPLIX_BLOCKS_REORDER', message, 502);
  }

  const returned = (Array.isArray(data) ? data : []) as Array<{ block_id?: string; block_order?: number }>;
  const order = returned
    .map((row) => ({ block_id: String(row.block_id), block_order: Number(row.block_order) }))
    .sort((a, b) => a.block_order - b.block_order);

  // A RPC e a autoridade da ordem; conferimos o eco em vez de recriar a ordem.
  if (order.length !== block_ids.length || order.some((row, index) => row.block_id !== block_ids[index])) {
    throw new DispatchError('MULTIPLIX_BLOCKS_REORDER', 'RPC devolveu ordem divergente', 502);
  }

  return jsonResponse({ data: { dispatch_id, order } }, 200, ctx.req);
}
