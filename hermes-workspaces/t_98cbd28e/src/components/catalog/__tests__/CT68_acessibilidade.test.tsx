/**
 * CT-68 — foco visível + anúncio da contagem no módulo de Catálogo.
 *
 * ── O que este arquivo prova ──────────────────────────────────────────────
 * (a) ANÚNCIO DA CONTAGEM: o total de resultados é uma região viva
 *     (`role="status"` + `aria-live="polite"`), então ao filtrar/trocar de
 *     visão o leitor de tela fala o novo intervalo. NÃO existe debounce
 *     próprio no anúncio: a contagem só muda quando `totalProducts` volta do
 *     fetch, que já é debounced em 300ms no efeito de filtros — digitar não
 *     gera um anúncio por tecla, só o do resultado.
 * (b) ANEL DE FOCO: os interativos do módulo (card da grade/lista, botão de
 *     favorito, checkbox de seleção, chips de categoria, thumbs da galeria,
 *     swatches e variações de cor) carregam `CATALOG_FOCUS_VISIBLE`, escrito
 *     SÓ com tokens (`focus-visible:ring-2 ring-ring ring-offset-2
 *     ring-offset-background`) — nenhuma cor literal.
 *
 * jsdom não pinta CSS: o que se prova aqui é o ATRIBUTO/classe que o browser
 * usa para desenhar o anel (o par de tokens vive em `catalogShared.tsx`).
 *
 * ── Decisão de tabulação (mudança de comportamento) ───────────────────────
 * O anel foi ligado apenas onde o elemento JÁ era interativo: o card da grade e
 * o da lista já eram paradas de tabulação (`tabIndex={0}` + Enter/`e`, CT-25) e
 * todo o resto é `<button>`. Nenhuma parada de tabulação nova foi criada.
 *
 * ── Nomes acessíveis (dívida do CT-67 paga aqui) ──────────────────────────
 * Os thumbs do strip são `<button>` com `<img alt="">` DECORATIVO: o nome
 * acessível vai no `aria-label` do botão. O `alt=""` continua vazio de
 * propósito (CT-69) — repetir o nome do produto a cada thumb seria ruído.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ExternalProductCatalog } from '../ExternalProductCatalog';
import { CategoryChips, CATALOG_FOCUS_VISIBLE } from '../catalogShared';
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

const mockCatalog = vi.hoisted(() => vi.fn());
const mockFavorites = vi.hoisted(() => vi.fn());
const mockExternalProduct = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/integrations/useExternalCatalog', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/integrations/useExternalCatalog')>(
    '@/hooks/integrations/useExternalCatalog'
  );
  return {
    ...actual,
    useExternalCatalog: (...args: unknown[]) => mockCatalog(...args),
    useCatalogFavorites: (...args: unknown[]) => mockFavorites(...args),
    useExternalProduct: (...args: unknown[]) => mockExternalProduct(...args),
  };
});

// O catálogo é o DAG inteiro; para a barra de status basta o dublê. O card REAL
// entra por `vi.importActual` no bloco de foco (mesmo componente da grade).
vi.mock('../CatalogProductCard', () => ({
  CatalogProductCard: ({ product }: { product: ExternalProduct }) => (
    <div data-testid="card">{product.id}</div>
  ),
  CatalogProductCardSkeleton: ({ mode }: { mode?: string }) => (
    <div data-testid="skeleton" data-mode={mode} />
  ),
}));
vi.mock('../ProductDetailDialog', () => ({ ProductDetailDialog: () => null }));
vi.mock('../SendProductDialog', () => ({ SendProductDialog: () => null }));
vi.mock('../CatalogBulkSendDialog', () => ({ CatalogBulkSendDialog: () => null }));

const FOCUS = 'focus-visible:ring-2';

const produto = (id: string): ExternalProduct => ({
  id,
  name: `Produto ${id}`,
  sku: id,
  sale_price: 10,
  stock_quantity: 5,
  primary_image_url: null,
  colors: [],
  variants: [],
} as unknown as ExternalProduct);

const baseCatalog = () => ({
  products: [produto('p1'), produto('p2')],
  totalProducts: 60,
  categories: [],
  suppliers: [],
  loading: false,
  isInitialLoading: false,
  isFetching: false,
  error: null,
  errorCode: null,
  fetchProducts: vi.fn(),
  fetchCategories: vi.fn(),
  fetchSuppliers: vi.fn(),
});

const renderCatalog = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ExternalProductCatalog open onOpenChange={vi.fn()} />
      </TooltipProvider>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  mockCatalog.mockReset();
  mockFavorites.mockReset();
  mockExternalProduct.mockReset();
  mockCatalog.mockReturnValue(baseCatalog());
  mockFavorites.mockReturnValue({
    favorites: [],
    favoriteIds: new Set<string>(),
    isFavorite: () => false,
    isLoading: false,
    toggle: vi.fn(),
  });
  mockExternalProduct.mockReturnValue({ data: undefined, isFetching: false });
});

describe('CT-68 — a contagem de resultados é anunciada (aria-live)', () => {
  it('a barra de status é uma região viva polida e mostra o intervalo paginado', () => {
    renderCatalog();

    const contagem = screen.getByTestId('catalog-result-count');
    expect(contagem).toHaveAttribute('role', 'status');
    expect(contagem).toHaveAttribute('aria-live', 'polite');
    expect(contagem).toHaveTextContent('Mostrando 1-24 de 60');
  });

  it('o mesmo nó de região viva passa a anunciar a visão de favoritos', () => {
    renderCatalog();
    const antes = screen.getByTestId('catalog-result-count');

    fireEvent.click(screen.getByRole('button', { name: /Meus favoritos/i }));

    const depois = screen.getByTestId('catalog-result-count');
    expect(depois).toBe(antes);
    expect(depois).toHaveTextContent('Mostrando 0 produto(s) favorito(s)');
  });
});

describe('CT-68 — anel de foco visível nos interativos do módulo', () => {
  it('a constante de foco usa tokens do design system, não cor literal', () => {
    expect(CATALOG_FOCUS_VISIBLE).toContain(FOCUS);
    expect(CATALOG_FOCUS_VISIBLE).toContain('ring-ring');
    expect(CATALOG_FOCUS_VISIBLE).toContain('ring-offset-background');
    expect(CATALOG_FOCUS_VISIBLE).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(CATALOG_FOCUS_VISIBLE).not.toMatch(/text-white/);
  });

  it('os chips do rail de categorias têm o anel', () => {
    render(<CategoryChips categories={[{ id: 'c1', name: 'Agro' }]} activeId={null} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Todos' }).className).toContain(FOCUS);
    expect(screen.getByRole('button', { name: 'Agro' }).className).toContain(FOCUS);
  });
});

describe('CT-68 — anel de foco no card real e no detalhe', () => {
  it('o card REAL (grade e lista), o favorito e o checkbox de seleção têm o anel', async () => {
    const { CatalogProductCard } = await vi.importActual<typeof import('../CatalogProductCard')>(
      '../CatalogProductCard'
    );
    const p = produto('p1');

    const grade = render(
      <TooltipProvider>
        <CatalogProductCard
          product={p}
          onSend={vi.fn()}
          onToggleFavorite={vi.fn()}
          onToggleSelect={vi.fn()}
        />
      </TooltipProvider>
    );
    const card = grade.container.querySelector('.catalog-card') as HTMLElement;
    expect(card.className).toContain(FOCUS);
    expect(screen.getByRole('button', { name: 'Adicionar aos favoritos' }).className).toContain(FOCUS);
    expect(screen.getByRole('button', { name: 'Selecionar produto' }).className).toContain(FOCUS);
    grade.unmount();

    const lista = render(
      <TooltipProvider>
        <CatalogProductCard product={p} mode="list" onSend={vi.fn()} />
      </TooltipProvider>
    );
    expect((lista.container.firstElementChild as HTMLElement).className).toContain(FOCUS);
  });
});

describe('CT-68 — anel de foco no detalhe (thumbs, swatches, variações)', () => {
  it('thumbs da galeria, swatches e variações de cor do detalhe têm o anel', async () => {
    const { ProductDetailDialog } = await vi.importActual<typeof import('../ProductDetailDialog')>(
      '../ProductDetailDialog'
    );

    render(
      <ProductDetailDialog
        product={{
          ...produto('p1'),
          name: 'Caneta Bambu',
          images: ['https://x/a.jpg', 'https://x/b.jpg', 'https://x/c.jpg'],
          color_swatches: [
            { color_name: 'Azul', color_hex: '#0000ff', image_url: 'https://x/b.jpg', stock_quantity: 7 },
            { color_name: 'Vermelho', color_hex: '#ff0000', image_url: 'https://x/a.jpg', stock_quantity: 2 },
          ],
          variants: [
            { id: 'v1', color_name: 'Azul', color_hex: '#0000ff', stock_quantity: 7, is_active: true },
          ],
        } as unknown as ExternalProduct}
        open
        onOpenChange={vi.fn()}
        onSend={vi.fn()}
      />
    );

    // thumbs do strip: botões sem texto (o nome acessível está no aria-label)
    const thumbs = document.querySelectorAll('button[aria-label^="Ver imagem"]');
    expect(thumbs.length).toBeGreaterThan(0);
    thumbs.forEach((t) => expect(t.className).toContain(FOCUS));

    // swatches de cor ("radios" de variação)
    expect(screen.getByLabelText('Cor Azul: 7 em estoque').className).toContain(FOCUS);

    // botões de VARIAÇÃO (grupo por cor) — bloco independente do de swatches;
    // usa só variantes, sem color_swatches, para exercitar o outro ramo.
    cleanup();
    render(
      <ProductDetailDialog
        product={{
          ...produto('p1'),
          name: 'Caneta Bambu',
          images: ['https://x/a.jpg'],
          color_swatches: [],
          variants: [
            { id: 'v1', color_name: 'Azul', color_hex: '#0000ff', stock_quantity: 7, is_active: true },
          ],
        } as unknown as ExternalProduct}
        open
        onOpenChange={vi.fn()}
      />
    );

    const variacoes = screen
      .getAllByText('Azul')
      .map((el) => el.closest('button'))
      .filter((b): b is HTMLButtonElement => b !== null);
    expect(variacoes.length).toBeGreaterThan(0);
    variacoes.forEach((b) => expect(b.className).toContain(FOCUS));
  });
});
