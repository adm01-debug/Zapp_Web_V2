/**
 * CT-15/CT-16 — o catálogo dentro do dialog do chat.
 *
 * Cobre: grade/lista reusando CatalogProductCard, paginação TalkXPagination,
 * estados de vazio/erro do Talk X e o chip "Meus favoritos" (catalog_favorites).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductCatalog } from '../ExternalProductCatalog';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

// CT-59 — o 429 dispara toast do sonner; sem mock o módulo real tentaria
// montar o Toaster e o teste não conseguiria inspecionar a chamada.
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));

// Radix Select (usado nos filtros) mede o trigger com ResizeObserver, API que
// o jsdom não implementa — mesmo polyfill já usado em
// ExternalProductManagement.test.tsx para conseguir abrir os selects.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

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
    priority,
    sizes,
  }: {
    product: ExternalProduct;
    onSend?: (p: ExternalProduct) => void;
    mode?: string;
    priority?: boolean;
    sizes?: string;
  }) => (
    <div
      data-testid={`card-${product.id}`}
      data-mode={mode}
      data-priority={priority ? 'true' : 'false'}
      data-sizes={sizes ?? ''}
    >
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
  categories: [{ id: 'cat1', name: 'Brindes', parent_id: null, products_count: 12 }],
  suppliers: [{ id: 'sup1', name: 'Promo Brindes' }],
  loading: false,
  error: null as string | null,
  errorCode: null as string | null,
  errorStatus: null as number | null,
  fetchProducts: vi.fn(),
  fetchCategories: vi.fn(),
  fetchSuppliers: vi.fn(),
});

beforeEach(() => {
  mockCatalog.mockReset();
  mockFavorites.mockReset();
  toastError.mockReset();
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

  it('mostra o estado de dados indisponíveis quando a edge falha (CATALOG_UPSTREAM_ERROR)', () => {
    mockCatalog.mockReturnValue({
      ...baseCatalog(),
      products: [],
      totalProducts: 0,
      error: 'Catalog database is temporarily unavailable',
      errorCode: 'CATALOG_UPSTREAM_ERROR',
      errorStatus: 503,
    });
    renderCatalog();

    expect(screen.getByText('Dados indisponíveis')).toBeInTheDocument();
  });
});

describe('ExternalProductCatalog — CT-59 (estado de erro por código da edge)', () => {
  const renderWithError = (overrides: Record<string, unknown>) => {
    const hookReturn = { ...baseCatalog(), products: [], totalProducts: 0, ...overrides };
    mockCatalog.mockReturnValue(hookReturn);
    renderCatalog();
    return hookReturn;
  };

  it('CATALOG_UPSTREAM_ERROR: TalkXDataUnavailableState + "Tentar de novo" refaz a busca', () => {
    const hookReturn = renderWithError({
      error: 'Catalog database is temporarily unavailable',
      errorCode: 'CATALOG_UPSTREAM_ERROR',
      errorStatus: 503,
    });

    expect(screen.getByText('Dados indisponíveis')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(hookReturn.fetchProducts).toHaveBeenCalled();
  });

  it('CATALOG_NOT_CONFIGURED: mostra o código para o admin, sem retry de agente', () => {
    renderWithError({
      error: 'Catalog is not configured',
      errorCode: 'CATALOG_NOT_CONFIGURED',
      errorStatus: 503,
    });

    expect(screen.getByText(/Código do erro:/)).toBeInTheDocument();
    expect(screen.getByText('CATALOG_NOT_CONFIGURED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
  });

  it('CATALOG_CREDENTIALS_INVALID: mostra o código real da edge (o plano escreve CREDENTIALS_INVALID)', () => {
    renderWithError({
      error: 'Catalog credentials are not authorized for the requested resource',
      errorCode: 'CATALOG_CREDENTIALS_INVALID',
      errorStatus: 503,
    });

    expect(screen.getByText('CATALOG_CREDENTIALS_INVALID')).toBeInTheDocument();
  });

  it('429: dispara o toast "Muitas requisições, aguarde 1 min" e desabilita os botões', async () => {
    renderWithError({
      error: 'Too many requests. Try again in 1 minute.',
      errorCode: 'CATALOG_RATE_LIMITED',
      errorStatus: 429,
    });

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Muitas requisições, aguarde 1 min');
    });
    // botões de ação desabilitados durante o cooldown de 10 s
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeDisabled();
    expect(screen.getByPlaceholderText('Buscar por nome, SKU ou marca...')).toBeDisabled();
    expect(screen.getAllByRole('combobox')[0]).toBeDisabled();
  });
});

describe('ExternalProductCatalog — CT-60 (contagem nos filtros)', () => {
  it('select de categoria em árvore com contagem: raiz semibold, filho indentado', () => {
    mockCatalog.mockReturnValue({
      ...baseCatalog(),
      categories: [
        { id: 'cat1', name: 'Brindes', parent_id: null, products_count: 42 },
        { id: 'cat2', name: 'Canecas', parent_id: 'cat1', products_count: 7 },
        { id: 'cat3', name: 'Sem contagem', parent_id: null },
      ],
    });
    renderCatalog();

    fireEvent.keyDown(screen.getAllByRole('combobox')[0], { key: 'ArrowDown' });

    const root = screen.getByRole('option', { name: 'Brindes (42)' });
    expect(root.className).toContain('font-semibold');
    const child = screen.getByRole('option', { name: 'Canecas (7)' });
    expect(child.className).toContain('pl-6');
    // sem products_count a fonte não tem número — o rótulo fica sem contagem
    expect(screen.getByRole('option', { name: 'Sem contagem' })).toBeInTheDocument();
  });

  it('select de fornecedor não inventa contagem (não há fonte real)', () => {
    renderCatalog();

    fireEvent.keyDown(screen.getAllByRole('combobox')[1], { key: 'ArrowDown' });

    expect(screen.getByRole('option', { name: 'Promo Brindes' })).toBeInTheDocument();
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

describe('ExternalProductCatalog — CT-72 (capas acima da dobra)', () => {
  it('só as 4 primeiras capas da grade nascem acima da dobra (priority)', () => {
    mockCatalog.mockReturnValue({
      ...baseCatalog(),
      products: Array.from({ length: 6 }, (_, i) => product(`p${i + 1}`, `Produto ${i + 1}`)),
      totalProducts: 6,
    });
    renderCatalog();

    const prioridades = [1, 2, 3, 4, 5, 6].map(
      (i) => screen.getByTestId(`card-p${i}`).getAttribute('data-priority')
    );

    expect(prioridades).toEqual(['true', 'true', 'true', 'true', 'false', 'false']);
  });
});
