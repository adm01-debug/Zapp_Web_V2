/**
 * Y29 / SEC-SAIDAS_DE_INFORMACAO-01 e -02 — gate de download nos caminhos do
 * catálogo (P0).
 *
 * Cada caminho é exercitado chamando o HELPER REAL (`downloadFileWithPermission`)
 * por dentro da função/componente de produção: sem `profiles.can_download`
 * ninguém chama `URL.createObjectURL` nem clica em anchor; com a permissão, o
 * arquivo sai como antes.
 *
 * Cobre:
 *  1. `triggerCsvDownload`/`exportCatalogCsv` (CSV de produtos — "Exportar
 *     catálogo" do rail e "Exportar seleção" das duas telas);
 *  2. `downloadImageAsBlob` (fotos do produto — `SendProductDialog`);
 *  3. o disparo do CSV de histórico de envios (`ExternalProductManagement`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { exportCatalogCsv, triggerCsvDownload } from '../catalogExport';
import { downloadImageAsBlob } from '../sendProductUtils';
import { SendProductDialog } from '../SendProductDialog';
import type { ExternalProduct, ExternalProductVariant } from '@/hooks/integrations/useExternalCatalog';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), loading: vi.fn(() => 't1'), dismiss: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

// Y29 — a permissão vem de `useDownloadPermission` (lida por
// `profiles.can_download`); aqui cada teste decide o valor.
const permissao = vi.hoisted(() => ({ valor: false }));
vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: permissao.valor, isLoading: false }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: { id: 'profile-1' } }) }));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/hooks/integrations/useCatalogSendReadiness', () => ({
  useCatalogSendReadiness: () => ({ ready: true, loading: false, reason: null }),
}));
vi.mock('@/hooks/integrations/useCatalogContactSearch', () => ({
  fetchCatalogContactResults: vi.fn().mockResolvedValue([]),
  logCatalogSendEvent: vi.fn().mockResolvedValue(undefined),
  CONTACT_SEARCH_MIN_CHARS: 2,
}));
vi.mock('@/services/outbound-message.service', () => ({ sendOutboundMessage: vi.fn() }));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));

const mockVariant = (o: Partial<ExternalProductVariant> = {}): ExternalProductVariant => ({
  id: 'v1', product_id: 'p1', sku: 'CB-001-A', name: 'Azul',
  attributes: null, stock_quantity: 10, color_name: 'Azul', color_hex: null,
  size_code: null, capacity_ml: null, selected_thumbnail: null, is_active: true,
  ...o,
});

const mockProduct = (o: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1', name: 'Caneta Bambu', description: null, short_description: null,
  sku: 'CB-001', sale_price: 12.5, suggested_price: null, stock_quantity: 100,
  primary_image_url: null, colors: null, brand: null,
  origin_country: null, min_quantity: null, dimensions_display: null, weight_g: null,
  combined_sizes: null, product_type: null, is_kit: false, is_active: true,
  is_stockout: false, allows_personalization: false, lead_time_days: null, supply_mode: null,
  category_id: null, supplier_id: null, slug: null, capacity_ml: null, ncm_code: null,
  categories: null, suppliers: null,
  images: [],
  variants: [
    mockVariant({ id: 'v1', selected_thumbnail: 'https://x/a.jpg' }),
    mockVariant({ id: 'v2', sku: 'CB-001-B', color_name: 'Verde', selected_thumbnail: 'https://x/b.jpg' }),
  ],
  ...o,
});

describe('Y29 — CSV do catálogo (triggerCsvDownload / exportCatalogCsv)', () => {
  const createObjectURL = vi.fn(() => 'blob:y29-csv');
  const revokeObjectURL = vi.fn();
  const click = vi.fn();

  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    click.mockClear();
    toastMock.success.mockClear();
    toastMock.error.mockClear();
    toastMock.dismiss.mockClear();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { click(); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('sem permissão o CSV do histórico/seleção não é gravado e o sucesso não é anunciado', () => {
    const entregou = triggerCsvDownload('\uFEFFA,B\n1,2', 'catalogo_enviados_20261009.csv', false);

    expect(entregou).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledTimes(1);
  });

  it('com permissão o CSV é gravado e a URL é revogada', () => {
    const entregou = triggerCsvDownload('\uFEFFA,B\n1,2', 'catalogo_selecao_20261009.csv', true);

    expect(entregou).toBe(true);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:y29-csv');
    expect(document.querySelector('a[download="catalogo_selecao_20261009.csv"]')).toBeNull();
  });

  it('exportCatalogCsv sem permissão não grava (downloaded: false) e não anuncia sucesso', async () => {
    const fetchPage = vi.fn(async () => ({ data: [mockProduct()] }));

    const resultado = await exportCatalogCsv({ filterKey: 'todos', fetchPage, canDownload: false });

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({ ok: false, downloaded: false, error: 'download-blocked' });
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('exportCatalogCsv com permissão grava o CSV (mesmo comportamento de antes)', async () => {
    const fetchPage = vi.fn(async () => ({ data: [mockProduct()] }));

    const resultado = await exportCatalogCsv({ filterKey: 'todos', fetchPage, canDownload: true });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(resultado).toMatchObject({ ok: true, downloaded: true });
    expect(toastMock.success).toHaveBeenCalledTimes(1);
  });
});

describe('Y29 — fotos do produto (downloadImageAsBlob, usado pelo SendProductDialog)', () => {
  const createObjectURL = vi.fn(() => 'blob:y29-img');
  const click = vi.fn();

  beforeEach(() => {
    createObjectURL.mockClear();
    click.mockClear();
    toastMock.error.mockClear();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { click(); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sem permissão nem busca a foto (fetch) nem grava', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(downloadImageAsBlob('https://x/a.jpg', 'Caneta_1.jpg', false)).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it('com permissão busca e grava como antes', async () => {
    const blob = new Blob(['img'], { type: 'image/jpeg' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => blob }));

    await expect(downloadImageAsBlob('https://x/a.jpg', 'Caneta_1.jpg', true)).resolves.toBe(true);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('Y29 — SendProductDialog: "Download (N fotos)" respeita o gate', () => {
  const createObjectURL = vi.fn(() => 'blob:y29-dialog');
  const click = vi.fn();

  const renderDialog = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <SendProductDialog product={mockProduct()} open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    createObjectURL.mockClear();
    click.mockClear();
    toastMock.error.mockClear();
    toastMock.success.mockClear();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { click(); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sem permissão o clique em Download não grava nada e avisa o bloqueio', async () => {
    permissao.valor = false;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /Download \(2 fotos\)/ }));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledTimes(1);
    });
    expect(String(toastMock.error.mock.calls[0][0])).toContain('Download bloqueado');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('com permissão o mesmo clique baixa as fotos (comportamento de antes)', async () => {
    permissao.valor = true;
    const blob = new Blob(['img'], { type: 'image/jpeg' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => blob }));
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /Download \(2 fotos\)/ }));

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(2);
    });
    expect(click).toHaveBeenCalledTimes(2);
    expect(toastMock.success).toHaveBeenCalledWith('📥 Download iniciado', expect.objectContaining({ description: '2 de 2 foto(s)' }));
  });
});
