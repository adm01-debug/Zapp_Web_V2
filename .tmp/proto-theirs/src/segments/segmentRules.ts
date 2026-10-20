/**
 * X104 — Regras de segmento v2 (tipos, normalização, descrição legível).
 *
 * Módulo standalone: NÃO importa o hook de segmentos em runtime — rótulos e kinds são cópia local da fonte canônica, para não
 * criar dependência circular (o hook nunca importa este arquivo).
 *
 * O formato v2 usa `field: string` e `value` tipado (texto, número, lista,
 * intervalo `{from,to}` ou booleano). Regras v1 (`value` sempre string,
 * `field` às vezes em formato objeto `{value,...}`) entram via `normalizeRules`.
 */

export type SegmentFieldKind = 'text' | 'array' | 'number' | 'date' | 'enum' | 'uuid';

export interface SegmentFieldDef {
  value: string;
  label: string;
  kind: SegmentFieldKind;
  comingSoon?: boolean;
}

/**
 * Cópia local dos rótulos/kinds canônicos do hook. O hook continua sendo a
 * fonte usada pela tela; esta cópia serve só para normalizar e descrever
 * regras v2 sem importar o hook.
 */
export const RULE_FIELDS: SegmentFieldDef[] = [
  { value: 'tags', label: 'Tags', kind: 'array' },
  { value: 'company', label: 'Empresa', kind: 'text' },
  { value: 'city', label: 'Cidade', kind: 'text' },
  { value: 'state', label: 'UF', kind: 'text' },
  { value: 'real_sector', label: 'Setor de atividade (real)', kind: 'enum' },
  { value: 'real_uf', label: 'UF (real)', kind: 'enum' },
  { value: 'group_category', label: 'Grupo', kind: 'enum' },
  { value: 'email', label: 'E-mail', kind: 'text' },
  { value: 'channel_type', label: 'Canal de origem', kind: 'text' },
  { value: 'lead_origin', label: 'Origem do lead', kind: 'text', comingSoon: true },
  { value: 'assigned_to', label: 'Responsável', kind: 'uuid' },
  { value: 'contact_type', label: 'Tipo do contato', kind: 'enum' },
  { value: 'conversation_status', label: 'Status da conversa', kind: 'enum' },
  { value: 'lead_score', label: 'Lead score', kind: 'number', comingSoon: true },
  { value: 'risk_score', label: 'Risco de churn', kind: 'number', comingSoon: true },
  { value: 'ai_priority', label: 'Prioridade (IA)', kind: 'enum' },
  { value: 'ai_sentiment', label: 'Sentimento (IA)', kind: 'enum' },
  { value: 'updated_at', label: 'Última interação', kind: 'date' },
  { value: 'created_at', label: 'Data de cadastro', kind: 'date' },
  { value: 'consent_status', label: 'Consentimento (LGPD)', kind: 'enum' },
];

/* ------------------------------------------------------------------ */
/* Tipos v2                                                           */
/* ------------------------------------------------------------------ */

export interface SegmentRulesV2 {
  version: 2;
  join: 'or' | 'and';
  groups: SegmentRuleGroupV2[];
}

export interface SegmentRuleGroupV2 {
  id: string;
  match: 'and' | 'or';
  rules: SegmentRuleV2[];
}

export interface SegmentRuleV2 {
  id: string;
  field: string;
  op: string;
  value: string | number | string[] | { from: string; to: string } | boolean;
}

/** Formato v1 aceito na entrada (estrutural — sem importar o hook). */
export interface SegmentRulesV1Like {
  groups?: Array<{
    id: string;
    match: 'and' | 'or';
    rules?: Array<{ id: string; field: unknown; op: string; value: unknown }>;
  }>;
  join?: 'and' | 'or';
}

/* ------------------------------------------------------------------ */
/* Normalização v1 → v2                                               */
/* ------------------------------------------------------------------ */

/** Nome do campo: string passa direto; objeto `{value,...}` é desenrolado. */
function fieldName(field: unknown): string {
  if (typeof field === 'string') return field;
  if (typeof field === 'object' && field !== null && 'value' in field) {
    const v = (field as { value: unknown }).value;
    return typeof v === 'string' ? v : String(v ?? '');
  }
  return String(field ?? '');
}

/**
 * Converte texto numérico em número nos campos de número/data (o hook valida
 * esses tipos numericamente); nos demais campos o texto continua texto.
 */
function coerceValue(field: string, value: unknown): SegmentRuleV2['value'] {
  if (typeof value !== 'string') return value as SegmentRuleV2['value'];
  const def = RULE_FIELDS.find((f) => f.value === field);
  if (def?.kind !== 'number' && def?.kind !== 'date') return value;
  const trimmed = value.trim();
  if (trimmed === '') return value;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : value;
}

/**
 * Converte regras v1 para o formato v2 (`field` vira string, `value` mantém
 * o tipo original quando possível). Entrada nula vira conjunto vazio.
 */
export function normalizeRules(rules: SegmentRulesV1Like | null | undefined): SegmentRulesV2 {
  if (!rules || !rules.groups) return { version: 2, join: 'or', groups: [] };
  const join = rules.join ?? 'or';
  return {
    version: 2,
    join,
    groups: rules.groups.map((g) => ({
      id: g.id,
      match: g.match,
      rules: (g.rules ?? []).map((r) => {
        const field = fieldName(r.field);
        return {
          id: r.id,
          field,
          op: r.op,
          value: coerceValue(field, r.value),
        };
      }),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Completude                                                         */
/* ------------------------------------------------------------------ */

/** `between` só vale com `from` E `to` preenchidos. */
function hasBetweenBounds(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const from = (value as { from?: unknown }).from;
  const to = (value as { to?: unknown }).to;
  return String(from ?? '').trim() !== '' && String(to ?? '').trim() !== '';
}

/**
 * Retorna `true` quando a regra tem campo conhecido, operador e valor
 * utilizável (mesma semântica do `isRuleComplete` do hook): texto/enum/array
 * exigem valor não vazio; número exige numérico; data exige dias finitos > 0;
 * `is_set`/`is_empty` não pedem valor; `between` exige os dois limites.
 */
export function isRuleComplete(rule: SegmentRuleV2): boolean {
  if (!rule.field || !rule.op) return false;
  const def = RULE_FIELDS.find((f) => f.value === rule.field);
  if (!def) return false;
  if (rule.op === 'between') return hasBetweenBounds(rule.value);
  if (rule.op === 'is_set' || rule.op === 'is_empty') return true;
  const v = rule.value;
  if (v === undefined || v === null) return false;
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.length > 0 && v.some((item) => String(item).trim() !== '');
  if (typeof v === 'object') return false;
  const text = String(v).trim();
  if (text === '') return false;
  if (def.kind === 'number') return !Number.isNaN(Number(text));
  if (def.kind === 'date') {
    const days = Number(text);
    return Number.isFinite(days) && days > 0;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Descrição legível                                                  */
/* ------------------------------------------------------------------ */

const OP_LABELS: Record<string, string> = {
  eq: 'igual a',
  neq: 'diferente de',
  contains: 'contém',
  not_contains: 'não contém',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  in: 'em',
  not_in: 'não em',
  between: 'entre',
  before: 'antes de',
  after: 'depois de',
  on: 'em',
  this_month: 'este mês',
  next_days: 'próximos dias',
  is_true: 'é verdadeiro',
  is_false: 'é falso',
  in_segment: 'no segmento',
  not_in_segment: 'não no segmento',
  in_last_days: 'nos últimos dias',
  not_in_last_days: 'não nos últimos dias',
  is_set: 'preenchido',
  is_empty: 'vazio',
};

/** Rótulo canônico local; campo desconhecido mostra a chave. */
function fieldLabel(fieldValue: string): string {
  const entry = RULE_FIELDS.find((f) => f.value === fieldValue);
  return entry?.label ?? fieldValue;
}

function formatValue(value: SegmentRuleV2['value']): string {
  if (typeof value === 'boolean') return value ? 'sim' : 'não';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object' && value !== null && 'from' in value && 'to' in value) {
    const from = (value as { from: unknown }).from;
    const to = (value as { to: unknown }).to;
    return `${String(from ?? '')} – ${String(to ?? '')}`;
  }
  return String(value);
}

/** Texto exibido no lugar de condição incompleta. */
export const INCOMPLETE_RULE_LABEL = 'Condição incompleta';

/**
 * Descreve uma regra em português claro, ex.: "Empresa igual a Acme".
 * Condição incompleta vira "Condição incompleta".
 */
export function describeRule(rule: SegmentRuleV2): string {
  if (!isRuleComplete(rule)) return INCOMPLETE_RULE_LABEL;
  const label = fieldLabel(rule.field);
  const opLabel = OP_LABELS[rule.op] ?? rule.op;
  if (rule.op === 'is_set' || rule.op === 'is_empty') return `${label} ${opLabel}`;
  const valueLabel = formatValue(rule.value);
  return [label, opLabel, valueLabel].filter((p) => p !== '').join(' ');
}

/**
 * Descreve todas as regras de um conjunto v2 numa string única
 * separada por " · ". Conjunto vazio = "Toda a base".
 */
export function describeRules(rules: SegmentRulesV2): string {
  const allRules = rules.groups.flatMap((g) => g.rules);
  if (allRules.length === 0) return 'Toda a base';
  return allRules.map(describeRule).join(' · ');
}
