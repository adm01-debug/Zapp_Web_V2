import { describe, it, expect } from 'vitest';
import { escapeOrFilterValue } from '../postgrestFilters';

describe('escapeOrFilterValue', () => {
  it('wraps a plain value in double quotes', () => {
    expect(escapeOrFilterValue('Silva')).toBe('"Silva"');
  });

  it('neutralizes a comma that would inject a sibling OR condition', () => {
    const injected = escapeOrFilterValue('x",is_admin.eq.true,name.ilike."%');
    expect(injected).toBe('"x\\",is_admin.eq.true,name.ilike.\\"%"');
  });

  it('escapes embedded double quotes', () => {
    expect(escapeOrFilterValue('João "Doidão"')).toBe('"João \\"Doidão\\""');
  });

  it('escapes a trailing backslash without leaving the quote unescaped', () => {
    expect(escapeOrFilterValue('C:\\')).toBe('"C:\\\\"');
  });

  it('escapes backslash before quote so quotes are not double-unescaped', () => {
    // \" cru quebraria a gramática se a barra não fosse escapada primeiro
    expect(escapeOrFilterValue('a\\"b')).toBe('"a\\\\\\"b"');
  });

  it('leaves parentheses and other PostgREST syntax chars inert once quoted', () => {
    expect(escapeOrFilterValue('(is_admin.eq.true)')).toBe('"(is_admin.eq.true)"');
  });

  it('round-trips an empty string', () => {
    expect(escapeOrFilterValue('')).toBe('""');
  });
});
