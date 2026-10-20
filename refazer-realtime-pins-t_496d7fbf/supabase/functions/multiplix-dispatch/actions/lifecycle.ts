/**
 * BLOCO E (F51/F52) — acoes de ciclo de vida do Multiplix na edge `multiplix-dispatch`.
 *
 * `confirm` (F51) e `status` (F52). O roteador (`../index.ts`, do lider) liga os dois
 * handlers; nada aqui fala com o front diretamente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * F51 · confirm — PREPARAR != REVISAR != CONFIRMAR
 * ─────────────────────────────────────────────────────────────────────────────
 * O ponto delicado do bloco: confirmar tem de ser UMA operacao. Revalidar a
 * elegibilidade, congelar publico e blocos, avancar a versao e gerar as linhas
 * de `multiplix_delivery_items` vivem na MESMA transacao — por isso tudo isso e
 * a RPC SQL `multiplix_confirm_dispatch` (ver a migration entregue junto). Se o
 * TS fizesse N INSERTs (o caminho antigo do front, `useMultiplixDispatches.ts`),
 * uma falha no meio deixaria o dispatch com metade da fila. Aqui o handler faz
 * DUAS coisas: resolve o escopo (dono OU `multiplix.dispatch.manage_all`) e
 * chama a RPC UMA vez.
 *
 * IDEMPOTENCIA por `(dispatch_id, dispatch_version)`: o cliente manda a versao
 * que REVISOU (`dispatch_version` do `draft.get`); a RPC grava em
 * `dispatch_version + 1` e as linhas de item carregam essa versao no
 * `idempotency_key` (UNIQUE). 5 cliques = 5 chamadas HTTP, mas 1 confirmacao: as
 * 4 seguintes acham os itens da versao ja materializada e devolvem
 * `created: false`. IMPORTANTE: o handler NAO compara a versao do payload com a
 * versao atual antes de chamar a RPC — se comparasse, o 2o clique (quando a
 * versao ja avancou) viraria "revisao desatualizada" e a idempotencia morreria.
 * A ORDEM das checagens (idempotencia ANTES de staleness) e da RPC.
 *
 * Revalidacao (F49) antes de congelar, tambem DENTRO da transacao: sem
 * destinatario elegivel, sem bloco ou sem conexao o confirm nao materializa nada
 * e devolve erro NOMEADO (422), nunca um 500 nem uma fila vazia "confirmada".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * F52 · status — sent != delivered != read != replied
 * ─────────────────────────────────────────────────────────────────────────────
 * A resposta traz o corte agregado, por destinatario e por bloco, e os QUATRO
 * estados de retorno SEPARADOS, cada um lido da sua propria fonte:
 *   sent      = itens com status `sent`      (saiu para o provedor)
 *   delivered = itens com status `delivered` (ack de entrega)
 *   read      = itens com status `read`      (recibo de leitura)
 *   replied   = itens com `replied_at`       (resposta correlacionada, F62)
 * `read` e `delivered` sao baldes EXCLUSIVOS do enum `multiplix_item_status` —
 * nao se colapsa "entregue" dentro de "enviado" (o defeito que o plano aponta).
 * `replied` e ORTOGONAL ao status (uma mensagem respondida tambem e lida); por
 * isso ele e contado a parte e nunca somado a `read`.
 */

import { z } from 'https://esm.sh/zod@3.23.8';
import { errorResponse, jsonResponse } from '../../_shared/validation.ts';
import { DispatchError, MANAGE_ALL_PERMISSION, type ActionContext } from '../index.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** Colunas lidas do dispatch — as mesmas que o front ja enxerga na tela de revisao. */
const DISPATCH_COLUMNS =
  'id,created_by,status,dispatch_version,scheduled_at,whatsapp_connection_id,total_recipients,' +
  'sent_count,delivered_count,failed_count,outcome_unknown_count,started_at,completed_at';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tamanho da pagina da leitura paginada (o teto de politica permite > 1000 itens). */
const PAGE_SIZE = 1000;
/** Teto de seguranca do paginador: 200 paginas * 1000 = 200k linhas. */
const MAX_PAGES = 200;

/** Os estados do enum `multiplix_item_status` (F30), na ordem da migration. */
const ITEM_STATES = [
  'pending',
  'sending',
  'sent',
  'delivered',
  'read',
  'failed',
  'failed_transient',
  'skipped',
  'cancelled',
  'outcome_unknown',
] as const;

/** Erros NOMEADOS da revalidacao (F49) que o confirm devolve como 422. */
export const CONFIRM_REVALIDATION_ERRORS = [
  'multiplix_confirm_no_recipients',
  'multiplix_confirm_no_eligible_recipients',
  'multiplix_confirm_no_blocks',
  'multiplix_confirm_connection_required',
  'multiplix_confirm_connection_unavailable',
] as const;

/**
 * Payload do `confirm`. `dispatch_version` e a versao REVISADA (nao a nova):
 * e ela que da a identidade da confirmacao. `scheduled_at` e opcional; quando
 * presente o dispatch nasce `scheduled`, quando ausente nasce `sending`.
 */
const ConfirmSchema = z.object({
  dispatch_id: z.string().uuid(),
  dispatch_version: z.coerce.number().int().positive(),
  // `datetime()` do zod nao aceita offset; aceitamos o que o front manda (ISO
  // com `Z` ou com offset) e deixamos o Postgres normalizar.
  scheduled_at: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'scheduled_at invalido')
    .nullish(),
  client_request_id: z.string().uuid().nullish(),
});

const StatusSchema = z.object({
  dispatch_id: z.string().uuid(),
  include_recipients: z.boolean().optional(),
  include_blocks: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Escopo e leitura comum.
// ---------------------------------------------------------------------------

interface Scope {
  profileId: string | null;
  isOwner: boolean;
  manageAll: boolean;
}

/**
 * Resolve o escopo no SERVIDOR a partir do JWT ja validado (ADR-007 D1): o front
 * nunca manda "pode gerenciar tudo". Dono = `profiles.id` igual a `created_by`;
 * sem isso, so a permissao nomeada abre a acao (mesma regra do `multiplix-send`/F06).
 */
async function resolveScope(ctx: ActionContext, createdBy: unknown): Promise<Scope> {
  const { data, error } = await ctx.supabase
    .from('profiles')
    .select('id')
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (error) throw new DispatchError('MULTIPLIX_PROFILE_LOOKUP', error.message, 502);

  const profileId = (data as { id?: string } | null)?.id ?? null;
  if (profileId !== null && profileId === createdBy) {
    return { profileId, isOwner: true, manageAll: false };
  }

  const { data: permission, error: permissionError } = await ctx.supabase.rpc('user_has_permission', {
    _user_id: ctx.userId,
    _permission_name: MANAGE_ALL_PERMISSION,
  });
  if (permissionError) throw new DispatchError('MULTIPLIX_PERMISSION_LOOKUP', permissionError.message, 502);
  return { profileId, isOwner: false, manageAll: permission === true };
}

async function loadDispatch(ctx: ActionContext, dispatchId: string): Promise<Row | null> {
  const { data, error } = await ctx.supabase
    .from('multiplix_dispatches')
    .select(DISPATCH_COLUMNS)
    .eq('id', dispatchId)
    .maybeSingle();
  if (error) throw new DispatchError('MULTIPLIX_DISPATCH_LOOKUP', error.message, 502);
  return (data as Row | null) ?? null;
}

/** Leitura paginada por `range` (o PostgREST devolve no maximo N linhas por pagina). */
async function fetchPaged(ctx: ActionContext, table: string, columns: string, dispatchId: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await ctx.supabase
      .from(table)
      .select(columns)
      .eq('dispatch_id', dispatchId)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new DispatchError(`MULTIPLIX_STATUS_${table.toUpperCase()}`, error.message, 502);
    const rows = (data as Row[] | null) ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

/** O `correlation_id` so e propagado se for UUID (a tabela de eventos e uuid). */
function uuidOrNull(value: string | null | undefined): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

// ---------------------------------------------------------------------------
// F51 — confirm.
// ---------------------------------------------------------------------------

/** Traduz o erro da RPC no erro NOMEADO/HTTP correspondente (nunca 500 cru). */
function mapConfirmError(error: { message?: string }, ctx: ActionContext, dispatch: Row): Response {
  const message = error.message ?? '';

  if (message.includes('multiplix_dispatch_not_found')) {
    return errorResponse('multiplix_dispatch_not_found', 404, ctx.req);
  }
  if (message.includes('multiplix_dispatch_scope_denied')) {
    return errorResponse('multiplix_dispatch_scope_denied', 403, ctx.req);
  }
  if (message.includes('multiplix_dispatch_review_stale')) {
    // 409 com a versao ATUAL: o cliente sabe que precisa refazer a revisao.
    return jsonResponse({
      error: 'multiplix_dispatch_review_stale',
      message: 'O disparo mudou desde a revisao; revise de novo antes de confirmar',
      dispatch_version: dispatch.dispatch_version ?? null,
    }, 409, ctx.req);
  }
  if (message.includes('multiplix_dispatch_already_confirmed')) {
    return errorResponse('multiplix_dispatch_already_confirmed', 409, ctx.req);
  }
  if (message.includes('multiplix_dispatch_not_confirmable')) {
    return errorResponse('multiplix_dispatch_not_confirmable', 409, ctx.req);
  }
  for (const named of CONFIRM_REVALIDATION_ERRORS) {
    if (message.includes(named)) return errorResponse(named, 422, ctx.req);
  }
  if (message.includes('multiplix_over_recipient_limit')) {
    return errorResponse('multiplix_over_recipient_limit', 400, ctx.req);
  }
  return errorResponse('multiplix_confirm_failed', 502, ctx.req);
}

export async function handleConfirm(ctx: ActionContext): Promise<Response> {
  const parsed = ConfirmSchema.safeParse(ctx.payload);
  if (!parsed.success) {
    return errorResponse(
      `confirm: payload invalido (${parsed.error.issues[0]?.path.join('.') ?? 'payload'})`,
      400,
      ctx.req,
    );
  }
  const p = parsed.data;

  const dispatch = await loadDispatch(ctx, p.dispatch_id);
  if (!dispatch) return errorResponse('multiplix_dispatch_not_found', 404, ctx.req);

  const scope = await resolveScope(ctx, dispatch.created_by);
  // Sem escopo: 404 (nao revela a existencia de disparo de outro usuario).
  if (!scope.isOwner && !scope.manageAll) {
    return errorResponse('multiplix_dispatch_not_found', 404, ctx.req);
  }

  const scheduledAt = p.scheduled_at ?? (dispatch.scheduled_at as string | null) ?? null;

  // UMA chamada: a RPC revalida (F49), congela publico/blocos, avanca a versao e
  // materializa os itens — tudo na MESMA transacao (falha no meio = 0 itens).
  const { data, error } = await ctx.supabase.rpc('multiplix_confirm_dispatch', {
    p_dispatch_id: p.dispatch_id,
    p_actor_id: scope.profileId,
    p_allow_manage_all: scope.manageAll,
    p_expected_version: p.dispatch_version,
    p_scheduled_at: scheduledAt,
    p_correlation_id: uuidOrNull(ctx.correlationId),
  });
  if (error) return mapConfirmError(error, ctx, dispatch);

  const row = (Array.isArray(data) ? data[0] : data) as Row | null;
  if (!row) {
    throw new DispatchError('MULTIPLIX_CONFIRM_EMPTY', 'A confirmacao nao devolveu resultado', 502);
  }

  return jsonResponse({
    data: {
      dispatch_id: row.dispatch_id ?? p.dispatch_id,
      dispatch_version: row.dispatch_version ?? p.dispatch_version + 1,
      status: row.status ?? null,
      scheduled_at: row.scheduled_at ?? scheduledAt,
      recipient_count: row.recipient_count ?? null,
      block_count: row.block_count ?? null,
      items_created: row.items_created ?? 0,
      items_total: row.items_total ?? 0,
      // "N contatos" != "N mensagens" (F50/F78): o numero de mensagens e
      // destinatarios x blocos; `total_recipients` continua contando destinatarios.
      message_count: row.items_total ?? 0,
      // false = ja estava confirmado naquela versao (idempotente) — o front usa
      // isto para nao tratar o clique repetido como erro.
      created: row.created !== false,
    },
  }, 200, ctx.req);
}

// ---------------------------------------------------------------------------
// F52 — status.
// ---------------------------------------------------------------------------

interface Tally {
  total_items: number;
  pending: number;
  sending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  failed_transient: number;
  skipped: number;
  cancelled: number;
  outcome_unknown: number;
  /** ortogonal ao status: itens com `replied_at` (F62). Nunca somado a `read`. */
  replied: number;
}

function emptyTally(): Tally {
  const tally: Record<string, number> = { total_items: 0, replied: 0 };
  for (const state of ITEM_STATES) tally[state] = 0;
  return tally as unknown as Tally;
}

/**
 * Conta os itens. Cada estado do enum e um balde EXCLUSIVO; `replied` e contado
 * a parte porque resposta e um evento ortogonal ao status de entrega.
 */
function tally(items: Row[]): Tally {
  const tally = emptyTally();
  for (const item of items) {
    tally.total_items += 1;
    const status = String(item.status ?? '');
    if ((ITEM_STATES as readonly string[]).includes(status)) {
      (tally as unknown as Record<string, number>)[status] += 1;
    }
    if (item.replied_at !== null && item.replied_at !== undefined) {
      tally.replied += 1;
    }
  }
  return tally;
}

/** Agrupa os itens por chave (recipient_id / block_id) mantendo a ordem do 1o item. */
function groupItems(items: Row[], key: string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const item of items) {
    const id = String(item[key] ?? '');
    if (!id) continue;
    const bucket = groups.get(id);
    if (bucket) bucket.push(item);
    else groups.set(id, [item]);
  }
  return groups;
}

/**
 * Metadados de retorno do DESTINATARIO (F62): o PRIMEIRO item respondido (menor
 * `replied_at`) e a atribuicao DESSE MESMO item — horario e atribuicao saem do
 * mesmo evento, entao o par nunca se contradiz. `linked` = a resposta citou uma
 * mensagem nossa (external_id casou); `inferred` = correlacao por janela +
 * telefone (ver `attribute_multiplix_item_reply`). Sem retorno, as duas chaves
 * existem e sao NULAS (a tela distingue "sem resposta" de "campo ausente").
 */
function recipientReply(rows: Row[]): { replied_at: string | null; reply_attribution: string | null } {
  let first: Row | null = null;
  let firstAt = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const value = row.replied_at;
    if (value === null || value === undefined) continue;
    const parsed = Date.parse(String(value));
    // Timestamp ilegivel nunca ganha de um valido, mas sozinho ainda e reportado.
    const at = Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
    if (first === null || at < firstAt) {
      first = row;
      firstAt = at;
    }
  }
  if (first === null) return { replied_at: null, reply_attribution: null };
  return {
    replied_at: (first.replied_at as string | null) ?? null,
    reply_attribution: (first.reply_attribution as string | null) ?? null,
  };
}

export async function handleStatus(ctx: ActionContext): Promise<Response> {
  const parsed = StatusSchema.safeParse(ctx.payload);
  if (!parsed.success) {
    return errorResponse('status: payload invalido (dispatch_id uuid)', 400, ctx.req);
  }
  const p = parsed.data;

  const dispatch = await loadDispatch(ctx, p.dispatch_id);
  if (!dispatch) return errorResponse('multiplix_dispatch_not_found', 404, ctx.req);

  const scope = await resolveScope(ctx, dispatch.created_by);
  if (!scope.isOwner && !scope.manageAll) {
    return errorResponse('multiplix_dispatch_not_found', 404, ctx.req);
  }

  const items = await fetchPaged(
    ctx,
    'multiplix_delivery_items',
    // `replied_at` + `reply_attribution` sao a fonte do retorno por destinatario
    // (F62): o horario e a atribuicao (`linked`/`inferred`) saem daqui.
    'recipient_id,block_id,status,sent_at,delivered_at,read_at,replied_at,reply_attribution',
    p.dispatch_id,
  );
  const recipients = p.include_recipients === false
    ? []
    : await fetchPaged(
      ctx,
      'multiplix_recipients',
      'id,destino_e164,company_id,company_name_snapshot,eligibility',
      p.dispatch_id,
    );
  const blocks = p.include_blocks === false
    ? []
    : await fetchPaged(ctx, 'multiplix_blocks', 'id,block_order,block_type,content_version', p.dispatch_id);

  const aggregate = tally(items);

  // Corte por destinatario: a uniao entre os destinatarios conhecidos e os que
  // aparecem so nos itens (defensivo — nunca perde uma linha da contagem).
  const byRecipient = new Map<string, Row>();
  for (const recipient of recipients) {
    byRecipient.set(String(recipient.id), {
      recipient_id: recipient.id,
      destino_e164: recipient.destino_e164 ?? null,
      company_id: recipient.company_id ?? null,
      company_name: recipient.company_name_snapshot ?? null,
      eligibility: recipient.eligibility ?? null,
      ...tally([]),
      // destinatario sem item: as chaves de retorno existem e sao NULAS.
      ...recipientReply([]),
    });
  }
  for (const [recipientId, rows] of groupItems(items, 'recipient_id')) {
    const entry = byRecipient.get(recipientId) ?? {
      recipient_id: recipientId,
      destino_e164: null,
      company_id: null,
      company_name: null,
      eligibility: null,
      ...tally([]),
      ...recipientReply([]),
    };
    // O horario/atribuicao do retorno completam o corte, sem tocar nos contadores.
    byRecipient.set(recipientId, { ...entry, ...tally(rows), ...recipientReply(rows) });
  }

  // Corte por bloco.
  const byBlock = new Map<string, Row>();
  for (const block of blocks) {
    byBlock.set(String(block.id), {
      block_id: block.id,
      block_order: block.block_order ?? null,
      block_type: block.block_type ?? null,
      content_version: block.content_version ?? null,
      ...tally([]),
    });
  }
  for (const [blockId, rows] of groupItems(items, 'block_id')) {
    const entry = byBlock.get(blockId) ?? {
      block_id: blockId,
      block_order: null,
      block_type: null,
      content_version: null,
      ...tally([]),
    };
    byBlock.set(blockId, { ...entry, ...tally(rows) });
  }

  const recipientsOut = [...byRecipient.values()].sort((a, b) =>
    String(a.destino_e164 ?? '').localeCompare(String(b.destino_e164 ?? ''))
  );
  const blocksOut = [...byBlock.values()].sort((a, b) =>
    Number(a.block_order ?? 0) - Number(b.block_order ?? 0)
  );

  return jsonResponse({
    data: {
      dispatch: {
        id: dispatch.id,
        status: dispatch.status,
        dispatch_version: dispatch.dispatch_version,
        scheduled_at: dispatch.scheduled_at ?? null,
        started_at: dispatch.started_at ?? null,
        completed_at: dispatch.completed_at ?? null,
        total_recipients: dispatch.total_recipients ?? 0,
        // contadores persistidos pelo worker (F32b §1: recalculados por item)
        sent_count: dispatch.sent_count ?? 0,
        delivered_count: dispatch.delivered_count ?? 0,
        failed_count: dispatch.failed_count ?? 0,
        outcome_unknown_count: dispatch.outcome_unknown_count ?? 0,
      },
      // Agregado: os QUATRO estados de retorno separados + os baldes da fila.
      aggregate: {
        ...aggregate,
        recipient_count: recipientsOut.length,
        block_count: blocksOut.length,
      },
      by_recipient: recipientsOut,
      by_block: blocksOut,
    },
  }, 200, ctx.req);
}
