/**
 * BLOCO E — acoes de LEITURA de listagem: `dispatch.list` e `recipients.list`.
 *
 * Duas leituras puras (sem mutacao), no mesmo estilo dos outros modulos de
 * acao: cada handler recebe o `ActionContext` resolvido pelo roteador e devolve
 * uma `Response`. Elas existem para o painel montar a tela de disparos e o
 * "quem entrou" de um disparo sem falar direto com as tabelas de escrita.
 *
 * ESCOPO — a mesma regra do resto do Bloco E (dono do disparo OU a permissao
 * ampla `multiplix.dispatch.manage_all`, o `F06` do `multiplix-send`): o recorte
 * de dono vai no PROPRIO WHERE (`.eq('created_by', ...)`), nunca so na policy,
 * para a edge nao virar um caminho lateral para ler o disparo de outro.
 *
 *   - `resolveOwnerScope` resolve o `profiles.id` do JWT (o MESMO id que o
 *     `multiplix_create_draft` grava em `created_by`) e a permissao ampla.
 *   - `dispatch.list` lista SO o que o usuario pode ver: sem a permissao ampla,
 *     o unico recorte e `created_by = <profile do JWT>`.
 *   - `recipients.list` confere o dono do disparo ANTES de listar e responde
 *     404 (nao 403) quando o disparo nao e do usuario — a mesma escolha do
 *     `draft.get`, para nao revelar a existencia de disparo de outro.
 *
 * Colunas: so as que EXISTEM em `multiplix_dispatches` / `multiplix_recipients`
 * (conferidas na migration do F31 e no schema canonico). Em particular NAO
 * existe `audience_size`; o tamanho do publico sai de `total_recipients`, que e
 * a coluna real.
 *
 * Telefone: `destino_e164` e devolvido como o resto da edge ja devolve (o
 * `status`/`inspect` tambem trazem o campo cru) — nao ha helper de mascaramento
 * em `_shared/`, entao nao se inventa um padrao paralelo aqui.
 */

import { z } from 'https://esm.sh/zod@3.23.8';
import { errorResponse, jsonResponse } from '../../_shared/validation.ts';
import { DispatchError, MANAGE_ALL_PERMISSION, type ActionContext } from '../index.ts';

// ---------------------------------------------------------------------------
// Contratos de entrada.
// ---------------------------------------------------------------------------

const Uuid = z.string().uuid();

const DispatchListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  // `dispatch_id` e OPCIONAL e nao cria uma acao nova: permite pedir UM disparo
  // especifico pela MESMA rota de listagem, para o front resolver o caso de um
  // disparo que nao esta entre os `limit` mais recentes (ele faz `find(id)` sobre
  // `data`). O filtro entra no MESMO WHERE do recorte de dono (ver handler), nunca
  // como um filtro pos-leitura sobre uma pagina ja recortada.
  dispatch_id: Uuid.optional(),
});

const RecipientsListSchema = z.object({
  dispatch_id: Uuid,
  // `status` e um filtro livre sobre o enum `multiplix_recipient_status`
  // (pending|sending|sent|delivered|read|failed|skipped|cancelled|outcome_unknown);
  // fica como string limitada para nao travar a resposta se o enum ganhar valor.
  status: z.string().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(500),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

/** Colunas de `multiplix_dispatches` (todas confirmadas na migration F31). */
const DISPATCH_LIST_COLUMNS =
  'id,name,status,created_at,updated_at,scheduled_at,dispatch_version,audience_version,origin,' +
  'total_recipients,sent_count,delivered_count,failed_count,outcome_unknown_count,' +
  'whatsapp_connection_id,started_at,completed_at';

/** Colunas de `multiplix_recipients` (todas confirmadas na migration F31). */
const RECIPIENT_LIST_COLUMNS =
  'id,dispatch_id,company_id,company_name_snapshot,destino_e164,singu_contact_id,' +
  'eligibility,eligibility_reason,inclusion_reason,status,sent_at,delivered_at,created_at';

type Result<T> = { data: T; error: { message?: string } | null };

interface OwnerScope {
  /** `profiles.id` do JWT (o que a `created_by` guarda), ou null se nao houver. */
  profileId: string | null;
  /** `multiplix.dispatch.manage_all`: ve os disparos de qualquer dono. */
  manageAll: boolean;
}

/**
 * Resolve o escopo de leitura no SERVIDOR a partir do JWT ja validado: o
 * `profiles.id` do usuario e a permissao ampla. Mesma resolucao do `multiplix-send`
 * (`authProfile` + `canManageDispatch`) e do `lifecycle.resolveScope`.
 */
async function resolveOwnerScope(ctx: ActionContext): Promise<OwnerScope> {
  const { data, error } = await ctx.supabase
    .from('profiles')
    .select('id')
    .eq('user_id', ctx.userId)
    .maybeSingle() as Result<{ id?: string } | null>;
  if (error) throw new DispatchError('MULTIPLIX_PROFILE_LOOKUP', error.message ?? 'profile lookup failed', 502);
  const profileId = typeof data?.id === 'string' ? data.id : null;

  const { data: permission, error: permissionError } = await ctx.supabase.rpc('user_has_permission', {
    _user_id: ctx.userId,
    _permission_name: MANAGE_ALL_PERMISSION,
  }) as Result<unknown>;
  if (permissionError) {
    throw new DispatchError('MULTIPLIX_PERMISSION_LOOKUP', permissionError.message ?? 'permission lookup failed', 502);
  }
  return { profileId, manageAll: permission === true };
}

// ---------------------------------------------------------------------------
// dispatch.list
// ---------------------------------------------------------------------------

/**
 * `dispatch.list` — os disparos do usuario, mais recentes primeiro.
 *
 * Sem a permissao ampla o recorte e `created_by = profile do JWT` (o MESMO dono
 * que o `draft.get` aceita); com ela, todos. Paginacao por `limit`/`offset`
 * validados com zod (default 50, max 200) e `.range()` no PostgREST.
 */
export async function handleDispatchList(ctx: ActionContext): Promise<Response> {
  const parsed = DispatchListSchema.safeParse(ctx.payload);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join('.') ?? 'payload';
    return errorResponse(`dispatch.list: payload inválido (${where})`, 400, ctx.req);
  }
  const { limit, offset, dispatch_id } = parsed.data;

  const scope = await resolveOwnerScope(ctx);
  // Sem permissao ampla e sem profile, o usuario nao possui disparo nenhum:
  // lista vazia (nao ha chave de dono para filtrar e nao se vaza nada).
  if (!scope.manageAll && scope.profileId === null) {
    return jsonResponse({
      data: [],
      meta: { correlation_id: ctx.correlationId, limit, offset, total: 0 },
    }, 200, ctx.req);
  }

  let query = ctx.supabase
    .from('multiplix_dispatches')
    .select(DISPATCH_LIST_COLUMNS, { count: 'exact' });
  // Sem permissao ampla o dono entra no WHERE: nunca traz de outro usuario.
  if (!scope.manageAll) query = query.eq('created_by', scope.profileId as string);
  // `dispatch_id` entra no MESMO WHERE do escopo de dono — o recorte por id e a
  // barreira de posse viajam juntos no SQL, entao nenhum filtro pos-leitura
  // (buscar a pagina e depois `find`) pode trazer o disparo de outro. Como o id e
  // chave unica, a pagina tem no maximo 1 item e o `dispatch_id` fura o teto de
  // `limit` sem alterar o contrato atual (o front faz `find(id)` sobre `data`).
  if (dispatch_id !== undefined) query = query.eq('id', dispatch_id);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new DispatchError('MULTIPLIX_DISPATCH_LIST', error.message, 502);

  const rows = Array.isArray(data) ? data : [];
  return jsonResponse({
    data: rows,
    meta: {
      correlation_id: ctx.correlationId,
      limit,
      offset,
      total: typeof count === 'number' ? count : rows.length,
    },
  }, 200, ctx.req);
}

// ---------------------------------------------------------------------------
// recipients.list
// ---------------------------------------------------------------------------

/**
 * `recipients.list` — destinatarios de um disparo do usuario.
 *
 * O escopo e conferido ANTES de qualquer leitura da lista: disparo de outro
 * usuario responde 404 `multiplix_dispatch_not_found` (nao 403 — nao revela
 * existencia), igual ao `draft.get`. Filtro opcional por `status` e paginacao
 * `limit`/`offset` (default 500, max 1000).
 */
export async function handleRecipientsList(ctx: ActionContext): Promise<Response> {
  const parsed = RecipientsListSchema.safeParse(ctx.payload);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join('.') ?? 'payload';
    return errorResponse(`recipients.list: payload inválido (${where})`, 400, ctx.req);
  }
  const { dispatch_id, status, limit, offset } = parsed.data;

  const notFound = () => errorResponse('multiplix_dispatch_not_found', 404, ctx.req);

  const scope = await resolveOwnerScope(ctx);
  if (!scope.manageAll && scope.profileId === null) return notFound();

  // Escopo: o disparo tem de ser do dono OU do escopo amplo. A checagem e
  // feita na LEITURA do disparo, antes de listar os destinatarios.
  const { data: dispatchData, error: dispatchError } = await ctx.supabase
    .from('multiplix_dispatches')
    .select('id,created_by')
    .eq('id', dispatch_id)
    .maybeSingle() as Result<{ id?: string; created_by?: string } | null>;
  if (dispatchError) {
    throw new DispatchError('MULTIPLIX_DISPATCH_LOOKUP', dispatchError.message ?? 'dispatch lookup failed', 502);
  }

  const dispatch = dispatchData;
  const owns = dispatch !== null && scope.profileId !== null && dispatch.created_by === scope.profileId;
  if (!dispatch || !(owns || scope.manageAll)) return notFound();

  let query = ctx.supabase
    .from('multiplix_recipients')
    .select(RECIPIENT_LIST_COLUMNS, { count: 'exact' })
    .eq('dispatch_id', dispatch_id);
  if (status !== undefined) query = query.eq('status', status);

  const { data, error, count } = await query
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw new DispatchError('MULTIPLIX_RECIPIENTS_LIST', error.message, 502);

  const rows = Array.isArray(data) ? data : [];
  return jsonResponse({
    data: rows,
    meta: {
      correlation_id: ctx.correlationId,
      limit,
      offset,
      total: typeof count === 'number' ? count : rows.length,
    },
  }, 200, ctx.req);
}
