/**
 * Auditoria de exports do catálogo — caminhos REAIS da tela
 * (`ExternalProductManagement`): aba "Enviados" e "Exportar seleção".
 *
 * O `logAudit` REAL roda (sem mock de `@/lib/audit`); a RPC do Supabase é
 * interceptada no client e o `triggerCsvDownload` é interceptado no módulo —
 * a prova é a ORDEM (auditoria ANTES do download) e o `p_action` enviado.
 * O `user_id` é anexado no SQL (`auth.uid()` em `log_audit_event`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductManagement } from '../ExternalProductManagement';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }),
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

// Permissão mutável por teste: liberada por padrão, bloqueada no teste do gate.
const permissao = vi.hoisted(() => ({ valor: true }));
vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: permissao.valor, isLoading: false }),
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
  return { ...actual, useCatalogRecentSends: () => mockRecentSends() };
});

const mockFetchContactPreset = vi.fn();
vi.mock('@/hooks/integrations/useCatalogContactPreset', () => ({
  fetchCatalogContactPreset: (...args: unknown[]) => mockFetchContactPreset(...args),
}));

vi.mock('../SendProductDialog', () => ({ SendProductDialog: () => <div data-testid="send-dialog" /> }));
vi.mock('../ExternalProductCard', () => ({
  ExternalProductCard: ({ product }: { product: { id: string; name: string } }) => (
    <div data-testid={`product-card-${product.id}`}>{product.name}</div>
  ),
}));

// O download do CSV é interceptado: o alvo é a ORDEM (auditoria antes dele).
const triggerCsvDownload = vi.fn();
vi.mock('../catalogExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalogExport')>();
  return { ...actual, triggerCsvDownload: (...args: unknown[]) => triggerCsvDownload(...args) };
});

// ─── Tabela falsa de `catalog_send_events`: 2 envios ───
type Linha = Record<string, unknown>;
type Resultado = { data: unknown; error: unknown };

const tabela: Linha[] = [1, 2].map((i) => ({
  id: `evt-${i}`,
  product_id: `prod-${i}`,
  product_name: `Produto ${i}`,
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
  b.range = vi.fn((from: number, to: number): Promise<Resultado> =>
    Promise.resolve({ data: tabela.slice(from, to + 1), error: null }),
  );
  return b;
}

// RPC de auditoria interceptada no client (o logAudit REAL a chama).
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn(async () => ({ error: null })) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => makeBuilder(), rpc: rpcMock },
}));

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
  triggerCsvDownload.mockReset();
  rpcMock.mockClear();
  permissao.valor = true;
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

describe('Auditoria — export da aba "Enviados" (caminho real)', () => {
  it('audita ANTES de baixar: RPC com catalog_send_history_export precede o download', async () => {
    window.history.replaceState(null, '', '/?tab=enviados');
    renderManagement();

    await waitFor(() => expect(screen.getByText(/de 2 envio/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock).toHaveBeenCalledWith(
      'log_audit_event',
      expect.objectContaining({
        p_action: 'catalog_send_history_export',
        p_entity_type: 'catalog_send_history_export',
        p_entity_id: expect.stringContaining('catalogo_enviados_'),
        p_details: expect.objectContaining({ filter: 'enviados', rows: 2 }),
      }),
    );
    expect(triggerCsvDownload).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.invocationCallOrder[0]).toBeLessThan(
      triggerCsvDownload.mock.invocationCallOrder[0],
    );
  });

  it('sem permissão: não audita nem baixa', async () => {
    permissao.valor = false;
    window.history.replaceState(null, '', '/?tab=enviados');
    renderManagement();

    await waitFor(() => expect(screen.getByText(/de 2 envio/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Exportar CSV/ })).toBeInTheDocument());
    expect(rpcMock).not.toHaveBeenCalled();
    expect(triggerCsvDownload).not.toHaveBeenCalled();
  });
});

describe('Auditoria — "Exportar seleção" da tela (caminho real)', () => {
  it('audita ANTES de baixar: RPC com catalog_export precede o download', async () => {
    renderManagement();

    await waitFor(() => expect(screen.getByTestId('product-card-p1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^Selecionar$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar seleção' }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock).toHaveBeenCalledWith(
      'log_audit_event',
      expect.objectContaining({
        p_action: 'catalog_export',
        p_entity_type: 'catalog_export',
        p_entity_id: expect.stringContaining('selecao'),
        p_details: expect.objectContaining({ filter: 'selecao', rows: 1 }),
      }),
    );
    expect(triggerCsvDownload).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.invocationCallOrder[0]).toBeLessThan(
      triggerCsvDownload.mock.invocationCallOrder[0],
    );
  });

  it('sem permissão: não audita nem baixa', async () => {
    permissao.valor = false;
    renderManagement();

    await waitFor(() => expect(screen.getByTestId('product-card-p1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^Selecionar$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar seleção' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Exportar seleção' })).toBeInTheDocument());
    expect(rpcMock).not.toHaveBeenCalled();
    expect(triggerCsvDownload).not.toHaveBeenCalled();
  });
});
