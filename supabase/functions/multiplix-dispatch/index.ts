/**
 * BLOCO E (F44-F54) — API de dominio do Multiplix.
 *
 * Objetivo do bloco: separar PREPARAR (rascunho) de REVISAR (previa/elegibilidade)
 * de CONFIRMAR (congelar e executar). O front nunca mais fala com as tabelas de
 * escrita direto: ele chama esta edge por `action`, e a edge valida escopo,
 * resolve, congela e so entao delega ao worker.
 *
 * Contrato de entrada (sempre POST, JSON):
 *   { "action": "<nome>", "payload": { ... } }
 *
 * Toda resposta carrega `meta.correlation_id` — o MESMO id que o Bloco D colocou no
 * kernel de mensageria (F43), para amarrar uma requisicao de API, o item de fila e o
 * log do envio sem depender de dado de cliente.
 *
 * Acoes desta etapa (F44): draft.create | draft.get | draft.update | draft.discard.
 * As demais acoes do bloco (F45-F52) vivem em ./actions/*.ts e sao ligadas aqui.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';
import { z } from 'https://esm.sh/zod@3.23.8';
import {
  enforceRateLimit,
  errorResponse,
  getClientIP,
  handleCors,
  jsonResponse,
  requireAuth,
  requireEnv,
} from '../_shared/validation.ts';
import { newCorrelationId } from '../_shared/messaging/index.ts';
import {
  mapResolvedRecipients,
  MULTIPLIX_OVER_POLICY_LIMIT,
  MULTIPLIX_RESOLVE_TRUNCATED,
  MultiplixPolicyLimitError,
  RESOLVE_REQUEST_MAX_IDS,
} from '../multiplix-audience/index.ts';
import { handleBlocksDelete, handleBlocksReorder, handleBlocksUpsert } from './actions/blocks.ts';
import {
  buildExternalAudienceSource,
  handleAudienceSelect,
  MULTIPLIX_AUDIENCE_CONFIG_INVALID,
  resolveAudienceScope,
  type AudienceSource,
} from './actions/audience.ts';
import { handleEligibilitySummary, handleEstimate, handlePreview, handleValidate } from './actions/inspect.ts';
import { handleConfirm, handleStatus } from './actions/lifecycle.ts';
import { handleDispatchList, handleRecipientsList } from './actions/listing.ts';

// F44: escopo do usuario. O dispatch e do DONO (created_by) ou de quem tem a
// permissao ampla — mesma regra que o F06 aplicou no `multiplix-send`, para a
// edge nao virar um caminho lateral para disparar do nome de outro.
export const MANAGE_ALL_PERMISSION = 'multiplix.dispatch.manage_all';

/** Erro de negocio com codigo nomeado: nunca vira 500 generico. */
export class DispatchError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

// MX08: o publico chega por REFERENCIA (ids de empresa/contato) — nunca como
// linhas prontas. O schema e `.strict()` de proposito: `recipients`,
// `destino_e164`, `elegibilidade` ou qualquer campo de destino vindo do
// navegador e RECUSADO com 400 (nao apenas ignorado), porque quem decide o
// destino e a elegibilidade e a ponte Singu sob o escopo assinado do JWT — o
// mesmo caminho do `audience.select`/F46 e do `create_draft` da edge irma
// `multiplix-audience`.
const DraftCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    message_template: z.string().min(1).max(65_536),
    company_ids: z.array(z.string().uuid()).max(RESOLVE_REQUEST_MAX_IDS).default([]),
    contact_ids: z.array(z.string().uuid()).max(RESOLVE_REQUEST_MAX_IDS).default([]),
    client_request_id: z.string().uuid(),
    whatsapp_connection_id: z.string().uuid().nullish(),
    scheduled_at: z.string().datetime({ offset: true }).nullish(),
    confirm_over_limit: z.boolean().optional().default(false),
  })
  .strict()
  .refine((v) => v.company_ids.length > 0 || v.contact_ids.length > 0, {
    message: 'Informe ao menos um company_id ou contact_id',
  });

const DraftGetSchema = z.object({ dispatch_id: z.string().uuid() });

const DraftUpdateSchema = z.object({
  dispatch_id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  whatsapp_connection_id: z.string().uuid().nullish(),
  scheduled_at: z.string().datetime().nullish(),
});

const DraftDiscardSchema = z.object({ dispatch_id: z.string().uuid() });

/** Contexto resolvido uma vez por request e passado aos handlers. */
export interface ActionContext {
  action: string;
  payload: Record<string, unknown>;
  userId: string;
  supabase: SupabaseClient;
  correlationId: string;
  req: Request;
}

type Handler = (ctx: ActionContext) => Promise<Response>;

// ---------------------------------------------------------------------------
// Identidade/escopo — UMA resolucao para toda a edge (MX08).
//
// `multiplix_dispatches.created_by` (e o `p_created_by` da RPC) guarda
// `profiles.id`, NAO o `auth.uid` que `requireAuth` entrega em `ctx.userId`.
// Comparar/gravar `created_by` com o `auth.uid` cru quebrava o proprio dono
// (404/409 falsos) e a criacao caia em `multiplix_draft_owner_not_found`.
// ---------------------------------------------------------------------------

type Result<T> = { data: T; error: { message?: string; code?: string } | null };

/** `profiles.id` do usuario autenticado (`ctx.userId` e o auth.uid do JWT). */
export async function resolveProfileId(ctx: ActionContext): Promise<string | null> {
  const { data, error } = await ctx.supabase
    .from('profiles')
    .select('id')
    .eq('user_id', ctx.userId)
    .maybeSingle() as Result<{ id?: string } | null>;
  if (error) throw new DispatchError('MULTIPLIX_PROFILE_LOOKUP', error.message ?? 'profile lookup failed', 502);
  return typeof data?.id === 'string' ? data.id : null;
}

/** Escopo de posse resolvido no servidor (ADR-007 D1). */
export interface OwnerScope {
  /** `profiles.id` do JWT (o que `created_by` guarda), ou null se nao houver. */
  profileId: string | null;
  /** true quando o `createdBy` informado e o profile do JWT. */
  isOwner: boolean;
  /** `multiplix.dispatch.manage_all`: opera o disparo de qualquer dono. */
  manageAll: boolean;
}

/**
 * Resolve `profiles.id` + a permissao ampla nomeada. Com `createdBy` informado,
 * o dono e reconhecido SEM a RPC de permissao — `user_has_permission` so roda
 * quando o usuario NAO e o dono (mesma economia do `lifecycle.resolveScope`).
 */
export async function resolveOwnerScope(ctx: ActionContext, createdBy?: unknown): Promise<OwnerScope> {
  const profileId = await resolveProfileId(ctx);
  if (profileId !== null && profileId === createdBy) {
    return { profileId, isOwner: true, manageAll: false };
  }
  const { data: permission, error } = await ctx.supabase.rpc('user_has_permission', {
    _user_id: ctx.userId,
    _permission_name: MANAGE_ALL_PERMISSION,
  }) as Result<unknown>;
  if (error) {
    throw new DispatchError('MULTIPLIX_PERMISSION_LOOKUP', error.message ?? 'permission lookup failed', 502);
  }
  return { profileId, isOwner: false, manageAll: permission === true };
}

// ---------------------------------------------------------------------------
// F44 — ciclo do rascunho.
// ---------------------------------------------------------------------------

/** Dependencias injetaveis: o teste aponta a ponte Singu; producao usa a real. */
export interface DraftCreateDeps {
  /**
   * Fonte de resolucao do publico. Ausente = ponte Singu real sob o escopo
   * assinado do JWT. O ESCOPO em si nunca e injetavel: ele sai sempre de
   * `resolveAudienceScope(ctx)`, para o caminho de autorizacao (403) nao poder
   * ser contornado por um duble de teste.
   */
  source?: AudienceSource;
}

/**
 * O rascunho e um `dispatches` com status `draft`. A criacao usa a RPC canonica
 * do F08 (nao INSERT direto): ela e quem aplica o teto de politica (F17) e
 * devolve o resultado de forma idempotente por `client_request_id`.
 */
export async function handleDraftCreate(ctx: ActionContext, deps: DraftCreateDeps = {}): Promise<Response> {
  const parsed = DraftCreateSchema.safeParse(ctx.payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join('.') || 'payload';
    return errorResponse(
      `draft.create: payload invalido (${where}: ${issue?.message ?? 'invalido'})`,
      400,
      ctx.req,
    );
  }
  const p = parsed.data;

  try {
    // 1. AUTORIZACAO antes de qualquer resolucao ou escrita: o escopo de publico
    //    vem SEMPRE do JWT (nunca do corpo e nunca de um duble). Sem permissao
    //    de publico nao ha rascunho — 403 e nada e resolvido/chamado.
    const scope = await resolveAudienceScope(ctx);
    if (scope instanceof Response) return scope;

    // 2. Identidade: `created_by` guarda `profiles.id`, entao o id do dono sai da
    //    tabela a partir do JWT — o `auth.uid` cru nao serve (MX08).
    const profileId = await resolveProfileId(ctx);
    if (!profileId) return errorResponse('draft.create: perfil nao encontrado para o JWT', 403, ctx.req);

    // 3. Re-resolucao no Singu sob o escopo assinado: quem decide QUEM recebe,
    //    com qual destino e se e elegivel e o servidor. O cliente so escolhe
    //    empresas/contatos por id.
    const source = deps.source ?? await buildExternalAudienceSource(scope.permissions, scope.vendedorEmail);
    const resolvedRows = await source.resolveRecipients(p.company_ids, p.contact_ids);
    const eligible = mapResolvedRecipients(resolvedRows);
    if (eligible.length === 0) return errorResponse('multiplix_draft_no_eligible_recipients', 400, ctx.req);

    const { data, error } = await ctx.supabase.rpc('multiplix_create_draft', {
      p_name: p.name,
      p_template: p.message_template,
      p_recipients: eligible,
      p_client_request_id: p.client_request_id,
      p_created_by: profileId,
      p_whatsapp_connection_id: p.whatsapp_connection_id ?? null,
      p_scheduled_at: p.scheduled_at ?? null,
      p_confirm_over_limit: p.confirm_over_limit ?? false,
    });

    if (error) {
      const draftError = error.message || 'multiplix_draft_failed';
      // F17: o teto de politica e um erro NOMEADO com os numeros, nunca um 500.
      if (draftError.includes('multiplix_over_recipient_limit')) {
        const m = /count=(\d+)\s+limit=(\d+)/.exec(draftError)
          || /multiplix_over_recipient_limit:?\s*(\d+)\s+(?:acima do teto de\s+)?(\d+)/.exec(draftError);
        return jsonResponse({
          error: 'multiplix_over_recipient_limit',
          count: m ? Number(m[1]) : eligible.length,
          limit: m ? Number(m[2]) : null,
          message: 'Acima do teto de destinatarios por disparo; confirme explicitamente para seguir',
        }, 400, ctx.req);
      }
      if (draftError.includes('multiplix_draft_no_eligible_recipients')) {
        return errorResponse('multiplix_draft_no_eligible_recipients', 400, ctx.req);
      }
      if (draftError.includes('multiplix_draft_owner_not_found')) {
        return errorResponse('draft.create: perfil nao encontrado para o JWT', 403, ctx.req);
      }
      throw new DispatchError('MULTIPLIX_DRAFT_CREATE', draftError, 502);
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | { dispatch_id?: string; recipient_count?: number; created?: boolean }
      | null;
    return jsonResponse({
      data: {
        dispatch_id: row?.dispatch_id ?? null,
        recipient_count: row?.recipient_count ?? eligible.length,
        created: row?.created !== false,
      },
    }, 200, ctx.req);
  } catch (error) {
    // Mesma traducao de erros da ponte que o `audience.select`.
    if (error instanceof MultiplixPolicyLimitError) {
      return jsonResponse({
        error: MULTIPLIX_OVER_POLICY_LIMIT,
        count: error.count,
        limit: error.limit,
        message: error.message,
      }, 400, ctx.req);
    }
    if (error instanceof Error && error.message.startsWith(MULTIPLIX_RESOLVE_TRUNCATED)) {
      return jsonResponse({
        error: MULTIPLIX_RESOLVE_TRUNCATED,
        message: 'O Singu devolveu menos linhas que o solicitado; nada foi entregue pela metade',
      }, 502, ctx.req);
    }
    if (error instanceof Error && error.message === MULTIPLIX_AUDIENCE_CONFIG_INVALID) {
      return errorResponse('Multiplix audience is not configured', 503, ctx.req);
    }
    if (error instanceof DispatchError) throw error;
    const code = error instanceof Error ? error.message.split(':')[0] : 'MULTIPLIX_UNKNOWN';
    if (code === 'MULTIPLIX_TIMEOUT') return errorResponse('Singu timed out', 504, ctx.req);
    throw new DispatchError('MULTIPLIX_DRAFT_CREATE', code === 'MULTIPLIX_UNKNOWN' ? 'falha desconhecida' : code, 502);
  }
}

/** Le um rascunho do usuario — dono ou quem tem a permissao ampla. */
export async function handleDraftGet(ctx: ActionContext): Promise<Response> {
  const parsed = DraftGetSchema.safeParse(ctx.payload);
  if (!parsed.success) return errorResponse('draft.get: dispatch_id obrigatorio (uuid)', 400, ctx.req);

  // Colunas REAIS da tabela (MX08/F31): `template` e `recipient_count` NAO
  // existem — sao `message_template` e `total_recipients`. Selecionar o nome
  // errado virava 42703 do PostgREST e saia como 502 para o proprio dono.
  const { data, error } = await ctx.supabase
    .from('multiplix_dispatches')
    .select('id,name,status,message_template,whatsapp_connection_id,scheduled_at,created_by,created_at,updated_at,total_recipients,dispatch_version')
    .eq('id', parsed.data.dispatch_id)
    .maybeSingle() as Result<Record<string, unknown> | null>;

  if (error) throw new DispatchError('MULTIPLIX_DRAFT_GET', error.message ?? 'dispatch lookup failed', 502);
  const scope = await resolveOwnerScope(ctx, data?.created_by);
  // Nao revela existencia de rascunho de outro usuario: 404, nao 403.
  if (!data || !(scope.isOwner || scope.manageAll)) {
    return errorResponse('multiplix_draft_not_found', 404, ctx.req);
  }
  return jsonResponse({ data }, 200, ctx.req);
}

/**
 * Atualiza titulo, conexao e agendamento — SO em rascunho.
 *
 * O trigger `enforce_multiplix_dispatch_mutability` (Bloco A) ja bloqueia mudanca
 * fora de `draft`; aqui so traduzimos a recusa num erro nomeado em vez de deixar
 * o erro cru do Postgres vazar como 502.
 */
export async function handleDraftUpdate(ctx: ActionContext): Promise<Response> {
  const parsed = DraftUpdateSchema.safeParse(ctx.payload);
  if (!parsed.success) return errorResponse('draft.update: payload invalido', 400, ctx.req);
  const { dispatch_id, ...changes } = parsed.data;

  const patch: Record<string, unknown> = {};
  if (changes.name !== undefined) patch.name = changes.name;
  if (changes.whatsapp_connection_id !== undefined) patch.whatsapp_connection_id = changes.whatsapp_connection_id;
  if (changes.scheduled_at !== undefined) patch.scheduled_at = changes.scheduled_at;
  if (Object.keys(patch).length === 0) {
    return errorResponse('draft.update: nada para atualizar', 400, ctx.req);
  }

  const ownerId = await readOwnerId(ctx, dispatch_id, 'MULTIPLIX_DRAFT_UPDATE');
  const scope = await resolveOwnerScope(ctx, ownerId);
  if (!ownerId || !(scope.isOwner || scope.manageAll)) {
    return errorResponse('multiplix_draft_not_found', 404, ctx.req);
  }

  // Escopo no proprio WHERE, com o MESMO dono lido acima: a mutacao nao pode
  // atingir outro rascunho nem reatribuir `created_by` (o patch nunca leva o
  // campo) — quem tem `manage_all` edita sem tomar a posse.
  const { data, error } = await ctx.supabase
    .from('multiplix_dispatches')
    .update(patch)
    .eq('id', dispatch_id)
    .eq('created_by', ownerId)
    .eq('status', 'draft')
    .select('id,name,status,whatsapp_connection_id,scheduled_at,updated_at')
    .maybeSingle() as Result<Record<string, unknown> | null>;

  if (error) {
    if ((error.message ?? '').includes('multiplix_dispatch_immutable') || error.code === '23514') {
      return errorResponse('multiplix_dispatch_not_editable', 409, ctx.req);
    }
    throw new DispatchError('MULTIPLIX_DRAFT_UPDATE', error.message ?? 'update failed', 502);
  }
  if (!data) return errorResponse('multiplix_draft_not_found', 404, ctx.req);
  return jsonResponse({ data }, 200, ctx.req);
}

/** Descarta o rascunho (DELETE permitido so em `draft`; auditado na mesma transacao). */
export async function handleDraftDiscard(ctx: ActionContext): Promise<Response> {
  const parsed = DraftDiscardSchema.safeParse(ctx.payload);
  if (!parsed.success) return errorResponse('draft.discard: dispatch_id obrigatorio (uuid)', 400, ctx.req);

  const ownerId = await readOwnerId(ctx, parsed.data.dispatch_id, 'MULTIPLIX_DRAFT_DISCARD');
  const scope = await resolveOwnerScope(ctx, ownerId);
  if (!ownerId || !(scope.isOwner || scope.manageAll)) {
    return errorResponse('multiplix_draft_not_found', 404, ctx.req);
  }

  const { data, error } = await ctx.supabase
    .from('multiplix_dispatches')
    .delete()
    .eq('id', parsed.data.dispatch_id)
    .eq('created_by', ownerId)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle() as Result<Record<string, unknown> | null>;

  if (error) {
    if (error.code === '23503' || (error.message ?? '').includes('multiplix')) {
      return errorResponse('multiplix_dispatch_not_discardable', 409, ctx.req);
    }
    throw new DispatchError('MULTIPLIX_DRAFT_DISCARD', error.message ?? 'discard failed', 502);
  }
  if (!data) return errorResponse('multiplix_draft_not_found', 404, ctx.req);
  return jsonResponse({ data: { dispatch_id: parsed.data.dispatch_id, discarded: true } }, 200, ctx.req);
}

/**
 * Le o dono (`created_by`) de um rascunho. Falha de BANCO nao pode virar 404:
 * um erro do SELECT sobe como DispatchError 502, igual ao `draft.get` — antes ele
 * era ignorado e o `data` nulo virava "nao encontrado" (404 falso).
 */
async function readOwnerId(ctx: ActionContext, dispatchId: string, code: string): Promise<string | null> {
  const { data, error } = await ctx.supabase
    .from('multiplix_dispatches')
    .select('created_by')
    .eq('id', dispatchId)
    .maybeSingle() as Result<{ created_by?: string } | null>;
  if (error) throw new DispatchError(code, error.message ?? 'owner lookup failed', 502);
  return typeof data?.created_by === 'string' ? data.created_by : null;
}

// ---------------------------------------------------------------------------
// Roteamento.
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, Handler> = {
  // F44
  'draft.create': handleDraftCreate,
  'draft.get': handleDraftGet,
  'draft.update': handleDraftUpdate,
  'draft.discard': handleDraftDiscard,
  // F45
  'blocks.upsert': handleBlocksUpsert,
  'blocks.delete': handleBlocksDelete,
  'blocks.reorder': handleBlocksReorder,
  // F46/F47
  'audience.select': handleAudienceSelect,
  // F48/F49/F50
  'preview': handlePreview,
  'validate': handleValidate,
  'eligibility.summary': handleEligibilitySummary,
  'estimate': handleEstimate,
  // F51/F52
  'confirm': handleConfirm,
  'status': handleStatus,
  // Leitura de listagem: dono do disparo OU `multiplix.dispatch.manage_all`.
  'dispatch.list': handleDispatchList,
  'recipients.list': handleRecipientsList,
};

/** Nenhuma acao do Bloco E fica pendente apos a ligacao acima. */
export const PENDING_ACTIONS = [] as const;

export async function handleMultiplixDispatchRequest(
  req: Request,
  _injected?: { supabase?: SupabaseClient; serviceKey?: string; now?: () => number },
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const correlationId = newCorrelationId();
  const started = performance.now();
  let action = 'unknown';
  let userId = 'anonymous';

  try {
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    userId = auth.userId;

    // F53 (parcial): teto por usuario na entrada. A cota por CONEXAO entra junto
    // com as acoes de audiencia; aqui ja corta rajada de rascunho.
    // `enforceRateLimit` devolve a DECISAO (nao uma Response): quem monta o 429 e
    // esta edge, com o `Retry-After` que o plano exige.
    const limit = await enforceRateLimit(`multiplix-dispatch:${userId}`, 60, 60_000);
    if (!limit.allowed) {
      const res = jsonResponse({
        error: 'rate_limited',
        message: 'Muitas requisicoes; tente de novo em instantes',
        remaining: 0,
      }, 429, req);
      res.headers.set('Retry-After', '60');
      return res;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse('JSON invalido', 400, req);
    }
    const envelope = z.object({ action: z.string().min(1).max(64), payload: z.record(z.unknown()).default({}) })
      .safeParse(body);
    if (!envelope.success) return errorResponse('Esperado { action, payload }', 400, req);
    action = envelope.data.action;
    const payload = envelope.data.payload as Record<string, unknown>;

    const supabase = _injected?.supabase ??
      createClient(requireEnv('SUPABASE_URL'), _injected?.serviceKey ?? requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

    const handler = HANDLERS[action];
    if (!handler) {
      if ((PENDING_ACTIONS as readonly string[]).includes(action)) {
        return jsonResponse({
          error: 'multiplix_action_not_implemented',
          action,
          message: 'Acao do Bloco E ainda nao ligada nesta etapa',
        }, 501, req);
      }
      return errorResponse(`Action is not allowed: ${action}`, 400, req);
    }

    const response = await handler({ action, payload, userId, supabase, correlationId, req });
    const duration = Math.round(performance.now() - started);
    console.warn(JSON.stringify({
      event: 'multiplix_dispatch', action, user_id: userId, correlation_id: correlationId,
      duration_ms: duration, status: response.status, ip: getClientIP(req), ok: response.ok,
    }));
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (error) {
    const code = error instanceof DispatchError ? error.code : 'MULTIPLIX_DISPATCH_UNKNOWN';
    const status = error instanceof DispatchError ? error.status : 502;
    console.error(JSON.stringify({
      event: 'multiplix_dispatch', action, user_id: userId, correlation_id: correlationId,
      code, ok: false,
    }));
    return errorResponse(code, status, req);
  }
}

if (import.meta.main) Deno.serve((req) => handleMultiplixDispatchRequest(req));
