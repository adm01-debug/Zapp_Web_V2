import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './catalogMocks';
import { toastError } from './catalogMocks';

// Cartão t_90dcdcc8, item 6: os botões de modo Grade/Lista só tinham `title`,
// sem `aria-pressed` — o estado não era anunciado. Prova: renderiza o
// componente REAL e exige o aria-pressed refletindo o modo.

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => mockUseAuth() }));

const mockUseExternalCatalog = vi.fn();
const mockUseCatalogStats = vi.fn();
const mockFavorites = vi.fn();
vi.mock('@/hooks/integrations/useExternalCatalog', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/integrations/useExternalCatalog')>(
    '@/hooks/integrations/useExternalCatalog'
  );
  return {
    ...actual,
    useExternalCatalog: () => mockUseExternalCatalog(),
    useCatalogStats: () => mockUseCatalogStats(),
    useCatalogFavorites: () => mockFavorites(),
  };
});

const produto = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1', name: 'Caneta Plástica Azul', description: null, short_description: 'Caneta azul',
  sku: 'CAN-001', sale_price: 3.99, suggested_price: null, stock_quantity: 5000,
  primary_image_url: null, colors: ['Azul'], brand: 'Spot', origin_country: 'China',
  min_quantity: 50, dimensions_display: null, weight_g: 12, combined_sizes: null,
  product_type: 'single', is_kit: false, is_active: true, is_stockout: false,
  allows_personalization: true, lead_time_days: 3, supply_mode: null,
  category_id: 'cat1', supplier_id: 'sup1', slug: 'caneta', capacity_ml: null, ncm_code: null,
  categories: { id: 'cat1', name: 'Canetas', slug: 'canetas', parent_id: null },
  suppliers: { id: 'sup1', name: 'Spot' },
  ...overrides,
});

function renderManagement() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExternalProductManagement />
    </QueryClientProvider>
  );
}

mockUseAuth.mockReturnValue({ profile: { id: 'profile-1' } });
mockUseExternalCatalog.mockReturnValue({
  products: [produto()],
  totalProducts: 1,
  categories: [{ id: 'cat1', name: 'Canetas', slug: 'canetas', parent_id: null }],
  suppliers: [{ id: 'sup1', name: 'Spot' }],
  loading: false,
  error: null,
  errorCode: null,
  errorStatus: null,
  fetchProducts: vi.fn(),
  fetchProduct: vi.fn(),
  fetchCategories: vi.fn(),
  fetchSuppliers: vi.fn(),
  isFetching: false,
  isInitialLoading: false,
  invalidate: vi.fn(),
});
mockUseCatalogStats.mockReturnValue({
  data: { total: 1, in_stock: 1, last_sync_at: new Date().toISOString() },
  isLoading: false,
  error: null,
});
mockFavorites.mockReturnValue({
  favorites: [],
  favoriteIds: new Set<string>(),
  isFavorite: () => false,
  isLoading: false,
  toggle: vi.fn(),
});
void toastError;

import { ExternalProductManagement } from '../ExternalProductManagement';

describe('ExternalProductManagement — a11y do toggle Grade/Lista (t_90dcdcc8)', () => {
  it('o modo ativo é anunciado por aria-pressed e alterna ao clicar', () => {
    window.localStorage.setItem('catalog.view', 'grid');
    renderManagement();

    const grade = screen.getByRole('button', { name: 'Grade' });
    const lista = screen.getByRole('button', { name: 'Lista' });

    expect(grade).toHaveAttribute('aria-pressed', 'true');
    expect(lista).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(lista);

    expect(screen.getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Grade' })).toHaveAttribute('aria-pressed', 'false');
  });
});
