/**
 * CT-55 — deep link `?contact=<id>` na tela de Catálogo:
 *   o contato é BUSCADO por id (`fetchCatalogContactPreset`) e o `ContactResult`
 *   completo (id/nome/telefone) chega ao `SendProductDialog` como `presetContact`.
 *   Sem `contact=` o dialog abre sem contato; com um id que não resolve (RLS/id
 *   inexistente) o preset fica vazio — o código NÃO inventa um contato a partir
 *   do id da URL, precisa da busca.
 *
 * CT-57 — aba "Enviados":
 *   (a) `useCatalogSendHistory` alimenta a tabela (2 linhas → 2 linhas);
 *   (b) lista vazia mostra o estado vazio ("Nenhum produto enviado ainda."),
 *       não uma tabela vazia sem aviso;
 *   (c) `?tab=enviados` abre já na aba (e não em Produtos).
 *
 * O `SendProductDialog` é mockado: aqui se prova a FIAÇÃO entre a tela e o
 * dialog (mesmo padrão do CT28_bulkBar.test.tsx). O comportamento do dialog em
 * si (card do presetContact) já é coberto em SendProductDialog.test.tsx (CT-17).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductManagement } from '../ExternalProductManagement';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';
import type { ContactResult } from '../useSendProduct';
import type { CatalogSendHistoryRow } from '@/hooks/integrations/useCatalogSendHistory';

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
vi.mock('@/hooks/integrations/useCatalogRecentSends', () => ({
  useCatalogRecentSends: (...args: unknown[]) => mockRecentSends(...args),
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

vi.mock('../SendProductDialog', () => ({
  SendProductDialog: ({
    presetContact,
    initialVariantColor,
  }: {
    presetContact?: ContactResult | null;
    initialVariantColor?: string;
  }) => (
    <div
      data-testid="send-dialog"
      data-contact-id={presetContact?.id ?? ''}
      data-contact-name={presetContact?.name ?? ''}
      data-contact-phone={presetContact?.phone ?? ''}
      data-variant={initialVariantColor ?? ''}
    />
  ),
}));

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

const historyRow = (overrides: Partial<CatalogSendHistoryRow> = {}): CatalogSendHistoryRow => ({
  id: 'e1', product_id: 'p1', product_name: 'Caneta Plástica Azul', product_sku: 'CAN-001',
  variant_label: null, contact_id: 'c9', contact_name: 'Maria Silva', agent_id: 'a1',
  agent_name: 'Ana', template: 'informal', images_count: 1, status: 'sent',
  created_at: '2026-09-30T12:00:00Z',
  ...overrides,
});

function baseHookReturn(overrides: Record<string, unknown> = {}) {
  return {
    products: [mockProduct()],
    totalProducts: 1,
    categories: [{ id: 'cat1', name: 'Canetas', slug: 'canetas', parent_id: null }],
    suppliers: [{ id: 'sup1', name: 'Spot' }],
    loading: false,
    error: null,
    errorCode: null,
    errorStatus: null,
    fetchProducts: vi.fn(),
    fetchProduct: vi.fn().mockResolvedValue(mockProduct({ id: 'p1' })),
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
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  reduceMotion.value = false;
  window.history.replaceState(null, '', '/');
  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue({ profile: { id: 'profile-1' } });
  mockUseExternalCatalog.mockReset();
  mockUseExternalCatalog.mockReturnValue(baseHookReturn());
  mockUseCatalogStats.mockReset();
  mockUseCatalogStats.mockReturnValue({
    data: { total: 1, in_stock: 1, featured: 0, new_30d: 0, last_sync_at: new Date().toISOString() },
    isLoading: false,
    error: null,
  });
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
});

describe('CT-57 — aba "Enviados"', () => {
  it('com o hook devolvendo 2 linhas, a aba renderiza as 2 linhas na tabela', () => {
    mockSendHistory.mockReturnValue({
      rows: [
        historyRow({ id: 'e1', product_name: 'Caneta Plástica Azul' }),
        historyRow({ id: 'e2', product_name: 'Caneca de Porcelana', product_sku: 'CAN-002' }),
      ],
      isLoading: false,
      error: null,
    });
    window.history.replaceState(null, '', '/?tab=enviados');

    renderManagement();

    expect(screen.getByText('Caneta Plástica Azul')).toBeInTheDocument();
    expect(screen.getByText('Caneca de Porcelana')).toBeInTheDocument();
  });

  it('com a lista vazia, mostra o estado vazio — não uma tabela vazia sem aviso', () => {
    mockSendHistory.mockReturnValue({ rows: [], isLoading: false, error: null });
    window.history.replaceState(null, '', '/?tab=enviados');

    renderManagement();

    expect(screen.getByText('Nenhum produto enviado ainda.')).toBeInTheDocument();
    // nenhuma linha de envio foi inventada
    expect(screen.queryByText('Caneta Plástica Azul')).not.toBeInTheDocument();
  });

  it('?tab=enviados abre já na aba enviados (e não em Produtos)', () => {
    mockSendHistory.mockReturnValue({
      rows: [historyRow()],
      isLoading: false,
      error: null,
    });
    window.history.replaceState(null, '', '/?tab=enviados');

    renderManagement();

    expect(screen.getByRole('tab', { name: /Enviados/ })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: /Produtos/ })).toHaveAttribute('data-state', 'inactive');
    // conteúdo da aba enviados visível; o de produtos, não montado
    expect(screen.getByPlaceholderText('Buscar por produto, SKU, contato ou agente...')).toBeInTheDocument();
    expect(screen.queryByText('Catálogo de Produtos')).not.toBeInTheDocument();
  });

  it('sem ?tab= abre em Produtos (a aba enviados não é a padrão)', () => {
    renderManagement();

    expect(screen.getByRole('tab', { name: /Produtos/ })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: /Enviados/ })).toHaveAttribute('data-state', 'inactive');
    expect(screen.getByText('Catálogo de Produtos')).toBeInTheDocument();
  });
});

describe('CT-55 — deep link ?contact=<id>', () => {
  const preset: ContactResult = {
    id: 'c9', name: 'Cliente Deep Link', phone: '5541999990000', avatar_url: null,
  };

  it('abre o dialog com o contato buscado pré-selecionado (id/nome/telefone)', async () => {
    mockFetchContactPreset.mockResolvedValue(preset);
    window.history.replaceState(null, '', '/?view=catalog&product=p1&send=1&contact=c9');

    renderManagement();

    const dialog = await screen.findByTestId('send-dialog');
    expect(mockFetchContactPreset).toHaveBeenCalledWith('c9');
    expect(dialog).toHaveAttribute('data-contact-id', 'c9');
    expect(dialog).toHaveAttribute('data-contact-name', 'Cliente Deep Link');
    expect(dialog).toHaveAttribute('data-contact-phone', '5541999990000');
  });

  it('sem contact= abre o dialog sem contato pré-selecionado (e não busca contato)', async () => {
    window.history.replaceState(null, '', '/?view=catalog&product=p1&send=1');

    renderManagement();

    const dialog = await screen.findByTestId('send-dialog');
    expect(mockFetchContactPreset).not.toHaveBeenCalled();
    expect(dialog).toHaveAttribute('data-contact-id', '');
    expect(dialog).toHaveAttribute('data-contact-name', '');
  });

  it('id que não resolve (RLS/inexistente) não vira contato fantasma: o preset fica vazio', async () => {
    mockFetchContactPreset.mockResolvedValue(null);
    window.history.replaceState(null, '', '/?view=catalog&product=p1&send=1&contact=ghost');

    renderManagement();

    const dialog = await screen.findByTestId('send-dialog');
    expect(mockFetchContactPreset).toHaveBeenCalledWith('ghost');
    // o ContactResult vem da BUSCA, não do id da URL: nada é inventado a partir do id
    expect(dialog).toHaveAttribute('data-contact-id', '');
    expect(dialog).toHaveAttribute('data-contact-name', '');
  });

  it('o produto do deep link é buscado por id antes de abrir o dialog', async () => {
    const hookReturn = baseHookReturn({ fetchProduct: vi.fn().mockResolvedValue(mockProduct({ id: 'p1' })) });
    mockUseExternalCatalog.mockReturnValue(hookReturn);
    mockFetchContactPreset.mockResolvedValue(preset);
    window.history.replaceState(null, '', '/?view=catalog&product=p1&send=1&contact=c9');

    renderManagement();

    await screen.findByTestId('send-dialog');
    await waitFor(() => expect(hookReturn.fetchProduct).toHaveBeenCalledWith('p1'));
  });

  // Guarda de WhatsApp (mesmo critério do painel do contato: normalizeE164BR):
  // contato do link sem telefone utilizável não pode habilitar o envio.
  it('contato do link SEM WhatsApp (telefone inválido) não é pré-selecionado', async () => {
    mockFetchContactPreset.mockResolvedValue({
      id: 'c9', name: 'Sem Fone', phone: '123', avatar_url: null,
    });
    window.history.replaceState(null, '', '/?view=catalog&product=p1&send=1&contact=c9');

    renderManagement();

    const dialog = await screen.findByTestId('send-dialog');
    // não vira presetContact: o dialog abre no passo normal de seleção
    expect(dialog).toHaveAttribute('data-contact-id', '');
    expect(dialog).toHaveAttribute('data-contact-name', '');
    expect(dialog).toHaveAttribute('data-contact-phone', '');
  });

  it('contato do link com telefone válido continua pré-selecionado', async () => {
    mockFetchContactPreset.mockResolvedValue({
      id: 'c9', name: 'Cliente Deep Link', phone: '5541999990000', avatar_url: null,
    });
    window.history.replaceState(null, '', '/?view=catalog&product=p1&send=1&contact=c9');

    renderManagement();

    const dialog = await screen.findByTestId('send-dialog');
    expect(dialog).toHaveAttribute('data-contact-id', 'c9');
    expect(dialog).toHaveAttribute('data-contact-phone', '5541999990000');
  });
});
