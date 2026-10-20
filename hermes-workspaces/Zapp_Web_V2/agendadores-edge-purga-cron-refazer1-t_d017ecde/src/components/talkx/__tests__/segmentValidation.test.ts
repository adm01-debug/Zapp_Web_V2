import { describe, expect, it, vi } from 'vitest';
import type { SegmentRules } from '@/hooks/integrations/useTalkXSegments';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) },
}));

import {
  SEGMENT_DESCRIPTION_MAX,
  SEGMENT_NAME_MAX,
  SEGMENT_NAME_MIN,
  descriptionCounter,
  isValid,
  validateSegment,
  validateSegmentDescription,
  validateSegmentName,
  validateSegmentRules,
} from '../segments/segmentValidation';

// X099 — cada regra de publicação do segmento tem um caso aqui. Antes do fix não
// existia validação nenhuma fora da condição em branco (X008): dava para publicar
// sem nome útil, com nome repetido (dois cards iguais na biblioteca) e com
// descrição maior do que a coluna aceita.

const grupoCom = (value: string): SegmentRules => ({
  groups: [{ id: 'g1', match: 'and', rules: [{ id: 'r1', field: 'tags', op: 'contains', value }] }],
});

describe('segmentValidation · nome (X099)', () => {
  it('recusa nome menor que o mínimo', () => {
    expect(validateSegmentName('')).toMatch(new RegExp(`ao menos ${SEGMENT_NAME_MIN}`));
    expect(validateSegmentName('AB')).toMatch(/ao menos/);
  });

  it('aceita nome no mínimo, ignorando espaços nas pontas', () => {
    expect(validateSegmentName('  VIP  ')).toBeNull();
  });

  it('recusa nome maior que o máximo', () => {
    expect(validateSegmentName('a'.repeat(SEGMENT_NAME_MAX + 1))).toMatch(new RegExp(`no máximo ${SEGMENT_NAME_MAX}`));
    expect(validateSegmentName('a'.repeat(SEGMENT_NAME_MAX))).toBeNull();
  });

  it('recusa nome repetido entre os segmentos existentes, sem diferenciar maiúsculas', () => {
    expect(validateSegmentName('Segmento VIP', ['Segmento VIP'])).toMatch(/Já existe/);
    expect(validateSegmentName('  segmento vip ', ['Segmento VIP'])).toMatch(/Já existe/);
    expect(validateSegmentName('Segmento OURO', ['Segmento VIP'])).toBeNull();
  });
});

describe('segmentValidation · descrição (X099)', () => {
  it('recusa descrição acima do limite', () => {
    expect(validateSegmentDescription('a'.repeat(SEGMENT_DESCRIPTION_MAX + 1))).toMatch(/no máximo 160/);
    expect(validateSegmentDescription('a'.repeat(SEGMENT_DESCRIPTION_MAX))).toBeNull();
  });

  it('o contador mostra o que foi digitado sobre o limite', () => {
    expect(descriptionCounter('')).toBe(`0/${SEGMENT_DESCRIPTION_MAX}`);
    expect(descriptionCounter('VIP')).toBe(`3/${SEGMENT_DESCRIPTION_MAX}`);
  });
});

describe('segmentValidation · condições (X099)', () => {
  it('recusa condição em branco dizendo quantas faltam', () => {
    expect(validateSegmentRules(grupoCom(''))).toMatch(/Complete ou remova 1 condição/);
  });

  it('aceita grupo completo', () => {
    expect(validateSegmentRules(grupoCom('VIP'))).toBeNull();
  });

  it('aceita segmento sem nenhuma condição: "Toda a base" é um segmento válido', () => {
    // Comportamento do produto fixado em teste (TalkXSegments.detailFresh.test.tsx:
    // publicar sem condição cria o segmento de toda a base). A trava aqui é a
    // condição em branco, que zeraria a estimativa — não a ausência de condição.
    expect(validateSegmentRules({ groups: [{ id: 'g1', match: 'and', rules: [] }] })).toBeNull();
  });
});

describe('segmentValidation · conjunto (X099)', () => {
  it('junta todos os motivos de recusa', () => {
    const errors = validateSegment({
      name: 'AB',
      description: 'a'.repeat(SEGMENT_DESCRIPTION_MAX + 1),
      rules: grupoCom(''),
      existingNames: [],
    });
    expect(errors.name).toMatch(/ao menos/);
    expect(errors.description).toMatch(/no máximo/);
    expect(errors.rules).toMatch(/Complete ou remova/);
    expect(isValid(errors)).toBe(false);
  });

  it('nome repetido entra na validação de conjunto', () => {
    const errors = validateSegment({ name: 'Segmento VIP', description: '', rules: grupoCom('VIP'), existingNames: ['Segmento VIP'] });
    expect(errors.name).toMatch(/Já existe/);
    expect(isValid(errors)).toBe(false);
  });

  it('segmento válido não deixa erro nenhum', () => {
    const errors = validateSegment({ name: 'Segmento VIP', description: 'clientes VIP', rules: grupoCom('VIP'), existingNames: ['Outro'] });
    expect(errors).toEqual({});
    expect(isValid(errors)).toBe(true);
  });
});
