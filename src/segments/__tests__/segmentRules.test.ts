import { describe, expect, it } from 'vitest';
import { normalizeRules, isRuleComplete, describeRule, describeRules } from '../segmentRules';

describe('normalizeRules', () => {
  it('returns an empty v2 set for null input', () => {
    expect(normalizeRules(null)).toEqual({ version: 2, join: 'or', groups: [] });
  });

  it('converts numeric text to number on number fields', () => {
    const result = normalizeRules({
      join: 'or',
      groups: [{ id: 'g1', match: 'and', rules: [
        { id: 'r1', field: 'lead_score', op: 'gte', value: '30' },
      ] }],
    });
    expect(result.groups[0].rules[0].value).toBe(30);
  });

  it('keeps numeric-looking text as string on text fields', () => {
    const result = normalizeRules({
      join: 'or',
      groups: [{ id: 'g1', match: 'and', rules: [
        { id: 'r1', field: 'company', op: 'eq', value: '123' },
      ] }],
    });
    expect(result.groups[0].rules[0].value).toBe('123');
  });

  it('unwraps object-shaped field to its value', () => {
    const result = normalizeRules({
      join: 'or',
      groups: [{ id: 'g1', match: 'and', rules: [
        { id: 'r1', field: { value: 'company' }, op: 'eq', value: 'Acme' },
      ] }],
    });
    expect(result.groups[0].rules[0].field).toBe('company');
  });

  it('defaults to version 2 and join or, preserving ids and fields', () => {
    const result = normalizeRules({
      groups: [{ id: 'g9', match: 'or', rules: [
        { id: 'r9', field: 'company', op: 'eq', value: 'Acme' },
      ] }],
    });
    expect(result.version).toBe(2);
    expect(result.join).toBe('or');
    expect(result.groups[0].rules[0]).toEqual({ id: 'r9', field: 'company', op: 'eq', value: 'Acme' });
  });

  it('converts numeric text to number on date fields', () => {
    const result = normalizeRules({
      join: 'or',
      groups: [{ id: 'g1', match: 'and', rules: [
        { id: 'r1', field: 'updated_at', op: 'in_last_days', value: '30' },
      ] }],
    });
    expect(result.groups[0].rules[0].value).toBe(30);
  });
});

describe('isRuleComplete', () => {
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

  it('describes lead_score gte with the canonical label', () => {
    expect(describeRule({ id: 'r1', field: 'lead_score', op: 'gte', value: '30' })).toBe('Lead score ≥ 30');
  });

  it('renders boolean value as sim', () => {
    expect(describeRule({ id: 'r1', field: 'consent_status', op: 'eq', value: true })).toBe(
      'Consentimento (LGPD) igual a sim',
    );
  });

  it('describes between with both bounds', () => {
    expect(
      describeRule({ id: 'r1', field: 'lead_score', op: 'between', value: { from: '10', to: '50' } }),
    ).toBe('Lead score entre 10 – 50');
  });

  it('returns "Condição incompleta" for an empty value', () => {
    expect(describeRule({ id: 'r1', field: 'company', op: 'eq', value: '' })).toBe('Condição incompleta');
  });

  it('returns "Condição incompleta" for an unknown field', () => {
    expect(describeRule({ id: 'r1', field: 'total_spent', op: 'gte', value: 1000 })).toBe('Condição incompleta');
  });

  it('describes updated_at in_last_days with the canonical label', () => {
    expect(describeRule({ id: 'r1', field: 'updated_at', op: 'in_last_days', value: '30' })).toBe(
      'Última interação nos últimos dias 30',
    );
  });

  it('falls back to the raw op when outside OP_LABELS', () => {
    expect(describeRule({ id: 'r1', field: 'company', op: 'foo', value: 'Acme' })).toBe('Empresa foo Acme');
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
});
