/**
 * CT-15/CT-16 — o catálogo dentro do dialog do chat.
 *
 * Cobre: grade/lista reusando CatalogProductCard, paginação TalkXPagination,
 * estados de vazio/erro do Talk X e o chip "Meus favoritos" (catalog_favorites).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductCatalog } from '../ExternalProductCatalog';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

const mockCatalog = vi.hoisted(() => vi.fn());
const mockFavorites = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/integrations/useExternalCatalog', () => ({
  useExternalCatalog: (...args: unknown[]) => mockCatalog(...args),
  useCatalogFavorites: (...args: unknown[]) => mockFavorites(...args),
  useExternalProduct: () => ({ data: null, isFetching: false }),
}));

// O card real precisa de dezenas de campos; aqui interessa apenas que o
// catálogo o use (CT-15) e que o clique em "Enviar" chegue ao dialog (CT-14).
vi.mock('../CatalogProductCard', () => ({
  CatalogProductCard: ({
    product,
    onSend,
    mode,
  }: {
    product: ExternalProduct;
    onSend?: (p: ExternalProduct) => void;
    mode?: string;
  }) => (
    <div data-testid={`card-${product.id}`} data-mode={mode}>
      <span>{product.name}</span>
      <button type="button" onClick={() => onSend?.(product)}>Enviar</button>
    </div>
  ),
  CatalogProductCardSkeleton: ({ mode }: { mode?: string }) => (
    <div data-testid="skeleton" data-mode={mode} />
  ),
}));

vi.mock('../SendProductDialog', () => ({
  SendProductDialog: ({
    product,
    presetContact,
  }: {
    product: ExternalProduct;
    presetContact?: { name: string } | null;
  }) => (
    <div data-testid="send-dialog">{`${product.name}|${presetContact?.name ?? 'sem-contato'}`}</div>
  ),
}));

const CONTACT = { id: 'c1', name: 'Cliente da Conversa', phone: '5541999990000', avatar_url: null };

const product = (id: string, name: string): ExternalProduct =>
  ({ id, name, sku: `SKU-${id}`, sale_price: 10, stock_quantity: 5, variants: [] } as unknown as ExternalProduct);

const FAVORITE = {
  id: 'f1',
  product_id: 'p9',
  product_name: 'Caneca Favorita',
  product_sku: 'SKU-P9',
  primary_image_url: null,
  created_at: '2026-09-29T10:00:00Z',
};

const renderCatalog = (props: Record<string, unknown> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExternalProductCatalog open onOpenChange={vi.fn()} {...props} />
    </QueryClientProvider>
  );
};

/** Estado base do hook do catálogo; cada teste sobrescreve o que interessa. */
const baseCatalog = () => ({
  products: [product('p1', 'Caneta Bambu'), product('p2', 'Squeeze Aço')],
  totalProducts: 60,
  categories: [{ id: 'cat1', name: 'Brindes', parent_id: null }],
  suppliers: [{ id: 'sup1', name: 'Promo Brindes' }],
  loading: false,
  error: null as string | null,
  fetchProducts: vi.fn(),
  fetchCategories: vi.fn(),
  fetchSuppliers: vi.fn(),
});

beforeEach(() => {
  mockCatalog.mockReset();
  mockFavorites.mockReset();
  mockCatalog.mockReturnValue(baseCatalog());
  mockFavorites.mockReturnValue({
    favorites: [FAVORITE],
    favoriteIds: new Set(['p9']),
    isFavorite: (id: string) => id === 'p9',
    isLoading: false,
    toggle: vi.fn(),
  });
});

describe('ExternalProductCatalog — CT-15 (primitivos da tela principal)', () => {
  it('renderiza a grade com CatalogProductCard e a paginação do Talk X', () => {
    renderCatalog();

    expect(screen.getByTestId('card-p1')).toHaveAttribute('data-mode', 'grade');
    expect(screen.getByTestId('card-p2')).toBeInTheDocument();
    expect(screen.getByText('Mostrando 1-24 de 60')).toBeInTheDocument();
    // TalkXPagination (60 produtos / 24 por página = 3 páginas) substituiu a
    // paginação própria: 3 botões de página + o resumo "1 a 24 de 60 produtos".
    expect(screen.getByText('1 a 24 de 60 produtos', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^3$/ }).length).toBeGreaterThan(0);
  });

  it('mostra o estado vazio do Talk X quando não há produtos', () => {
    mockCatalog.mockReturnValue({ ...baseCatalog(), products: [], totalProducts: 0 });
    renderCatalog();

    expect(screen.getByText('Nenhum produto encontrado')).toBeInTheDocument();
  });

  it('mostra o estado de dados indisponíveis quando a edge falha', () => {
    mockCatalog.mockReturnValue({ ...baseCatalog(), products: [], totalProducts: 0, error: 'CATALOG_UPSTREAM_ERROR' });
    renderCatalog();

    expect(screen.getByText('Dados indisponíveis')).toBeInTheDocument();
  });
});

describe('ExternalProductCatalog — CT-16 (chip Meus favoritos)', () => {
  it('alterna para os favoritos salvos em catalog_favorites', () => {
    renderCatalog();

    expect(screen.queryByTestId('card-p9')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Meus favoritos/i }));

    expect(screen.getByTestId('card-p9')).toBeInTheDocument();
    expect(screen.getByText('Caneca Favorita')).toBeInTheDocument();
    expect(screen.getByText('Mostrando 1 produto(s) favorito(s)')).toBeInTheDocument();
    // sem paginação na visão de favoritos
    expect(screen.queryByText(/Mostrando 1-24 de/)).not.toBeInTheDocument();
  });

  it('sem favoritos, mostra o estado vazio', () => {
    mockFavorites.mockReturnValue({
      favorites: [],
      favoriteIds: new Set<string>(),
      isFavorite: () => false,
      isLoading: false,
      toggle: vi.fn(),
    });
    renderCatalog();

    fireEvent.click(screen.getByRole('button', { name: /Meus favoritos/i }));

    expect(screen.getByText('Sem favoritos ainda')).toBeInTheDocument();
  });

  it('envia pelo SendProductDialog já com o contato da conversa (CT-14)', () => {
    renderCatalog({ presetContact: CONTACT });

    fireEvent.click(screen.getAllByRole('button', { name: 'Enviar' })[0]);

    expect(screen.getByTestId('send-dialog')).toHaveTextContent('Caneta Bambu|Cliente da Conversa');
  });
});
