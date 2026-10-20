import { describe, expect, it } from 'vitest';
import { aggregateScores, normalizeScore } from '../../supabase/functions/_shared/ai-values.ts';
import * as canonicalValues from '../../supabase/functions/_shared/ai-values.ts';
import * as appValues from '../../src/lib/ai-values.ts';

const PERCENT = { min: 0, max: 100, scale: 'percent' as const };
const CSAT = { min: 1, max: 5, scale: 'integer' as const };
const CONFIDENCE = { min: 0, max: 1, scale: 'ratio' as const };

describe('IA-023 · normalizeScore nunca inventa número', () => {
  it('trata ausência como ausência (não como 50 nem 3)', () => {
    for (const raw of [null, undefined, '', '   ']) {
      expect(normalizeScore(raw, PERCENT)).toEqual({ value: null, issue: 'absent' });
      expect(normalizeScore(raw, CSAT)).toEqual({ value: null, issue: 'absent' });
      expect(normalizeScore(raw, CONFIDENCE)).toEqual({ value: null, issue: 'absent' });
    }
  });

  it('rejeita string numérica em vez de coagir ("80" não é 80)', () => {
    expect(normalizeScore('80', PERCENT)).toEqual({ value: null, issue: 'not_a_number' });
    expect(normalizeScore('0.9', CONFIDENCE)).toEqual({ value: null, issue: 'not_a_number' });
  });

  it('rejeita NaN/Infinity', () => {
    expect(normalizeScore(Number.NaN, PERCENT).issue).toBe('not_a_number');
    expect(normalizeScore(Number.POSITIVE_INFINITY, PERCENT).issue).toBe('not_a_number');
  });

  it('preserva ZERO — o defeito mascarado no bloco era o 0 virar 50/70', () => {
    expect(normalizeScore(0, PERCENT)).toEqual({ value: 0, issue: null });
    expect(normalizeScore(0, CONFIDENCE)).toEqual({ value: 0, issue: null });
    expect(normalizeScore(0, CSAT).value).toBeNull(); // CSAT começa em 1: 0 é fora de faixa, não "3"
    expect(normalizeScore(0, CSAT).issue).toBe('out_of_range');
  });

  it('detecta escala trocada (0,7 querendo dizer 70%) em vez de gravar 1', () => {
    expect(normalizeScore(0.7, PERCENT)).toEqual({ value: null, issue: 'wrong_scale' });
    expect(normalizeScore(0.99, PERCENT)).toEqual({ value: null, issue: 'wrong_scale' });
    expect(normalizeScore(85, CONFIDENCE)).toEqual({ value: null, issue: 'wrong_scale' });
    expect(normalizeScore(1.5, CONFIDENCE)).toEqual({ value: null, issue: 'wrong_scale' });
  });

  it('rejeita fora de faixa', () => {
    expect(normalizeScore(101, PERCENT)).toEqual({ value: null, issue: 'out_of_range' });
    expect(normalizeScore(-1, PERCENT)).toEqual({ value: null, issue: 'out_of_range' });
    expect(normalizeScore(6, CSAT)).toEqual({ value: null, issue: 'out_of_range' });
    expect(normalizeScore(-0.1, CONFIDENCE)).toEqual({ value: null, issue: 'out_of_range' });
  });

  it('rejeita fração onde só cabe inteiro e registra arredondamento quando é legítimo', () => {
    expect(normalizeScore(3.5, CSAT)).toEqual({ value: null, issue: 'not_an_integer' });
    expect(normalizeScore(50.4, PERCENT)).toEqual({ value: 50, issue: null, rounded: true });
    expect(normalizeScore(99.6, PERCENT)).toEqual({ value: 100, issue: null, rounded: true });
  });

  it('aceita os limites válidos', () => {
    expect(normalizeScore(100, PERCENT)).toEqual({ value: 100, issue: null });
    expect(normalizeScore(1, CSAT)).toEqual({ value: 1, issue: null });
    expect(normalizeScore(5, CSAT)).toEqual({ value: 5, issue: null });
    expect(normalizeScore(0.85, CONFIDENCE)).toEqual({ value: 0.85, issue: null });
    expect(normalizeScore(1, CONFIDENCE)).toEqual({ value: 1, issue: null });
  });
});

describe('IA-023 · aggregateScores exclui o ausente em vez de tratar como 0/50', () => {
  it('média ignora nulo/ausente e informa quantas amostras caíram', () => {
    expect(aggregateScores([0, 50, null, undefined])).toEqual({ average: 25, sampleSize: 2, discarded: 2 });
  });

  it('sem nenhuma amostra válida devolve null (não 0 nem 50)', () => {
    expect(aggregateScores([])).toEqual({ average: null, sampleSize: 0, discarded: 0 });
    expect(aggregateScores([null, undefined])).toEqual({ average: null, sampleSize: 0, discarded: 2 });
  });

  it('um único 0 continua 0', () => {
    expect(aggregateScores([0])).toEqual({ average: 0, sampleSize: 1, discarded: 0 });
  });

  it('descarta valores não finitos', () => {
    expect(aggregateScores([10, Number.NaN, Number.POSITIVE_INFINITY])).toEqual({
      average: 10,
      sampleSize: 1,
      discarded: 2,
    });
  });
});

/**
 * O contrato numérico existe em UM único módulo:
 * `supabase/functions/_shared/ai-values.ts` (empacotado pelo Deno). O front
 * consome esse MESMO arquivo por reexport em `src/lib/ai-values.ts` — não há mais
 * duas cópias byte-idênticas para divergirem (o SonarCloud contava as duas como
 * duplicação do bloco). Aqui provamos IDENTIDADE DE EXPORTAÇÃO: cada símbolo de
 * valor do front é a MESMA referência do canônico.
 */
describe('IA-023 · identidade de exportação entre edge e frontend', () => {
  const VALUE_EXPORTS = ['normalizeScore', 'aggregateScores'] as const;

  it('o front reexporta os MESMOS símbolos de valor do canônico (mesma referência)', () => {
    for (const name of VALUE_EXPORTS) {
      expect(appValues[name]).toBeDefined();
      expect(appValues[name]).toBe(canonicalValues[name]);
    }
  });

  it('o front não exporta nada além do canônico e não perde símbolo de valor', () => {
    expect(Object.keys(appValues).sort()).toEqual(Object.keys(canonicalValues).sort());
    expect(Object.keys(canonicalValues).sort()).toEqual([...VALUE_EXPORTS].sort());
  });
});
