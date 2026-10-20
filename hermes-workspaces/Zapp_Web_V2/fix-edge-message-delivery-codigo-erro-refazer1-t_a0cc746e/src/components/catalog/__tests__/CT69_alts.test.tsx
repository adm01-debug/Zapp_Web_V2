/**
 * CT-69 — `alt` descritivo (NOME + COR) nas imagens de produto/variação.
 *
 * ── Regra ─────────────────────────────────────────────────────────────────
 * Imagem de PRODUTO/VARIAÇÃO → `productImageAlt(nome, cor)` = `"Nome — Cor"`
 * (só `"Nome"` quando a cor não é conhecida). O `alt=""` das miniaturas do
 * strip da galeria continua VAZIO de propósito (é decorativo e repetiria o
 * mesmo nome a cada thumb) — o nome acessível dessas thumbs vive no
 * `aria-label` do botão.
 *
 * ── Capa do card ──────────────────────────────────────────────────────────
 * `singleProductColor` só devolve cor quando o produto tem EXATAMENTE uma cor
 * nomeada: em produto multi-cor a capa não é de uma cor específica e
 * rotulá-la com a 1ª descreveria errado a foto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CatalogProductCard } from '../CatalogProductCard';
import { productImageAlt, singleProductColor } from '../catalogShared';
import './catalogMocks';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const mockExternalProduct = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/integrations/useExternalCatalog', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/integrations/useExternalCatalog')>(
    '@/hooks/integrations/useExternalCatalog'
  );
  return {
    ...actual,
    useExternalProduct: (...args: unknown[]) => mockExternalProduct(...args),
    useCatalogFavorites: () => ({ isFavorite: () => false, toggle: vi.fn() }),
  };
});

// O card carrega o detalhe por `import()`; aqui interessa só o alt da capa.
vi.mock('../ProductDetailDialog', () => ({ ProductDetailDialog: () => null }));

const produto = (o: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1',
  name: 'Caneta Bambu',
  sku: 'CB-001',
  sale_price: 12.5,
  stock_quantity: 10,
  primary_image_url: 'https://x/a.jpg',
  primary_image_fallback_url: null,
  colors: [],
  variants: [],
  ...o,
} as unknown as ExternalProduct);

beforeEach(() => {
  mockExternalProduct.mockReset();
  mockExternalProduct.mockReturnValue({ data: undefined, isFetching: false });
});

describe('CT-69 — helpers de alt/cor', () => {
  it('productImageAlt junta nome e cor com travessão', () => {
    expect(productImageAlt('Caneta Bambu', 'Azul')).toBe('Caneta Bambu — Azul');
  });

  it('productImageAlt degrada para o nome quando a cor é ausente ou vazia', () => {
    expect(productImageAlt('Caneta Bambu', null)).toBe('Caneta Bambu');
    expect(productImageAlt('Caneta Bambu', undefined)).toBe('Caneta Bambu');
    expect(productImageAlt('Caneta Bambu', '   ')).toBe('Caneta Bambu');
  });

  it('singleProductColor só devolve cor com UMA cor nomeada', () => {
    expect(singleProductColor(produto({ colors: ['Azul'] }))).toBe('Azul');
    expect(singleProductColor(produto({ colors: ['Azul', 'Vermelho'] }))).toBeNull();
    expect(singleProductColor(produto({ colors: [] }))).toBeNull();
    expect(
      singleProductColor(produto({ color_swatches: [{ color_name: 'Verde', color_hex: null, image_url: null, stock_quantity: 1 }] } as Partial<ExternalProduct>))
    ).toBe('Verde');
  });
});

describe('CT-69 — alt da capa/miniatura do card', () => {
  it('produto de UMA cor nomeada: capa e miniatura levam "Nome — Cor"', () => {
    const p = produto({ colors: ['Azul'] });

    const grade = render(
      <TooltipProvider>
        <CatalogProductCard product={p} onSend={vi.fn()} />
      </TooltipProvider>
    );
    expect(screen.getByAltText('Caneta Bambu — Azul')).toHaveAttribute('src', 'https://x/a.jpg');
    grade.unmount();

    render(
      <TooltipProvider>
        <CatalogProductCard product={p} mode="list" onSend={vi.fn()} />
      </TooltipProvider>
    );
    expect(screen.getByAltText('Caneta Bambu — Azul')).toHaveAttribute('src', 'https://x/a.jpg');
  });

  it('produto multi-cor: a capa fica só com o nome (não inventa a 1ª cor)', () => {
    render(
      <TooltipProvider>
        <CatalogProductCard product={produto({ colors: ['Azul', 'Vermelho'] })} onSend={vi.fn()} />
      </TooltipProvider>
    );
    expect(screen.getByAltText('Caneta Bambu')).toBeInTheDocument();
    expect(screen.queryByAltText('Caneta Bambu — Azul')).not.toBeInTheDocument();
  });
});

describe('CT-69 — alt do detalhe e o alt vazio proposital das thumbs', () => {
  const comSwatches = () => produto({
    images: ['https://x/a.jpg', 'https://x/b.jpg'],
    color_swatches: [
      { color_name: 'Azul', color_hex: '#0000ff', image_url: 'https://x/b.jpg', stock_quantity: 4 },
      { color_name: 'Vermelho', color_hex: '#ff0000', image_url: 'https://x/a.jpg', stock_quantity: 2 },
    ],
    variants: [],
  });

  it('imagem principal acompanha a cor escolhida', async () => {
    const { ProductDetailDialog } = await vi.importActual<typeof import('../ProductDetailDialog')>(
      '../ProductDetailDialog'
    );
    const { unmount } = render(
      <ProductDetailDialog product={comSwatches()} open onOpenChange={vi.fn()} onSend={vi.fn()} />
    );

    expect(screen.getByAltText('Caneta Bambu')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Cor Azul: 4 em estoque'));
    expect(screen.getByAltText('Caneta Bambu — Azul')).toBeInTheDocument();
    unmount();
  });

  it('as miniaturas do strip continuam com alt="" (decorativas)', async () => {
    const { ProductDetailDialog } = await vi.importActual<typeof import('../ProductDetailDialog')>(
      '../ProductDetailDialog'
    );
    render(
      <ProductDetailDialog product={comSwatches()} open onOpenChange={vi.fn()} onSend={vi.fn()} />
    );

    const thumbs = document.querySelectorAll('button[aria-label^="Ver imagem"] img');
    expect(thumbs.length).toBeGreaterThan(0);
    thumbs.forEach((img) => expect(img).toHaveAttribute('alt', ''));
  });

  it('a foto da variação agrupada leva "Nome — Cor"', async () => {
    const { ProductDetailDialog } = await vi.importActual<typeof import('../ProductDetailDialog')>(
      '../ProductDetailDialog'
    );
    render(
      <ProductDetailDialog
        product={produto({
          images: ['https://x/a.jpg'],
          color_swatches: [],
          variants: [
            { id: 'v1', color_name: 'Azul', color_hex: '#0000ff', stock_quantity: 7, is_active: true, selected_thumbnail: 'https://x/azul.jpg' },
          ],
        } as unknown as Partial<ExternalProduct>)}
        open
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByAltText('Caneta Bambu — Azul')).toHaveAttribute('src', 'https://x/azul.jpg');
  });
});
