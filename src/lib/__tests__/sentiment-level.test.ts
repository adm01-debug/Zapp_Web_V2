import { describe, it, expect } from 'vitest';
import { SENTIMENT_VALUES } from '@/lib/ai-vocabulary';
import { sentimentLevel, SENTIMENT_LEVELS } from '../sentiment-level';

/**
 * Contrato do mapeador único de sentimento banco -> interface (item L2).
 *
 * O banco fala pt-BR canônico (`positivo|neutro|negativo|critico`) e ainda pode
 * ter linhas do legado EN gravadas por `ai-auto-tag`/`chatbot-l1`. O
 * mapeador tem de aceitar os dois sem lançar e sem inventar valor: desconhecido
 * é `null`, nunca `'neutral'`.
 */
describe('sentimentLevel', () => {
  it('todo valor canônico do banco vira um nível da interface, sem lançar', () => {
    for (const value of SENTIMENT_VALUES) {
      expect(() => sentimentLevel(value), value).not.toThrow();
      expect(SENTIMENT_LEVELS, value).toContain(sentimentLevel(value));
    }
    expect(SENTIMENT_VALUES.map((value) => sentimentLevel(value))).toEqual([
      'positive',
      'neutral',
      'negative',
      'critical',
    ]);
  });

  it('o legado EN cai no MESMO nível do canônico (leitura traduz, não copia)', () => {
    expect(sentimentLevel('positive')).toBe('positive');
    expect(sentimentLevel('neutral')).toBe('neutral');
    expect(sentimentLevel('negative')).toBe('negative');
    expect(sentimentLevel('critical')).toBe('critical');
  });

  it('ignora caixa e espaços em volta, como o resto do vocabulário', () => {
    expect(sentimentLevel('  POSITIVO  ')).toBe('positive');
    expect(sentimentLevel('Critical')).toBe('critical');
  });

  it('desconhecido/ausente é null — não vira neutro', () => {
    for (const raw of [null, undefined, '', '   ', 'muito_positivo', 'very_negative', 'none', 42, {}, []]) {
      expect(sentimentLevel(raw), String(raw)).toBeNull();
    }
  });
});
