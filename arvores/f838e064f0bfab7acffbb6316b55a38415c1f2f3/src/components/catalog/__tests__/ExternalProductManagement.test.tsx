import { toastError } from './catalogMocks';
import { useCallback, useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import { toast } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductManagement } from '../ExternalProductManagement';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

// jsdom não implementa scrollIntoView; a paginação chama ao trocar de página
// (mesmo stub usado em CT25/CT68/CT69/TalkXTable).
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

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

// SendProductDialog (montado dentro de ExternalProductCard) usa useAuth()
// desde a E28 para resolver o agent_id do log de envio.
const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

// CT-70 — o componente lê `useReducedMotion`; aqui só esse hook do
// framer-motion é trocado (o resto segue real, então a asserção é sobre o DOM
// que o framer-motion de fato produz).
const reduceMotion = vi.hoisted(() => ({ value: false }));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

const mockUseExternalCatalog = vi.fn();
// E32: ModuleHeader usa useCatalogStats (total real + status de sync).
const mockUseCatalogStats = vi.fn();
// CT-28 — a barra de seleção liga o toggle de favoritos da própria tela; sem
// este mock o hook real bateria no Supabase durante o teste.
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

// CT-21/CT-28 — o "Exportar catálogo" do rail passa por exportCatalogCsv e o
// "Exportar seleção" da barra desce até o download; ambos são observados sem
// tocar na edge nem no DOM (buildCatalogCsv/catalogExportFilename seguem reais).
const exportCatalogCsvMock = vi.hoisted(() => vi.fn());
const triggerCsvDownloadMock = vi.hoisted(() => vi.fn());
vi.mock('../catalogExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalogExport')>();
  return { ...actual, exportCatalogCsv: exportCatalogCsvMock, triggerCsvDownload: triggerCsvDownloadMock };
});

function baseHookReturn(overrides: Record<string, unknown> = {}) {
  return {
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
    exportCatalogCsvMock.mockReset();
    triggerCsvDownloadMock.mockReset();
    mockUseExternalCatalog.mockReset();
    mockUseExternalCatalog.mockReturnValue(baseHookReturn());
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({ profile: { id: 'profile-1' } });
    toastError.mockReset();
    vi.mocked(toast.success).mockClear();
    mockFavorites.mockReset();
    mockFavorites.mockReturnValue({
      favorites: [],
      favoriteIds: new Set<string>(),
      isFavorite: () => false,
      isLoading: false,
      toggle: vi.fn(),
    });
    mockUseCatalogStats.mockReset();
    mockUseCatalogStats.mockReturnValue({
      data: {
        total: 2,
        in_stock: 2,
        featured: 1,
        new_30d: 1,
        categories_root: 1,
        suppliers_active: 1,
        last_sync_at: new Date().toISOString(),
      },
      isLoading: false,
      error: null,
    });
  });

  it('mostra o título e a contagem total de produtos', () => {
    renderManagement();
    expect(screen.getByText('Catálogo de Produtos')).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === '2 produtos sincronizados em tempo real com o PromoGifts. Gerencie, edite e compartilhe produtos.')).toBeInTheDocument();
  });

  it('E32: chip de sync recente mostra "Sincronizado" (tom success)', () => {
    mockUseCatalogStats.mockReturnValue({
      data: { total: 2, last_sync_at: new Date().toISOString() },
      isLoading: false,
      error: null,
    });
    renderManagement();
    expect(screen.getByText(/^Sincronizado /)).toBeInTheDocument();
  });

  it('E32: chip de sync com mais de 24h mostra data/hora (tom neutro)', () => {
    const stale = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    mockUseCatalogStats.mockReturnValue({
      data: { total: 2, last_sync_at: stale },
      isLoading: false,
      error: null,
    });
    renderManagement();
    expect(screen.getByText(/^Última sincronização em /)).toBeInTheDocument();
  });

  it('renderiza um card por produto retornado', () => {
    renderManagement();
    expect(screen.getByText('Caneta Plástica Azul')).toBeInTheDocument();
    expect(screen.getByText('Caneta Vermelha')).toBeInTheDocument();
  });

  it('E33: clicar no KPI "Em destaque" aplica is_featured=true na proxima busca', async () => {
    const hookReturn = baseHookReturn();
    mockUseExternalCatalog.mockReturnValue(hookReturn);
    renderManagement();
    // O rail (E53) exibe a mesma label "Em destaque" na lista de contagens;
    // o clique precisa ser escopado no strip de KPIs para nao ficar ambiguo.
    fireEvent.click(within(screen.getByTestId('catalog-kpi-strip')).getByText('Em destaque'));
    await new Promise((r) => setTimeout(r, 350));
    const calls = (hookReturn.fetchProducts as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = calls[calls.length - 1][0] as Record<string, unknown>;
    expect(lastCall.is_featured).toBe(true);
  });

  it('E33: clicar no KPI "Total" nao aplica filtro nenhum (nao-acionavel)', async () => {
    const hookReturn = baseHookReturn();
    mockUseExternalCatalog.mockReturnValue(hookReturn);
    renderManagement();
    // O effeito de debounce roda no mount tambem (array de deps nao vazio
    // ainda dispara na 1a renderizacao) - espera esse assentar antes de
    // limpar, senao ele conta como uma chamada "nova" mais tarde.
    await new Promise((r) => setTimeout(r, 350));
    hookReturn.fetchProducts.mockClear();
    fireEvent.click(screen.getByText('Produtos no total'));
    await new Promise((r) => setTimeout(r, 350));
    expect(hookReturn.fetchProducts).not.toHaveBeenCalled();
  });

  it('CT-23: "Ver produtos com estoque baixo" no rail aplica low_stock=true na próxima busca', async () => {
    const hookReturn = baseHookReturn();
    mockUseExternalCatalog.mockReturnValue(hookReturn);
    // low_stock > 0 é o que faz o alerta (e o botão) existirem; sem isso o
    // rail nem renderiza o bloco (nada morto: botão só aparece com dado real).
    mockUseCatalogStats.mockReturnValue({
      data: { total: 2, low_stock: 7, last_sync_at: new Date().toISOString() },
      isLoading: false,
      error: null,
    });
    renderManagement();
    await new Promise((r) => setTimeout(r, 350));
    hookReturn.fetchProducts.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Ver produtos com estoque baixo' }));

    await new Promise((r) => setTimeout(r, 350));
    const calls = (hookReturn.fetchProducts as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = calls[calls.length - 1][0] as Record<string, unknown>;
    expect(lastCall.low_stock).toBe(true);
  });

  it('CT-21: "Exportar catálogo" no rail exporta o filtro ativo (Em destaque → featured)', async () => {
    const hookReturn = baseHookReturn();
    mockUseExternalCatalog.mockReturnValue(hookReturn);
    renderManagement();
    await new Promise((r) => setTimeout(r, 350));

    fireEvent.click(within(screen.getByTestId('catalog-kpi-strip')).getByText('Em destaque'));
    await new Promise((r) => setTimeout(r, 350));

    fireEvent.click(screen.getByRole('button', { name: /Exportar catálogo/ }));

    await waitFor(() => expect(exportCatalogCsvMock).toHaveBeenCalled());
    const options = exportCatalogCsvMock.mock.calls[0][0] as {
      filterKey: string;
      filters: Record<string, unknown>;
    };
    expect(options.filterKey).toBe('featured');
    expect(options.filters).toEqual({ is_featured: true });
  });

  it('CT-21: sem filtro do rail ativo, o export sai como catálogo inteiro (todos)', async () => {
    renderManagement();
    await new Promise((r) => setTimeout(r, 350));

    fireEvent.click(screen.getByRole('button', { name: /Exportar catálogo/ }));

    await waitFor(() => expect(exportCatalogCsvMock).toHaveBeenCalled());
    const options = exportCatalogCsvMock.mock.calls[0][0] as {
      filterKey: string;
      filters: Record<string, unknown>;
    };
    expect(options.filterKey).toBe('todos');
    expect(options.filters).toEqual({});
  });

  it('R2-MOD-041: "Exportar catálogo" leva a busca da listagem (não só o filtro do rail)', async () => {
    renderManagement();
    await new Promise((r) => setTimeout(r, 350));

    fireEvent.change(screen.getByPlaceholderText('Buscar por nome, SKU ou marca...'), {
      target: { value: 'caneta' },
    });
    await new Promise((r) => setTimeout(r, 350));

    fireEvent.click(screen.getByRole('button', { name: /Exportar catálogo/ }));

    await waitFor(() => expect(exportCatalogCsvMock).toHaveBeenCalled());
    const options = exportCatalogCsvMock.mock.calls[0][0] as { filters: Record<string, unknown> };
    expect(options.filters).toEqual({ search: 'caneta' });
  });

  it('R2-MOD-041: busca, categoria e estoque baixo chegam TODOS ao export', async () => {
    // low_stock > 0 é o que faz o alerta (e o botão de filtro) existirem.
    mockUseCatalogStats.mockReturnValue({
      data: { total: 2, low_stock: 7, in_stock: 2, featured: 1, new_30d: 1, last_sync_at: new Date().toISOString() },
      isLoading: false,
      error: null,
    });
    renderManagement();
    await new Promise((r) => setTimeout(r, 350));

    fireEvent.change(screen.getByPlaceholderText('Buscar por nome, SKU ou marca...'), {
      target: { value: 'caneta' },
    });
    await new Promise((r) => setTimeout(r, 350));
    fireEvent.click(screen.getByRole('button', { name: 'Canetas' }));
    await new Promise((r) => setTimeout(r, 350));
    fireEvent.click(screen.getByRole('button', { name: 'Ver produtos com estoque baixo' }));
    await new Promise((r) => setTimeout(r, 350));

    fireEvent.click(screen.getByRole('button', { name: /Exportar catálogo/ }));

    await waitFor(() => expect(exportCatalogCsvMock).toHaveBeenCalled());
    const options = exportCatalogCsvMock.mock.calls[0][0] as { filters: Record<string, unknown> };
    expect(options.filters).toEqual({ search: 'caneta', category_id: 'cat1', low_stock: true });
  });

  it('E34: clicar no chip de categoria aplica o filtro e reflete na URL', async () => {
    const hookReturn = baseHookReturn();
    mockUseExternalCatalog.mockReturnValue(hookReturn);
    renderManagement();
    await new Promise((r) => setTimeout(r, 350));
    hookReturn.fetchProducts.mockClear();

    // "Canetas" tambem aparece como badge (div, nao clicavel) nos cards
    // de produto mockados - getByRole('button', ...) pega so o chip real,
    // ignora os badges (achado real: getAllByText pegava 3 elementos, o
    // ultimo era um badge de card sem onClick, testando nada).
    fireEvent.click(screen.getByRole('button', { name: 'Canetas' }));

    await new Promise((r) => setTimeout(r, 350));
    const calls = (hookReturn.fetchProducts as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = calls[calls.length - 1][0] as Record<string, unknown>;
    expect(lastCall.category_id).toBe('cat1');
    expect(window.location.search).toContain('view=catalog');
    expect(window.location.search).toContain('cat=cat1');
  });

  it('E34: URL com ?view=catalog&cat=<id> ja aplica o filtro no mount', () => {
    // parseCatalogCategoryRoute exige formato UUID de verdade - 'cat1' (o
    // id simplificado usado nos outros mocks deste arquivo) e rejeitado
    // como malformado por design, entao aqui precisa de um id real.
    const realCategoryId = 'a1b2c3d4-e5f6-4789-a123-456789abcdef';
    const previousSearch = window.location.search;
    window.history.replaceState(null, '', `/?view=catalog&cat=${realCategoryId}`);
    try {
      const hookReturn = baseHookReturn({
        categories: [{ id: realCategoryId, name: 'Canetas', slug: 'canetas', parent_id: null }],
      });
      mockUseExternalCatalog.mockReturnValue(hookReturn);
      renderManagement();
      const chip = screen.getByRole('button', { name: 'Canetas' });
      expect(chip.className).toContain('catalog-category-chip--active');
    } finally {
      window.history.replaceState(null, '', previousSearch || '/');
    }
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

  it('estado vazio sem filtros: mostra "Catálogo vazio" quando products=[]', () => {
    // Texto atualizado pela E39 (achado e corrigido de forma independente
    // em duas sessoes concorrentes - a mensagem generica antiga nao existe
    // mais, virou 2 mensagens distintas conforme ha ou nao filtro ativo).
    mockUseExternalCatalog.mockReturnValue(baseHookReturn({ products: [], totalProducts: 0 }));
    renderManagement();
    expect(screen.getByText('Catálogo vazio')).toBeInTheDocument();
    expect(screen.getByText('Nenhum produto sincronizado ainda.')).toBeInTheDocument();
  });

  it('estado vazio com filtros ativos: mostra "Nenhum produto com esses filtros"', async () => {
    mockUseExternalCatalog.mockReturnValue(baseHookReturn({ products: [], totalProducts: 0 }));
    renderManagement();
    const input = screen.getByPlaceholderText('Buscar por nome, SKU ou marca...');
    fireEvent.change(input, { target: { value: 'caneta' } });
    expect(screen.getByText('Nenhum produto com esses filtros')).toBeInTheDocument();
  });

  it('estado de erro: mostra a mensagem de erro do hook', () => {
    mockUseExternalCatalog.mockReturnValue(baseHookReturn({ error: 'Catalog database is temporarily unavailable' }));
    renderManagement();
    expect(screen.getByText('Catalog database is temporarily unavailable')).toBeInTheDocument();
  });

  describe('E36: filtros avançados de cor/material', () => {
    it('mostra o placeholder dinâmico do preço máximo — nunca "999,99" fixo', () => {
      mockUseCatalogStats.mockReturnValue({
        data: { total: 2, price_max: 199.9 },
        isLoading: false,
        error: null,
      });
      renderManagement();
      fireEvent.click(screen.getByText('Filtros avançados'));
      expect(screen.getByPlaceholderText('200')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('999,99')).not.toBeInTheDocument();
    });

    it('selecionar uma cor filtra os produtos exibidos no client (edge só aceita 1 valor escalar)', () => {
      const hookReturn = baseHookReturn({
        products: [
          mockProduct({ id: 'p1', name: 'Caneta Azul', colors: ['Azul'] }),
          mockProduct({ id: 'p2', name: 'Caneta Vermelha', sku: 'CAN-002', colors: ['Vermelho'] }),
        ],
      });
      mockUseExternalCatalog.mockReturnValue(hookReturn);
      mockUseCatalogStats.mockReturnValue({
        data: { total: 2, top_colors: [{ label: 'Azul', count: 1 }, { label: 'Vermelho', count: 1 }] },
        isLoading: false,
        error: null,
      });
      renderManagement();
      expect(screen.getByText('Caneta Azul')).toBeInTheDocument();
      expect(screen.getByText('Caneta Vermelha')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Filtros avançados'));
      fireEvent.click(screen.getByRole('button', { name: 'Azul' }));
      fireEvent.click(screen.getByText('Aplicar filtros'));

      expect(screen.getByText('Caneta Azul')).toBeInTheDocument();
      expect(screen.queryByText('Caneta Vermelha')).not.toBeInTheDocument();
    });

    it('com exatamente 1 cor selecionada, envia color=[valor] (array) pro servidor (fetchProducts)', async () => {
      const hookReturn = baseHookReturn({
        products: [mockProduct({ id: 'p1', name: 'Caneta Azul', colors: ['Azul'] })],
      });
      mockUseExternalCatalog.mockReturnValue(hookReturn);
      mockUseCatalogStats.mockReturnValue({
        data: { total: 1, top_colors: [{ label: 'Azul', count: 1 }] },
        isLoading: false,
        error: null,
      });
      renderManagement();
      await new Promise((r) => setTimeout(r, 350));
      hookReturn.fetchProducts.mockClear();

      fireEvent.click(screen.getByText('Filtros avançados'));
      fireEvent.click(screen.getByRole('button', { name: 'Azul' }));
      fireEvent.click(screen.getByText('Aplicar filtros'));

      await new Promise((r) => setTimeout(r, 350));
      const calls = (hookReturn.fetchProducts as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1][0] as Record<string, unknown>;
      expect(lastCall.color).toEqual(['Azul']);
    });

    it('com 2+ cores selecionadas, envia color=[v1,v2] (array) pro servidor — corrige contagem/paginação (E36-2)', async () => {
      const hookReturn = baseHookReturn({
        products: [
          mockProduct({ id: 'p1', name: 'Caneta Azul', colors: ['Azul'] }),
          mockProduct({ id: 'p2', name: 'Caneta Vermelha', sku: 'CAN-002', colors: ['Vermelho'] }),
        ],
      });
      mockUseExternalCatalog.mockReturnValue(hookReturn);
      mockUseCatalogStats.mockReturnValue({
        data: { total: 2, top_colors: [{ label: 'Azul', count: 1 }, { label: 'Vermelho', count: 1 }] },
        isLoading: false,
        error: null,
      });
      renderManagement();
      await new Promise((r) => setTimeout(r, 350));
      hookReturn.fetchProducts.mockClear();

      fireEvent.click(screen.getByText('Filtros avançados'));
      fireEvent.click(screen.getByRole('button', { name: 'Azul' }));
      fireEvent.click(screen.getByRole('button', { name: 'Vermelho' }));
      fireEvent.click(screen.getByText('Aplicar filtros'));

      await new Promise((r) => setTimeout(r, 350));
      const calls = (hookReturn.fetchProducts as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1][0] as Record<string, unknown>;
      expect(lastCall.color).toEqual(['Azul', 'Vermelho']);
      // filtro client-side é 2ª camada idempotente — ambos continuam visíveis
      expect(screen.getByText('Caneta Azul')).toBeInTheDocument();
      expect(screen.getByText('Caneta Vermelha')).toBeInTheDocument();
    });

    it('material: mesmo fluxo de seleção/filtragem client-side que cor', () => {
      const hookReturn = baseHookReturn({
        products: [
          mockProduct({ id: 'p1', name: 'Caneta Metal', materials: ['Metal'] }),
          mockProduct({ id: 'p2', name: 'Caneta Plástico', sku: 'CAN-002', materials: ['Plástico'] }),
        ],
      });
      mockUseExternalCatalog.mockReturnValue(hookReturn);
      mockUseCatalogStats.mockReturnValue({
        data: { total: 2, top_materials: [{ label: 'Metal', count: 1 }, { label: 'Plástico', count: 1 }] },
        isLoading: false,
        error: null,
      });
      renderManagement();

      fireEvent.click(screen.getByText('Filtros avançados'));
      fireEvent.click(screen.getByRole('button', { name: 'Metal' }));
      fireEvent.click(screen.getByText('Aplicar filtros'));

      expect(screen.getByText('Caneta Metal')).toBeInTheDocument();
      expect(screen.queryByText('Caneta Plástico')).not.toBeInTheDocument();
    });

    it('stats é repassado à Sheet: com stats=undefined, o teto do slider cai para o fallback sem quebrar', () => {
      mockUseCatalogStats.mockReturnValue({ data: undefined, isLoading: true, error: null });
      renderManagement();
      fireEvent.click(screen.getByText('Filtros avançados'));
      expect(screen.getByPlaceholderText('2000')).toBeInTheDocument();
    });
  });

  describe('CT-59: erro por código da edge', () => {
    const renderWithError = (overrides: Record<string, unknown>) => {
      const hookReturn = baseHookReturn({ products: [], totalProducts: 0, ...overrides });
      mockUseExternalCatalog.mockReturnValue(hookReturn);
      renderManagement();
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

    it('CATALOG_NOT_CONFIGURED: mostra o código para o admin', () => {
      renderWithError({ error: 'Catalog is not configured', errorCode: 'CATALOG_NOT_CONFIGURED', errorStatus: 503 });

      expect(screen.getByText(/Código do erro:/)).toBeInTheDocument();
      expect(screen.getByText('CATALOG_NOT_CONFIGURED')).toBeInTheDocument();
    });

    it('CATALOG_CREDENTIALS_INVALID: mostra o código real da edge', () => {
      renderWithError({
        error: 'Catalog credentials are not authorized for the requested resource',
        errorCode: 'CATALOG_CREDENTIALS_INVALID',
        errorStatus: 503,
      });

      expect(screen.getByText('CATALOG_CREDENTIALS_INVALID')).toBeInTheDocument();
    });

    it('429: toast "Muitas requisições, aguarde 1 min" + botões desabilitados', async () => {
      renderWithError({
        error: 'Too many requests. Try again in 1 minute.',
        errorCode: 'CATALOG_RATE_LIMITED',
        errorStatus: 429,
      });

      await waitFor(() => {
        expect(toastError).toHaveBeenCalledWith('Muitas requisições, aguarde 1 min');
      });
      expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Atualizar/ })).toBeDisabled();
    });
  });

  describe('CT-60: contagem nos filtros', () => {
    it('select de categoria em árvore com contagem (raiz semibold, filho indentado)', () => {
      mockUseExternalCatalog.mockReturnValue(baseHookReturn({
        categories: [
          { id: 'cat1', name: 'Brindes', slug: 'brindes', parent_id: null, products_count: 42 },
          { id: 'cat2', name: 'Canecas', slug: 'canecas', parent_id: 'cat1', products_count: 7 },
          { id: 'cat3', name: 'Sem contagem', slug: 'sem', parent_id: null },
        ],
      }));
      renderManagement();

      fireEvent.keyDown(screen.getAllByRole('combobox')[0], { key: 'ArrowDown' });

      expect(screen.getByRole('option', { name: 'Brindes (42)' }).className).toContain('font-semibold');
      expect(screen.getByRole('option', { name: 'Canecas (7)' }).className).toContain('pl-6');
      expect(screen.getByRole('option', { name: 'Sem contagem' })).toBeInTheDocument();
    });

    it('select de fornecedor não inventa contagem (não há fonte real)', () => {
      renderManagement();

      fireEvent.keyDown(screen.getAllByRole('combobox')[1], { key: 'ArrowDown' });

      expect(screen.getByRole('option', { name: 'Spot' })).toBeInTheDocument();
    });
  });

  describe('CT-22: opção de ordenação "Mais pedidos" removida', () => {
    it('o menu de ordenação não oferece "Mais pedidos" (PromoGifts ainda não expõe order_count)', () => {
      renderManagement();
      // O gatilho é um DropdownMenu (Radix): abre com ArrowDown no trigger,
      // as opções viram menuitemradio (mesmo padrão dos testes de Select acima).
      const trigger = screen.getByRole('button', { name: /^Ordenar:/ });
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });

      const labels = screen
        .getAllByRole('menuitemradio')
        .map((o) => (o.textContent ?? '').trim());

      expect(labels.some((l) => /mais pedidos/i.test(l))).toBe(false);
      expect(labels).not.toContain('Mais pedidos');
      // A remoção foi cirúrgica: as demais opções continuam disponíveis.
      expect(labels).toContain('Nome A–Z');
      expect(labels).toContain('Maior estoque');
      expect(labels).toContain('Mais recentes');
    });
  });

  describe('CT-28: barra de seleção em massa', () => {
    const abrirBarra = () => fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));

    it('selecionar a página abre a barra com envio, "Exportar seleção" e "Favoritar N"', () => {
      renderManagement();

      abrirBarra();

      expect(screen.getByRole('button', { name: 'Enviar (2)' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Exportar seleção' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Favoritar 2' })).toBeInTheDocument();
    });

    it('"Exportar seleção" baixa CSV com cabeçalho + as linhas selecionadas', async () => {
      renderManagement();
      await new Promise((r) => setTimeout(r, 350));

      abrirBarra();
      fireEvent.click(screen.getByRole('button', { name: 'Exportar seleção' }));

      expect(triggerCsvDownloadMock).toHaveBeenCalledTimes(1);
      const [csv, filename] = triggerCsvDownloadMock.mock.calls[0] as [string, string];
      expect(csv.split('\n')).toHaveLength(3); // cabeçalho + 2 produtos
      expect(csv).toContain('CAN-001');
      expect(filename).toContain('selecao');
    });

    it('"Favoritar N" favorita só os selecionados que ainda não são favoritos', () => {
      const toggle = vi.fn();
      mockFavorites.mockReturnValue({
        favorites: [], favoriteIds: new Set(['p2']), isFavorite: (id: string) => id === 'p2',
        isLoading: false, toggle,
      });
      renderManagement();

      abrirBarra();
      fireEvent.click(screen.getByRole('button', { name: 'Favoritar 2' }));

      expect(toggle).toHaveBeenCalledTimes(1);
      expect(toggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', name: 'Caneta Plástica Azul' }));
    });

    it('R2-MOD-043: "Favoritar N" só anuncia o sucesso depois de a escrita confirmar', async () => {
      const pending: Array<(ok: boolean) => void> = [];
      const toggle = vi.fn(() => new Promise<boolean>((resolve) => { pending.push(resolve); }));
      mockFavorites.mockReturnValue({
        favorites: [], favoriteIds: new Set<string>(), isFavorite: () => false,
        isLoading: false, toggle,
      });
      renderManagement();

      abrirBarra();
      fireEvent.click(screen.getByRole('button', { name: 'Favoritar 2' }));

      // A escrita segue pendente: nada de confirmação na tela ainda.
      expect(toggle).toHaveBeenCalledTimes(2);
      expect(vi.mocked(toast.success)).not.toHaveBeenCalled();

      await act(async () => { pending.forEach((resolve) => resolve(true)); });

      await waitFor(() =>
        expect(vi.mocked(toast.success)).toHaveBeenCalledWith('2 produto(s) adicionado(s) aos favoritos'),
      );
    });

    it('R2-MOD-043: "Favoritar N" avisa quando a persistência falha, em vez de confirmar', async () => {
      const toggle = vi.fn().mockResolvedValue(false);
      mockFavorites.mockReturnValue({
        favorites: [], favoriteIds: new Set<string>(), isFavorite: () => false,
        isLoading: false, toggle,
      });
      renderManagement();

      abrirBarra();
      fireEvent.click(screen.getByRole('button', { name: 'Favoritar 2' }));

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith('2 produto(s) não foram salvos nos favoritos. Tente novamente.'),
      );
      expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
    });

    it('R2-MOD-043: anuncia só a quantidade que a escrita confirmou', async () => {
      const toggle = vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      mockFavorites.mockReturnValue({
        favorites: [], favoriteIds: new Set<string>(), isFavorite: () => false,
        isLoading: false, toggle,
      });
      renderManagement();

      abrirBarra();
      fireEvent.click(screen.getByRole('button', { name: 'Favoritar 2' }));

      await waitFor(() =>
        expect(vi.mocked(toast.success)).toHaveBeenCalledWith('1 produto(s) adicionado(s) aos favoritos'),
      );
      expect(toastError).toHaveBeenCalledWith('1 produto(s) não foram salvos nos favoritos. Tente novamente.');
    });
  });

  describe('CT-84: ajuda do catálogo no header', () => {
    it('o botão "Ajuda" do header abre o CatalogHelpSheet (5 passos)', () => {
      renderManagement();

      // Sheet fechado por padrão (Radix não monta o conteúdo fechado).
      expect(screen.queryByTestId('catalog-help-sheet')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Ajuda/ }));

      expect(screen.getByTestId('catalog-help-sheet')).toBeInTheDocument();
      expect(screen.getByText('Como usar o catálogo')).toBeInTheDocument();
      expect(screen.getByTestId('catalog-help-steps').querySelectorAll('li')).toHaveLength(5);
    });
  });

  // R2-MOD-009 — na gestão, o efeito de paginação só buscava com `page > 0`;
  // voltar para a 1ª deixava os produtos da página anterior na grade.
  it('R2-MOD-009: voltar para a 1ª página emite a consulta (offset 0) e devolve os produtos da 1ª', async () => {
    const TOTAL = 60;
    const emitidos: Array<Record<string, unknown>> = [];
    // Identidades estáveis: a tela reexecuta efeitos que têm estas funções nas
    // deps (o hook real as memoiza com useCallback).
    const fetchCategories = vi.fn();
    const fetchSuppliers = vi.fn();
    // Hook "com servidor": a página exibida é a que o próprio componente
    // consultou (offset do último fetchProducts) — os cards provam a consulta.
    mockUseExternalCatalog.mockImplementation(() => {
      const [params, setParams] = useState<Record<string, unknown> | null>(null);
      const fetchProducts = useCallback((p: Record<string, unknown> = {}) => {
        emitidos.push(p);
        setParams(p);
      }, []);
      const offset = Number(params?.offset ?? 0);
      const limit = Number(params?.limit ?? 24);
      const products = Array.from(
        { length: Math.max(0, Math.min(limit, TOTAL - offset)) },
        (_, i) => mockProduct({ id: `p${offset + i + 1}`, name: `Produto ${offset + i + 1}`, sku: `SKU-${offset + i + 1}` })
      );
      return baseHookReturn({ products, totalProducts: TOTAL, fetchProducts, fetchCategories, fetchSuppliers });
    });

    // URL limpa: a leitura de `?page=`/`?tab=` no mount não pode herdar o que
    // outros testes deste arquivo deixaram na history.
    window.history.replaceState(null, '', '/');
    try {
      renderManagement();
      await new Promise((r) => setTimeout(r, 350));
      expect(screen.getByText('Produto 1')).toBeInTheDocument();
      expect(screen.queryByText('Produto 25')).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Próxima página'));
      expect(await screen.findByText('Produto 25')).toBeInTheDocument();
      expect(screen.queryByText('Produto 1')).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Página anterior'));
      // volta para a 1ª: busca de novo e mostra os mesmos produtos do começo
      expect(await screen.findByText('Produto 1')).toBeInTheDocument();
      expect(screen.queryByText('Produto 25')).not.toBeInTheDocument();
      // a consulta de retorno saiu: 2ª página (offset 24) e, depois, a 1ª (0)
      expect(emitidos.slice(-2).map((c) => c.offset)).toEqual([24, 0]);
    } finally {
      // o describe CT-70 (irmão deste) não tem beforeEach próprio: sem
      // restaurar aqui, o hook falso vazaria para ele.
      mockUseExternalCatalog.mockReset();
      mockUseExternalCatalog.mockReturnValue(baseHookReturn());
      window.history.replaceState(null, '', '/');
    }
  });
});

describe('ExternalProductManagement — CT-70 (prefers-reduced-motion)', () => {
  afterEach(() => {
    reduceMotion.value = false;
  });

  const comOpacidadeInicial = (root: HTMLElement) =>
    root.querySelectorAll('[style*="opacity: 0"]').length;

  it('sem redução, o cabeçalho e os cards entram animando', () => {
    reduceMotion.value = false;
    const { container } = renderManagement();

    // 1 motion.div do cabeçalho (ModuleHeader) + 1 por card da grade
    expect(comOpacidadeInicial(container)).toBeGreaterThanOrEqual(3);
  });

  it('com redução, nada entra animando (estado final direto)', () => {
    reduceMotion.value = true;
    const { container } = renderManagement();

    expect(comOpacidadeInicial(container)).toBe(0);
    // a grade continua montada — só a animação foi pulada
    expect(screen.getByText('Caneta Plástica Azul')).toBeInTheDocument();
    expect(screen.getByText('Catálogo de Produtos')).toBeInTheDocument();
  });
});
