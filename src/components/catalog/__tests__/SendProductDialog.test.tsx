import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
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

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast: mockToast }));

// CT-08/CT-09 — o dialog consulta a prontidão do envio e envia de verdade.
const mockReadiness = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/integrations/useCatalogSendReadiness', () => ({
  useCatalogSendReadiness: (...args: unknown[]) => mockReadiness(...args),
}));

const mockFetchContacts = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/integrations/useCatalogContactSearch', () => ({
  fetchCatalogContactResults: (...args: unknown[]) => mockFetchContacts(...args),
  logCatalogSendEvent: vi.fn().mockResolvedValue(undefined),
  // CT-43 — useSendProduct importa esta constante do módulo real; ela precisa
  // existir no mock, senão o import estoura ao montar o dialog.
  CONTACT_SEARCH_MIN_CHARS: 2,
}));

const mockSendOutboundMessage = vi.hoisted(() => vi.fn());
vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: (...args: unknown[]) => mockSendOutboundMessage(...args),
}));

vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));

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

const renderDialog = (props: Partial<React.ComponentProps<typeof SendProductDialog>> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SendProductDialog product={mockProduct()} open onOpenChange={vi.fn()} {...props} />
    </QueryClientProvider>
  );
};

const resetToastMocks = () => {
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockToast.warning.mockReset();
};

const setupDialogMocks = () => {
  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue({ profile: { id: 'profile-1' } });
  resetToastMocks();
  mockReadiness.mockReset();
  mockReadiness.mockReturnValue({ blocked: false, reason: null, checking: false });
  mockFetchContacts.mockReset();
  mockFetchContacts.mockResolvedValue([]);
  mockSendOutboundMessage.mockReset();
  mockSendOutboundMessage.mockResolvedValue({ id: 'msg-1' });
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
};

describe('SendProductDialog — Fase 7 (E72-E75 parcial)', () => {
  beforeEach(() => {
    setupDialogMocks();
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

    // CT-69 — o alt das fotos do produto agora e "Nome — Cor".
    for (let i = 0; i < 10; i++) {
      fireEvent.click(screen.getByAltText(new RegExp(`— Cor ${i}$`)).closest('button')!);
    }
    expect(screen.getByText('10 de 11 fotos selecionadas')).toBeInTheDocument();

    fireEvent.click(screen.getByAltText(/— Cor 10$/).closest('button')!);
    expect(screen.getByText('10 de 11 fotos selecionadas')).toBeInTheDocument();
    expect(mockToast.error).toHaveBeenCalledWith('Limite de 10 fotos por envio', expect.objectContaining({ description: expect.any(String) }));
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
    expect(screen.getAllByText(/segue informações do produto/i).length).toBe(2);
  });
});

describe('SendProductDialog — Fase 7 (E77-E78)', () => {
  beforeEach(() => {
    setupDialogMocks();
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

describe('SendProductDialog — CT-08/CT-09 (checagem pré-envio e teclado)', () => {
  const CONTACT = { id: 'c1', name: 'Tomaz', phone: '5511949600474', avatar_url: null };

  beforeEach(() => {
    setupDialogMocks();
    sessionStorage.clear();
  });

  it('com a conexão de WhatsApp fora, o botão Enviar fica desabilitado com explicação (CT-08)', async () => {
    mockFetchContacts.mockResolvedValue([CONTACT]);
    mockReadiness.mockReturnValue({
      blocked: true,
      reason: 'Nenhuma conexão de WhatsApp ativa. Reconecte a instância em Conexões para poder enviar.',
      checking: false,
    });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /Selecionar Contato/i }));
    fireEvent.click((await screen.findByText('Tomaz')).closest('button')!);

    expect(screen.getByText(/Nenhuma conexão de WhatsApp ativa/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar para Tomaz/i })).toBeDisabled();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', ctrlKey: true });
    expect(mockSendOutboundMessage).not.toHaveBeenCalled();
  });

  it('Esc no passo do contato volta um passo em vez de fechar o dialog (CT-09)', async () => {
    mockFetchContacts.mockResolvedValue([CONTACT]);
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    fireEvent.click(screen.getByRole('button', { name: /Selecionar Contato/i }));
    expect(screen.getByRole('heading', { name: /Selecionar Contato/i })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.getByRole('heading', { name: /Enviar Produto/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Selecionar Contato/i })).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('Ctrl+Enter no passo do contato envia com a mensagem como caption da foto (CT-04/CT-09)', async () => {
    mockFetchContacts.mockResolvedValue([CONTACT]);
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /Selecionar Contato/i }));
    fireEvent.click((await screen.findByText('Tomaz')).closest('button')!);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(mockSendOutboundMessage).toHaveBeenCalledTimes(1));
    expect(mockSendOutboundMessage.mock.calls[0][0]).toMatchObject({
      contactId: 'c1',
      messageType: 'image',
      mediaUrl: 'https://x/a.jpg',
    });
    expect((mockSendOutboundMessage.mock.calls[0][0] as { caption: string }).caption).toContain('Olha esse produto');
  });

  it('CT-68: enquanto o envio acontece, o progresso é anunciado numa região viva', async () => {
    mockFetchContacts.mockResolvedValue([CONTACT]);
    // promise que nunca resolve: prende o dialog no estado "enviando"
    mockSendOutboundMessage.mockImplementation(() => new Promise(() => {}));
    renderDialog();

    expect(screen.queryByTestId('send-progress-live')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Selecionar Contato/i }));
    fireEvent.click((await screen.findByText('Tomaz')).closest('button')!);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', ctrlKey: true });

    const live = await screen.findByTestId('send-progress-live');
    expect(live).toHaveAttribute('role', 'status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('Enviando');
  });
});

describe('SendProductDialog — CT-17 (contato da conversa pré-selecionado)', () => {
  const CONTACT = { id: 'c9', name: 'Cliente da Conversa', phone: '5541999990000', avatar_url: null };

  beforeEach(() => {
    setupDialogMocks();
    sessionStorage.clear();
  });

  it('mostra o card-resumo do contato e troca "Selecionar Contato" por "Enviar para <nome>" (CT-17)', () => {
    renderDialog({ presetContact: CONTACT });

    expect(screen.getByText('Cliente da Conversa')).toBeInTheDocument();
    expect(screen.getByText('5541999990000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar para Cliente da Conversa/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Selecionar Contato/i })).not.toBeInTheDocument();
  });

  it('envia direto para o contato pré-selecionado, sem passar pelo passo de contato (CT-14)', async () => {
    renderDialog({ presetContact: CONTACT });

    fireEvent.click(screen.getByRole('button', { name: /Enviar para Cliente da Conversa/i }));

    await waitFor(() => expect(mockSendOutboundMessage).toHaveBeenCalled());
    expect(mockSendOutboundMessage.mock.calls[0][0]).toMatchObject({ contactId: 'c9', messageType: 'image' });
  });

  it('"Trocar" continua permitindo escolher outro contato (CT-17)', () => {
    renderDialog({ presetContact: CONTACT });

    fireEvent.click(screen.getByRole('button', { name: /^Trocar$/i }));

    expect(screen.getByText('Selecionar Contato')).toBeInTheDocument();
  });

  it('com a prontidão bloqueada, o botão fica desabilitado com explicação (CT-08 com preset)', () => {
    mockReadiness.mockReturnValue({
      blocked: true,
      reason: 'Nenhuma conexão de WhatsApp ativa. Reconecte a instância em Conexões para poder enviar.',
      checking: false,
    });
    renderDialog({ presetContact: CONTACT });

    expect(screen.getByText(/Nenhuma conexão de WhatsApp ativa/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar para Cliente da Conversa/i })).toBeDisabled();
  });
});

describe('SendProductDialog — CT-38 (card de info do produto no modo completo)', () => {
  beforeEach(() => {
    setupDialogMocks();
    sessionStorage.clear();
  });

  const variantProduct = (o: Partial<ExternalProduct> = {}) => mockProduct({
    variants: [mockVariant({
      id: 'v1', color_name: 'Azul', color_hex: '#0000ff',
      selected_thumbnail: 'https://x/azul.jpg', stock_quantity: 7,
    })],
    ...o,
  });

  it('mostra thumb, nome, modelo e contagem de fotos no modo completo', () => {
    renderDialog({ product: mockProduct({ name: 'Caneta Bambu Eco' }) });

    const card = screen.getByTestId('product-info-card');
    expect(within(card).getByText('Caneta Bambu Eco')).toBeInTheDocument();
    expect(within(card).getByAltText('Caneta Bambu Eco')).toHaveAttribute('src', 'https://x/a.jpg');
    expect(within(card).getByText('1 foto(s) · Modelo Informal')).toBeInTheDocument();
  });

  it('atualiza o modelo do card ao trocar o template da mensagem', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Formal' }));

    const card = screen.getByTestId('product-info-card');
    expect(within(card).getByText('1 foto(s) · Modelo Formal')).toBeInTheDocument();
  });

  it('não mostra o card no modo "Variação Específica" e mantém os cards de variação com foto/cor/estoque', () => {
    renderDialog({ product: variantProduct() });
    expect(screen.getByTestId('product-info-card')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Variação Específica/i }));

    expect(screen.queryByTestId('product-info-card')).not.toBeInTheDocument();

    const variantCard = screen.getByText('Azul').closest('button')!;
    // CT-69 — alt das fotos de variação agora e "Nome — Cor".
    expect(within(variantCard).getByAltText(/— Azul$/)).toHaveAttribute('src', 'https://x/azul.jpg');
    expect(within(variantCard).getByText('1 foto · 7 un.')).toBeInTheDocument();
  });

  it('mantém o card visível no modo completo quando o produto tem variantes', () => {
    renderDialog({ product: variantProduct() });

    expect(screen.getByTestId('product-info-card')).toBeInTheDocument();
    expect(within(screen.getByTestId('product-info-card')).getByText('Caneta Bambu')).toBeInTheDocument();
  });

  it('convive com o contato pré-selecionado, sem quebrar o modo presetContact (CT-17)', () => {
    renderDialog({
      presetContact: { id: 'c1', name: 'Cliente', phone: '5511999990000', avatar_url: null },
    });

    expect(screen.getByTestId('product-info-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar para Cliente/i })).toBeInTheDocument();
  });
});

describe('SendProductDialog — CT-37 (PhonePreview reutilizável, zero cor literal)', () => {
  beforeEach(() => {
    setupDialogMocks();
    sessionStorage.clear();
  });

  it('renderiza a prévia com a classe .catalog-phone e a mensagem atual dentro da bolha', () => {
    renderDialog();

    // O Dialog usa portal (Radix), então a prévia não vive no container do
    // render e sim em document.body.
    const phone = document.querySelector('.catalog-phone');
    expect(phone).not.toBeNull();

    const bubble = phone!.querySelector('.catalog-phone__bubble');
    expect(bubble).not.toBeNull();
    expect(within(bubble as HTMLElement).getByText(/Olha esse produto/)).toBeInTheDocument();

    // A foto selecionada continua aparecendo no mock (E74 preservado).
    expect(within(phone as HTMLElement).getByAltText('Prévia')).toHaveAttribute('src', 'https://x/a.jpg');
  });

  it('não usa nenhuma cor hexadecimal literal nem bg-white/text-white (aceite CT-37)', () => {
    const fonte = readFileSync(path.resolve(__dirname, '..', 'SendProductDialog.tsx'), 'utf8');

    expect(fonte.match(/#[0-9a-fA-F]{6}\b/g)).toBeNull();
    expect(fonte).not.toMatch(/\bbg-white\b/);
    expect(fonte).not.toMatch(/\btext-white\b/);
  });
});
