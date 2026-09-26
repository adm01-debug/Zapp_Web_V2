import { describe, it, expect } from 'vitest';

import {
  cleanPhone as legacyCleanPhone,
  formatBrazilianPhone as legacyFormatBrazilianPhone,
} from '../../formatters';
import {
  NO_PHONE_LABEL,
  cleanPhone,
  formatBrazilianPhone,
  formatPhoneBR,
  normalizeE164BR,
  phonesMatchExact,
} from '../phone';

const CANONICAL = '+5511999992048';

// ─── 10 formatos de entrada distintos para o MESMO número ───────────

const SAME_NUMBER_INPUTS: string[] = [
  '11999992048', // DDD + nono dígito, só dígitos
  '+5511999992048', // E.164 completo
  '5511999992048', // código do país sem '+'
  '+55 11 99999-2048', // E.164 com máscara
  '(11) 99999-2048', // máscara nacional
  '(011) 99999-2048', // tronco 0 + máscara
  '011999992048', // tronco 0, só dígitos
  '11 9 9999 2048', // espaços soltos
  '119999-2048', // celular sem o nono dígito
  '011 999992048', // tronco 0 + celular sem o nono dígito
];

describe('normalizeE164BR', () => {
  it('normaliza os 10 formatos de entrada para a mesma forma E.164', () => {
    expect(SAME_NUMBER_INPUTS).toHaveLength(10);
    for (const input of SAME_NUMBER_INPUTS) {
      expect(normalizeE164BR(input), `entrada: ${input}`).toBe(CANONICAL);
    }
  });

  it('mantém fixo de 10 dígitos (assinante começando em 2–5)', () => {
    expect(normalizeE164BR('1133334444')).toBe('+551133334444');
    expect(normalizeE164BR('(11) 3333-4444')).toBe('+551133334444');
    expect(normalizeE164BR('+55 11 3333-4444')).toBe('+551133334444');
  });

  it('recompõe o nono dígito em vários DDDs', () => {
    expect(normalizeE164BR('2199999204')).toBe('+5521999999204');
    expect(normalizeE164BR('8598888777')).toBe('+5585998888777');
  });

  it('não confunde DDD 55 com o código do país', () => {
    expect(normalizeE164BR('5599999204')).toBe('+5555999999204');
    expect(normalizeE164BR('5533334444')).toBe('+555533334444');
  });

  it('devolve null para entrada não normalizável', () => {
    expect(normalizeE164BR('')).toBeNull();
    expect(normalizeE164BR('   ')).toBeNull();
    expect(normalizeE164BR('abc')).toBeNull();
    expect(normalizeE164BR('123')).toBeNull();
    expect(normalizeE164BR('99999999999999')).toBeNull();
    expect(normalizeE164BR('5511999992048123')).toBeNull();
    expect(normalizeE164BR(null)).toBeNull();
    expect(normalizeE164BR(undefined)).toBeNull();
  });
});

describe('formatPhoneBR', () => {
  it('formata celular com DDI e nono dígito', () => {
    expect(formatPhoneBR('11999992048')).toBe('+55 (11) 99999-2048');
    expect(formatPhoneBR('(011) 99999 2048')).toBe('+55 (11) 99999-2048');
    expect(formatPhoneBR('119999-2048')).toBe('+55 (11) 99999-2048');
  });

  it('formata fixo', () => {
    expect(formatPhoneBR('1133334444')).toBe('+55 (11) 3333-4444');
  });

  it('entrada sem telefone → —', () => {
    expect(formatPhoneBR(null)).toBe(NO_PHONE_LABEL);
    expect(formatPhoneBR(undefined)).toBe(NO_PHONE_LABEL);
    expect(formatPhoneBR('')).toBe(NO_PHONE_LABEL);
    expect(formatPhoneBR('   ')).toBe(NO_PHONE_LABEL);
  });

  it('entrada não normalizável não perde informação (formatador legado)', () => {
    expect(formatPhoneBR('abc')).toBe('abc');
  });
});

describe('phonesMatchExact', () => {
  it('casa todas as grafias do mesmo número', () => {
    for (const input of SAME_NUMBER_INPUTS) {
      expect(phonesMatchExact(input, CANONICAL), `entrada: ${input}`).toBe(true);
      expect(phonesMatchExact(CANONICAL, input), `entrada invertida: ${input}`).toBe(true);
    }
  });

  it('NÃO casa por sufixo de 8 dígitos com DDD diferente', () => {
    expect(phonesMatchExact('(11) 99999-2048', '(21) 99999-2048')).toBe(false);
    expect(phonesMatchExact('11999992048', '21999992048')).toBe(false);
    expect(phonesMatchExact('+55 11 99999-2048', '+55 21 99999-2048')).toBe(false);
    expect(phonesMatchExact('+5511999992048', '+5521999992048')).toBe(false);
  });

  it('NÃO casa com o mesmo sufixo em outro DDD', () => {
    expect(phonesMatchExact('11999992048', '85999992048')).toBe(false);
    expect(phonesMatchExact('3199999204', '6199999204')).toBe(false);
  });

  it('NÃO casa fixo com celular de mesmo sufixo', () => {
    expect(phonesMatchExact('1133334444', '11933334444')).toBe(false);
  });

  it('nunca casa por fragmento curto (8 dígitos não é telefone completo)', () => {
    expect(phonesMatchExact('99992048', '11999992048')).toBe(false);
    expect(phonesMatchExact('99992048', '99992048')).toBe(false);
    expect(phonesMatchExact('2048', '2048')).toBe(false);
  });

  it('lado ausente ou inválido → false', () => {
    expect(phonesMatchExact(null, CANONICAL)).toBe(false);
    expect(phonesMatchExact(CANONICAL, undefined)).toBe(false);
    expect(phonesMatchExact('abc', 'abc')).toBe(false);
    expect(phonesMatchExact('', '')).toBe(false);
  });
});

describe('reexport dos utilitários de formatters', () => {
  it('cleanPhone e formatBrazilianPhone seguem disponíveis por phone.ts', () => {
    expect(cleanPhone('(11) 99999-2048')).toBe('11999992048');
    expect(formatBrazilianPhone('5511999992048')).toBe('(11) 99999-2048');
    expect(cleanPhone).toBe(legacyCleanPhone);
    expect(formatBrazilianPhone).toBe(legacyFormatBrazilianPhone);
  });
});
