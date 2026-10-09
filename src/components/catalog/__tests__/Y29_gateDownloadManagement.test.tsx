/**
 * Y29 / SEC-SAIDAS_DE_INFORMACAO-02 (P0) — o CSV de histórico de envios leva
 * nome de cliente e de agente; ele só sai com `profiles.can_download`.
 *
 * Aqui a TELA REAL (`ExternalProductManagement`, aba "Enviados") roda com o
 * `catalogExport` REAL (nada de mock no download): o clique no botão cai na
 * porta única de gravação. Sem permissão, nenhum `createObjectURL` e nenhum
 * clique de anchor acontecem; com permissão, o arquivo sai como antes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductManagement } from '../ExternalProductManagement';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), loading: vi.fn(() => 't1'), dismiss: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

// Y29 — a permissão vem de `useDownloadPermission` (`profiles.can_download`).
const permissao = vi.hoisted(() => ({ valor: false }));
vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: permissao.valor, isLoading: false }),
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: (...args: unknown[]) => mockUseAuth(...args) }));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => false };
});

const mockUseExternalCatalog = vi.fn();
const mockUseCatalogStats = vi.fn();
const mockFavorites = vi.fn();
vi.mock('@/hooks/integrations/useExternalCatalog', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/integrations/useExternalCatalog')>('@/hooks/integrations/useExternalCatalog');
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
  return { ...actual, useCatalogRecentSends: () => mockRecentSends() };
});

vi.mock('@/hooks/integrations/useCatalogContactPreset', () => ({ fetchCatalogContactPreset: vi.fn().mockResolvedValue(null) }));
vi.mock('../SendProductDialog', () => ({ SendProductDialog: () => <div data-testid="send-dialog" /> }));
vi.mock('../ExternalProductCard', () => ({ ExternalProductCard: () => <div data-testid="product-card" /> }));

// `catalog_send_events` com dois envios (contato + agente) — o CSV do achado -02.
const tabela = [
  {
    id: 'evt-1', product_id: 'prod-1', product_name: 'Caneta Azul', product_sku: 'CAN-1',
    variant_label: null, contact_id: 'c1', agent_id: 'a1', template: 'informal', images_count: 1,
    status: 'sent', created_at: '2026-10-09T12:00:00.000Z',
    contacts: { name: 'Maria Silva' }, profiles: { name: 'Ana Souza' },
  },
  {
    id: 'evt-2', product_id: 'prod-2', product_name: 'Squeeze Inox', product_sku: 'SQ-2',
    variant_label: null, contact_id: 'c2', agent_id: 'a1', template: 'formal', images_count: 2,
    status: 'sent', created_at: '2026-10-08T12:00:00.000Z',
    contacts: { name: 'João Pereira' }, profiles: { name: 'Ana Souza' },
  },
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.order = () => b;
      b.limit = () => Promise.resolve({ data: tabela, error: null });
      b.range = () => Promise.resolve({ data: tabela, error: null });
      return b;
    },
  },
}));

const mockProduct = (o: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1', name: 'Caneta Bambu', description: null, short_description: null,
  sku: 'CB-001', sale_price: 12.5, suggested_price: null, stock_quantity: 100,
  primary_image_url: null, colors: null, brand: null,
  origin_country: null, min_quantity: null, dimensions_display: null, weight_g: null,
  combined_sizes: null, product_type: null, is_kit: false, is_active: true,
  is_stockout: false, allows_personalization: false, lead_time_days: null, supply_mode: null,
  category_id: null, supplier_id: null, slug: null, capacity_ml: null, ncm_code: null,
  categories: null, suppliers: null, images: [], variants: [],
  ...o,
});

const renderManagement = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExternalProductManagement />
    </QueryClientProvider>,
  );
};

describe('Y29 — CSV de envios do catálogo passa pelo gate can_download', () => {
  const createObjectURL = vi.fn(() => 'blob:y29-envios');
  const revokeObjectURL = vi.fn();
  const click = vi.fn();

  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    click.mockClear();
    toastMock.success.mockClear();
    toastMock.error.mockClear();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { click(); });

    window.history.replaceState(null, '', '/?tab=enviados');
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({ profile: { id: 'profile-1' } });
    mockUseExternalCatalog.mockReset();
    mockUseExternalCatalog.mockReturnValue({
      products: [mockProduct()], totalProducts: 1,
      categories: [], suppliers: [], loading: false, isInitialLoading: false, isFetching: false,
      error: null, errorCode: null, errorStatus: null,
      fetchProducts: vi.fn(), fetchProduct: vi.fn(), fetchCategories: vi.fn(), fetchSuppliers: vi.fn(), invalidate: vi.fn(),
    });
    mockUseCatalogStats.mockReset();
    mockUseCatalogStats.mockReturnValue({ data: null, isLoading: false, error: null });
    mockFavorites.mockReset();
    mockFavorites.mockReturnValue({ favorites: [], favoriteIds: new Set<string>(), isFavorite: () => false, isLoading: false, toggle: vi.fn() });
    mockRecentSends.mockReset();
    mockRecentSends.mockReturnValue({ recent: [], topSent: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('sem permissão o CSV com nome de contato/agente não é gerado', async () => {
    permissao.valor = false;
    renderManagement();

    await waitFor(() => expect(screen.getByText(/de 2 envio/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('com permissão o CSV é gerado como antes', async () => {
    permissao.valor = true;
    renderManagement();

    await waitFor(() => expect(screen.getByText(/de 2 envio/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:y29-envios');
    expect(toastMock.success).toHaveBeenCalledTimes(1);
  });
});
