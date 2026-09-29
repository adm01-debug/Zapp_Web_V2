import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';
import { z } from 'https://esm.sh/zod@3.23.8';
import {
  enforceRateLimit, errorResponse, getClientIP, handleCors, jsonResponse, requireAuth, requireEnv,
} from '../_shared/validation.ts';
import { isExpectedExternalServerKey, isExpectedExternalUrl } from '../_shared/crm-integration-contract.ts';

// Ponte Singu do Multiplix (ADR-007 D1 / docs/multiplix/PERMISSOES.md). Reusa os
// mesmos secrets EXTERNAL_SUPABASE_URL/EXTERNAL_SUPABASE_SERVICE_ROLE_KEY do
// crm-integration — mesmo projeto Singu (pgxfvjmuubtbowutlide), sem duplicar
// credencial sob outro nome.
const TIMEOUT_MS = 12_000;

async function withTimeout<T>(operation: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error('MULTIPLIX_TIMEOUT')), TIMEOUT_MS); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const AudienceRole = z.enum(['cliente', 'fornecedor', 'transportadora']);

const FiltersSchema = z.object({
  roles: z.array(AudienceRole).max(3).optional(),
  ramo: z.string().max(200).optional(),
  uf: z.string().length(2).optional(),
  search: z.string().max(200).optional(),
});

const SearchParamsSchema = FiltersSchema.extend({
  page: z.number().int().min(0).max(100_000).default(0),
  page_size: z.number().int().min(1).max(200).default(50),
});

const ResolveParamsSchema = z.object({
  company_ids: z.array(z.string().uuid()).max(500).default([]),
  contact_ids: z.array(z.string().uuid()).max(500).default([]),
}).refine((v) => v.company_ids.length > 0 || v.contact_ids.length > 0, {
  message: 'Informe ao menos um company_id ou contact_id',
});

// F08 (Bloco A): a criacao do disparo sai do navegador. O front manda os
// company_ids/contact_ids selecionados; a re-resolucao acontece AQUI, no
// servidor, com o escopo do JWT ja validado, e o resultado vira a chamada da
// RPC transacional multiplix_create_draft (dispatch + destinatarios numa
// transacao, idempotente por client_request_id).
const CreateDraftParamsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  message_template: z.string().min(1).max(65_536),
  company_ids: z.array(z.string().uuid()).max(500).default([]),
  contact_ids: z.array(z.string().uuid()).max(500).default([]),
  client_request_id: z.string().uuid(),
  whatsapp_connection_id: z.string().uuid().nullish(),
  scheduled_at: z.string().datetime({ offset: true }).nullish(),
  confirm_over_limit: z.boolean().optional().default(false),
}).refine((v) => v.company_ids.length > 0 || v.contact_ids.length > 0, {
  message: 'Informe ao menos um company_id ou contact_id',
});

const RequestSchema = z.object({
  action: z.enum(['list_ramos', 'list_ufs', 'search', 'count', 'resolve', 'create_draft']),
  params: z.record(z.unknown()).optional().default({}),
});

export interface MultiplixDraftRecipient {
  company_id: string;
  company_name: string | null;
  destino_e164: string | null;
  destino_origem: string | null;
  elegibilidade: string | null;
}

// Converte a resposta de multiplix_resolve_recipients no que a RPC
// multiplix_create_draft aceita. So entra quem o servidor classificou como
// 'apto' e quem tem company_id: linha marcada como fora de escopo/invalida
// nunca vira destinatario (era isso que o composer decidia no navegador e que
// o navegador podia ignorar).
export function mapResolvedRecipients(rows: Array<Record<string, unknown>>): MultiplixDraftRecipient[] {
  return rows
    .filter((row) => String(row?.elegibilidade ?? 'apto') === 'apto' && Boolean(row?.company_id))
    .map((row) => ({
      company_id: String(row.company_id),
      company_name: row.company_name == null ? null : String(row.company_name),
      destino_e164: row.destino_e164 == null ? null : String(row.destino_e164),
      destino_origem: row.destino_origem == null ? null : String(row.destino_origem),
      elegibilidade: row.elegibilidade == null ? null : String(row.elegibilidade),
    }));
}

export async function handleMultiplixAudienceRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);

  let supabaseUrl: string;
  let serviceKey: string;
  try {
    supabaseUrl = requireEnv('SUPABASE_URL');
    serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  } catch {
    return errorResponse('Multiplix audience is not configured', 503, req);
  }

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const rate = await enforceRateLimit(`multiplix-audience:${userId}:${getClientIP(req)}`, 60, 60_000);
  if (!rate.allowed) return errorResponse('Rate limit exceeded', 429, req);

  let externalUrl: string;
  let externalKey: string;
  try {
    externalUrl = requireEnv('EXTERNAL_SUPABASE_URL');
    externalKey = requireEnv('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
  } catch {
    return errorResponse('Multiplix audience is not configured', 503, req);
  }
  if (!isExpectedExternalUrl(externalUrl) || !isExpectedExternalServerKey(externalKey)) {
    return errorResponse('External audience configuration is invalid', 503, req);
  }

  const canonical = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const externalClient = createClient(externalUrl, externalKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }) },
  });

  // Escopo resolvido no servidor a partir do JWT ja validado por requireAuth —
  // o front nunca manda p_scope_permissions (ADR-007 D1). multiplix.audience.*
  // ainda nao existe no catalogo de permissions (E015, proposta em
  // PERMISSOES.md): ate essa migration ser decidida, so is_admin() abre escopo
  // (comportamento seguro por padrao, ver PERMISSOES.md).
  const userHasPermission = async (permission: string): Promise<boolean> => {
    const { data, error } = await canonical.rpc('user_has_permission', {
      _user_id: userId, _permission_name: permission,
    });
    return !error && data === true;
  };

  const [isAdmin, hasAdminScope, hasSuppliers, hasCarriers, hasCustomersAll, hasCustomersOwn] = await Promise.all([
    canonical.rpc('is_admin', { _user_id: userId }).then((r) => !r.error && r.data === true),
    userHasPermission('multiplix.audience.admin'),
    userHasPermission('multiplix.audience.suppliers'),
    userHasPermission('multiplix.audience.carriers'),
    userHasPermission('multiplix.audience.customers.all'),
    userHasPermission('multiplix.audience.customers.own'),
  ]);

  const scopePermissions: string[] = [];
  if (isAdmin || hasAdminScope) {
    scopePermissions.push('admin');
  } else {
    if (hasSuppliers) scopePermissions.push('suppliers');
    if (hasCarriers) scopePermissions.push('carriers');
    if (hasCustomersAll) scopePermissions.push('customers_all');
    if (hasCustomersOwn) scopePermissions.push('customers_own');
  }
  if (scopePermissions.length === 0) return errorResponse('Sem permissão para acessar o público do Multiplix', 403, req);

  let vendedorEmail: string | null = null;
  if (scopePermissions.includes('customers_own')) {
    const { data: authUser } = await canonical.auth.admin.getUserById(userId);
    vendedorEmail = authUser?.user?.email ?? null;
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }
  const parsed = RequestSchema.safeParse(rawBody);
  if (!parsed.success) return errorResponse('Invalid request', 400, req);
  const { action, params } = parsed.data;
  const started = performance.now();

  try {
    let data: unknown;

    if (action === 'list_ramos') {
      const result = await withTimeout(externalClient.rpc('multiplix_list_ramos'));
      if (result.error) throw new Error(`MULTIPLIX_RPC:${result.error.code || 'unknown'}`);
      data = result.data;
    } else if (action === 'list_ufs') {
      const result = await withTimeout(externalClient.rpc('multiplix_list_ufs'));
      if (result.error) throw new Error(`MULTIPLIX_RPC:${result.error.code || 'unknown'}`);
      data = result.data;
    } else if (action === 'search') {
      const filters = SearchParamsSchema.safeParse(params);
      if (!filters.success) return errorResponse('Invalid search parameters', 400, req);
      const f = filters.data;
      const result = await withTimeout(externalClient.rpc('multiplix_search_audience', {
        p_roles: f.roles ?? null,
        p_ramo: f.ramo ?? null,
        p_uf: f.uf ?? null,
        p_search: f.search ?? null,
        p_scope_permissions: scopePermissions,
        p_scope_vendedor_email: vendedorEmail,
        p_page: f.page,
        p_page_size: f.page_size,
      }));
      if (result.error) throw new Error(`MULTIPLIX_RPC:${result.error.code || 'unknown'}`);
      data = result.data;
    } else if (action === 'count') {
      const filters = FiltersSchema.safeParse(params);
      if (!filters.success) return errorResponse('Invalid search parameters', 400, req);
      const f = filters.data;
      const result = await withTimeout(externalClient.rpc('multiplix_count_audience', {
        p_roles: f.roles ?? null,
        p_ramo: f.ramo ?? null,
        p_uf: f.uf ?? null,
        p_search: f.search ?? null,
        p_scope_permissions: scopePermissions,
        p_scope_vendedor_email: vendedorEmail,
      }));
      if (result.error) throw new Error(`MULTIPLIX_RPC:${result.error.code || 'unknown'}`);
      data = result.data;
    } else if (action === 'resolve') {
      const resolveParams = ResolveParamsSchema.safeParse(params);
      if (!resolveParams.success) return errorResponse('Invalid resolve parameters', 400, req);
      const p = resolveParams.data;
      const result = await withTimeout(externalClient.rpc('multiplix_resolve_recipients', {
        p_company_ids: p.company_ids,
        p_contact_ids: p.contact_ids,
        p_scope_permissions: scopePermissions,
        p_scope_vendedor_email: vendedorEmail,
      }));
      if (result.error) throw new Error(`MULTIPLIX_RPC:${result.error.code || 'unknown'}`);
      data = result.data;
    } else if (action === 'create_draft') {
      const draftParams = CreateDraftParamsSchema.safeParse(params);
      if (!draftParams.success) return errorResponse('Invalid create_draft parameters', 400, req);
      const p = draftParams.data;

      // Quem cria precisa existir em profiles: multiplix_create_draft exige
      // created_by = profiles.id, e esse id vem do JWT — nunca do corpo.
      const { data: profileRow, error: profileLookupError } = await canonical
        .from('profiles').select('id').eq('user_id', userId).maybeSingle();
      if (profileLookupError) throw new Error(`MULTIPLIX_PROFILE_LOOKUP:${profileLookupError.code || 'unknown'}`);
      if (!profileRow?.id) return errorResponse('Perfil não encontrado para criar disparo', 403, req);

      // Re-resolucao no Singu com o escopo do JWT: quem decide quem recebe e o
      // servidor (o cliente so escolhe as empresas/contatos).
      const resolved = await withTimeout(externalClient.rpc('multiplix_resolve_recipients', {
        p_company_ids: p.company_ids,
        p_contact_ids: p.contact_ids,
        p_scope_permissions: scopePermissions,
        p_scope_vendedor_email: vendedorEmail,
      }));
      if (resolved.error) throw new Error(`MULTIPLIX_RPC:${resolved.error.code || 'unknown'}`);

      const resolvedRows = Array.isArray(resolved.data) ? resolved.data as Array<Record<string, unknown>> : [];
      const eligible = mapResolvedRecipients(resolvedRows);
      if (eligible.length === 0) return errorResponse('multiplix_draft_no_eligible_recipients', 400, req);

      const draft = await canonical.rpc('multiplix_create_draft', {
        p_name: p.name,
        p_template: p.message_template,
        p_recipients: eligible,
        p_client_request_id: p.client_request_id,
        p_created_by: profileRow.id,
        p_whatsapp_connection_id: p.whatsapp_connection_id ?? null,
        p_scheduled_at: p.scheduled_at ?? null,
        p_confirm_over_limit: p.confirm_over_limit ?? false,
      });
      if (draft.error) {
        const draftError = draft.error.message || 'multiplix_draft_failed';
        // Teto de destinatarios (F17): o composer confirma o numero real e
        // reenvia com confirm_over_limit — por isso o corpo estruturado.
        if (draftError.includes('multiplix_over_recipient_limit')) {
          const parsed = /multiplix_over_recipient_limit:\s*(\d+)\s+acima do teto de\s+(\d+)/.exec(draftError);
          return jsonResponse({
            error: 'multiplix_over_recipient_limit',
            count: parsed ? Number(parsed[1]) : eligible.length,
            limit: parsed ? Number(parsed[2]) : null,
            message: draftError,
          }, 400, req);
        }
        if (draftError.includes('multiplix_draft_no_eligible_recipients')) {
          return errorResponse('multiplix_draft_no_eligible_recipients', 400, req);
        }
        throw new Error(`MULTIPLIX_DRAFT:${draftError}`);
      }

      const created = (Array.isArray(draft.data) ? draft.data[0] : draft.data) as
        | { dispatch_id?: string; recipient_count?: number; created?: boolean }
        | null;
      data = {
        dispatch_id: created?.dispatch_id ?? null,
        recipient_count: created?.recipient_count ?? eligible.length,
        created: created?.created !== false,
      };
    } else {
      return errorResponse('Action is not allowed', 400, req);
    }

    const duration = Math.round(performance.now() - started);
    console.warn(JSON.stringify({
      event: 'multiplix_audience', action, user_id: userId, scope: scopePermissions, duration_ms: duration, ok: true,
    }));
    return jsonResponse({
      data,
      meta: { record_count: Array.isArray(data) ? data.length : data == null ? 0 : 1, duration_ms: duration },
    }, 200, req);
  } catch (error) {
    const code = error instanceof Error ? error.message.split(':')[0] : 'MULTIPLIX_UNKNOWN';
    const status = code === 'MULTIPLIX_TIMEOUT' ? 504 : 502;
    console.error(JSON.stringify({ event: 'multiplix_audience', action, user_id: userId, code, ok: false }));
    return errorResponse(code === 'MULTIPLIX_TIMEOUT' ? 'Singu timed out' : 'Singu request failed', status, req);
  }
}

if (import.meta.main) Deno.serve(handleMultiplixAudienceRequest);
