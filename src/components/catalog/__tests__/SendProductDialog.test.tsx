import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SendProductDialog } from '../SendProductDialog';
import type { ExternalProduct, ExternalProductVariant } from '@/hooks/integrations/useExternalCatalog';

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

// O DropdownMenu (Radix) exige simulacao de ponteiro que o jsdom nao
// implementa; seguindo o padrao ja usado em EmailChatReplyBar.test.tsx, o
// menu vira um bloco sempre visivel com os itens como botoes simples.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const mockToast = vi.fn();
vi.mock('@/hooks/ui/use-toast', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

const mockVariant = (o: Partial<ExternalProductVariant> = {}): ExternalProductVariant => ({
  id: 'v1', product_id: 'p1', sku: 'CB-001-A', name: 'Azul',
  attributes: null, stock_quantity: 10, color_name: 'Azul', color_hex: '#0000ff',
  size_code: null, capacity_ml: null, selected_thumbnail: null, is_active: true,
  ...o,
});

const mockProduct = (o: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1', name: 'Caneta Bambu', description: null, short_description: null,
  sku: 'CB-001', sale_price: 12.5, suggested_price: null, stock_quantity: 100,
  primary_image_url: 'https://x/a.jpg', colors: null, brand: null,
  origin_country: null, min_quantity: null, dimensions_display: null, weight_g: null,
  combined_sizes: null, product_type: null, is_kit: false, is_active: true,
  is_stockout: false, allows_personalization: false, lead_time_days: null, supply_mode: null,
  category_id: null, supplier_id: null, slug: null, capacity_ml: null, ncm_code: null,
  categories: null, suppliers: null,
  images: ['https://x/a.jpg'],
  // produto ja com variants (mesmo vazio): needsFullProduct fica false, entao
  // useExternalProduct nunca dispara fetch de rede durante o teste.
  variants: [],
  ...o,
});

function renderDialog(props: Partial<React.ComponentProps<typeof SendProductDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SendProductDialog product={mockProduct()} open onOpenChange={vi.fn()} {...props} />
    </QueryClientProvider>
  );
}

describe('SendProductDialog — Fase 7 (E72-E75 parcial)', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({ profile: { id: 'profile-1' } });
    mockToast.mockReset();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('mostra o contador de caracteres da mensagem (E73)', () => {
    renderDialog();
    expect(screen.getByText(/^\d+\/2000$/)).toBeInTheDocument();
  });

  it('acima de 2000 caracteres, desabilita "Selecionar Contato" e mostra erro (E73)', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Editar/i }));
    const textarea = screen.getByPlaceholderText('Escreva sua mensagem personalizada...');
    fireEvent.change(textarea, { target: { value: 'a'.repeat(2001) } });

    expect(screen.getByText('2001/2000')).toBeInTheDocument();
    expect(screen.getByText(/Mensagem muito longa/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Selecionar Contato/i })).toBeDisabled();
  });

  it('dentro do limite, "Selecionar Contato" fica habilitado', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /Selecionar Contato/i })).not.toBeDisabled();
  });

  it('bloqueia a 11a foto e avisa com toast, mantendo a selecao em 10 (E72)', () => {
    const variants = Array.from({ length: 11 }, (_, i) => mockVariant({
      id: `v${i}`, sku: `SKU-${i}`, color_name: `Cor ${i}`, selected_thumbnail: `https://x/img-${i}.jpg`,
    }));
    renderDialog({ product: mockProduct({ variants, primary_image_url: null }) });

    // Todas as 11 fotos comecam selecionadas (comportamento pre-existente);
    // desmarca todas para testar a trava do 11o clique com um estado limpo.
    fireEvent.click(screen.getByRole('button', { name: 'Desmarcar todas' }));
    expect(screen.getByText('0 de 11 fotos selecionadas')).toBeInTheDocument();

    for (let i = 0; i < 10; i++) {
      fireEvent.click(screen.getByAltText(`Cor ${i}`).closest('button')!);
    }
    expect(screen.getByText('10 de 11 fotos selecionadas')).toBeInTheDocument();

    fireEvent.click(screen.getByAltText('Cor 10').closest('button')!);
    expect(screen.getByText('10 de 11 fotos selecionadas')).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Limite de 10 fotos por envio' }));
  });

  it('copiar link do produto chama o clipboard com a URL esperada (E75)', async () => {
    renderDialog({ product: mockProduct({ id: 'prod-xyz' }) });
    fireEvent.click(screen.getByText('Copiar link do produto'));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}${window.location.pathname}?view=catalog&product=prod-xyz`
    );
  });

  it('preview estilo WhatsApp renderiza a mensagem atual e atualiza ao trocar template (E74)', () => {
    renderDialog();
    expect(screen.getByText('Pré-visualização')).toBeInTheDocument();
    // O template 'informal' e o default: a mesma frase aparece no bloco de
    // mensagem e na bolha do preview.
    expect(screen.getAllByText(/Olha esse produto/).length).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: 'Formal' }));
    expect(screen.getAllByText(/Prezado\(a\)/).length).toBe(2);
  });
});
