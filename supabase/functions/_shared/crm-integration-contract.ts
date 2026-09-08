export const CRM_RPC_ALLOWLIST = new Set([
  'get_companies_by_phones_batch',
  'get_contact_360_by_phone',
  'get_contact_intelligence_by_phone',
  'search_contacts_advanced',
]);

export const CRM_TABLE_ALLOWLIST = new Set([
  'companies', 'contacts', 'customers', 'contact_phones', 'contact_emails',
  'contact_social_media', 'contact_addresses', 'company_social_media',
  'company_addresses', 'company_rfm_scores', 'company_phones', 'company_emails',
  'salespeople', 'sales', 'sales_activities', 'suppliers', 'carriers',
  'achievements', 'daily_challenges', 'weekly_challenges', 'interactions',
  'orders', 'order_items', 'products', 'leads', 'pipelines', 'pipeline_stages',
  'deals', 'deal_products', 'quotations', 'quotation_items', 'tasks', 'notes',
  'tags', 'company_tags', 'contact_tags_ext', 'payment_conditions',
  'price_tables', 'regions', 'segments',
]);

export const FILTER_OPERATORS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in']);
export const EXPECTED_EXTERNAL_PROJECT_REF = 'pgxfvjmuubtbowutlide';
export const MUTABLE_FIELDS: Record<string, ReadonlySet<string>> = {
  companies: new Set([
    'nome_fantasia', 'razao_social', 'cnpj', 'inscricao_estadual', 'website',
    'ramo_atividade', 'status', 'nicho_cliente', 'porte_rf',
    'natureza_juridica_desc', 'capital_social', 'data_fundacao',
  ]),
  contacts: new Set([
    'first_name', 'last_name', 'full_name', 'nome_tratamento', 'apelido',
    'cargo', 'departamento', 'cpf', 'data_nascimento', 'sexo',
    'relationship_stage', 'relationship_score', 'sentiment', 'source', 'notes',
    'assinatura_contato',
  ]),
};

export function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z_][a-z0-9_]*$/i.test(value);
}

export function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const phone = value.replace(/\D/g, '');
  return phone.length >= 8 && phone.length <= 15 ? phone : null;
}

export function isExpectedExternalUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === `${EXPECTED_EXTERNAL_PROJECT_REF}.supabase.co` && url.pathname === '/';
  } catch {
    return false;
  }
}

export function isExpectedExternalAnonKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const payload = JSON.parse(atob(normalized));
    return payload?.ref === EXPECTED_EXTERNAL_PROJECT_REF && payload?.role === 'anon';
  } catch {
    return false;
  }
}

export function validateMutation(table: unknown, action: unknown, data: unknown, match: unknown): string | null {
  if (action !== 'insert' && action !== 'update') return 'Mutation action is not allowed';
  if (typeof table !== 'string' || !MUTABLE_FIELDS[table]) return 'Table is not mutable';
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Mutation data is invalid';
  const fields = Object.keys(data as Record<string, unknown>);
  if (fields.length === 0 || fields.some((field) => !MUTABLE_FIELDS[table].has(field))) return 'Mutation field is not allowed';
  const values = Object.values(data as Record<string, unknown>);
  if (values.some((value) =>
    value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean'
  )) return 'Mutation value is invalid';
  if (values.some((value) => typeof value === 'string' && value.length > 5000)) return 'Mutation value is too long';
  if (JSON.stringify(data).length > 20_000) return 'Mutation data is too large';
  if (action === 'update') {
    if (!match || typeof match !== 'object' || Array.isArray(match)) return 'Update match is required';
    const entries = Object.entries(match as Record<string, unknown>);
    if (entries.length !== 1 || entries[0][0] !== 'id' || typeof entries[0][1] !== 'string' ||
      entries[0][1].length < 1 || entries[0][1].length > 200) return 'Update must match one id';
  }
  return null;
}

export function validateRpc(rpc: unknown, params: unknown): string | null {
  if (typeof rpc !== 'string' || !CRM_RPC_ALLOWLIST.has(rpc)) return 'RPC is not allowed';
  if (!params || typeof params !== 'object' || Array.isArray(params)) return 'RPC params are invalid';
  const p = params as Record<string, unknown>;
  const allowedParams: Record<string, ReadonlySet<string>> = {
    get_companies_by_phones_batch: new Set(['p_phones']),
    get_contact_360_by_phone: new Set(['p_phone']),
    get_contact_intelligence_by_phone: new Set(['p_phone']),
    search_contacts_advanced: new Set([
      'p_search', 'p_vendedor', 'p_ramo', 'p_rfm_segment', 'p_estado',
      'p_cliente_ativado', 'p_ja_comprou', 'p_sort_by', 'p_page', 'p_page_size',
    ]),
  };
  if (Object.keys(p).some((key) => !allowedParams[rpc].has(key))) return 'RPC param is not allowed';
  if (rpc === 'get_companies_by_phones_batch') {
    if (!Array.isArray(p.p_phones) || p.p_phones.length < 1 || p.p_phones.length > 100 || p.p_phones.some((phone) => !normalizePhone(phone))) return 'Phone batch is invalid';
  }
  if ((rpc === 'get_contact_360_by_phone' || rpc === 'get_contact_intelligence_by_phone') && !normalizePhone(p.p_phone)) return 'Phone is invalid';
  if (rpc === 'search_contacts_advanced') {
    const page = p.p_page ?? 0;
    const size = p.p_page_size ?? 25;
    if (!Number.isInteger(page) || Number(page) < 0 || !Number.isInteger(size) || Number(size) < 1 || Number(size) > 200) return 'Search pagination is invalid';
    if (typeof p.p_search === 'string' && p.p_search.length > 200) return 'Search term is too long';
    for (const key of ['p_vendedor', 'p_ramo', 'p_rfm_segment', 'p_estado']) {
      if (p[key] !== undefined && p[key] !== null && (typeof p[key] !== 'string' || p[key].length > 200)) return 'Search filter is invalid';
    }
    if (p.p_sort_by !== undefined && p.p_sort_by !== null &&
      (typeof p.p_sort_by !== 'string' || !['relevance', 'name', 'recent', 'relationship_score'].includes(p.p_sort_by))) return 'Search sort is invalid';
    for (const key of ['p_cliente_ativado', 'p_ja_comprou']) {
      if (p[key] !== undefined && p[key] !== null && typeof p[key] !== 'boolean') return 'Search boolean is invalid';
    }
  }
  return null;
}
