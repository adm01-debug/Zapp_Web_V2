import { describe, expect, it } from 'vitest';
import { normalizeRules, isRuleComplete, describeRule, describeRules } from '../segmentRules';
import type { SegmentRules } from '@/hooks/integrations/useTalkXSegments';

const v1Rules = {
  join: 'or' as const,
  groups: [
    { id: 'g1', match: 'and' as const, rules: [
      { id: 'r1', field: 'company', op: 'eq', value: 'Acme' },
      { id: 'r2', field: 'tags', op: 'contains', value: 'vip' },
    ] },
    { id: 'g2', match: 'or' as const, rules: [
      { id: 'r3', field: 'contact_type', op: 'eq', value: 'cliente' },
    ] },
  ],
};

describe('normalizeRules', () => {
  it('converts v1 rules to v2 format', () => {
    const result = normalizeRules(v1Rules as SegmentRules);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].rules).toHaveLength(2);
    expect(result.groups[1].rules).toHaveLength(1);
  });

  it('strips unknown fields from rules', () => {
    const withUnknown = {
      version: 2,
      join: 'or',
      groups: [{ id: 'g1', match: 'and', rules: [
        { id: 'r1', field: 'company', op: 'eq', value: 'Acme', unknownField: 'should be stripped' as never },
      ] }],
    };
    const result = normalizeRules(withUnknown as never);
    expect(result.groups[0].rules[0]).not.toHaveProperty('unknownField');
  });

  it('strips unknown group-level properties', () => {
    const withUnknown = {
      version: 2,
      join: 'or',
      groups: [{ id: 'g1', match: 'and', rules: [], unknownProp: 'stripped' }],
    };
    const result = normalizeRules(withUnknown as never);
    expect(result.groups[0]).not.toHaveProperty('unknownProp');
  });

  it('returns empty groups array for null input', () => {
    const result = normalizeRules(null as never);
    expect(result.groups).toEqual([]);
  });

  it('returns empty groups array for undefined input', () => {
    const result = normalizeRules(undefined as never);
    expect(result.groups).toEqual([]);
  });

  it('converts numeric text to number on number fields', () => {
    const input = {
      join: 'or',
      groups: [{ id: 'g1', match: 'and', rules: [
        { id: 'r1', field: 'lead_score', op: 'gte', value: '30' },
      ] }],
    };
    const result = normalizeRules(input as SegmentRules);
    expect(result.groups[0].rules[0].value).toBe(30);
  });

  it('keeps numeric-looking text as string on text fields', () => {
    const input = {
      join: 'or',
      groups: [{ id: 'g1', match: 'and', rules: [
        { id: 'r1', field: 'company', op: 'eq', value: '123' },
      ] }],
    };
    const result = normalizeRules(input as SegmentRules);
    expect(result.groups[0].rules[0].value).toBe('123');
  });

  it('unwraps object-shaped field to its value', () => {
    const input = {
      join: 'or',
      groups: [{ id: 'g1', match: 'and', rules: [
        { id: 'r1', field: { value: 'company' }, op: 'eq', value: 'Acme' },
      ] }],
    };
    const result = normalizeRules(input as never);
    expect(result.groups[0].rules[0].field).toBe('company');
  });

  it('converts day counts to number on date fields', () => {
    const input = {
      join: 'or',
      groups: [{ id: 'g1', match: 'and', rules: [
        { id: 'r1', field: 'updated_at', op: 'in_last_days', value: '30' },
      ] }],
    };
    const result = normalizeRules(input as SegmentRules);
    expect(result.groups[0].rules[0].value).toBe(30);
  });
});

describe('isRuleComplete', () => {
  it('returns true for a rule with field, op, and value', () => {
    expect(isRuleComplete({ id: 'r1', field: 'company', op: 'eq', value: 'Acme' })).toBe(true);
  });

  it('returns false when field is missing', () => {
    expect(isRuleComplete({ id: 'r1', op: 'eq', value: 'Acme' } as never)).toBe(false);
  });

  it('returns false when op is missing', () => {
    expect(isRuleComplete({ id: 'r1', field: 'company', value: 'Acme' } as never)).toBe(false);
  });

  it('returns false when value is missing', () => {
    expect(isRuleComplete({ id: 'r1', field: 'company', op: 'eq' } as never)).toBe(false);
  });

  it('returns false for a rule with empty string value', () => {
    expect(isRuleComplete({ id: 'r1', field: 'company', op: 'eq', value: '' })).toBe(false);
  });

  it('returns false for an unknown field', () => {
    expect(isRuleComplete({ id: 'r1', field: 'total_spent', op: 'gte', value: 1000 })).toBe(false);
  });

  it('returns false for non-numeric text on a number field', () => {
    expect(isRuleComplete({ id: 'r1', field: 'lead_score', op: 'gte', value: 'abc' })).toBe(false);
  });

  it('returns true for is_set without a value', () => {
    expect(isRuleComplete({ id: 'r1', field: 'email', op: 'is_set', value: '' })).toBe(true);
  });

  it('returns false for between without both bounds', () => {
    expect(isRuleComplete({ id: 'r1', field: 'lead_score', op: 'between', value: { from: '10', to: '' } })).toBe(false);
  });

  it('returns true for between with both bounds', () => {
    expect(isRuleComplete({ id: 'r1', field: 'lead_score', op: 'between', value: { from: '10', to: '50' } })).toBe(true);
  });
});

describe('describeRule', () => {
  it('describes company eq with the canonical label', () => {
    expect(describeRule({ id: 'r1', field: 'company', op: 'eq', value: 'Acme' })).toBe('Empresa igual a Acme');
  });

  it('describes tags contains with the canonical label', () => {
    expect(describeRule({ id: 'r1', field: 'tags', op: 'contains', value: 'vip' })).toBe('Tags contém vip');
  });

  it('describes lead_score gte with the canonical label', () => {
    expect(describeRule({ id: 'r1', field: 'lead_score', op: 'gte', value: '30' })).toBe('Lead score ≥ 30');
  });

  it('describes updated_at in_last_days with the canonical label', () => {
    expect(describeRule({ id: 'r1', field: 'updated_at', op: 'in_last_days', value: '30' })).toBe(
      'Última interação nos últimos dias 30',
    );
  });

  it('describes contact_type eq with the canonical label', () => {
    expect(describeRule({ id: 'r1', field: 'contact_type', op: 'eq', value: 'cliente' })).toBe(
      'Tipo do contato igual a cliente',
    );
  });

  it('describes consent_status eq with the canonical label', () => {
    expect(describeRule({ id: 'r1', field: 'consent_status', op: 'eq', value: 'granted' })).toBe(
      'Consentimento (LGPD) igual a granted',
    );
  });

  it('describes city eq with the canonical label', () => {
    expect(describeRule({ id: 'r1', field: 'city', op: 'eq', value: 'São Paulo' })).toBe('Cidade igual a São Paulo');
  });

  it('renders boolean value as sim/nao', () => {
    expect(describeRule({ id: 'r1', field: 'consent_status', op: 'eq', value: true })).toBe(
      'Consentimento (LGPD) igual a sim',
    );
  });

  it('describes between with both bounds', () => {
    expect(
      describeRule({ id: 'r1', field: 'lead_score', op: 'between', value: { from: '10', to: '50' } }),
    ).toBe('Lead score entre 10 – 50');
  });

  it('joins list values with comma', () => {
    expect(describeRule({ id: 'r1', field: 'tags', op: 'contains', value: ['vip', 'ouro'] })).toBe(
      'Tags contém vip, ouro',
    );
  });

  it('returns "Condição incompleta" for an empty value', () => {
    expect(describeRule({ id: 'r1', field: 'company', op: 'eq', value: '' })).toBe('Condição incompleta');
  });

  it('returns "Condição incompleta" for between without both bounds', () => {
    expect(
      describeRule({ id: 'r1', field: 'lead_score', op: 'between', value: { from: '10', to: '' } }),
    ).toBe('Condição incompleta');
  });

  it('returns "Condição incompleta" for an unknown field', () => {
    expect(describeRule({ id: 'r1', field: 'total_spent', op: 'gte', value: 1000 })).toBe('Condição incompleta');
  });

  it('describes is_set without a trailing value', () => {
    expect(describeRule({ id: 'r1', field: 'email', op: 'is_set', value: '' })).toBe('E-mail preenchido');
  });
});

describe('describeRules', () => {
  it('describes all rules across groups as a single string', () => {
    const result = describeRules({ version: 2, join: 'or', groups: [
      { id: 'g1', match: 'and', rules: [
        { id: 'r1', field: 'company', op: 'eq', value: 'Acme' },
        { id: 'r2', field: 'tags', op: 'contains', value: 'vip' },
      ] },
      { id: 'g2', match: 'or', rules: [
        { id: 'r3', field: 'contact_type', op: 'eq', value: 'cliente' },
      ] },
    ]});
    expect(result).toBe('Empresa igual a Acme · Tags contém vip · Tipo do contato igual a cliente');
  });

  it('returns "Toda a base" for empty rules', () => {
    expect(describeRules({ version: 2, join: 'or', groups: [] })).toBe('Toda a base');
  });

  it('renders an incomplete rule as "Condição incompleta"', () => {
    const result = describeRules({ version: 2, join: 'or', groups: [
      { id: 'g1', match: 'and', rules: [
        { id: 'r1', field: 'company', op: 'eq', value: '' },
      ] },
    ]});
    expect(result).toBe('Condição incompleta');
  });
});
