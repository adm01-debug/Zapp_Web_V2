import { describe, it, expect } from 'vitest';
import { formatPrice, formatStock } from '../catalogShared';

describe('catalogShared', () => {
  it('formatPrice formata em BRL pt-BR', () => {
    expect(formatPrice(63.78)).toBe('R$\u00a063,78');
  });

  it('formatPrice arredonda para 2 casas', () => {
    expect(formatPrice(3.999)).toBe('R$\u00a04,00');
  });

  it('formatStock adiciona sufixo "un."', () => {
    expect(formatStock(1573)).toBe('1573 un.');
    expect(formatStock(0)).toBe('0 un.');
  });
});
