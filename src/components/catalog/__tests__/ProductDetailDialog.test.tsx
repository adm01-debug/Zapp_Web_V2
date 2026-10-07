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

describe('ProductDetailDialog — CT-31 MetaTile (Qtd. mínima / Prazo / Origem)', () => {
  beforeEach(() => {
    mockUseExternalProduct.mockReturnValue({ data: undefined, isFetching: false });
  });

  it('renderiza os 3 tiles quando os campos existem', () => {
    render(
      <ProductDetailDialog
        product={mockProduct({ min_quantity: 25, lead_time_days: 15, origin_country: 'China' })}
        open
        onOpenChange={vi.fn()}
      />
    );
    expect(screen.getByText('Qtd. mínima')).toBeInTheDocument();
    expect(screen.getByText('25 un.')).toBeInTheDocument();
    expect(screen.getByText('Prazo')).toBeInTheDocument();
    expect(screen.getByText('15 dias úteis')).toBeInTheDocument();
    expect(screen.getByText('Origem')).toBeInTheDocument();
    expect(screen.getByText('China')).toBeInTheDocument();
  });

  it('sem os campos nao renderiza nenhum tile', () => {
    render(<ProductDetailDialog product={mockProduct()} open onOpenChange={vi.fn()} />);
    expect(screen.queryByText('Qtd. mínima')).not.toBeInTheDocument();
    expect(screen.queryByText('Prazo')).not.toBeInTheDocument();
    expect(screen.queryByText('Origem')).not.toBeInTheDocument();
  });
});

describe('ProductDetailDialog — CT-32 SectionCard (Descrição / Ficha técnica)', () => {
  beforeEach(() => {
    mockUseExternalProduct.mockReturnValue({ data: undefined, isFetching: false });
  });

  it('mostra LAZER na ficha técnica do PO-13153 (engraving_type)', () => {
    render(
      <ProductDetailDialog
        product={mockProduct({
          sku: 'PO-13153',
          engraving_type: 'LASER',
          materials: ['Bambu'],
          capacity_ml: 350,
          has_gift_box: true,
          dimensions_display: '10 x 5 cm',
          weight_g: 250,
        })}
        open
        onOpenChange={vi.fn()}
      />
    );
    expect(screen.getByText('Ficha técnica')).toBeInTheDocument();
    expect(screen.getByText('LASER')).toBeInTheDocument();
    expect(screen.getByText('Bambu')).toBeInTheDocument();
    expect(screen.getByText('350 ml')).toBeInTheDocument();
    expect(screen.getByText('10 x 5 cm')).toBeInTheDocument();
    expect(screen.getByText('250 g')).toBeInTheDocument();
    expect(screen.getByText(/Inclui embalagem de presente/)).toBeInTheDocument();
  });

  it('descrição usa o card e cai para short_description quando não há description', () => {
    render(
      <ProductDetailDialog
        product={mockProduct({ description: null, short_description: 'Curtinha' })}
        open
        onOpenChange={vi.fn()}
      />
    );
    expect(screen.getByText('Descrição')).toBeInTheDocument();
    expect(screen.getByText('Curtinha')).toBeInTheDocument();
  });
});

describe('ProductDetailDialog — CT-33 ColorSwatch (estoque por cor + scroll da galeria)', () => {
  beforeEach(() => {
    mockUseExternalProduct.mockReturnValue({ data: undefined, isFetching: false });
  });

  const doisCores = () => mockProduct({
    images: ['https://x/a.jpg', 'https://x/b.jpg'],
    color_swatches: [
      { color_name: 'Azul', color_hex: '#0000ff', image_url: 'https://x/b.jpg', stock_quantity: 0 },
      { color_name: 'Vermelho', color_hex: '#ff0000', image_url: 'https://x/a.jpg', stock_quantity: 0 },
    ],
    variants: [
      mockVariant({ id: 'v1', sku: 'CB-A1', color_name: 'Azul', color_hex: '#0000ff', stock_quantity: 3 }),
      mockVariant({ id: 'v2', sku: 'CB-A2', color_name: 'Azul', color_hex: '#0000ff', stock_quantity: 4 }),
      mockVariant({ id: 'v3', sku: 'CB-V1', color_name: 'Vermelho', color_hex: '#ff0000', stock_quantity: 0 }),
    ],
  });

  it('mostra as 2 cores com o estoque somado das variantes', () => {
    render(<ProductDetailDialog product={doisCores()} open onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText('Cor Azul: 7 em estoque')).toBeInTheDocument();
    expect(screen.getByLabelText('Cor Vermelho: 0 em estoque')).toBeInTheDocument();
  });

  it('clicar na cor rola a galeria para a 1ª imagem dela', () => {
    render(<ProductDetailDialog product={doisCores()} open onOpenChange={vi.fn()} />);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Cor Azul: 7 em estoque'));

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});

describe('ProductDetailDialog — CT-34 variantes agrupadas por cor', () => {
  const onSend = vi.fn();
  beforeEach(() => {
    mockUseExternalProduct.mockReturnValue({ data: undefined, isFetching: false });
    onSend.mockClear();
  });

  const comGrupos = () => mockProduct({
    variants: [
      mockVariant({ id: 'v1', sku: 'CB-A1', color_name: 'Azul', stock_quantity: 3, selected_thumbnail: 'https://x/azul.jpg' }),
      mockVariant({ id: 'v2', sku: 'CB-A2', color_name: 'Azul', stock_quantity: 4 }),
      mockVariant({ id: 'v3', sku: 'CB-V1', color_name: 'Vermelho', color_hex: '#ff0000', stock_quantity: 5 }),
    ],
  });

  it('agrupa por cor (2 grupos) e usa .catalog-gallery-thumb(--active)', () => {
    // O Sheet do Radix renderiza num portal (fora do container do render) —
    // as consultas de classe precisam ser no documento.
    render(<ProductDetailDialog product={comGrupos()} open onOpenChange={vi.fn()} onSend={onSend} />);
    expect(screen.getByText('Variantes (2)')).toBeInTheDocument();
    expect(screen.getByText('7 un.')).toBeInTheDocument(); // 3 + 4 (Azul)
    expect(document.querySelector('.catalog-gallery-thumb--active')).toBeNull();

    fireEvent.click(screen.getByText('Azul'));

    const ativo = document.querySelector('.catalog-gallery-thumb--active');
    expect(ativo).not.toBeNull();
    expect(ativo?.className).toContain('catalog-gallery-thumb');
  });

  it('selecionar a cor troca o CTA para "Enviar variação" e envia a cor no onSend', () => {
    render(<ProductDetailDialog product={comGrupos()} open onOpenChange={vi.fn()} onSend={onSend} />);
    expect(screen.getByText('Enviar produto no chat')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Vermelho'));

    const cta = screen.getByRole('button', { name: /Enviar variação/ });
    fireEvent.click(cta);

    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), 'Vermelho');
  });
});

describe('ProductDetailDialog — CT-35 pills de categoria e tags', () => {
  beforeEach(() => {
    mockUseExternalProduct.mockReturnValue({ data: undefined, isFetching: false });
  });

  it('mostra a categoria e as tags como pills no topo', () => {
    render(
      <ProductDetailDialog
        product={mockProduct({
          categories: { id: 'c1', name: 'Brinquedos', slug: 'brinquedos', parent_id: null },
          tags: ['promo', 'kit-escolar'],
        })}
        open
        onOpenChange={vi.fn()}
      />
    );
    expect(screen.getByText('Brinquedos')).toBeInTheDocument();
    expect(screen.getByText('promo')).toBeInTheDocument();
    expect(screen.getByText('kit-escolar')).toBeInTheDocument();
  });

  it('sem categoria e sem tags nao renderiza pills', () => {
    render(<ProductDetailDialog product={mockProduct()} open onOpenChange={vi.fn()} />);
    expect(document.querySelectorAll('.catalog-chip')).toHaveLength(0);
  });

  // As duas formas do payload convivem: a edge pode mandar (ou não) o
  // caminho completo da categoria dentro de `categories`.
  it('usa o caminho completo (full_path_readable) quando ele vem', () => {
    render(
      <ProductDetailDialog
        product={mockProduct({
          categories: {
            id: 'c1', name: 'Canecas', slug: 'canecas', parent_id: null,
            full_path_readable: 'Brindes > Canecas',
          },
          tags: ['promo'],
        })}
        open
        onOpenChange={vi.fn()}
      />
    );
    expect(screen.getByText('Brindes > Canecas')).toBeInTheDocument();
    expect(screen.queryByText('Canecas')).not.toBeInTheDocument();
    expect(screen.getByText('promo')).toBeInTheDocument();
  });

  it('cai para o nome simples quando full_path_readable nao vem (undefined ou null)', () => {
    const { unmount } = render(
      <ProductDetailDialog
        product={mockProduct({
          categories: { id: 'c1', name: 'Canecas', slug: 'canecas', parent_id: null },
        })}
        open
        onOpenChange={vi.fn()}
      />
    );
    expect(screen.getByText('Canecas')).toBeInTheDocument();
    unmount();

    render(
      <ProductDetailDialog
        product={mockProduct({
          categories: { id: 'c1', name: 'Canecas', slug: 'canecas', parent_id: null, full_path_readable: null },
        })}
        open
        onOpenChange={vi.fn()}
      />
    );
    expect(screen.getByText('Canecas')).toBeInTheDocument();
  });

  it('nao renderiza pill vazia quando os dois campos vem em branco', () => {
    render(
      <ProductDetailDialog
        product={mockProduct({
          categories: {
            id: 'c1', name: '  ', slug: 'canecas', parent_id: null,
            full_path_readable: '   ',
          },
        })}
        open
        onOpenChange={vi.fn()}
      />
    );
    expect(document.querySelectorAll('.catalog-chip')).toHaveLength(0);
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });
});

describe('ProductDetailDialog — CT-36 navegação ‹ › entre produtos do resultado', () => {
  const lista = () => [
    mockProduct({ id: 'p1', name: 'Primeiro' }),
    mockProduct({ id: 'p2', name: 'Segundo' }),
    mockProduct({ id: 'p3', name: 'Terceiro' }),
  ];

  beforeEach(() => {
    mockUseExternalProduct.mockReturnValue({ data: undefined, isFetching: false });
  });

  it('sem a prop products nao mostra os botoes', () => {
    render(<ProductDetailDialog product={mockProduct({ name: 'Sozinho' })} open onOpenChange={vi.fn()} />);
    expect(screen.queryByLabelText('Próximo produto')).not.toBeInTheDocument();
  });

  it('avança para o proximo produto do resultado e reflete o deep link ?product=', () => {
    render(<ProductDetailDialog product={lista()[0]} products={lista()} open onOpenChange={vi.fn()} />);

    expect(screen.getByLabelText('Produto anterior')).toBeDisabled();
    expect(screen.getByText('Primeiro')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Próximo produto'));

    expect(screen.getByText('Segundo')).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get('product')).toBe('p2');
  });

  it('volta para o produto anterior', () => {
    render(<ProductDetailDialog product={lista()[0]} products={lista()} open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Próximo produto'));
    fireEvent.click(screen.getByLabelText('Produto anterior'));

    expect(screen.getByText('Primeiro')).toBeInTheDocument();
  });
});

describe('ProductDetailDialog — R2-MOD-047 indice da galeria ao navegar para produto com menos imagens', () => {
  beforeEach(() => {
    mockUseExternalProduct.mockReturnValue({ data: undefined, isFetching: false });
  });

  const comImagens = (id: string, name: string, images: string[], primary = 'https://x/a.jpg') =>
    mockProduct({ id, name, images, primary_image_url: primary });

  it('da 3a imagem de A para um produto com 1 imagem: cai no 1o quadro e nao aponta para indice inexistente', () => {
    const a = comImagens('p1', 'Tres fotos', ['https://x/a.jpg', 'https://x/b.jpg', 'https://x/c.jpg']);
    const b = comImagens('p2', 'Uma foto', [], 'https://x/so.jpg');

    render(<ProductDetailDialog product={a} products={[a, b]} open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Próxima imagem'));
    fireEvent.click(screen.getByLabelText('Próxima imagem'));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Próximo produto'));

    // B tem 1 imagem: contador e setas nem existem; nenhum deles pode apontar
    // para o indice herdado do produto anterior.
    expect(screen.getByText('Uma foto')).toBeInTheDocument();
    expect(screen.getByAltText('Uma foto')).toHaveAttribute('src', 'https://x/so.jpg');
    expect(screen.queryByText(/^\d+ \/ \d+$/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Imagem anterior')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Próxima imagem')).not.toBeInTheDocument();
  });

  it('navegar para um produto com menos imagens recomeca no 1o quadro', () => {
    const a = comImagens('p1', 'Tres fotos', ['https://x/a.jpg', 'https://x/b.jpg', 'https://x/c.jpg']);
    const b = comImagens('p2', 'Duas fotos', ['https://x/b2.jpg'], 'https://x/a2.jpg');

    render(<ProductDetailDialog product={a} products={[a, b]} open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Próxima imagem'));
    fireEvent.click(screen.getByLabelText('Próxima imagem'));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Próximo produto'));

    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Imagem anterior')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Próxima imagem'));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('produto completo chegando com menos imagens limita o indice ao conjunto atual', () => {
    const { rerender } = render(
      <ProductDetailDialog
        product={comImagens('p1', 'Tres fotos', ['https://x/a.jpg', 'https://x/b.jpg', 'https://x/c.jpg'])}
        open
        onOpenChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText('Próxima imagem'));
    fireEvent.click(screen.getByLabelText('Próxima imagem'));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();

    rerender(
      <ProductDetailDialog
        product={comImagens('p1', 'Tres fotos', ['https://x/b.jpg'], 'https://x/a.jpg')}
        open
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Próxima imagem')).not.toBeInTheDocument();
  });
});
