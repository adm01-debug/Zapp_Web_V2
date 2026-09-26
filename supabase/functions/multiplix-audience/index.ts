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

const RequestSchema = z.object({
  action: z.enum(['list_ramos', 'list_ufs', 'search', 'count', 'resolve']),
  params: z.record(z.unknown()).optional().default({}),
});

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
