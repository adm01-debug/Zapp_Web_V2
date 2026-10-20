import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SendProductDialog } from '../SendProductDialog';
import type { ExternalProduct, ExternalProductVariant } from '@/hooks/integrations/useExternalCatalog';

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' } }),
}));

// jsdom não implementa a simulação de ponteiro que o Radix exige; o menu vira
// conteúdo sempre visível com os itens como botões — mesma solução do teste
// vizinho (SendProductDialog.test.tsx).
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

// CT-39 — só o download é dublado; o resto do módulo segue real, senão o teste
// deixaria de provar o caminho que roda em produção.
const mockDownload = vi.hoisted(() => vi.fn());
vi.mock('../sendProductUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sendProductUtils')>()),
  downloadImageAsBlob: (...args: unknown[]) => mockDownload(...args),
}));

const mockVariant = (o: Partial<ExternalProductVariant> = {}): ExternalProductVariant => ({
  id: 'v1', product_id: 'p1', sku: 'CB-001-A', name: 'Azul',
  attributes: null, stock_quantity: 10, color_name: 'Azul', color_hex: null,
  size_code: null, capacity_ml: null, selected_thumbnail: null, is_active: true,
  ...o,
});

const mockProduct = (o: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1', name: 'Caneta Bambu', description: null, short_description: null,
  sku: 'CB-001', sale_price: 12.5, suggested_price: null, stock_quantity: 100,
  // Sem imagem primaria e com 2 variantes: sao as miniaturas das variantes que
  // alimentam collectAllImages, entao este fixture da exatamente 2 fotos.
  primary_image_url: null, colors: null, brand: null,
  origin_country: null, min_quantity: null, dimensions_display: null, weight_g: null,
  combined_sizes: null, product_type: null, is_kit: false, is_active: true,
  is_stockout: false, allows_personalization: false, lead_time_days: null, supply_mode: null,
  category_id: null, supplier_id: null, slug: null, capacity_ml: null, ncm_code: null,
  categories: null, suppliers: null,
  images: [],
  // Produto já com variants: o dialog não dispara fetch de rede no teste.
  variants: [
    mockVariant({ id: 'v1', selected_thumbnail: 'https://x/a.jpg' }),
    mockVariant({ id: 'v2', sku: 'CB-001-B', color_name: 'Verde', selected_thumbnail: 'https://x/b.jpg' }),
  ],
  ...o,
});

const renderDialog = (props: Partial<React.ComponentProps<typeof SendProductDialog>> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SendProductDialog product={mockProduct()} open onOpenChange={vi.fn()} {...props} />
    </QueryClientProvider>
  );
};

/**
 * CT-39 — o handler de download (`handleDownloadImages`) não tinha teste. São
 * três caminhos e os três prometem coisas diferentes para o agente: nenhuma foto,
 * sucesso parcial e falha total. Aqui os três são exercitados.
 */
describe('CT-39 — download das fotos selecionadas', () => {
  beforeEach(() => {
    mockToast.success.mockReset();
    mockToast.error.mockReset();
    mockDownload.mockReset();
  });

  it('sem foto selecionada, avisa e não tenta baixar nada', async () => {
    renderDialog();

    // O dialog nasce com todas as fotos visíveis marcadas; desmarca todas.
    fireEvent.click(screen.getByRole('button', { name: 'Desmarcar todas' }));
    expect(screen.getByText('0 de 2 fotos selecionadas')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Download \(0 fotos\)/ }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Nenhuma foto selecionada');
    });
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('informa quantas desceram quando o download é parcial', async () => {
    mockDownload.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /Download \(2 fotos\)/ }));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(
        '📥 Download iniciado',
        expect.objectContaining({ description: '1 de 2 foto(s)' })
      );
    });
    expect(mockDownload).toHaveBeenCalledTimes(2);
    // O nome do arquivo sai do nome do produto, sem espaços (a ordem das fotos
    // vem do Set de seleção, então a URL é conferida sem ordenação fixa).
    expect(mockDownload).toHaveBeenCalledWith(expect.any(String), 'Caneta_Bambu_1.jpg');
    expect(mockDownload.mock.calls.map((c) => c[0]).sort()).toEqual(['https://x/a.jpg', 'https://x/b.jpg']);
  });

  it('quando nenhuma desce, diz que não foi possível e não promete download', async () => {
    mockDownload.mockResolvedValue(false);
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /Download \(2 fotos\)/ }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        'Não foi possível baixar as fotos',
        expect.objectContaining({ description: expect.any(String) })
      );
    });
    expect(mockToast.success).not.toHaveBeenCalled();
  });
});
