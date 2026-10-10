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
      { id: 'r3', field: 'contact_type', op: 'eq', value: 'lead' },
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
});

describe('describeRule', () => {
  it('describes a simple eq rule with field key as label', () => {
    expect(describeRule({ id: 'r1', field: 'company', op: 'eq', value: 'Acme' })).toBe('company igual a Acme');
  });

  it('describes a has rule with fallback operator label', () => {
    expect(describeRule({ id: 'r1', field: 'tags', op: 'contains', value: 'vip' })).toBe('tags contém vip');
  });

  it('describes a gte rule with number (no locale formatting for non-currency)', () => {
    expect(describeRule({ id: 'r1', field: 'total_spent', op: 'gte', value: 1000 })).toBe('total_spent ≥ 1000');
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
        { id: 'r3', field: 'contact_type', op: 'eq', value: 'lead' },
      ] },
    ]});
    expect(result).toBe('company igual a Acme · tags contém vip · contact_type igual a lead');
  });

  it('returns "Toda a base" for empty rules', () => {
    expect(describeRules({ version: 2, join: 'or', groups: [] })).toBe('Toda a base');
  });
});
