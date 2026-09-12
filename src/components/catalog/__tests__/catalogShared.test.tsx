import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatPrice, formatStock, resolveProductBadge, ColorChips, ColorSwatch, PriceTag, StockPill, LowStockPill } from '../catalogShared';

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

describe('ColorChips', () => {
  it('5 cores com max=3 renderiza 3 chips + "+2"', () => {
    render(<ColorChips colors={['Bambu', 'Preto', 'Branco', 'Verde', 'Azul']} max={3} />);
    expect(screen.getByText('Bambu')).toBeInTheDocument();
    expect(screen.getByText('Preto')).toBeInTheDocument();
    expect(screen.getByText('Branco')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.queryByText('Verde')).not.toBeInTheDocument();
  });

  it('aceita objetos com color_name (E21 color_swatches)', () => {
    render(<ColorChips colors={[{ color_name: 'Bambu' }, { name: 'Preto' }]} />);
    expect(screen.getByText('Bambu')).toBeInTheDocument();
    expect(screen.getByText('Preto')).toBeInTheDocument();
  });

  it('lista vazia não renderiza nada', () => {
    const { container } = render(<ColorChips colors={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('ColorSwatch', () => {
  it('com hex, renderiza uma bolinha colorida com aria-label', () => {
    render(<ColorSwatch hex="#c9a06a" name="Bambu" />);
    expect(screen.getByRole('img', { name: 'Cor Bambu' })).toBeInTheDocument();
  });

  it('sem hex, cai para chip de texto', () => {
    render(<ColorSwatch hex={null} name="Padrão" />);
    expect(screen.getByText('Padrão')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('PriceTag', () => {
  it('mostra só o preço quando não há sugerido', () => {
    render(<PriceTag value={63.78} />);
    expect(screen.getByText('R$ 63,78')).toBeInTheDocument();
  });

  it('mostra o sugerido riscado quando diferente do preço', () => {
    render(<PriceTag value={63.78} suggested={43.67} />);
    expect(screen.getByText('R$ 63,78')).toBeInTheDocument();
    expect(screen.getByText('R$ 43,67')).toBeInTheDocument();
  });

  it('não duplica quando sugerido é igual ao preço', () => {
    render(<PriceTag value={63.78} suggested={63.78} />);
    expect(screen.getAllByText('R$ 63,78')).toHaveLength(1);
  });
});

describe('StockPill', () => {
  it('em estoque: mostra a contagem', () => {
    render(<StockPill qty={1573} />);
    expect(screen.getByText('1573 em estoque')).toBeInTheDocument();
  });
  it('qty=0: mostra Esgotado mesmo sem a flag stockout', () => {
    render(<StockPill qty={0} />);
    expect(screen.getByText('Esgotado')).toBeInTheDocument();
  });
  it('stockout=true: mostra Esgotado mesmo com qty>0 (dado inconsistente do PromoGifts)', () => {
    render(<StockPill qty={5} stockout />);
    expect(screen.getByText('Esgotado')).toBeInTheDocument();
  });
});

describe('LowStockPill', () => {
  it('qty=5 (entre 1 e 10): renderiza', () => {
    render(<LowStockPill qty={5} />);
    expect(screen.getByText('5 un.')).toBeInTheDocument();
  });
  it('qty=0: não renderiza', () => {
    const { container } = render(<LowStockPill qty={0} />);
    expect(container.firstChild).toBeNull();
  });
  it('qty=11 (acima do threshold padrão): não renderiza', () => {
    const { container } = render(<LowStockPill qty={11} />);
    expect(container.firstChild).toBeNull();
  });
  it('threshold customizado', () => {
    render(<LowStockPill qty={15} threshold={20} />);
    expect(screen.getByText('15 un.')).toBeInTheDocument();
  });
});
