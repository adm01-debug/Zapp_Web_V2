/**
 * N-058 — Catálogo › Gestão: alvos/a11y da aba "Enviados" e altura das abas.
 *
 * Prova, chamando o código REAL (getByRole/getByLabelText com nome acessível):
 *   (1) o campo de busca da aba Enviados tem nome acessível ("Buscar envios");
 *   (2) o botão X de limpar a busca tem nome acessível ("Limpar busca de enviados");
 *   (3) o SelectTrigger de status tem nome acessível ("Filtrar envios por status");
 *   (4) as três abas têm no mínimo 44 px no celular (min-h-11) sem mudar o
 *       desktop (sm:min-h-0 devolve a altura original).
 *
 * Sem os aria-label e as classes responsivas, cada teste falha (vermelho).
 * Mesmo harness de mocks do CT55_57_management.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductManagement } from '../ExternalProductManagement';
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
  SendProductDialog: () => <div data-testid="send-dialog" />,
}));

vi.mock('../ExternalProductCard', () => ({
  ExternalProductCard: () => <button type="button">Enviar</button>,
}));

const historyRow = (overrides: Partial<CatalogSendHistoryRow> = {}): CatalogSendHistoryRow => ({
  id: 'e1', product_id: 'p1', product_name: 'Caneta Plástica Azul', product_sku: 'CAN-001',
  variant_label: null, contact_id: 'c9', contact_name: 'Maria Silva', agent_id: 'a1',
  agent_name: 'Ana', template: 'informal', images_count: 1, status: 'sent',
  created_at: '2026-09-30T12:00:00Z',
  ...overrides,
});

function baseHookReturn(overrides: Record<string, unknown> = {}) {
  return {
    products: [], totalProducts: 0, categories: [], suppliers: [],
    loading: false, error: null, errorCode: null, errorStatus: null,
    fetchProducts: vi.fn(), fetchProduct: vi.fn(), fetchCategories: vi.fn(), fetchSuppliers: vi.fn(),
    isFetching: false, isInitialLoading: false, invalidate: vi.fn(),
    ...overrides,
  };
}

function renderEnviadosTab() {
  window.history.replaceState(null, '', '/?tab=enviados');
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
  mockUseCatalogStats.mockReturnValue({ data: null, isLoading: false, error: null });
  mockFavorites.mockReset();
  mockFavorites.mockReturnValue({
    favorites: [], favoriteIds: new Set<string>(), isFavorite: () => false, isLoading: false, toggle: vi.fn(),
  });
  mockRecentSends.mockReset();
  mockRecentSends.mockReturnValue({ recent: [], topSent: [] });
  mockSendHistory.mockReset();
  mockSendHistory.mockReturnValue({ rows: [historyRow()], isLoading: false, error: null });
  mockFetchContactPreset.mockReset();
  mockFetchContactPreset.mockResolvedValue(null);
});

describe('N-058 — headers acessíveis e alvo de toque das abas', () => {
  it('o campo de busca da aba Enviados tem nome acessível', () => {
    renderEnviadosTab();
    expect(screen.getByLabelText('Buscar envios')).toBeInTheDocument();
  });

  it('o botão X de limpar busca tem nome acessível', () => {
    renderEnviadosTab();

    // o X só aparece com busca preenchida
    fireEvent.change(screen.getByLabelText('Buscar envios'), { target: { value: 'Caneta' } });

    expect(screen.getByRole('button', { name: 'Limpar busca de enviados' })).toBeInTheDocument();
  });

  it('o filtro de status tem nome acessível no combobox', () => {
    renderEnviadosTab();
    expect(screen.getByRole('combobox', { name: 'Filtrar envios por status' })).toBeInTheDocument();
  });

  it('as três abas têm no mínimo 44 px no celular e mantêm a altura no desktop', () => {
    renderEnviadosTab();

    for (const name of [/Produtos/, /Favoritos/, /Enviados/]) {
      const tab = screen.getByRole('tab', { name });
      expect(tab).toHaveClass('min-h-11');      // 44 px no celular
      expect(tab).toHaveClass('sm:min-h-0');    // altura original no desktop
    }
  });
});
