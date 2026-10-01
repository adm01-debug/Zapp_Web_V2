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

// F26 (Bloco B): ramos e ufs mudam pouco e o seletor de audiencia os pede a
// cada abertura. Cache por isolate (Map + TTL de 5 min), um Map por conjunto —
// sem Redis/DB: dados de ate 5 min de idade saem mais baratos que um round-trip
// ao Singu em cada request. Erro da RPC NUNCA entra no cache (nao envenena o
// isolate apos um timeout/solucao momentanea).
export const AUDIENCE_CACHE_TTL_MS = 5 * 60_000;

type AudienceListKind = 'ramos' | 'ufs';

interface AudienceListCacheEntry {
  data: unknown;
  expiresAt: number;
}

const audienceListCache: Record<AudienceListKind, Map<string, AudienceListCacheEntry>> = {
  ramos: new Map(),
  ufs: new Map(),
};

// Serve a lista do cache enquanto ela nao vence; senao consulta a RPC e guarda
// o resultado. Devolve junto o rotulo do header x-cache (HIT = veio do Map,
// MISS = a RPC foi chamada). O relogio vem de _injected.now (teste) ou Date.now.
export async function fetchAudienceList(
  kind: AudienceListKind,
  rpcName: string,
  callRpc: () => PromiseLike<{ data: unknown; error: unknown }>,
  _injected?: { now?: () => number },
): Promise<{ data: unknown; cache: 'HIT' | 'MISS' }> {
  const now = _injected?.now?.() ?? Date.now();
  const cached = audienceListCache[kind].get(rpcName);
  if (cached && now < cached.expiresAt) return { data: cached.data, cache: 'HIT' };

  const result = await withTimeout(callRpc());
  if (result.error) {
    const code = (result.error as { code?: string } | null)?.code;
    throw new Error(`MULTIPLIX_RPC:${code || 'unknown'}`);
  }
  audienceListCache[kind].set(rpcName, { data: result.data, expiresAt: now + AUDIENCE_CACHE_TTL_MS });
  return { data: result.data, cache: 'MISS' };
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

// ---------------------------------------------------------------------------
// F27 (Bloco B): resolve em lotes de 1.000, sem teto silencioso.
//
// O teto NAO esta no SQL da RPC. O espelho de F21
// (supabase/migrations/_foreign/singu/multiplix_resolve_recipients.sql) nao tem
// LIMIT na entrada. O teto esta na camada REST do Singu: o PostgREST de
// pgxfvjmuubtbowutlide corta a RESPOSTA em 1.000 linhas e devolve sucesso com o
// resto descartado, sem erro nenhum. Medido em 2026-10-01 contra o Singu real
// (evidencia bruta em .tmp/medicao-f27/):
//
//   1000 ids -> 1.000 linhas, "0-999/1000"   (nada descartado)
//   1200 ids -> 1.000 linhas, "0-999/1200"   (200 descartados EM SILENCIO)
//   2000 ids -> 1.000 linhas, "0-999/2000"   (1.000 descartados)
//   5001 ids -> 1.000 linhas, "0-999/5001"   (4.001 descartados)
//  10000 ids -> 1.000 linhas, "0-999/10000"  (9.000 descartados)
//
// (o 206 e o HTTP de resposta parcial do PostgREST; sem `Prefer: count=exact` o
//  mesmo caso devolve 200 e `content-range: 0-999/*`, sem pista do descarte.)
//
// A defesa tem duas partes:
//   1. fatiar por no maximo 1.000 ids *somando* company_ids e contact_ids — a
//      RPC devolve UMA linha por empresa DISTINCT (alvo = UNION dos dois
//      arrays, ver multiplix_resolve_recipients.sql:18-26,43), entao um lote de
//      1.000 ids nunca chega a 1.001 linhas e nao pode ser cortado;
//   2. pedir `count: 'exact'` em cada lote e recusar a resposta quando
//      `data.length < count` — se o max-rows do Singu mudar (foi o caso aqui)
//      vira erro nomeado em vez de resultado pela metade.
// ---------------------------------------------------------------------------

/** Linhas que o PostgREST do Singu devolve por chamada. Medido: 1.000 (2026-10-01). */
export const RESOLVE_RPC_MAX_ROWS = 1_000;

/** Teto de POLITICA de um pedido de resolve (F17/F47): acima disso, erro nomeado. */
export const RESOLVE_POLICY_MAX_IDS = 10_000;

/**
 * Guarda de TRANSPORTE (Zod), maior que o teto de politica de proposito: ate o
 * teto de politica o pedido e aceito e repartido; acima dele (ate esta guarda) a
 * resposta e o erro NOMEADO `multiplix_over_policy_limit`; so acima daqui o
 * corpo e recusado antes de qualquer trabalho (~20k uuids ≈ 760 KB).
 */
export const RESOLVE_REQUEST_MAX_IDS = 20_000;

/** Erro nomeado do teto de politica (o `over_policy_limit` de F47). */
export const MULTIPLIX_OVER_POLICY_LIMIT = 'multiplix_over_policy_limit';

/** Erro nomeado de resposta parcial: nunca devolver meia lista em silencio. */
export const MULTIPLIX_RESOLVE_TRUNCATED = 'multiplix_resolve_truncated';

export class MultiplixPolicyLimitError extends Error {
  readonly count: number;
  readonly limit: number;

  constructor(count: number, limit: number) {
    super(`${MULTIPLIX_OVER_POLICY_LIMIT}: ${count} ids acima do teto de politica de ${limit}`);
    this.name = 'MultiplixPolicyLimitError';
    this.count = count;
    this.limit = limit;
  }
}

export interface ResolveBatch {
  company_ids: string[];
  contact_ids: string[];
}

export interface ResolveBatchResult {
  data: unknown;
  error: unknown;
  /** Total de linhas do lote, lido do header content-range (Prefer: count=exact). */
  count?: number | null;
}

/**
 * Reparte os ids recebidos em lotes de no maximo `batchSize` ids somando
 * company_ids e contact_ids. A soma dos ids dos lotes e exatamente o total
 * recebido: nada e deduplicado nem descartado aqui. Acima do teto de politica
 * lanca MultiplixPolicyLimitError em vez de cortar a lista.
 */
export function planResolveBatches(
  companyIds: string[],
  contactIds: string[],
  _injected?: { batchSize?: number; policyMaxIds?: number },
): ResolveBatch[] {
  const batchSize = _injected?.batchSize ?? RESOLVE_RPC_MAX_ROWS;
  const policyMaxIds = _injected?.policyMaxIds ?? RESOLVE_POLICY_MAX_IDS;
  const total = companyIds.length + contactIds.length;
  if (total > policyMaxIds) throw new MultiplixPolicyLimitError(total, policyMaxIds);

  const ordered: Array<[string | null, string | null]> = [
    ...companyIds.map((id) => [id, null] as [string | null, string | null]),
    ...contactIds.map((id) => [null, id] as [string | null, string | null]),
  ];

  const batches: ResolveBatch[] = [];
  for (let i = 0; i < ordered.length; i += batchSize) {
    const slice = ordered.slice(i, i + batchSize);
    batches.push({
      company_ids: slice.filter(([company]) => company !== null).map(([company]) => company as string),
      contact_ids: slice.filter(([, contact]) => contact !== null).map(([, contact]) => contact as string),
    });
  }
  return batches;
}

/**
 * F22 — assinatura do escopo que vai para as RPCs do Singu.
 *
 * As RPCs de audiencia recebem o escopo por parametro (`p_scope_permissions`).
 * Enquanto o unico chamador era a service key, quem tivesse a
 * EXTERNAL_SUPABASE_SERVICE_ROLE_KEY podia pedir `['admin']` e ler o publico
 * inteiro do Singu. A partir do F22 a RPC so aceita escopo acompanhado de
 * assinatura HMAC valida e dentro do prazo — a chave fica so nas edges do Zapp
 * (env) e no vault do Singu, nunca com quem chama.
 *
 * Contrato (v1) — os dois lados precisam ser identicos:
 *   payload   = `v1|<permissoes ordenadas asc, unidas por ",">|<email ou "">|<exp>`
 *   assinatura = HMAC-SHA256(payload, MULTIPLIX_SCOPE_HMAC_SECRET) em hex
 */
export const SCOPE_SIGNATURE_VERSION = 'v1';
export const SCOPE_SIGNATURE_TTL_SECONDS = 300;

export function scopeSignaturePayload(
  permissions: string[],
  vendedorEmail: string | null,
  exp: number,
): string {
  return `${SCOPE_SIGNATURE_VERSION}|${[...permissions].sort().join(',')}|${vendedorEmail ?? ''}|${exp}`;
}

export async function signScope(
  permissions: string[],
  vendedorEmail: string | null,
  secret: string,
  nowMs: number = Date.now(),
): Promise<{ hmac: string; exp: number }> {
  const exp = Math.floor(nowMs / 1000) + SCOPE_SIGNATURE_TTL_SECONDS;
  const payload = scopeSignaturePayload(permissions, vendedorEmail, exp);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const hmac = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return { hmac, exp };
}

/**
 * Chama multiplix_resolve_recipients uma vez por lote e concatena as linhas na
 * ordem dos ids. Erro da RPC e resposta parcial nunca voltam como dado: os dois
 * viram excecao (o handler traduz em 4xx/5xx nomeado). Meia lista de
 * destinatarios e pior que um erro — e era exatamente o que o teto silencioso
 * produzia.
 */
export async function resolveRecipientsInBatches(
  companyIds: string[],
  contactIds: string[],
  callBatch: (batch: ResolveBatch) => PromiseLike<ResolveBatchResult>,
  _injected?: { batchSize?: number; policyMaxIds?: number },
): Promise<Array<Record<string, unknown>>> {
  const batches = planResolveBatches(companyIds, contactIds, _injected);
  const rows: Array<Record<string, unknown>> = [];
  for (const batch of batches) {
    const result = await withTimeout(callBatch(batch));
    if (result.error) {
      const code = (result.error as { code?: string } | null)?.code;
      throw new Error(`MULTIPLIX_RPC:${code || 'unknown'}`);
    }
    const batchRows = Array.isArray(result.data) ? result.data as Array<Record<string, unknown>> : [];
    const expected = batch.company_ids.length + batch.contact_ids.length;
    // count vem do content-range quando a chamada manda Prefer: count=exact.
    if (typeof result.count === 'number' && batchRows.length < result.count) {
      throw new Error(`${MULTIPLIX_RESOLVE_TRUNCATED}: lote devolveu ${batchRows.length} de ${result.count} linhas`);
    }
    if (batchRows.length > expected) {
      throw new Error(`${MULTIPLIX_RESOLVE_TRUNCATED}: lote devolveu ${batchRows.length} linhas para ${expected} ids`);
    }
    rows.push(...batchRows);
  }
  return rows;
}

const ResolveParamsSchema = z.object({
  company_ids: z.array(z.string().uuid()).max(RESOLVE_REQUEST_MAX_IDS).default([]),
  contact_ids: z.array(z.string().uuid()).max(RESOLVE_REQUEST_MAX_IDS).default([]),
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
  company_ids: z.array(z.string().uuid()).max(RESOLVE_REQUEST_MAX_IDS).default([]),
  contact_ids: z.array(z.string().uuid()).max(RESOLVE_REQUEST_MAX_IDS).default([]),
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

export interface MultiplixAudienceInjected {
  /** Relogio injetavel (F26): o teste controla o TTL sem esperar 5 min reais. */
  now?: () => number;
}

export async function handleMultiplixAudienceRequest(
  req: Request,
  _injected?: MultiplixAudienceInjected,
): Promise<Response> {
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

  // F22: o escopo e assinado UMA vez por requisicao — as quatro chamadas ao
  // Singu levam a mesma assinatura/prazo. Sem o secret na env a edge NAO
  // segue: falha antes de chamar (fail-closed), porque a RPC ja recusa escopo
  // sem assinatura. Assinar "de qualquer jeito" so trocaria o erro de 500 por
  // um 401 vindo do Singu.
  const scopeSecret = Deno.env.get('MULTIPLIX_SCOPE_HMAC_SECRET');
  if (!scopeSecret) {
    return errorResponse('multiplix_scope_secret_ausente', 500, req);
  }
  const { hmac: scopeHmac, exp: scopeExp } = await signScope(
    scopePermissions, vendedorEmail, scopeSecret,
  );
  // F22: a assinatura viaja em CABECALHO, nunca em parametro. Acrescentar
  // p_scope_hmac/p_scope_exp muda a assinatura da funcao, e o PostgREST casa a
  // chamada pelo conjunto de nomes do corpo: medido, a chamada com um parametro
  // que a funcao nao tem devolve 404 PGRST202. Com parametro, publicar esta edge
  // antes do guard derrubaria TODAS as chamadas do Multiplix. Com cabecalho a
  // RPC antiga simplesmente ignora, o guard novo valida, e a ordem de deploy
  // deixa de ser critica.
  const scopeHeaders = {
    'x-multiplix-scope-hmac': scopeHmac,
    'x-multiplix-scope-exp': String(scopeExp),
  };

  // O cliente do Singu carrega a assinatura em cabecalho GLOBAL do cliente: a
  // API do supabase-js NAO aceita headers por chamada de rpc() — o terceiro
  // argumento so aceita head/get/count (verificado pelo deno check), e passar
  // `headers` ali nao compila. O PostgREST manda os headers globais ao Singu, e
  // as RPCs sem escopo (list_ramos/list_ufs) simplesmente ignoram o cabecalho.
  const externalClient = createClient(externalUrl, externalKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }),
      headers: scopeHeaders,
    },
  });

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
  // F26: so list_ramos/list_ufs tem cache; as demais acoes ficam com o header
  // ausente (null nao vira header).
  let cacheStatus: 'HIT' | 'MISS' | null = null;

  try {
    let data: unknown;

    if (action === 'list_ramos') {
      const result = await fetchAudienceList(
        'ramos', 'multiplix_list_ramos', () => externalClient.rpc('multiplix_list_ramos'), _injected,
      );
      data = result.data;
      cacheStatus = result.cache;
    } else if (action === 'list_ufs') {
      const result = await fetchAudienceList(
        'ufs', 'multiplix_list_ufs', () => externalClient.rpc('multiplix_list_ufs'), _injected,
      );
      data = result.data;
      cacheStatus = result.cache;
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
      // F27: o pedido pode ter ate RESOLVE_POLICY_MAX_IDS ids; a edge fatia em
      // lotes de 1.000 (teto medido do PostgREST) e concatena na mesma resposta.
      data = await resolveRecipientsInBatches(
        p.company_ids,
        p.contact_ids,
        (batch) => externalClient.rpc('multiplix_resolve_recipients', {
          p_company_ids: batch.company_ids,
          p_contact_ids: batch.contact_ids,
          p_scope_permissions: scopePermissions,
          p_scope_vendedor_email: vendedorEmail,
        }, { count: 'exact' }),
      );
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
      // servidor (o cliente so escolhe as empresas/contatos). Mesmo caminho em
      // lotes de F27 — sem ele, um publico > 1.000 sairia truncado em silencio.
      const resolvedRows = await resolveRecipientsInBatches(
        p.company_ids,
        p.contact_ids,
        (batch) => externalClient.rpc('multiplix_resolve_recipients', {
          p_company_ids: batch.company_ids,
          p_contact_ids: batch.contact_ids,
          p_scope_permissions: scopePermissions,
          p_scope_vendedor_email: vendedorEmail,
        }, { count: 'exact' }),
      );
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
      event: 'multiplix_audience', action, user_id: userId, scope: scopePermissions, duration_ms: duration,
      cache: cacheStatus, ok: true,
    }));
    const response = jsonResponse({
      data,
      meta: { record_count: Array.isArray(data) ? data.length : data == null ? 0 : 1, duration_ms: duration },
    }, 200, req);
    // F26: HIT|MISS so nas respostas que serviram ramos/ufs; o log acima registra
    // o segundo request em 5 min como cache HIT sem novo round-trip ao Singu.
    if (cacheStatus) response.headers.set('x-cache', cacheStatus);
    return response;
  } catch (error) {
    // F27: o teto de POLITICA nao trunca — responde 400 com o codigo nomeado,
    // o numero real e o teto, do mesmo jeito que o teto de destinatarios de F17
    // (multiplix_over_recipient_limit) faz em create_draft.
    if (error instanceof MultiplixPolicyLimitError) {
      console.warn(JSON.stringify({
        event: 'multiplix_audience', action, user_id: userId, code: MULTIPLIX_OVER_POLICY_LIMIT,
        count: error.count, limit: error.limit, ok: false,
      }));
      return jsonResponse({
        error: MULTIPLIX_OVER_POLICY_LIMIT,
        count: error.count,
        limit: error.limit,
        message: error.message,
      }, 400, req);
    }
    // F27: resposta parcial do Singu nunca vira dado — vira erro nomeado.
    if (error instanceof Error && error.message.startsWith(MULTIPLIX_RESOLVE_TRUNCATED)) {
      console.error(JSON.stringify({
        event: 'multiplix_audience', action, user_id: userId, code: MULTIPLIX_RESOLVE_TRUNCATED, ok: false,
      }));
      return jsonResponse({
        error: MULTIPLIX_RESOLVE_TRUNCATED,
        message: 'O Singu devolveu menos linhas que o solicitado; nada foi entregue pela metade',
      }, 502, req);
    }
    const code = error instanceof Error ? error.message.split(':')[0] : 'MULTIPLIX_UNKNOWN';
    const status = code === 'MULTIPLIX_TIMEOUT' ? 504 : 502;
    console.error(JSON.stringify({ event: 'multiplix_audience', action, user_id: userId, code, ok: false }));
    return errorResponse(code === 'MULTIPLIX_TIMEOUT' ? 'Singu timed out' : 'Singu request failed', status, req);
  }
}

if (import.meta.main) Deno.serve((req) => handleMultiplixAudienceRequest(req));
