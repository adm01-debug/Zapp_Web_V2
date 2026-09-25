import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

  it('copiar link do produto inclui send=1 pra abrir o dialog direto (E75/E78)', async () => {
    renderDialog({ product: mockProduct({ id: 'prod-xyz' }) });
    fireEvent.click(screen.getByText('Copiar link do produto'));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}${window.location.pathname}?view=catalog&product=prod-xyz&send=1`
    );
  });

  it('copiar link com variante selecionada inclui o parametro variant (E78)', async () => {
    const variants = [mockVariant({ id: 'v1', color_name: 'Azul', selected_thumbnail: 'https://x/azul.jpg' })];
    renderDialog({ product: mockProduct({ id: 'prod-xyz', variants }) });

    fireEvent.click(screen.getByRole('button', { name: /Variação Específica/i }));
    fireEvent.click(screen.getByText('Copiar link do produto'));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}${window.location.pathname}?view=catalog&product=prod-xyz&send=1&variant=Azul`
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

describe('SendProductDialog — Fase 7 (E77-E78)', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({ profile: { id: 'profile-1' } });
    mockToast.mockReset();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    sessionStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('salva rascunho no sessionStorage apos editar mensagem e esperar o debounce (E77)', async () => {
    renderDialog({ product: mockProduct({ id: 'draft-p1' }) });

    fireEvent.click(screen.getByRole('button', { name: /Editar/i }));
    const textarea = screen.getByPlaceholderText('Escreva sua mensagem personalizada...');
    fireEvent.change(textarea, { target: { value: 'Mensagem personalizada de teste' } });

    expect(sessionStorage.getItem('catalog.sendDraft.draft-p1')).toBeNull();

    await act(async () => { vi.advanceTimersByTime(500); });

    const raw = sessionStorage.getItem('catalog.sendDraft.draft-p1');
    expect(raw).not.toBeNull();
    const draft = JSON.parse(raw!);
    expect(draft.customMessage).toBe('Mensagem personalizada de teste');
  });

  it('nao salva rascunho quando nao esta editando (estado default)', async () => {
    renderDialog({ product: mockProduct({ id: 'draft-p2' }) });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(sessionStorage.getItem('catalog.sendDraft.draft-p2')).toBeNull();
  });

  it('mostra banner de restauracao ao reabrir com rascunho salvo e restaura corretamente (E77)', () => {
    sessionStorage.setItem('catalog.sendDraft.draft-p3', JSON.stringify({
      template: 'formal', customMessage: 'Texto salvo anteriormente', sendMode: 'product',
      selectedColorGroup: null, savedAt: Date.now(),
    }));

    renderDialog({ product: mockProduct({ id: 'draft-p3' }) });

    expect(screen.getByText('Você tem um rascunho não enviado para este produto.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar rascunho' }));

    expect(screen.queryByText('Você tem um rascunho não enviado para este produto.')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Texto salvo anteriormente')).toBeInTheDocument();
  });

  it('descartar rascunho remove a chave do sessionStorage (E77)', () => {
    sessionStorage.setItem('catalog.sendDraft.draft-p4', JSON.stringify({
      template: 'formal', customMessage: 'Texto a descartar', sendMode: 'product',
      selectedColorGroup: null, savedAt: Date.now(),
    }));

    renderDialog({ product: mockProduct({ id: 'draft-p4' }) });
    expect(screen.getByText('Você tem um rascunho não enviado para este produto.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(sessionStorage.getItem('catalog.sendDraft.draft-p4')).toBeNull();
    expect(screen.queryByText('Você tem um rascunho não enviado para este produto.')).not.toBeInTheDocument();
  });

  it('confirmacao aparece ao tentar fechar com edicao pendente e "Fechar mesmo assim" chama onOpenChange(false) (E77)', () => {
    const onOpenChange = vi.fn();
    renderDialog({ product: mockProduct({ id: 'draft-p5' }), onOpenChange });

    fireEvent.click(screen.getByRole('button', { name: /Editar/i }));
    const textarea = screen.getByPlaceholderText('Escreva sua mensagem personalizada...');
    fireEvent.change(textarea, { target: { value: 'Edicao nao enviada' } });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByText('Descartar alterações não enviadas?')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar mesmo assim' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('fecha sem confirmacao quando nao ha edicao pendente', () => {
    const onOpenChange = vi.fn();
    renderDialog({ product: mockProduct({ id: 'draft-p6' }), onOpenChange });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByText('Descartar alterações não enviadas?')).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Ctrl+Enter aciona o mesmo fluxo do botao "Selecionar Contato" (E78)', () => {
    renderDialog({ product: mockProduct({ id: 'draft-p7' }) });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', ctrlKey: true });

    expect(screen.getByRole('heading', { name: /Selecionar Contato/i })).toBeInTheDocument();
  });

  it('rascunho com shape invalido no sessionStorage e ignorado, sem travar o dialog (audit 24/09)', () => {
    sessionStorage.setItem('catalog.sendDraft.draft-p8', JSON.stringify({ foo: 'bar', nada_a_ver: 123 }));

    renderDialog({ product: mockProduct({ id: 'draft-p8' }) });

    expect(screen.queryByText('Você tem um rascunho não enviado para este produto.')).not.toBeInTheDocument();
  });

  it('trocar de produto via key diferente remonta o dialog e nao vaza rascunho entre produtos (audit 24/09)', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <SendProductDialog key="prod-A" product={mockProduct({ id: 'prod-A' })} open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /Editar/i }));
    fireEvent.change(screen.getByPlaceholderText('Escreva sua mensagem personalizada...'), { target: { value: 'Mensagem do produto A' } });

    rerender(
      <QueryClientProvider client={client}>
        <SendProductDialog key="prod-B" product={mockProduct({ id: 'prod-B' })} open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    );

    expect(screen.queryByDisplayValue('Mensagem do produto A')).not.toBeInTheDocument();
  });
});
