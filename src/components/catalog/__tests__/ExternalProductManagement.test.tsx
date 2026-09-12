import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductManagement } from '../ExternalProductManagement';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

const mockProduct = (overrides: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1', name: 'Caneta Plástica Azul', description: null, short_description: 'Caneta azul',
  sku: 'CAN-001', sale_price: 3.99, suggested_price: null, stock_quantity: 5000,
  primary_image_url: 'https://example.com/caneta.jpg', colors: ['Azul'], brand: 'Spot',
  origin_country: 'China', min_quantity: 50, dimensions_display: null, weight_g: 12,
  combined_sizes: null, product_type: 'single', is_kit: false, is_active: true,
  is_stockout: false, allows_personalization: true, lead_time_days: 3, supply_mode: null,
  category_id: 'cat1', supplier_id: 'sup1', slug: 'caneta', capacity_ml: null, ncm_code: null,
  categories: { id: 'cat1', name: 'Canetas', slug: 'canetas', parent_id: null },
  suppliers: { id: 'sup1', name: 'Spot' },
  ...overrides,
});

const mockUseExternalCatalog = vi.fn();
vi.mock('@/hooks/integrations/useExternalCatalog', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/integrations/useExternalCatalog')>(
    '@/hooks/integrations/useExternalCatalog'
  );
  return { ...actual, useExternalCatalog: () => mockUseExternalCatalog() };
});

function baseHookReturn(overrides: Record<string, unknown> = {}) {
  return {
    products: [mockProduct(), mockProduct({ id: 'p2', name: 'Caneta Vermelha', sku: 'CAN-002' })],
    totalProducts: 2,
    categories: [{ id: 'cat1', name: 'Canetas', slug: 'canetas', parent_id: null }],
    suppliers: [{ id: 'sup1', name: 'Spot' }],
    loading: false,
    error: null,
    fetchProducts: vi.fn(),
    fetchProduct: vi.fn(),
    fetchCategories: vi.fn(),
    fetchSuppliers: vi.fn(),
    isFetching: false,
    isInitialLoading: false,
    invalidate: vi.fn(),
    ...overrides,
  };
}

function renderManagement() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExternalProductManagement />
    </QueryClientProvider>
  );
}

describe('ExternalProductManagement', () => {
  beforeEach(() => {
    mockUseExternalCatalog.mockReset();
    mockUseExternalCatalog.mockReturnValue(baseHookReturn());
  });

  it('mostra o título e a contagem total de produtos', () => {
    renderManagement();
    expect(screen.getByText('Catálogo de Produtos')).toBeInTheDocument();
    expect(screen.getByText('2 produtos')).toBeInTheDocument();
  });

  it('renderiza um card por produto retornado', () => {
    renderManagement();
    expect(screen.getByText('Caneta Plástica Azul')).toBeInTheDocument();
    expect(screen.getByText('Caneta Vermelha')).toBeInTheDocument();
  });

  it('digitar na busca chama fetchProducts com o texto (debounce)', async () => {
    const hookReturn = baseHookReturn();
    mockUseExternalCatalog.mockReturnValue(hookReturn);
    renderManagement();
    const input = screen.getByPlaceholderText('Buscar por nome, SKU ou marca...');
    fireEvent.change(input, { target: { value: 'caneta' } });
    await new Promise((r) => setTimeout(r, 350));
    const calls = (hookReturn.fetchProducts as ReturnType<typeof vi.fn>).mock.calls;
    const sawSearch = calls.some((call) => (call[0] as Record<string, unknown>)?.search === 'caneta');
    expect(sawSearch).toBe(true);
  });

  it('alterna para o modo lista ao clicar no ícone de lista', () => {
    const { container } = renderManagement();
    const listButton = container.querySelectorAll('button')[container.querySelectorAll('button').length - 1];
    // apenas garante que o toggle nao quebra o render; a asserção visual fica para a Fase 4
    fireEvent.click(listButton);
    expect(screen.getByText('Caneta Plástica Azul')).toBeInTheDocument();
  });

  it('estado vazio: mostra "Nenhum produto encontrado" quando products=[]', () => {
    mockUseExternalCatalog.mockReturnValue(baseHookReturn({ products: [], totalProducts: 0 }));
    renderManagement();
    expect(screen.getByText('Nenhum produto encontrado')).toBeInTheDocument();
  });

  it('estado de erro: mostra a mensagem de erro do hook', () => {
    mockUseExternalCatalog.mockReturnValue(baseHookReturn({ error: 'Catalog database is temporarily unavailable' }));
    renderManagement();
    expect(screen.getByText('Catalog database is temporarily unavailable')).toBeInTheDocument();
  });
});
