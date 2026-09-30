import { describe, expect, it } from 'vitest';
import * as edge from '../../supabase/functions/_shared/ai-vocabulary.ts';
import * as app from '../../src/lib/ai-vocabulary.ts';

/**
 * Comportamento do vocabulário canônico (IA-021 / IA-022).
 *
 * A MESMA tabela roda contra as DUAS portas de entrada (edge Deno em
 * `supabase/functions/_shared/` e app Vite via re-export em `src/lib/`): como o
 * front reexporta o módulo canônico, as duas pontas são o MESMO código — aqui o
 * que se prova é o comportamento observável. Complementa o teste de identidade
 * de exportação, que prova que cada símbolo do front é a mesma referência do
 * canônico.
 */

const copias: Array<[string, typeof edge]> = [
  ['edge (supabase/functions)', edge],
  ['app (src/lib)', app],
];

const SENTIMENTO: Array<[unknown, string | null, boolean]> = [
  ['positivo', 'positivo', true],
  ['neutro', 'neutro', true],
  ['negativo', 'negativo', true],
  ['critico', 'critico', true],
  ['  POSITIVO  ', 'positivo', true],
  ['positive', 'positivo', true],
  ['negative', 'negativo', true],
  ['neutral', 'neutro', true],
  ['critical', 'critico', true],
  ['positive ', 'positivo', true],
  // Não existe intensidade no domínio: 'very_negative' NÃO é traduzido para
  // 'negativo' — vira desconhecido, para não inventar significado.
  ['very_negative', null, false],
  ['very_positive', null, false],
  ['purple', null, false],
  ['', null, false],
  ['   ', null, false],
  [null, null, false],
  [undefined, null, false],
  [42, null, false],
  [{}, null, false],
];

const URGENCIA: Array<[unknown, string | null, boolean]> = [
  ['baixa', 'baixa', true],
  ['media', 'media', true],
  ['alta', 'alta', true],
  ['critica', 'critica', true],
  ['low', 'baixa', true],
  ['medium', 'media', true],
  ['high', 'alta', true],
  ['critical', 'critica', true],
  ['urgent', 'critica', true],
  // 'normal' é prioridade operacional legada, não urgência analítica.
  ['normal', null, false],
  ['', null, false],
  [null, null, false],
  [undefined, null, false],
];

const PRIORIDADE: Array<[unknown, string | null, boolean]> = [
  ['low', 'low', true],
  ['medium', 'medium', true],
  ['high', 'high', true],
  ['urgent', 'urgent', true],
  ['normal', 'medium', true],
  ['alta', 'high', true],
  ['media', 'medium', true],
  ['baixa', 'low', true],
  ['critica', 'urgent', true],
  ['HIGH', 'high', true],
  ['banana', null, false],
  ['', null, false],
  [null, null, false],
  [undefined, null, false],
];

describe.each(copias)('IA-021 · sentimento canônico em %s', (_nome, mod) => {
  it.each(SENTIMENTO)('%s → %s (known=%s)', (entrada, esperado, known) => {
    expect(mod.normalizeSentiment(entrada)).toEqual({ value: esperado, known });
  });

  it('nunca cai para "neutro" quando não reconhece', () => {
    for (const entrada of ['', null, undefined, 'purple', 7]) {
      expect(mod.normalizeSentiment(entrada).value).toBeNull();
    }
  });

  it('o conjunto canônico é o que está no banco', () => {
    expect([...mod.SENTIMENT_VALUES]).toEqual(['positivo', 'neutro', 'negativo', 'critico']);
  });
});

describe.each(copias)('IA-022 · urgência analítica em %s', (_nome, mod) => {
  it.each(URGENCIA)('%s → %s (known=%s)', (entrada, esperado, known) => {
    expect(mod.normalizeUrgency(entrada)).toEqual({ value: esperado, known });
  });

  it('converte urgência em prioridade operacional sem inventar', () => {
    expect(mod.urgencyToOperationalPriority('baixa')).toBe('low');
    expect(mod.urgencyToOperationalPriority('media')).toBe('medium');
    expect(mod.urgencyToOperationalPriority('alta')).toBe('high');
    expect(mod.urgencyToOperationalPriority('critica')).toBe('urgent');
    expect(mod.urgencyToOperationalPriority(null)).toBeNull();
  });

  it('o conjunto de urgência é distinto do de prioridade', () => {
    expect([...mod.URGENCY_VALUES]).toEqual(['baixa', 'media', 'alta', 'critica']);
    expect([...mod.OPERATIONAL_PRIORITY_VALUES]).toEqual(['low', 'medium', 'high', 'urgent']);
  });
});

describe.each(copias)('IA-022 · prioridade operacional em %s', (_nome, mod) => {
  it.each(PRIORIDADE)('%s → %s (known=%s)', (entrada, esperado, known) => {
    expect(mod.normalizeOperationalPriority(entrada)).toEqual({ value: esperado, known });
  });
});

describe('IA-021/IA-022 · o valor morto "normal" e o morto "critica" não escapam', () => {
  it('prioridade "normal" (default antigo da coluna) vira medium', () => {
    expect(app.normalizeOperationalPriority('normal').value).toBe('medium');
  });

  it('urgência "critica" vira prioridade "urgent" (era o bug do === critical)', () => {
    const urg = app.normalizeUrgency('critica');
    expect(urg.value).toBe('critica');
    expect(app.urgencyToOperationalPriority(urg.value)).toBe('urgent');
  });
});
