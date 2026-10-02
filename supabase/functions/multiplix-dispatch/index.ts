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
import { handleBlocksDelete, handleBlocksReorder, handleBlocksUpsert } from './actions/blocks.ts';
import { handleAudienceSelect } from './actions/audience.ts';
import { handleEligibilitySummary, handleEstimate, handlePreview, handleValidate } from './actions/inspect.ts';
import { handleConfirm, handleStatus } from './actions/lifecycle.ts';

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

const DraftCreateSchema = z.object({
  name: z.string().min(1).max(200),
  template: z.string().min(1).max(20_000),
  recipients: z.array(z.record(z.unknown())).min(1),
  client_request_id: z.string().uuid(),
  whatsapp_connection_id: z.string().uuid().nullish(),
  scheduled_at: z.string().datetime().nullish(),
  confirm_over_limit: z.boolean().optional(),
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
// F44 — ciclo do rascunho.
// ---------------------------------------------------------------------------

/**
 * O rascunho e um `dispatches` com status `draft`. A criacao usa a RPC canonica
 * do F08 (nao INSERT direto): ela e quem aplica o teto de politica (F17) e
 * devolve o resultado de forma idempotente por `client_request_id`.
 */
async function handleDraftCreate(ctx: ActionContext): Promise<Response> {
  const parsed = DraftCreateSchema.safeParse(ctx.payload);
  if (!parsed.success) {
    return errorResponse(`draft.create: payload invalido (${parsed.error.issues[0]?.path.join('.')})`, 400, ctx.req);
  }
  const p = parsed.data;

  const { data, error } = await ctx.supabase.rpc('multiplix_create_draft', {
    p_name: p.name,
    p_template: p.template,
    p_recipients: p.recipients,
    p_client_request_id: p.client_request_id,
    p_created_by: ctx.userId,
    p_whatsapp_connection_id: p.whatsapp_connection_id ?? null,
    p_scheduled_at: p.scheduled_at ?? null,
    p_confirm_over_limit: p.confirm_over_limit ?? false,
  });

  if (error) {
    // F17: o teto de politica e um erro NOMEADO com os numeros, nunca um 500.
    if (error.message.includes('multiplix_over_recipient_limit')) {
      const m = /count=(\d+)\s+limit=(\d+)/.exec(error.message);
      return jsonResponse({
        error: 'multiplix_over_recipient_limit',
        count: m ? Number(m[1]) : null,
        limit: m ? Number(m[2]) : null,
        message: 'Acima do teto de destinatarios por disparo; confirme explicitamente para seguir',
      }, 400, ctx.req);
    }
    if (error.message.includes('multiplix_draft_no_eligible_recipients')) {
      return errorResponse('multiplix_draft_no_eligible_recipients', 400, ctx.req);
    }
    throw new DispatchError('MULTIPLIX_DRAFT_CREATE', error.message, 502);
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { dispatch_id?: string; recipient_count?: number; created?: boolean }
    | null;
  return jsonResponse({
    data: {
      dispatch_id: row?.dispatch_id ?? null,
      recipient_count: row?.recipient_count ?? null,
      created: row?.created !== false,
    },
  }, 200, ctx.req);
}

/** Le um rascunho do usuario — dono ou quem tem a permissao ampla. */
async function handleDraftGet(ctx: ActionContext): Promise<Response> {
  const parsed = DraftGetSchema.safeParse(ctx.payload);
  if (!parsed.success) return errorResponse('draft.get: dispatch_id obrigatorio (uuid)', 400, ctx.req);

  const { data, error } = await ctx.supabase
    .from('multiplix_dispatches')
    .select('id,name,status,template,whatsapp_connection_id,scheduled_at,created_by,created_at,updated_at,recipient_count')
    .eq('id', parsed.data.dispatch_id)
    .maybeSingle();

  if (error) throw new DispatchError('MULTIPLIX_DRAFT_GET', error.message, 502);
  // Nao revela existencia de rascunho de outro usuario: 404, nao 403.
  if (!data || data.created_by !== ctx.userId) {
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
async function handleDraftUpdate(ctx: ActionContext): Promise<Response> {
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

  const { data, error } = await ctx.supabase
    .from('multiplix_dispatches')
    .update(patch)
    .eq('id', dispatch_id)
    .eq('created_by', ctx.userId) // escopo no proprio WHERE: nao depende da policy
    .eq('status', 'draft')
    .select('id,name,status,whatsapp_connection_id,scheduled_at,updated_at')
    .maybeSingle();

  if (error) {
    if (error.message.includes('multiplix_dispatch_immutable') || error.code === '23514') {
      return errorResponse('multiplix_dispatch_not_editable', 409, ctx.req);
    }
    throw new DispatchError('MULTIPLIX_DRAFT_UPDATE', error.message, 502);
  }
  if (!data) return errorResponse('multiplix_draft_not_found', 404, ctx.req);
  return jsonResponse({ data }, 200, ctx.req);
}

/** Descarta o rascunho (DELETE permitido so em `draft`; auditado na mesma transacao). */
async function handleDraftDiscard(ctx: ActionContext): Promise<Response> {
  const parsed = DraftDiscardSchema.safeParse(ctx.payload);
  if (!parsed.success) return errorResponse('draft.discard: dispatch_id obrigatorio (uuid)', 400, ctx.req);

  const { data, error } = await ctx.supabase
    .from('multiplix_dispatches')
    .delete()
    .eq('id', parsed.data.dispatch_id)
    .eq('created_by', ctx.userId)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.code === '23503' || error.message.includes('multiplix')) {
      return errorResponse('multiplix_dispatch_not_discardable', 409, ctx.req);
    }
    throw new DispatchError('MULTIPLIX_DRAFT_DISCARD', error.message, 502);
  }
  if (!data) return errorResponse('multiplix_draft_not_found', 404, ctx.req);
  return jsonResponse({ data: { dispatch_id: parsed.data.dispatch_id, discarded: true } }, 200, ctx.req);
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
