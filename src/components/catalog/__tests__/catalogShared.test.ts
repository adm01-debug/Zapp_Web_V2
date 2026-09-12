import { describe, it, expect } from 'vitest';
import { formatPrice, formatStock, resolveProductBadge } from '../catalogShared';

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

describe('resolveProductBadge', () => {
  it('prioriza esgotado sobre qualquer outra flag', () => {
    expect(resolveProductBadge({ is_stockout: true, is_bestseller: true, is_new: true, is_featured: true })).toBe('out');
  });
  it('mais vendido tem prioridade sobre novidade e destaque', () => {
    expect(resolveProductBadge({ is_stockout: false, is_bestseller: true, is_new: true, is_featured: true })).toBe('bestseller');
  });
  it('novidade tem prioridade sobre destaque', () => {
    expect(resolveProductBadge({ is_stockout: false, is_bestseller: false, is_new: true, is_featured: true })).toBe('new');
  });
  it('destaque quando só ele está ativo', () => {
    expect(resolveProductBadge({ is_stockout: false, is_bestseller: false, is_new: false, is_featured: true })).toBe('featured');
  });
  it('em estoque quando nenhuma flag está ativa (ou ausente, como antes da E21)', () => {
    expect(resolveProductBadge({ is_stockout: false, is_bestseller: false, is_new: false, is_featured: false })).toBe('instock');
    expect(resolveProductBadge({ is_stockout: false })).toBe('instock');
  });
});
