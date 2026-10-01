import { describe, it, expect } from 'vitest';
import {
  CONTACT_SEARCH_MIN_CHARS,
  buildContactSearchFilter,
  contactSearchDigits,
} from '../useCatalogContactSearch';

describe('buildContactSearchFilter — CT-43 (busca de contato)', () => {
  it('abaixo do mínimo de 2 caracteres não monta filtro nenhum', () => {
    expect(CONTACT_SEARCH_MIN_CHARS).toBe(2);
    expect(buildContactSearchFilter('')).toBeNull();
    expect(buildContactSearchFilter(' ')).toBeNull();
    expect(buildContactSearchFilter('t')).toBeNull();
    expect(buildContactSearchFilter(' t ')).toBeNull();
    // 2 caracteres já valem.
    expect(buildContactSearchFilter('to')).not.toBeNull();
  });

  it('busca por nome a partir de 2 caracteres', () => {
    expect(buildContactSearchFilter('tom')).toBe('name.ilike."%tom%"');
  });

  it('normaliza o telefone para apenas dígitos', () => {
    expect(contactSearchDigits('+55 (41) 9 9999')).toBe('554199999');
    expect(contactSearchDigits('9999')).toBe('9999');
    expect(contactSearchDigits('tom')).toBe('');
  });

  it('acha um contato armazenado como "+55 (41) 9 9999" buscando "9999"', () => {
    const stored = '+55 (41) 9 9999';
    const digits = contactSearchDigits('9999');

    // O `ilike` do PostgREST compara substring: a linha só precisa conter os
    // dígitos do termo — antes o filtro mandava a máscara digitada crua.
    expect(stored.includes(digits)).toBe(true);

    const filter = buildContactSearchFilter('9999');
    expect(filter).toContain(`phone.ilike."%${digits}%"`);
    expect(filter).toContain('name.ilike."%9999%"');
  });

  it('termo só com letras não gera cláusula de telefone ("%%" casaria toda a base)', () => {
    expect(buildContactSearchFilter('tom')).not.toContain('phone.ilike');
    expect(buildContactSearchFilter('tom')).not.toContain('%%');
  });

  it('escapa o termo para não quebrar a gramática do or()', () => {
    expect(buildContactSearchFilter('a,b')).toBe('name.ilike."%a,b%"');
    expect(buildContactSearchFilter('a"b')).toBe('name.ilike."%a\\"b%"');
  });
});
