import { describe, expect, it } from 'vitest';
import { filtrarViolacoesBloqueantes } from '../../e2e/support/a11y-impactos';

describe('gate E98 de acessibilidade', () => {
  it('bloqueia violações serious e critical sem promover moderate', () => {
    const violacoes = [
      { id: 'color-contrast', impact: 'serious', nos: 2 },
      { id: 'button-name', impact: 'critical', nos: 1 },
      { id: 'landmark', impact: 'moderate', nos: 1 },
    ];

    expect(filtrarViolacoesBloqueantes(violacoes)).toEqual([
      { id: 'color-contrast', impact: 'serious', nos: 2 },
      { id: 'button-name', impact: 'critical', nos: 1 },
    ]);
  });
});
