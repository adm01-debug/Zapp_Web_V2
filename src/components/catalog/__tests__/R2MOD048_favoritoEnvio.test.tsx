/**
 * R2-MOD-048 — envio a partir do favorito.
 *
 * A snapshot de `catalog_favorites` não tem preço/estoque. Antes, o
 * SendProductDialog usava a snapshot como fallback e liberava o avanço: a
 * mensagem saía com "Valor: R$ 0,00" e "Em estoque: 0 un." (ou ficava presa em
 * silêncio quando a consulta falhava). Aqui o dialog REAL é montado com o
 * produto que o favorito produz (`favoriteToProduct`) e a consulta do produto
 * completo é controlada nos três estados: pendente, resolvida e falha.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SendProductDialog } from '../SendProductDialog';
import { ProductDetailDialog } from '../ProductDetailDialog';
import { favoriteToProduct, UNKNOWN_PRICE_LABEL, UNKNOWN_STOCK_LABEL } from '../catalogShared';
import type { CatalogFavorite, ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: (...args: unknown[]) => mockUseAuth(...args) }));

const mockReadiness = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/integrations/useCatalogSendReadiness', () => ({
  useCatalogSendReadiness: (...args: unknown[]) => mockReadiness(...args),
}));

vi.mock('@/hooks/integrations/useCatalogContactSearch', () => ({
  fetchCatalogContactResults: vi.fn().mockResolvedValue([]),
  logCatalogSendEvent: vi.fn().mockResolvedValue(undefined),
  CONTACT_SEARCH_MIN_CHARS: 2,
}));

vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));

/** Só a consulta do produto completo (e o favorito do detalhe) são controlados. */
const mockUseExternalProduct = vi.fn();
vi.mock('@/hooks/integrations/useExternalCatalog', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/integrations/useExternalCatalog')>(
    '@/hooks/integrations/useExternalCatalog',
  );
  return {
    ...actual,
    useExternalProduct: (...args: unknown[]) => mockUseExternalProduct(...args),
    useCatalogFavorites: () => ({ isFavorite: () => false, toggle: vi.fn() }),
  };
});

const favorito: CatalogFavorite = {
  id: 'f1',
  product_id: 'p1',
  product_name: 'Caneta Bambu',
  product_sku: 'CB-001',
  primary_image_url: null,
  created_at: '2026-10-01T12:00:00.000Z',
};

/** Exatamente o produto que a tela de favoritos entrega ao dialog. */
const snapshot = favoriteToProduct(favorito);

const produtoReal = (o: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1', name: 'Caneta Bambu', description: null, short_description: null,
  sku: 'CB-001', sale_price: 12.5, suggested_price: null, stock_quantity: 100,
  primary_image_url: null, colors: null, brand: null, origin_country: null,
  min_quantity: null, dimensions_display: null, weight_g: null, combined_sizes: null,
  product_type: null, is_kit: false, is_active: true, is_stockout: false,
  allows_personalization: false, lead_time_days: null, supply_mode: null, category_id: null,
  supplier_id: null, slug: null, capacity_ml: null, ncm_code: null, categories: null,
  suppliers: null, variants: [],
  ...o,
});

const renderDialogo = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SendProductDialog product={snapshot} open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue({ profile: { id: 'profile-1' } });
  mockReadiness.mockReset();
  mockReadiness.mockReturnValue({ blocked: false, reason: null, checking: false });
  mockUseExternalProduct.mockReset();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe('R2-MOD-048 — envio de favorito espera os dados completos', () => {
  it('pendente: não monta mensagem com zeros e bloqueia o avanço', () => {
    mockUseExternalProduct.mockReturnValue({ data: undefined, isFetching: true, refetch: vi.fn() });

    renderDialogo();

    expect(screen.queryByText(/R\$[\s\u00a0]*0,00/)).toBeNull();
    expect(screen.queryByText(/Em estoque: 0 un\./)).toBeNull();
    expect(screen.queryByText(/Valor:/)).toBeNull();
    expect(screen.getAllByText('Carregando os dados do produto...').length).toBeGreaterThan(0);

    const avancar = screen.getByRole('button', { name: 'Selecionar Contato' });
    expect(avancar).toBeDisabled();

    // Ctrl+Enter não fura o bloqueio: o dialog continua no passo de mensagem.
    fireEvent.keyDown(screen.getByTestId('send-product-dialog'), { key: 'Enter', ctrlKey: true });
    expect(screen.getByText('Modelo de mensagem')).toBeInTheDocument();
  });

  it('hidratado: mostra valor e estoque reais e libera o avanço', () => {
    mockUseExternalProduct.mockReturnValue({ data: produtoReal(), isFetching: false, refetch: vi.fn() });

    renderDialogo();
    fireEvent.click(screen.getByRole('button', { name: 'Formal' }));

    expect(screen.getAllByText(/Valor: R\$[\s\u00a0]*12,50/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Em estoque: 100 un\./).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Selecionar Contato' })).toBeEnabled();
    expect(screen.queryByText('Carregando os dados do produto...')).toBeNull();
  });

  it('falha na consulta: erro visível, "Tentar novamente" e envio ainda bloqueado', () => {
    const refetch = vi.fn();
    mockUseExternalProduct.mockReturnValue({ data: undefined, isFetching: false, refetch });

    renderDialogo();

    expect(screen.getAllByText('Não foi possível carregar os dados do produto.').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Selecionar Contato' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('R2-MOD-048 — detalhe do favorito', () => {
  it('pendente: painel mostra preço e estoque desconhecidos, sem zeros', () => {
    mockUseExternalProduct.mockReturnValue({ data: undefined, isFetching: true, refetch: vi.fn() });

    render(<ProductDetailDialog product={snapshot} open onOpenChange={vi.fn()} />);

    expect(screen.queryByText(/R\$/)).toBeNull();
    expect(screen.queryByText(/em estoque/)).toBeNull();
    expect(screen.getByText(UNKNOWN_PRICE_LABEL)).toBeInTheDocument();
    expect(screen.getByText(UNKNOWN_STOCK_LABEL)).toBeInTheDocument();
  });

  it('hidratado: volta aos valores reais do produto', () => {
    mockUseExternalProduct.mockReturnValue({ data: produtoReal(), isFetching: false, refetch: vi.fn() });

    render(<ProductDetailDialog product={snapshot} open onOpenChange={vi.fn()} />);

    expect(screen.getByText(/R\$[\s\u00a0]*12,50/)).toBeInTheDocument();
    expect(screen.getByText('100 em estoque')).toBeInTheDocument();
  });
});
