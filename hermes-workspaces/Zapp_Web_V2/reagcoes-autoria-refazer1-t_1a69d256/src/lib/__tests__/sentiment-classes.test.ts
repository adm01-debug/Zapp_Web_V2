import { describe, it, expect } from 'vitest';
import { classifySentiment } from '../sentiment-classes';

/**
 * IA-SENTIMENT-001 — matriz PT-BR / legado EN / crítico / inválido / ausente da
 * classe de 3 vias usada pelos widgets do Dashboard.
 */
describe('classifySentiment', () => {
  it('lê o canônico pt-BR sem alteração', () => {
    expect(classifySentiment('positivo')).toBe('positivo');
    expect(classifySentiment('neutro')).toBe('neutro');
    expect(classifySentiment('negativo')).toBe('negativo');
  });

  it('traduz o legado EN na leitura', () => {
    expect(classifySentiment('positive')).toBe('positivo');
    expect(classifySentiment('neutral')).toBe('neutro');
    expect(classifySentiment('negative')).toBe('negativo');
    expect(classifySentiment('critical')).toBe('negativo');
  });

  it('soma o crítico (e o legado critical) à classe negativa — nunca ao neutro', () => {
    expect(classifySentiment('critico')).toBe('negativo');
    expect(classifySentiment('  CRITICO  ')).toBe('negativo');
  });

  it('inválido/ausente é null — não vira neutro', () => {
    for (const raw of [null, undefined, '', '   ', 'very_positive', 'very_negative', 'none', 42, {}, []]) {
      expect(classifySentiment(raw), String(raw)).toBeNull();
    }
  });
});
