/**
 * BLOCO E — F46 (`audience.select`) + F47 ("selecionar todos os N").
 *
 * Esta acao e o UNICO ponto onde o publico de um disparo e montado. O front so
 * manda a INTENCAO (selecao manual, publicos aplicados, filtros, exclusoes e o
 * modo "contato principal por empresa"); o conjunto final
 *
 *     (manual ∪ publicos aplicados) ∩ filtros − exclusoes
 *
 * e calculado AQUI, no servidor, e so entao resolvido pela MESMA ponte Singu do
 * F27 (`multiplix_resolve_recipients`, em lotes de 1.000). Nada de conjunto
 * montado no navegador — era isso que deixava o cliente decidir quem recebe.
 *
 * Regras que este modulo garante (e que os testes provam com dubles):
 *
 *   F46 — EXCLUSAO VENCE INCLUSAO. A exclusao e aplicada depois da uniao e
 *         depois do resolve; reaplicar um publico que contem um excluido NAO o
 *         traz de volta (a exclusao e reaplicada no fim, nao guardada no
 *         conjunto de entrada).
 *   F46 — modo "contato principal por empresa": quando ligado, o resultado tem
 *         NO MAXIMO 1 destinatario por empresa. Quando a ponte devolve mais de
 *         um candidato para a mesma empresa e NENHUM traz o dado de primazia
 *         (`contact_phones.is_primary` / `contacts.role`), a resposta SINALIZA
 *         (`primary_not_determinable`) em vez de inventar um principal ou
 *         descartar os outros em silencio.
 *   F47 — "selecionar todos os N": materializa via `count` + `resolve` paginado
 *         (a mesma reparticao de F27). O UNICO teto e o de POLITICA
 *         (`RESOLVE_POLICY_MAX_IDS`, o `over_policy_limit` de F17/F47), sempre
 *         NOMEADO com `{count, limit}` — nunca truncamento, nunca 500 generico.
 *
 * Fronteira PT→EN: a ponte continua devolvendo a elegibilidade em portugues e a
 * traducao passa SO por `fromSinguEligibility` (mesma regra do resto do
 * Multiplix) — nenhum literal PT vaza para a resposta.
 *
 * A ponte e o escopo sao injetaveis (`AudienceSelectDeps`) para o teste rodar
 * SEM rede: em producao o escopo vem do JWT (canonico) e a fonte e a MESMA
 * credencial/assinatura HMAC da edge `multiplix-audience` — nenhuma ponte nova.
 */

import { z } from 'https://esm.sh/zod@3.23.8';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';
import { errorResponse, jsonResponse, requireEnv } from '../../_shared/validation.ts';
import { isExpectedExternalServerKey, isExpectedExternalUrl } from '../../_shared/crm-integration-contract.ts';
import { fromSinguEligibility } from '../../_shared/multiplix-eligibility.ts';
import {
  MULTIPLIX_OVER_POLICY_LIMIT,
  MULTIPLIX_RESOLVE_TRUNCATED,
  MultiplixPolicyLimitError,
  RESOLVE_POLICY_MAX_IDS,
  RESOLVE_REQUEST_MAX_IDS,
  resolveRecipientsInBatches,
  signScope,
} from '../../multiplix-audience/index.ts';
import type { ActionContext } from '../index.ts';

export type { ActionContext } from '../index.ts';

/**
 * Reexporta o teto de POLITICA e o seu erro nomeado da edge irma: o
 * `over_policy_limit` de F47 e o MESMO conceito do F27 — reusa a constante e o
 * erro em vez de cunhar um limite paralelo que poderia divergir.
 */
export {
  MULTIPLIX_OVER_POLICY_LIMIT,
  MultiplixPolicyLimitError,
  RESOLVE_POLICY_MAX_IDS,
} from '../../multiplix-audience/index.ts';

/** Erro nomeado de falha interna: nunca deixa o 500 generico do runtime. */
export const MULTIPLIX_AUDIENCE_SELECT_FAILED = 'multiplix_audience_select_failed';

/** Erro nomeado de configuracao da ponte (mesma credencial do F27). */
export const MULTIPLIX_AUDIENCE_CONFIG_INVALID = 'multiplix_audience_config_invalid';

/** Codigo do sinal "nao deu para eleger o principal por empresa". */
export const AUDIENCE_SIGNAL_PRIMARY_NOT_DETERMINABLE = 'primary_not_determinable';

/** Codigo do sinal "mais de um candidato marcado como principal" (conflito). */
export const AUDIENCE_SIGNAL_PRIMARY_CONFLICT = 'primary_conflict';

const TIMEOUT_MS = 12_000;

// ---------------------------------------------------------------------------
// Contrato de entrada.
// ---------------------------------------------------------------------------

export type AudienceFilterRole = 'cliente' | 'fornecedor' | 'transportadora';

export interface AudienceFilters {
  roles?: AudienceFilterRole[];
  ramo?: string;
  uf?: string;
  search?: string;
}

export interface AudienceIdSet {
  company_ids: string[];
  contact_ids: string[];
}

const UUID = z.string().uuid();
const UuidArray = z.array(UUID).max(RESOLVE_REQUEST_MAX_IDS);

const IdSetSchema = z.object({
  company_ids: UuidArray.optional().default([]),
  contact_ids: UuidArray.optional().default([]),
});

const AudienceFiltersSchema = z.object({
  roles: z.array(z.enum(['cliente', 'fornecedor', 'transportadora'])).max(3).optional(),
  ramo: z.string().max(200).optional(),
  uf: z.string().length(2).optional(),
  search: z.string().max(200).optional(),
});

// "Publico aplicado": ou um conjunto de ids ja materializado (o front manda os
// ids da selecao salva) ou um conjunto de FILTROS que o servidor materializa
// aqui mesmo via `multiplix_search_audience` — nos dois casos a expansao e
// server-side.
const PublicSchema = IdSetSchema.extend({ filters: AudienceFiltersSchema.optional() });

const AudienceSelectSchema = z.object({
  manual: IdSetSchema.optional(),
  publics: z.array(PublicSchema).max(50).optional().default([]),
  filters: AudienceFiltersSchema.optional(),
  exclude: IdSetSchema.optional(),
  primary_per_company: z.boolean().optional().default(false),
  select_all: z.boolean().optional().default(false),
});

// ---------------------------------------------------------------------------
// Fonte de publico (a ponte Singu, injetavel).
// ---------------------------------------------------------------------------

export interface FilteredAudience {
  /** Todos os company_ids que casam com os filtros, ja paginados. */
  companyIds: string[];
  /** N do servidor (`multiplix_count_audience`). Pode ser > companyIds.length. */
  count: number;
}

export interface AudienceSource {
  /** Materializa TODOS os company_ids que casam com os filtros, paginado. */
  listFilteredCompanyIds(filters: AudienceFilters, opts?: { max?: number }): Promise<FilteredAudience>;
  /** Resolve ids em destinatarios pela MESMA ponte/credenciais do F27. */
  resolveRecipients(companyIds: string[], contactIds: string[]): Promise<Array<Record<string, unknown>>>;
}

/** Escopo derivado do JWT (nunca do corpo). Injetavel no teste. */
export interface AudienceScope {
  permissions: string[];
  vendedorEmail: string | null;
}

export interface AudienceSelectDeps {
  scope?: AudienceScope;
  source?: AudienceSource;
  /** Teto de politica (teste injeta um menor). Default: RESOLVE_POLICY_MAX_IDS. */
  policyMaxIds?: number;
}

export interface AudiencePrimarySignal {
  code: string;
  company_id: string;
  candidates: number;
  detail: string;
}

// ---------------------------------------------------------------------------
// Logica pura (testavel isoladamente).
// ---------------------------------------------------------------------------

/** Ha algum filtro efetivo? `{}` nao conta como filtro. */
export function hasAnyFilter(filters: AudienceFilters | undefined): boolean {
  if (!filters) return false;
  if (Array.isArray(filters.roles) && filters.roles.length > 0) return true;
  for (const value of [filters.ramo, filters.uf, filters.search]) {
    if (typeof value === 'string' && value.trim() !== '') return true;
  }
  return false;
}

/** Ids de empresa/contato de um conjunto, sem duplicata. */
function idSet(companyIds: Iterable<string>, contactIds: Iterable<string>): AudienceIdSet {
  return { company_ids: [...new Set(companyIds)], contact_ids: [...new Set(contactIds)] };
}

/**
 * Uniao dos conjuntos que ENTRAM na selecao (manual + publicos aplicados). Sem
 * exclusao aqui: a exclusao entra DEPOIS, para nao ser "resgatada" por uma
 * reaplicacao de publico.
 */
export function unionCandidates(sets: AudienceIdSet[]): AudienceIdSet {
  const company = new Set<string>();
  const contact = new Set<string>();
  for (const set of sets) {
    for (const id of set.company_ids) company.add(id);
    for (const id of set.contact_ids) contact.add(id);
  }
  return idSet(company, contact);
}

/** Aplica as exclusoes (company_id OU contact_id vencem a inclusao). */
export function applyExclusions(set: AudienceIdSet, exclude: AudienceIdSet): AudienceIdSet {
  const excludedCompanies = new Set(exclude.company_ids);
  const excludedContacts = new Set(exclude.contact_ids);
  return idSet(
    set.company_ids.filter((id) => !excludedCompanies.has(id)),
    set.contact_ids.filter((id) => !excludedContacts.has(id)),
  );
}

/** Uma linha resolvida esta excluida? (defesa pos-resolve) */
export function isRowExcluded(
  row: Record<string, unknown>,
  excludedCompanies: ReadonlySet<string>,
  excludedContacts: ReadonlySet<string>,
): boolean {
  const company = row?.company_id == null ? null : String(row.company_id);
  const contact = row?.contact_id == null ? null : String(row.contact_id);
  return (company !== null && excludedCompanies.has(company)) ||
    (contact !== null && excludedContacts.has(contact));
}

function hasPrimaryFlag(row: Record<string, unknown>): boolean {
  return row?.contact_phone_is_primary === true;
}

function contactRoleOf(row: Record<string, unknown>): string | null {
  const role = row?.contact_role;
  return typeof role === 'string' && role.trim() !== '' ? role.trim() : null;
}

/**
 * Modo "contato principal por empresa": no MAXIMO 1 destinatario por empresa.
 *
 * A primazia vem do dado da propria linha (`contact_phone_is_primary`, de
 * `contact_phones.is_primary`; `contact_role`, de `contacts.role`) — a MESMA
 * fonte que o E060/E014 usa na ponte. Quando ha mais de um candidato para a
 * mesma empresa:
 *   - exatamente um marcado como primario -> ele fica;
 *   - mais de um marcado -> conflito e SINALIZA (`primary_conflict`);
 *   - exatamente um com `role` nao vazio -> ele fica;
 *   - nenhum dado -> escolhe de forma deterministica (o primeiro) e SINALIZA
 *     (`primary_not_determinable`). NUNCA inventa um principal nem descarta os
 *     outros em silencio: quem decidiu foi o dado, nao uma suposicao.
 *
 * Empresa com candidato unico nao sinaliza: nao ha o que escolher (1 por
 * empresa ja vale) — sinalizar toda linha seria ruido, nao informacao.
 */
export function selectPrimaryPerCompany(rows: Array<Record<string, unknown>>): {
  recipients: Array<Record<string, unknown>>;
  signals: AudiencePrimarySignal[];
} {
  const groups = new Map<string, Array<Record<string, unknown>>>();
  const order: string[] = [];
  for (const row of rows) {
    const key = row?.company_id == null ? '' : String(row.company_id);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(row);
  }

  const recipients: Array<Record<string, unknown>> = [];
  const signals: AudiencePrimarySignal[] = [];

  for (const key of order) {
    const group = groups.get(key)!;
    if (group.length === 1) {
      recipients.push(group[0]);
      continue;
    }
    const flagged = group.filter(hasPrimaryFlag);
    if (flagged.length === 1) {
      recipients.push(flagged[0]);
      continue;
    }
    if (flagged.length > 1) {
      recipients.push(flagged[0]);
      signals.push({
        code: AUDIENCE_SIGNAL_PRIMARY_CONFLICT,
        company_id: key,
        candidates: flagged.length,
        detail: `${flagged.length} candidatos marcados como principal; mantido o primeiro`,
      });
      continue;
    }
    const withRole = group.filter((row) => contactRoleOf(row) !== null);
    if (withRole.length === 1) {
      recipients.push(withRole[0]);
      continue;
    }
    recipients.push(withRole[0] ?? group[0]);
    signals.push({
      code: AUDIENCE_SIGNAL_PRIMARY_NOT_DETERMINABLE,
      company_id: key,
      candidates: group.length,
      detail: `${group.length} candidatos sem dado de primazia (telefone principal/role); mantido o primeiro`,
    });
  }

  return { recipients, signals };
}

// ---------------------------------------------------------------------------
// Escopo (JWT) + fonte Singu real (mesma credencial/assinatura do F27).
// ---------------------------------------------------------------------------

async function userHasPermission(ctx: ActionContext, permission: string): Promise<boolean> {
  const { data, error } = await ctx.supabase.rpc('user_has_permission', {
    _user_id: ctx.userId,
    _permission_name: permission,
  });
  return !error && data === true;
}

/**
 * Escopo resolvido no SERVIDOR a partir do JWT ja validado (ADR-007 D1): o
 * corpo nunca manda `p_scope_permissions`. Mesma matriz da edge irma
 * `multiplix-audience`, para as duas nao divergirem.
 */
export async function resolveAudienceScope(ctx: ActionContext): Promise<AudienceScope | Response> {
  const [isAdmin, hasAdminScope, hasSuppliers, hasCarriers, hasCustomersAll, hasCustomersOwn] = await Promise.all([
    ctx.supabase.rpc('is_admin', { _user_id: ctx.userId }).then((r) => !r.error && r.data === true),
    userHasPermission(ctx, 'multiplix.audience.admin'),
    userHasPermission(ctx, 'multiplix.audience.suppliers'),
    userHasPermission(ctx, 'multiplix.audience.carriers'),
    userHasPermission(ctx, 'multiplix.audience.customers.all'),
    userHasPermission(ctx, 'multiplix.audience.customers.own'),
  ]);

  const permissions: string[] = [];
  if (isAdmin || hasAdminScope) {
    permissions.push('admin');
  } else {
    if (hasSuppliers) permissions.push('suppliers');
    if (hasCarriers) permissions.push('carriers');
    if (hasCustomersAll) permissions.push('customers_all');
    if (hasCustomersOwn) permissions.push('customers_own');
  }
  if (permissions.length === 0) {
    return errorResponse('Sem permissão para acessar o público do Multiplix', 403, ctx.req);
  }

  let vendedorEmail: string | null = null;
  if (permissions.includes('customers_own')) {
    const { data } = await ctx.supabase.auth.admin.getUserById(ctx.userId);
    vendedorEmail = data?.user?.email ?? null;
  }
  return { permissions, vendedorEmail };
}

async function withTimeout<T>(operation: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('MULTIPLIX_TIMEOUT')), TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const SEARCH_PAGE_SIZE = 200;

/**
 * F47 — materializacao PAGINADA de "todos os N": pergunta o `count` ao servidor
 * e so entao pagina a busca (page_size fixo) ate juntar TODOS os company_ids.
 * Extraido do cliente real para virar testavel sem rede.
 *
 * Regras (as mesmas do F27, que resolve em lotes):
 *   - `count` > teto de politica NAO paga o preco de paginar: devolve a
 *     contagem e nenhum id, para o handler errar NOMEADO (`over_policy_limit`);
 *   - a paginacao para quando a pagina vem vazia ou curta (fim real da lista) —
 *     nunca por um teto silencioso.
 */
export async function materializeFilteredCompanyIds(
  fetchCount: () => Promise<number>,
  fetchPage: (page: number, pageSize: number) => Promise<Array<Record<string, unknown>>>,
  opts?: { max?: number; pageSize?: number },
): Promise<FilteredAudience> {
  const max = opts?.max ?? RESOLVE_POLICY_MAX_IDS;
  const pageSize = opts?.pageSize ?? SEARCH_PAGE_SIZE;
  const total = await fetchCount();
  if (!Number.isFinite(total) || total < 0) throw new Error('MULTIPLIX_RPC:count');
  if (total > max) return { companyIds: [], count: total };

  const companyIds: string[] = [];
  for (let page = 0; companyIds.length < total; page++) {
    const rows = await fetchPage(page, pageSize);
    if (rows.length === 0) break;
    for (const row of rows) {
      const id = row?.company_id;
      if (typeof id === 'string' && id !== '') companyIds.push(id);
    }
    if (rows.length < pageSize) break;
  }
  return { companyIds, count: total };
}

/**
 * Fonte real: MESMA ponte/credenciais da edge `multiplix-audience` — os secrets
 * EXTERNAL_SUPABASE_URL / EXTERNAL_SUPABASE_SERVICE_ROLE_KEY e a assinatura
 * HMAC do escopo (`MULTIPLIX_SCOPE_HMAC_SECRET`), em cabecalho, pelo mesmo
 * motivo do F22 (parametro novo quebra o PostgREST via PGRST202).
 */
export async function buildExternalAudienceSource(
  scopePermissions: string[],
  vendedorEmail: string | null,
): Promise<AudienceSource> {
  const externalUrl = requireEnv('EXTERNAL_SUPABASE_URL');
  const externalKey = requireEnv('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
  if (!isExpectedExternalUrl(externalUrl) || !isExpectedExternalServerKey(externalKey)) {
    throw new Error(MULTIPLIX_AUDIENCE_CONFIG_INVALID);
  }
  const scopeSecret = Deno.env.get('MULTIPLIX_SCOPE_HMAC_SECRET');
  if (!scopeSecret) throw new Error(MULTIPLIX_AUDIENCE_CONFIG_INVALID);

  const { hmac, exp } = await signScope(scopePermissions, vendedorEmail, scopeSecret);
  const externalClient = createClient(externalUrl, externalKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }),
      headers: { 'x-multiplix-scope-hmac': hmac, 'x-multiplix-scope-exp': String(exp) },
    },
  });

  const scopeArgs = (filters: AudienceFilters) => ({
    p_roles: filters.roles ?? null,
    p_ramo: filters.ramo ?? null,
    p_uf: filters.uf ?? null,
    p_search: filters.search ?? null,
    p_scope_permissions: scopePermissions,
    p_scope_vendedor_email: vendedorEmail,
  });

  return {
    async listFilteredCompanyIds(filters, opts) {
      const max = opts?.max ?? RESOLVE_POLICY_MAX_IDS;
      return await materializeFilteredCompanyIds(
        async () => {
          const countResult = await withTimeout(externalClient.rpc('multiplix_count_audience', scopeArgs(filters)));
          if (countResult.error) {
            const code = (countResult.error as { code?: string } | null)?.code;
            throw new Error(`MULTIPLIX_RPC:${code || 'unknown'}`);
          }
          return Number(countResult.data ?? 0);
        },
        async (page, pageSize) => {
          const result = await withTimeout(
            externalClient.rpc('multiplix_search_audience', {
              ...scopeArgs(filters),
              p_page: page,
              p_page_size: pageSize,
            }),
          );
          if (result.error) {
            const code = (result.error as { code?: string } | null)?.code;
            throw new Error(`MULTIPLIX_RPC:${code || 'unknown'}`);
          }
          return Array.isArray(result.data) ? result.data as Array<Record<string, unknown>> : [];
        },
        { max },
      );
    },

    resolveRecipients(companyIds, contactIds) {
      return resolveRecipientsInBatches(companyIds, contactIds, (batch) =>
        externalClient.rpc('multiplix_resolve_recipients', {
          p_company_ids: batch.company_ids,
          p_contact_ids: batch.contact_ids,
          p_scope_permissions: scopePermissions,
          p_scope_vendedor_email: vendedorEmail,
        }, { count: 'exact' }));
    },
  };
}

// ---------------------------------------------------------------------------
// Handler.
// ---------------------------------------------------------------------------

export async function handleAudienceSelect(
  ctx: ActionContext,
  deps: AudienceSelectDeps = {},
): Promise<Response> {
  const started = performance.now();

  const parsed = AudienceSelectSchema.safeParse(ctx.payload);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join('.') ?? 'payload';
    return errorResponse(`audience.select: payload inválido (${where})`, 400, ctx.req);
  }
  const p = parsed.data;

  try {
    // 1. Escopo do JWT (ou injetado no teste).
    let scope = deps.scope;
    if (!scope) {
      const resolved = await resolveAudienceScope(ctx);
      if (resolved instanceof Response) return resolved;
      scope = resolved;
    }

    const policyMax = deps.policyMaxIds ?? RESOLVE_POLICY_MAX_IDS;
    const source = deps.source ?? await buildExternalAudienceSource(scope.permissions, scope.vendedorEmail);

    const filters = p.filters;
    const filtersActive = hasAnyFilter(filters);

    // 2. Filtros materializados no SERVIDOR: o conjunto de empresas que casam.
    let filterSet: Set<string> | null = null;
    let materialized: string[] = [];
    let reportedCount: number | null = null;
    if (filtersActive) {
      const expanded = await source.listFilteredCompanyIds(filters!, { max: policyMax });
      reportedCount = expanded.count;
      // F47: o teto de politica e conferido AQUI, antes de qualquer resolve —
      // erro NOMEADO, nada de materializar o que vai ser recusado.
      if (expanded.count > policyMax) throw new MultiplixPolicyLimitError(expanded.count, policyMax);
      filterSet = new Set(expanded.companyIds);
      materialized = [...expanded.companyIds];
    } else if (p.select_all) {
      return errorResponse('audience.select: select_all exige filtros', 400, ctx.req);
    }

    // 3. (manual ∪ publicos aplicados). Publicos podem vir por id ou por filtro
    //    (que este servidor materializa).
    const unionSets: AudienceIdSet[] = [];
    if (p.manual) unionSets.push({ company_ids: p.manual.company_ids, contact_ids: p.manual.contact_ids });
    for (const pub of p.publics) {
      unionSets.push({ company_ids: pub.company_ids, contact_ids: pub.contact_ids });
      if (hasAnyFilter(pub.filters)) {
        const expanded = await source.listFilteredCompanyIds(pub.filters!, { max: policyMax });
        if (expanded.count > policyMax) throw new MultiplixPolicyLimitError(expanded.count, policyMax);
        unionSets.push({ company_ids: expanded.companyIds, contact_ids: [] });
      }
    }
    const union = unionCandidates(unionSets);

    // 4. ∩ filtros (nivel empresa; contato e filtrado pos-resolve pela empresa).
    const candidateCompanies = new Set<string>(
      filterSet ? union.company_ids.filter((id) => filterSet!.has(id)) : union.company_ids,
    );
    if (p.select_all) for (const id of materialized) candidateCompanies.add(id);
    const candidateContacts = new Set<string>(union.contact_ids);

    // 5. − exclusoes ANTES da ponte (economiza resolve) e de novo depois (defesa).
    const excludedCompanies = new Set(p.exclude?.company_ids ?? []);
    const excludedContacts = new Set(p.exclude?.contact_ids ?? []);
    const requestCompanies = [...candidateCompanies].filter((id) => !excludedCompanies.has(id));
    const requestContacts = [...candidateContacts].filter((id) => !excludedContacts.has(id));

    // 6. Teto de politica sobre o que a ponte vai de fato resolver.
    const totalRequested = requestCompanies.length + requestContacts.length;
    if (totalRequested > policyMax) throw new MultiplixPolicyLimitError(totalRequested, policyMax);

    // 7. Resolve pela MESMA ponte do F27 (lotes de 1.000, count=exact).
    let rows = await source.resolveRecipients(requestCompanies, requestContacts);

    // 8. Pos-resolve: ∩ filtros (por empresa) + − exclusoes.
    let droppedOutOfFilter = 0;
    if (filterSet) {
      const before = rows.length;
      rows = rows.filter((row) => filterSet!.has(String(row?.company_id)));
      droppedOutOfFilter = before - rows.length;
    }
    const beforeExclusion = rows.length;
    rows = rows.filter((row) => !isRowExcluded(row, excludedCompanies, excludedContacts));
    const excludedRemoved = beforeExclusion - rows.length;

    // 9. Fronteira PT→EN da elegibilidade (unico ponto de traducao).
    rows = rows.map((row) => ({ ...row, elegibilidade: fromSinguEligibility(row?.elegibilidade) }));

    // 10. F46: modo "contato principal por empresa".
    let signals: AudiencePrimarySignal[] = [];
    if (p.primary_per_company) {
      const selected = selectPrimaryPerCompany(rows);
      rows = selected.recipients;
      signals = selected.signals;
    }

    const duration = Math.round(performance.now() - started);
    console.warn(JSON.stringify({
      event: 'multiplix_dispatch', action: 'audience.select', user_id: ctx.userId,
      correlation_id: ctx.correlationId, scope: scope.permissions, count: reportedCount,
      recipients: rows.length, signals: signals.length, duration_ms: duration, ok: true,
    }));

    return jsonResponse({
      data: {
        recipients: rows,
        total: rows.length,
        count: reportedCount ?? rows.length,
        policy_limit: policyMax,
        primary_per_company: p.primary_per_company,
        select_all: p.select_all,
        signals,
        dropped_out_of_filter: droppedOutOfFilter,
        excluded_removed: excludedRemoved,
      },
      meta: { correlation_id: ctx.correlationId, duration_ms: duration },
    }, 200, ctx.req);
  } catch (error) {
    if (error instanceof MultiplixPolicyLimitError) {
      console.warn(JSON.stringify({
        event: 'multiplix_dispatch', action: 'audience.select', user_id: ctx.userId,
        correlation_id: ctx.correlationId, code: MULTIPLIX_OVER_POLICY_LIMIT,
        count: error.count, limit: error.limit, ok: false,
      }));
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
    // Nunca 500 generico: falha interna vira NOMEADA (com correlation_id no header).
    const code = error instanceof Error ? error.message.split(':')[0] : 'unknown';
    console.error(JSON.stringify({
      event: 'multiplix_dispatch', action: 'audience.select', user_id: ctx.userId,
      correlation_id: ctx.correlationId, code, ok: false,
    }));
    return jsonResponse({
      error: MULTIPLIX_AUDIENCE_SELECT_FAILED,
      message: 'audience.select falhou no servidor',
    }, 502, ctx.req);
  }
}
