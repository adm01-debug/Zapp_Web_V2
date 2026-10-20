/**
 * R2-MOD-042 (item 411) — "Histórico de envios do catálogo esconde registros
 * além dos 500 mais recentes".
 *
 * A aba "Enviados" monta a tabela sobre o que `useCatalogSendHistory` carrega;
 * com o `limit(500)` do hook, tudo além do 500º envio mais recente era
 * invisível: a busca respondia "Nenhum envio com esses filtros" para um envio
 * que existe e o CSV saía só com o lote truncado.
 *
 * Aqui a TELA REAL (`ExternalProductManagement`) roda com o hook REAL e o
 * cliente Supabase falso servindo 501 eventos em páginas de 1000 — o 501º é o
 * mais antigo e não cabe no lote de 500 do comportamento antigo. O teste prova
 * que ele é localizável pela busca E que o CSV exportado o contém.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductManagement } from '../ExternalProductManagement';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

const reduceMotion = vi.hoisted(() => ({ value: false }));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

const mockUseExternalCatalog = vi.fn();
const mockUseCatalogStats = vi.fn();
const mockFavorites = vi.fn();
vi.mock('@/hooks/integrations/useExternalCatalog', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/integrations/useExternalCatalog')>(
    '@/hooks/integrations/useExternalCatalog',
  );
  return {
    ...actual,
    useExternalCatalog: () => mockUseExternalCatalog(),
    useCatalogStats: () => mockUseCatalogStats(),
    useCatalogFavorites: () => mockFavorites(),
  };
});

const mockRecentSends = vi.fn();
vi.mock('@/hooks/integrations/useCatalogRecentSends', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useCatalogRecentSends')>();
  // Parcial de propósito: `CATALOG_SEND_EVENTS_KEY` continua vindo do módulo
  // real (o hook do histórico monta a query key com ele).
  return { ...actual, useCatalogRecentSends: () => mockRecentSends() };
});

const mockFetchContactPreset = vi.fn();
vi.mock('@/hooks/integrations/useCatalogContactPreset', () => ({
  fetchCatalogContactPreset: (...args: unknown[]) => mockFetchContactPreset(...args),
}));

vi.mock('../SendProductDialog', () => ({ SendProductDialog: () => <div data-testid="send-dialog" /> }));
vi.mock('../ExternalProductCard', () => ({ ExternalProductCard: () => <div data-testid="product-card" /> }));

// O download do CSV é interceptado: o alvo é o TEXTO exportado (o recorte).
const triggerCsvDownload = vi.fn();
vi.mock('../catalogExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalogExport')>();
  return { ...actual, triggerCsvDownload: (...args: unknown[]) => triggerCsvDownload(...args) };
});

// ─── Tabela falsa de `catalog_send_events`: 501 eventos, o mais antigo é o 501º ───
type Linha = Record<string, unknown>;
type Resultado = { data: unknown; error: unknown };

const rangeCalls: [number, number][] = [];
const tabela: Linha[] = Array.from({ length: 501 }, (_, i) => ({
  id: `evt-${i + 1}`,
  product_id: `prod-${i + 1}`,
  product_name: `Produto ${i + 1}`,
  product_sku: null,
  variant_label: null,
  contact_id: 'c1',
  agent_id: 'a1',
  template: 'informal',
  images_count: 1,
  status: 'sent',
  created_at: new Date(Date.UTC(2026, 9, 6, 12, 0, 0) - i * 60_000).toISOString(),
  contacts: { name: 'Maria Silva' },
  profiles: { name: 'Ana' },
}));

function makeBuilder() {
  const b: Record<string, unknown> = {};
  const self = () => b;
  b.select = () => b;
  b.eq = vi.fn(self);
  b.order = vi.fn(self);
  // Comportamento ANTIGO (`limit(500)`): devolve só o começo da tabela.
  b.limit = vi.fn((n: number): Promise<Resultado> => Promise.resolve({ data: tabela.slice(0, n), error: null }));
  b.range = vi.fn((from: number, to: number): Promise<Resultado> => {
    rangeCalls.push([from, to]);
    return Promise.resolve({ data: tabela.slice(from, to + 1), error: null });
  });
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => makeBuilder() } }));

const mockProduct = (overrides: Partial<ExternalProduct> = {}): ExternalProduct => ({
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

function renderManagement() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ExternalProductManagement />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  reduceMotion.value = false;
  rangeCalls.length = 0;
  triggerCsvDownload.mockReset();
  window.history.replaceState(null, '', '/?tab=enviados');

  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue({ profile: { id: 'profile-1' } });
  mockUseExternalCatalog.mockReset();
  mockUseExternalCatalog.mockReturnValue({
    products: [mockProduct()], totalProducts: 1,
    categories: [{ id: 'cat1', name: 'Canetas', slug: 'canetas', parent_id: null }],
    suppliers: [{ id: 'sup1', name: 'Spot' }],
    loading: false, isInitialLoading: false, isFetching: false,
    error: null, errorCode: null, errorStatus: null,
    fetchProducts: vi.fn(), fetchProduct: vi.fn().mockResolvedValue(mockProduct()),
    fetchCategories: vi.fn(), fetchSuppliers: vi.fn(), invalidate: vi.fn(),
  });
  mockUseCatalogStats.mockReset();
  mockUseCatalogStats.mockReturnValue({ data: null, isLoading: false, error: null });
  mockFavorites.mockReset();
  mockFavorites.mockReturnValue({
    favorites: [], favoriteIds: new Set<string>(), isFavorite: () => false, isLoading: false, toggle: vi.fn(),
  });
  mockRecentSends.mockReset();
  mockRecentSends.mockReturnValue({ recent: [], topSent: [] });
  mockFetchContactPreset.mockReset();
  mockFetchContactPreset.mockResolvedValue(null);
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('CT-57 — histórico de envios além dos 500 mais recentes (R2-MOD-042 / item 411)', () => {
  it('o 501º envio (o mais antigo) é localizável pela busca da aba "Enviados"', async () => {
    renderManagement();

    const busca = await screen.findByPlaceholderText('Buscar por produto, SKU, contato ou agente...');
    // O total da paginação é o recorte inteiro: 501, não 500.
    await waitFor(() => expect(screen.getByText(/de 501 envio/)).toBeInTheDocument());
    // O mais antigo não está na primeira página...
    expect(screen.queryByText('Produto 501')).not.toBeInTheDocument();

    fireEvent.change(busca, { target: { value: 'Produto 501' } });

    // ...mas a busca o alcança, em vez de responder "nenhum envio".
    expect(await screen.findByText('Produto 501')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum envio com esses filtros.')).not.toBeInTheDocument();
  });

  it('o CSV exportado cobre o recorte inteiro (inclui o 501º envio)', async () => {
    renderManagement();

    await waitFor(() => expect(screen.getByText(/de 501 envio/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }));

    expect(triggerCsvDownload).toHaveBeenCalledTimes(1);
    const csv = String(triggerCsvDownload.mock.calls[0][0]);
    expect(csv).toContain('Produto 501');
  });
});
