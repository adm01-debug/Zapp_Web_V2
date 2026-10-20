/**
 * CT-30 — responsividade do catálogo.
 *
 * Cobre os dois pontos do aceite: (1) abaixo de xl o rail vira o Accordion
 * rotulado "Resumo do catálogo" (mesmo <CatalogRail/> do <aside>); (2) abaixo
 * de md (768px) o painel de detalhe vira Drawer (vaul) e acima disso continua
 * o Sheet lateral de sempre.
 *
 * Os mocks globais (sonner, ResizeObserver) vêm de ./catalogMocks, seguindo o
 * padrão dos testes vizinhos do catálogo.
 */
import './catalogMocks';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductManagement } from '../ExternalProductManagement';
import { ProductDetailDialog } from '../ProductDetailDialog';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

// useIsMobile decide Sheet x Drawer; o valor é controlado por teste (o jsdom
// não dispara o matchMedia do breakpoint, então mockar o hook é o caminho
// determinístico — mesmo padrão dos testes de inbox).
const mobile = vi.hoisted(() => ({ value: false }));
vi.mock('@/hooks/ui/use-mobile', () => ({
  useIsMobile: () => mobile.value,
  MOBILE_BREAKPOINT: 768,
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => false };
});

const mockUseExternalCatalog = vi.fn();
const mockUseCatalogStats = vi.fn();
const mockFavorites = vi.fn();
const mockUseExternalProduct = vi.fn();
vi.mock('@/hooks/integrations/useExternalCatalog', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/integrations/useExternalCatalog')>(
    '@/hooks/integrations/useExternalCatalog',
  );
  return {
    ...actual,
    useExternalCatalog: () => mockUseExternalCatalog(),
    useCatalogStats: () => mockUseCatalogStats(),
    useCatalogFavorites: () => mockFavorites(),
    useExternalProduct: (...args: unknown[]) => mockUseExternalProduct(...args),
  };
});

const exportCatalogCsvMock = vi.hoisted(() => vi.fn());
vi.mock('../catalogExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalogExport')>();
  return { ...actual, exportCatalogCsv: exportCatalogCsvMock };
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
  images: ['https://x/a.jpg'],
  variants: [],
  ...o,
});

function renderManagement() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExternalProductManagement />
    </QueryClientProvider>,
  );
}

const baseHookReturn = () => ({
  products: [mockProduct(), mockProduct({ id: 'p2', name: 'Caneta Vermelha', sku: 'CAN-002' })],
  totalProducts: 2,
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

beforeEach(() => {
  mobile.value = false;
  exportCatalogCsvMock.mockReset();
  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue({ profile: { id: 'profile-1' } });
  mockUseExternalCatalog.mockReset();
  mockUseExternalCatalog.mockReturnValue(baseHookReturn());
  mockUseCatalogStats.mockReset();
  mockUseCatalogStats.mockReturnValue({
    data: {
      total: 2, in_stock: 2, featured: 1, new_30d: 1,
      categories_root: 1, suppliers_active: 1, last_sync_at: new Date().toISOString(),
    },
    isLoading: false,
    error: null,
  });
  mockFavorites.mockReset();
  mockFavorites.mockReturnValue({
    favorites: [], favoriteIds: new Set<string>(), isFavorite: () => false, isLoading: false, toggle: vi.fn(),
  });
  mockUseExternalProduct.mockReset();
  mockUseExternalProduct.mockReturnValue({ data: undefined, isFetching: false });
});

describe('CT-30 — Accordion "Resumo do catálogo" abaixo de xl', () => {
  it('renderiza o Accordion rotulado "Resumo do catálogo" (oculto em xl) e reusa o mesmo rail', () => {
    renderManagement();

    const acc = screen.getByTestId('catalog-rail-accordion');
    // O rótulo exato pedido pelo aceite.
    expect(within(acc).getByText('Resumo do catálogo')).toBeInTheDocument();
    // Só aparece abaixo de xl (o <aside> do rail continua exclusivo do xl+).
    expect(acc.className).toContain('xl:hidden');

    // Recolhido por padrão: o conteúdo do rail ainda não está montado.
    expect(within(acc).queryByText('Brindes que fortalecem relacionamentos')).not.toBeInTheDocument();

    // Ao abrir, o MESMO CatalogRail aparece dentro do Accordion.
    fireEvent.click(within(acc).getByRole('button', { name: 'Resumo do catálogo' }));
    expect(within(acc).getByText('Brindes que fortalecem relacionamentos')).toBeInTheDocument();
  });
});

describe('CT-30 — Detalhe do produto: Drawer < md, Sheet >= md', () => {
  it('abaixo de md (768px) o detalhe é renderizado no Drawer (vaul)', () => {
    mobile.value = true;

    render(<ProductDetailDialog product={mockProduct()} open onOpenChange={vi.fn()} />);

    const drawer = screen.getByTestId('product-detail-drawer');
    // Atributo do vaul prova que é o Drawer de verdade, não só um id.
    expect(drawer).toHaveAttribute('data-vaul-drawer-direction', 'bottom');
    expect(within(drawer).getByText('Caneta Bambu')).toBeInTheDocument();
    expect(screen.queryByTestId('product-detail-sheet')).not.toBeInTheDocument();
  });

  it('em md ou maior o detalhe continua no Sheet lateral (comportamento atual)', () => {
    mobile.value = false;

    render(<ProductDetailDialog product={mockProduct()} open onOpenChange={vi.fn()} />);

    const sheet = screen.getByTestId('product-detail-sheet');
    expect(within(sheet).getByText('Caneta Bambu')).toBeInTheDocument();
    expect(screen.queryByTestId('product-detail-drawer')).not.toBeInTheDocument();
  });
});
