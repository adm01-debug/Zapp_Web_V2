import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductDetailDialog } from '../ProductDetailDialog';
import type { ExternalProduct, ExternalProductVariant } from '@/hooks/integrations/useExternalCatalog';

// Dialog de zoom (E60) usa @radix-ui/react-dialog, que depende de
// ResizeObserver em alguns navegadores simulados; o jsdom nao implementa.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const mockUseExternalProduct = vi.fn();
const mockToggleFavorite = vi.fn();
vi.mock('@/hooks/integrations/useExternalCatalog', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/integrations/useExternalCatalog')>(
    '@/hooks/integrations/useExternalCatalog'
  );
  return {
    ...actual,
    useExternalProduct: (...args: unknown[]) => mockUseExternalProduct(...args),
    useCatalogFavorites: () => ({ isFavorite: () => false, toggle: mockToggleFavorite }),
  };
});

const mockVariant = (o: Partial<ExternalProductVariant> = {}): ExternalProductVariant => ({
  id: 'v1', product_id: 'p1', sku: 'CB-001-A', name: 'Azul',
  attributes: null, stock_quantity: 10, color_name: 'Azul', color_hex: '#0000ff',
  size_code: null, capacity_ml: null, selected_thumbnail: null, is_active: true,
  ...o,
});

const mockProduct = (o: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1', name: 'Caneta Bambu', description: null, short_description: null,
  sku: 'CB-001', sale_price: 12.5, suggested_price: null, stock_quantity: 100,
  primary_image_url: 'https://x/a.jpg', colors: null, brand: null,
  origin_country: null, min_quantity: null, dimensions_display: null, weight_g: null,
  combined_sizes: null, product_type: null, is_kit: false, is_active: true,
  is_stockout: false, allows_personalization: false, lead_time_days: null, supply_mode: null,
  category_id: null, supplier_id: null, slug: null, capacity_ml: null, ncm_code: null,
  categories: null, suppliers: { id: 's1', name: 'Só Marcas' },
  images: ['https://x/a.jpg', 'https://x/b.jpg', 'https://x/c.jpg'],
  variants: [],
  ...o,
});

describe('ProductDetailDialog — Fase 6 (galeria, SKU, rodapé)', () => {
  beforeEach(() => {
    mockUseExternalProduct.mockReturnValue({ data: undefined, isFetching: false });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('mostra o contador "1 / N" quando ha mais de 1 imagem (E60)', () => {
    render(<ProductDetailDialog product={mockProduct()} open onOpenChange={vi.fn()} />);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('com 1 imagem so nao mostra contador', () => {
    render(<ProductDetailDialog product={mockProduct({ images: [] })} open onOpenChange={vi.fn()} />);
    expect(screen.queryByText(/^\d+ \/ \d+$/)).not.toBeInTheDocument();
  });

  it('seta → avanca a galeria e atualiza o contador', () => {
    render(<ProductDetailDialog product={mockProduct()} open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Próxima imagem'));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('na 1a imagem nao mostra seta de anterior', () => {
    render(<ProductDetailDialog product={mockProduct()} open onOpenChange={vi.fn()} />);
    expect(screen.queryByLabelText('Imagem anterior')).not.toBeInTheDocument();
  });

  it('copiar SKU chama o clipboard com o SKU do produto (E61)', () => {
    render(<ProductDetailDialog product={mockProduct()} open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Copiar SKU'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('CB-001');
  });

  it('mostra o fornecedor no rodape (E66)', () => {
    render(<ProductDetailDialog product={mockProduct()} open onOpenChange={vi.fn()} onSend={vi.fn()} />);
    expect(screen.getByText('Só Marcas')).toBeInTheDocument();
  });

  it('sem fornecedor e sem onSend nao renderiza o rodape', () => {
    render(<ProductDetailDialog product={mockProduct({ suppliers: null })} open onOpenChange={vi.fn()} />);
    expect(screen.queryByText(/Fornecedor:/)).not.toBeInTheDocument();
  });

  it('variante esgotada com previsao de entrada mostra a data dd/MM (E61)', () => {
    render(
      <ProductDetailDialog
        product={mockProduct({ variants: [mockVariant({ stock_quantity: 0, next_entry_date: '2026-10-05' })] })}
        open
        onOpenChange={vi.fn()}
      />
    );
    expect(screen.getByText(/Previsão de entrada 05\/10/)).toBeInTheDocument();
  });

  it('variante com estoque nao mostra previsao mesmo com a data', () => {
    render(
      <ProductDetailDialog
        product={mockProduct({ variants: [mockVariant({ stock_quantity: 10, next_entry_date: '2026-10-05' })] })}
        open
        onOpenChange={vi.fn()}
      />
    );
    expect(screen.queryByText(/Previsão de entrada/)).not.toBeInTheDocument();
  });
});
