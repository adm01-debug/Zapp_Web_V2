/**
 * X104 — Regras de segmento v2 (tipos, normalização, descrição legível).
 *
 * O formato v2 usa `field: string` (nome do campo) em vez do objeto
 * `RuleField` completo do v1, e `value` aceita texto, número, lista,
 * intervalo `{from,to}` ou booleano.
 *
 * Regras antigas (sem `version`) são lidas como `join='or'` e
 * `updated_at` vira "última interação".
 */

import { RULE_FIELDS, type RuleField, type RuleOp, type SegmentRule, type SegmentRuleGroup, type SegmentRules } from '@/hooks/integrations/useTalkXSegments';
import { SEGMENT_FIELD_CATALOG } from './segmentFieldCatalog';

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

/**
 * Converte regras v1 (campo como objeto `RuleField`, `value` sempre
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
        const fieldValue = (r.field as RuleField).value ?? (r.field as unknown as string);
        return {
          id: r.id,
          field: fieldValue,
          op: r.op,
          value: r.value,
        };
      }),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Completude                                                         */
/* ------------------------------------------------------------------ */

/**
 * Retorna `true` quando a regra tem campo, operador e valor definidos
 * (condições incompletas ficam de fora da contagem de audiência).
 */
export function isRuleComplete(rule: SegmentRuleV2): boolean {
  if (!rule.field || !rule.op) return false;
  if (rule.value === undefined || rule.value === null) return false;
  if (typeof rule.value === 'string' && rule.value.trim() === '') return false;
  if (Array.isArray(rule.value) && rule.value.length === 0) return false;
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
  neq_num: 'diferente de',
  in_segment: 'no segmento',
  not_in_segment: 'não no segmento',
  in_last_days: 'nos últimos dias',
  not_in_last_days: 'não nos últimos dias',
  is_set: 'preenchido',
  is_empty: 'vazio',
};

function fieldLabel(fieldValue: string): string {
  const entry = SEGMENT_FIELD_CATALOG.find((f) => f.value === fieldValue);
  return entry?.label ?? fieldValue;
}

function formatValue(value: string | number | string[] | { from: string; to: string } | boolean, kind?: string): string {
  if (typeof value === 'boolean') return value ? 'sim' : 'não';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object' && value !== null && 'from' in value && 'to' in value) {
    return `${value.from} – ${value.to}`;
  }
  if (kind === 'currency' && typeof value === 'number') {
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (kind === 'currency' && typeof value === 'string') {
    const num = parseFloat(value);
    if (!isNaN(num)) return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return String(value);
}

/**
 * Descreve uma regra individual em português claro, ex.:
 * "Ticket médio > R$ 1.000" ou "Gênero contém Feminino".
 */
export function describeRule(rule: SegmentRuleV2): string {
  const fieldDef = SEGMENT_FIELD_CATALOG.find((f) => f.value === rule.field);
  const label = fieldLabel(rule.field);
  const opLabel = OP_LABELS[rule.op] ?? rule.op;
  const kind = fieldDef?.kind ?? 'text';
  const valueLabel = formatValue(rule.value, kind);
  return `${label} ${opLabel} ${valueLabel}`;
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
