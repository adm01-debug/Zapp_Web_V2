import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'vitest-axe';
import './catalogMocks';
import { toastError } from './catalogMocks';

// Cartão t_90dcdcc8, item 6 [refazer 1]: os botões de modo Grade/Lista só tinham `title`,
// sem `aria-pressed` — o estado não era anunciado. Prova: renderiza o
// componente REAL e exige o aria-pressed refletindo o modo.
//
// O que a recusa mandou corrigir aqui:
// - primitivos de UI REAIS: Button, Switch e Select NÃO são dublados (só os
//   hooks de dados); os dois SelectTrigger (categoria/fornecedor) ganharam
//   nome acessível e o botão de limpar a busca também;
// - sel (SelectTrigger real — em jsdom, exige o stub do pointerdown);
// - axe real com o filtro de impactos sérios do aceite + teste de controle.

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) chama
// `hasPointerCapture` no pointerdown que o abre.
beforeAll(() => {
  if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
});

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

/** Impactos sérios segundo o aceite (mesma régua da skill de a11y do repo). */
const SERIOUS = new Set(['critical', 'serious']);
const ids = (violations: { id: string }[]) => violations.map((v) => v.id).sort();

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

  it('os seletores de categoria e fornecedor (Select real) têm nome acessível', () => {
    window.localStorage.setItem('catalog.view', 'grid');
    renderManagement();

    expect(screen.getByRole('combobox', { name: 'Filtrar por categoria' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filtrar por fornecedor' })).toBeInTheDocument();
  });

  it('o interruptor "Em estoque" (Switch real) tem nome acessível', () => {
    window.localStorage.setItem('catalog.view', 'grid');
    renderManagement();

    expect(screen.getByRole('switch', { name: 'Em estoque' })).toBeInTheDocument();
  });

  it('o botão de limpar a busca tem nome acessível e limpa o filtro', () => {
    window.localStorage.setItem('catalog.view', 'grid');
    renderManagement();

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome, SKU ou marca/), {
      target: { value: 'caneta' },
    });

    const limpar = screen.getByRole('button', { name: 'Limpar busca' });
    fireEvent.click(limpar);

    expect(screen.queryByRole('button', { name: 'Limpar busca' })).not.toBeInTheDocument();
  });
});

describe('ExternalProductManagement — axe: sem violação séria (t_90dcdcc8)', () => {
  it('os filtros do catálogo não têm violações critical/serious', async () => {
    window.localStorage.setItem('catalog.view', 'grid');
    renderManagement();

    const results = await axe(document.body);
    expect({
      ...results,
      violations: results.violations.filter((v) => SERIOUS.has(v.impact ?? '')),
    }).toHaveNoViolations();
  });

  /**
   * Controle: prova que o matcher acusa violação REAL. Um `<button>` só de ícone
   * sem nome viola `button-name` (critical) — é exatamente o defeito corrigido.
   * Se o axe nunca rodasse, o controle (e o teste acima) deixaria de reprovar.
   */
  it('controle: um botão só de ícone sem nome CONTÉM button-name', async () => {
    render(
      <button type="button">
        <span data-testid="icone" />
      </button>,
    );
    const results = await axe(document.body);

    expect(ids(results.violations)).toContain('button-name');
  });
});
