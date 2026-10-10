/**
 * X104 — Regras de segmento v2 (tipos, normalização, descrição legível).
 *
 * O formato v2 generaliza o v1 (`SegmentRule` em
 * `@/hooks/integrations/useTalkXSegments`, com `field: RuleField` e
 * `value: string`): `field` continua sendo o nome do campo e `value`
 * aceita texto, número, lista, intervalo `{from,to}` ou booleano.
 * Rótulos e completude vêm da fonte canônica do hook (`RULE_FIELDS` e
 * `isRuleComplete`); a normalização também tolera `field` em formato
 * objeto (`{value,...}`) e converte texto numérico em número nos campos
 * de número/data, que o hook valida numericamente.
 *
 * Regras antigas (sem `version`) são lidas como `join='or'` e
 * `updated_at` vira "última interação".
 */

import {
  isRuleComplete as isV1RuleComplete,
  RULE_FIELDS,
  type SegmentRule,
  type SegmentRules,
} from '@/hooks/integrations/useTalkXSegments';

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
 * Converte texto numérico em número nos campos de número/data (o
 * `isRuleComplete` do hook exige valor numérico nesses tipos);
 * nos demais campos o texto continua texto.
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
 * Converte regras v1 (`field` como nome do campo, `value` sempre
 * string) para o formato v2 (`field` é string, `value` mantém o
 * tipo original quando possível).
 */
export function normalizeRules(rules: SegmentRules | null | undefined): SegmentRulesV2 {
  if (!rules || !rules.groups) return { version: 2, join: 'or', groups: [] };
  const join = rules.join ?? 'or';
  return {
    version: 2,
    join,
    groups: rules.groups.map((g) => ({
      id: g.id,
      match: g.match,
      rules: g.rules.map((r) => {
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
 * Retorna `true` quando a regra tem campo, operador e valor definidos
 * (condições incompletas ficam de fora da contagem de audiência).
 * A decisão é a canônica do hook (`isRuleComplete`): campo conhecido,
 * texto/data numéricos, `is_set`/`is_empty` sem valor. Valor fora de
 * texto (número, booleano, lista) é convertido para texto antes de
 * delegar, então a mesma regra vale para todos os tipos do v2.
 */
export function isRuleComplete(rule: SegmentRuleV2): boolean {
  if (!rule.field || !rule.op) return false;
  if (rule.op === 'between') return hasBetweenBounds(rule.value);
  const v = rule.value;
  if (v === undefined || v === null) return false;
  const asText = typeof v === 'string' ? v : Array.isArray(v) ? v.join(',') : String(v);
  return isV1RuleComplete({ ...rule, value: asText } as unknown as SegmentRule);
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
  neq_num: 'diferente de',
  in_segment: 'no segmento',
  not_in_segment: 'não no segmento',
  in_last_days: 'nos últimos dias',
  not_in_last_days: 'não nos últimos dias',
  is_set: 'preenchido',
  is_empty: 'vazio',
};

/** Rótulo canônico do campo (`RULE_FIELDS`); desconhecido mostra a chave. */
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
 * Descreve uma regra individual em português claro, ex.:
 * "Empresa igual a Acme" ou "Lead score ≥ 30".
 * Condição incompleta (campo/operador/valor que o motor rejeitaria)
 * vira "Condição incompleta".
 */
export function describeRule(rule: SegmentRuleV2): string {
  if (!isRuleComplete(rule)) return INCOMPLETE_RULE_LABEL;
  const label = fieldLabel(rule.field);
  const opLabel = OP_LABELS[rule.op] ?? rule.op;
  const valueLabel = formatValue(rule.value);
  return [label, opLabel, valueLabel].filter((p) => p !== '').join(' ');
}

/**
 * Descreve todas as regras de um conjunto v2. Retorna uma string
 * única com todas as regras separadas por " · ".
 */
export function describeRules(rules: SegmentRulesV2): string {
  const allRules = rules.groups.flatMap((g) => g.rules);
  if (allRules.length === 0) return 'Toda a base';
  return allRules.map(describeRule).join(' · ');
}
