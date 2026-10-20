/**
 * CT-62 — filtros em `useReducer` único na tela de Catálogo.
 *   (a) trocar um filtro (aqui, marcar "Novidades") faz a consulta sair com o
 *       filtro certo (`is_new: true`);
 *   (b) derrubar a busca/filtros ("Limpar filtros") faz a NOVA consulta sair
 *       sem o filtro antigo.
 *   O efeito de debounce lê o estado atual via `buildFiltersRef` — se o
 *   `buildFilters` ficasse preso ao estado antigo (stale closure), (a)/(b)
 *   receberiam os filtros errados.
 *
 * CT-65 — chip "Mostrando só Novidades · limpar": aparece só com `isNew` (não
 *   com `hasFilters`, que inclui busca textual) e desliga a flag num clique.
 *
 * CT-61 — atalhos: `/` e Ctrl/Cmd+F focam a busca, Esc limpa. O `/` é ignorado
 *   quando o foco já está num campo editável. Ctrl/Cmd+F precisa de
 *   `preventDefault` num listener de CAPTURA (senão o "localizar" do browser
 *   engole o evento) — provado disparando o evento no window e afirmando que o
 *   `preventDefault` foi chamado, nas DUAS telas (a página e o Sheet do chat).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductManagement } from '../ExternalProductManagement';
import { ExternalProductCatalog } from '../ExternalProductCatalog';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

// framer-motion: só `useReducedMotion` é trocado (o DOM continua o de produção).
const reduceMotion = vi.hoisted(() => ({ value: false }));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

const mockCatalog = vi.fn();
const mockStats = vi.fn();
const mockFavorites = vi.fn();
vi.mock('@/hooks/integrations/useExternalCatalog', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/integrations/useExternalCatalog')>(
    '@/hooks/integrations/useExternalCatalog',
  );
  return {
    ...actual,
    useExternalCatalog: () => mockCatalog(),
    useCatalogStats: () => mockStats(),
    useCatalogFavorites: () => mockFavorites(),
  };
});

const mockRecentSends = vi.fn();
vi.mock('@/hooks/integrations/useCatalogRecentSends', () => ({
  useCatalogRecentSends: () => mockRecentSends(),
}));

const mockSendHistory = vi.fn();
vi.mock('@/hooks/integrations/useCatalogSendHistory', () => ({
  useCatalogSendHistory: () => mockSendHistory(),
  buildSendHistoryCsv: vi.fn(() => ''),
  sendHistoryFilename: vi.fn(() => 'catalogo_enviados.csv'),
}));

const mockFetchContactPreset = vi.fn();
vi.mock('@/hooks/integrations/useCatalogContactPreset', () => ({
  fetchCatalogContactPreset: (...args: unknown[]) => mockFetchContactPreset(...args),
}));

// O dialog de envio e o card são substituídos por stubs: a prova é sobre a
// CONSULTA disparada e sobre os atalhos, não sobre a UI interna desses
// componentes (cobertos em seus próprios testes).
vi.mock('../SendProductDialog', () => ({
  SendProductDialog: () => <div data-testid="send-dialog" />,
}));

vi.mock('../CatalogProductCard', () => ({
  CatalogProductCard: ({ product }: { product: ExternalProduct }) => (
    <div data-testid={`card-${product.id}`}>{product.name}</div>
  ),
  CatalogProductCardSkeleton: () => <div data-testid="skeleton" />,
}));

const product = (overrides: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1', name: 'Caneta Plástica Azul', description: null, short_description: 'Caneta azul',
  sku: 'CAN-001', sale_price: 3.99, suggested_price: null, stock_quantity: 5000,
  primary_image_url: null, colors: ['Azul'], brand: 'Spot', origin_country: 'China',
  min_quantity: 50, dimensions_display: null, weight_g: 12, combined_sizes: null,
  product_type: 'single', is_kit: false, is_active: true, is_stockout: false,
  allows_personalization: true, lead_time_days: 3, supply_mode: null, category_id: 'cat1',
  supplier_id: 'sup1', slug: 'caneta', capacity_ml: null, ncm_code: null,
  categories: { id: 'cat1', name: 'Canetas', slug: 'canetas', parent_id: null },
  suppliers: { id: 'sup1', name: 'Spot' },
  ...overrides,
});

/** Estado do hook de catálogo; cada teste sobrescreve o que interessa. */
const baseCatalog = (overrides: Record<string, unknown> = {}) => ({
  products: [product()],
  totalProducts: 1,
  categories: [{ id: 'cat1', name: 'Canetas', slug: 'canetas', parent_id: null }],
  suppliers: [{ id: 'sup1', name: 'Spot' }],
  loading: false,
  isInitialLoading: false,
  isFetching: false,
  error: null,
  errorCode: null,
  errorStatus: null,
  fetchProducts: vi.fn(),
  fetchProduct: vi.fn().mockResolvedValue(product()),
  fetchCategories: vi.fn(),
  fetchSuppliers: vi.fn(),
  invalidate: vi.fn(),
  ...overrides,
});

const baseStats = (overrides: Record<string, unknown> = {}) => ({
  data: {
    total: 1, in_stock: 1, featured: 0, new_30d: 1, categories_root: 1,
    suppliers_active: 1, last_sync_at: new Date().toISOString(), ...overrides,
  },
  isLoading: false,
  error: null,
});

function renderManagement() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExternalProductManagement />
    </QueryClientProvider>,
  );
}

function renderCatalog(props: Record<string, unknown> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExternalProductCatalog open onOpenChange={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

/** O debounce dos filtros é de 300 ms. */
const settle = () => new Promise((r) => setTimeout(r, 350));
const lastQuery = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls[fn.mock.calls.length - 1]?.[0] as Record<string, unknown> | undefined;

beforeEach(() => {
  reduceMotion.value = false;
  window.history.replaceState(null, '', '/');
  sessionStorage.clear();
  (document.activeElement as HTMLElement | null)?.blur?.();

  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue({ profile: { id: 'profile-1' } });
  mockCatalog.mockReset();
  mockCatalog.mockReturnValue(baseCatalog());
  mockStats.mockReset();
  mockStats.mockReturnValue(baseStats());
  mockFavorites.mockReset();
  mockFavorites.mockReturnValue({
    favorites: [], favoriteIds: new Set<string>(), isFavorite: () => false, isLoading: false, toggle: vi.fn(),
  });
  mockRecentSends.mockReset();
  mockRecentSends.mockReturnValue({ recent: [], topSent: [] });
  mockSendHistory.mockReset();
  mockSendHistory.mockReturnValue({ rows: [], isLoading: false, error: null });
  mockFetchContactPreset.mockReset();
  mockFetchContactPreset.mockResolvedValue(null);
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
  sessionStorage.clear();
});

describe('CT-62 — filtros no reducer único', () => {
  it('(a) marcar "Novidades" dispara a consulta com is_new=true', async () => {
    const hook = baseCatalog();
    mockCatalog.mockReturnValue(hook);
    renderManagement();
    await settle();
    hook.fetchProducts.mockClear();

    fireEvent.click(within(screen.getByTestId('catalog-kpi-strip')).getByText('Novidades'));
    await settle();

    expect(lastQuery(hook.fetchProducts)?.is_new).toBe(true);
  });

  it('(b) "Limpar filtros" derruba busca e flag — a nova consulta sai sem eles', async () => {
    const hook = baseCatalog();
    mockCatalog.mockReturnValue(hook);
    renderManagement();
    await settle();

    const input = screen.getByPlaceholderText('Buscar por nome, SKU ou marca...');
    fireEvent.change(input, { target: { value: 'caneta' } });
    fireEvent.click(within(screen.getByTestId('catalog-kpi-strip')).getByText('Novidades'));
    await settle();
    expect(lastQuery(hook.fetchProducts)?.search).toBe('caneta');

    hook.fetchProducts.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await settle();

    const afterClear = lastQuery(hook.fetchProducts);
    expect(afterClear?.search).toBeUndefined();
    expect(afterClear?.is_new).toBeUndefined();
    expect(screen.queryByDisplayValue('caneta')).not.toBeInTheDocument();
  });
});

describe('CT-65 — chip da flag "Novidades"', () => {
  it('aparece só com a flag ligada e o botão "limpar" desliga o filtro', async () => {
    const hook = baseCatalog();
    mockCatalog.mockReturnValue(hook);
    renderManagement();
    expect(screen.queryByTestId('catalog-flag-chip')).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByTestId('catalog-kpi-strip')).getByText('Novidades'));
    expect(screen.getByTestId('catalog-flag-chip')).toBeInTheDocument();
    expect(screen.getByText('Mostrando só Novidades')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'limpar' }));
    expect(screen.queryByTestId('catalog-flag-chip')).not.toBeInTheDocument();

    await settle();
    expect(lastQuery(hook.fetchProducts)?.is_new).toBeUndefined();
  });

  it('só com busca textual o chip NÃO aparece (não está ligado a hasFilters)', () => {
    renderManagement();
    fireEvent.change(screen.getByPlaceholderText('Buscar por nome, SKU ou marca...'), {
      target: { value: 'caneca' },
    });
    expect(screen.queryByTestId('catalog-flag-chip')).not.toBeInTheDocument();
  });
});

describe('CT-61 — atalhos na página (ExternalProductManagement)', () => {
  it('"/" foca a busca quando o foco não está num campo editável', () => {
    renderManagement();
    const input = screen.getByPlaceholderText('Buscar por nome, SKU ou marca...');
    (document.activeElement as HTMLElement | null)?.blur?.();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));

    expect(input).toHaveFocus();
  });

  it('Ctrl/Cmd+F chama preventDefault (atalho nativo) e foca a busca', () => {
    renderManagement();
    const input = screen.getByPlaceholderText('Buscar por nome, SKU ou marca...');

    const ev = new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(ev, 'preventDefault');
    window.dispatchEvent(ev);

    expect(preventDefault).toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(true);
    expect(input).toHaveFocus();
  });

  it('Esc limpa a busca', () => {
    renderManagement();
    const input = screen.getByPlaceholderText('Buscar por nome, SKU ou marca...');
    fireEvent.change(input, { target: { value: 'caneta' } });
    expect(input).toHaveValue('caneta');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(input).toHaveValue('');
  });

  it('"/" digitado dentro de um input NÃO é interceptado', () => {
    renderManagement();
    const input = screen.getByPlaceholderText('Buscar por nome, SKU ou marca...');
    input.focus();

    const ev = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    input.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input);
  });
});

describe('CT-61 — atalhos no Sheet (ExternalProductCatalog)', () => {
  it('com o dialog aberto, Ctrl/Cmd+F chama preventDefault e foca a busca', () => {
    renderCatalog();
    const input = screen.getByPlaceholderText('Buscar por nome, SKU ou marca...');

    const ev = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(ev, 'preventDefault');
    window.dispatchEvent(ev);

    expect(preventDefault).toHaveBeenCalled();
    expect(input).toHaveFocus();
  });

  it('com o dialog aberto, "/" foca a busca e Esc limpa', () => {
    renderCatalog();
    const input = screen.getByPlaceholderText('Buscar por nome, SKU ou marca...');

    fireEvent.keyDown(window, { key: '/' });
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: 'caneta' } });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(input).toHaveValue('');
  });

  it('com o dialog fechado, os atalhos não são interceptados', () => {
    renderCatalog({ open: false });

    const ev = new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(ev, 'preventDefault');
    window.dispatchEvent(ev);

    expect(preventDefault).not.toHaveBeenCalled();
  });
});
