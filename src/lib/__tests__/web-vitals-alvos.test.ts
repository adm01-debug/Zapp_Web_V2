import { describe, expect, it } from 'vitest';

import { getRating, getVitalTargets } from '../web-vitals';

/**
 * E34/SL-229 — a outra ponta do contrato dos alvos.
 *
 * O guarda do arquivo (`tests/contracts/web-vitals-alvos.contract.test.ts`) prova
 * que a seção `web-vitals` do `performance-budget.json` cobre exatamente o que o
 * campo publica. Aqui a prova é que o CÓDIGO REAL classifica com esses alvos:
 * o alvo novo do FCP existe de verdade e o FID, declarado sem par de campo,
 * continua sendo medido contra o alvo dele (não cai no "sem alvo = good").
 *
 * Sem estes testes, o FCP poderia entrar no JSON e não chegar em quem decide — e
 * o FID poderia perder o alvo sem ninguém notar.
 */
describe('alvos de Web Vitals usados pelo código (E34)', () => {
  it('o alvo novo do FCP está no mapa que o código expõe', () => {
    expect(getVitalTargets().FCP).toEqual({ target: 1800, poor: 3000, field: true, unit: 'ms', rating: 'good' });
  });

  it('getRating classifica o FCP pelos limites publicados que estão no arquivo', () => {
    expect(getRating('FCP', 1800)).toBe('good');
    expect(getRating('FCP', 1801)).toBe('needs-improvement');
    expect(getRating('FCP', 3000)).toBe('needs-improvement');
    expect(getRating('FCP', 3001)).toBe('poor');
  });

  it('o FID declarado sem par de campo continua medido contra o alvo dele', () => {
    expect(getRating('FID', 100)).toBe('good');
    expect(getRating('FID', 300)).toBe('needs-improvement');
    expect(getRating('FID', 301)).toBe('poor');
  });

  it('os quatro alvos anteriores seguem no mapa (nada foi trocado no lugar do FCP)', () => {
    const alvos = getVitalTargets();
    expect(Object.keys(alvos).sort()).toEqual(['CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB']);
    expect(getRating('LCP', 2501)).toBe('needs-improvement');
    expect(getRating('CLS', 0.11)).toBe('needs-improvement');
  });
});
