import { describe, it, expect, vi } from 'vitest';

/**
 * E36 — os alvos de Web Vitals têm UMA fonte, e o código realmente a usa.
 *
 * O `vi.mock` abaixo troca os alvos por valores DIFERENTES dos reais de propósito:
 * é o único jeito de provar que o rating vem do arquivo e não de um limiar
 * copiado no código. Se alguém voltar a escrever `2500` dentro do `getRating`,
 * o teste quebra (o mock diz 6000), e é isso que queremos.
 */
vi.mock('../../../performance-budget.json', () => ({
  default: {
    budgets: {},
    'web-vitals': {
      LCP: { target: 6000, poor: 9000, unit: 'ms', rating: 'good' },
      INP: { target: 400, poor: 900, unit: 'ms', rating: 'good' },
      CLS: { target: 0.3, poor: 0.6, unit: 'score', rating: 'good' },
    },
  },
}));

import { getVitalTargets, getRating } from '../web-vitals';

describe('alvos de Web Vitals (E36)', () => {
  it('getVitalTargets devolve o que está no arquivo', () => {
    const alvos = getVitalTargets();
    expect(alvos.LCP.target).toBe(6000);
    expect(alvos.INP.target).toBe(400);
    expect(alvos.CLS.target).toBe(0.3);
  });

  it('getRating classifica usando o alvo do ARQUIVO (não um limiar copiado)', () => {
    // 2501 é o caso decisivo: com o limiar "do Google" hardcoded (2500) daria
    // 'needs-improvement'; com o alvo do arquivo (6000) tem que dar 'good'.
    expect(getRating('LCP', 2501)).toBe('good');
    expect(getRating('LCP', 6000)).toBe('good');
    expect(getRating('LCP', 6001)).toBe('needs-improvement');
    expect(getRating('LCP', 9001)).toBe('poor');
  });

  it('respeita os limites de CLS (adimensional) do arquivo', () => {
    expect(getRating('CLS', 0.3)).toBe('good');
    expect(getRating('CLS', 0.31)).toBe('needs-improvement');
    expect(getRating('CLS', 0.61)).toBe('poor');
  });

  it('métrica desconhecida não inventa rating ruim', () => {
    expect(getRating('XPTO', 999999)).toBe('good');
  });
});
