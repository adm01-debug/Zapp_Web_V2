/**
 * CT-51/CT-52 — botão "Enviar produto" no painel do contato
 * (src/components/contacts/ContactDetailPanel.tsx).
 *
 * Prova a FIAÇÃO: o botão existe e, ao clicar, abre o catálogo do chat
 * (ExternalProductCatalog REAL) que, ao escolher um produto, abre o
 * `SendProductDialog` levando ESTE contato do painel como `presetContact`
 * (id/nome/telefone/avatar vindos do `contact` da prop).
 *
 * O `SendProductDialog` e o card de produto são mocks (mesmo padrão do
 * CT28_bulkBar.test.tsx): aqui não se testa o dialog em si, e sim que o painel
 * entrega o `presetContact` correto — o card-resumo do contato no dialog é
 * coberto em SendProductDialog.test.tsx (CT-17).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactDetailPanel } from '../ContactDetailPanel';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';
import type { ContactResult } from '@/components/catalog/useSendProduct';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

// #253: o painel passou a consultar a atividade do contato por conta própria
// (useContactActivity → ContactService). Aqui a atividade não é o objeto do
// teste; o serviço é mockado para o painel não falar com a rede.
vi.mock('@/services/contact.service', () => ({
  ContactService: {
    fetchStats: vi.fn().mockResolvedValue({
      totalMessages: 0, avgResponseTimeMinutes: 0, totalConversations: 0,
      messagesChangePercent: null, conversationsChangePercent: null,
      csatAverage: null, csatCount: 0,
    }),
    getLastMessageDates: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

// Filhos pesados do painel (falam direto com o supabase / animações): fora do
// escopo do CT-51/52, então viram stubs para isolar o botão em teste.
vi.mock('../ContactActivityTimeline', () => ({ ContactActivityTimeline: () => <div data-testid="timeline" /> }));
vi.mock('../ContactNotes', () => ({ ContactNotes: () => <div data-testid="notes" /> }));
vi.mock('../ContactPurchaseHistory', () => ({ ContactPurchaseHistory: () => <div data-testid="purchases" /> }));
vi.mock('../ContactEngagementScore', () => ({ ContactEngagementScore: () => <div data-testid="score" /> }));

const mockCatalog = vi.fn();
const mockFavorites = vi.fn();
vi.mock('@/hooks/integrations/useExternalCatalog', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/integrations/useExternalCatalog')>(
    '@/hooks/integrations/useExternalCatalog',
  );
  return {
    ...actual,
    useExternalCatalog: () => mockCatalog(),
    useCatalogFavorites: () => mockFavorites(),
  };
});

vi.mock('@/components/catalog/CatalogProductCard', () => ({
  CatalogProductCard: ({
    product,
    onSend,
  }: {
    product: ExternalProduct;
    onSend?: (p: ExternalProduct) => void;
  }) => (
    <button type="button" onClick={() => onSend?.(product)}>
      Abrir envio {product.id}
    </button>
  ),
  CatalogProductCardSkeleton: () => <div data-testid="card-skeleton" />,
}));

vi.mock('@/components/catalog/SendProductDialog', () => ({
  SendProductDialog: ({ presetContact }: { presetContact?: ContactResult | null }) => (
    <div
      data-testid="send-dialog"
      data-contact-id={presetContact?.id ?? ''}
      data-contact-name={presetContact?.name ?? ''}
      data-contact-phone={presetContact?.phone ?? ''}
      data-contact-avatar={presetContact?.avatar_url ?? ''}
    />
  ),
}));

const mockProduct = (overrides: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1', name: 'Caneta Plástica Azul', description: null, short_description: null,
  sku: 'CAN-001', sale_price: 3.99, suggested_price: null, stock_quantity: 5000,
  primary_image_url: null, colors: null, brand: null, origin_country: null,
  min_quantity: null, dimensions_display: null, weight_g: null, combined_sizes: null,
  product_type: null, is_kit: false, is_active: true, is_stockout: false,
  allows_personalization: false, lead_time_days: null, supply_mode: null,
  category_id: null, supplier_id: null, slug: null, capacity_ml: null, ncm_code: null,
  categories: null, suppliers: null,
  ...overrides,
});

function baseCatalog(products: ExternalProduct[]) {
  return {
    products,
    totalProducts: products.length,
    categories: [],
    suppliers: [],
    loading: false,
    isInitialLoading: false,
    isFetching: false,
    error: null,
    errorCode: null,
    errorStatus: null,
    fetchProducts: vi.fn(),
    fetchProduct: vi.fn(),
    fetchCategories: vi.fn(),
    fetchSuppliers: vi.fn(),
  };
}

interface TestContact {
  id: string; name: string; phone: string; email?: string | null;
  avatar_url?: string | null; contact_type?: string | null;
  tags?: string[] | null; created_at: string;
}

const makeContact = (overrides: Partial<TestContact> = {}): TestContact => ({
  id: 'c9',
  name: 'Maria Silva',
  phone: '5541999990000',
  email: 'maria@example.com',
  avatar_url: null,
  contact_type: 'cliente',
  tags: null,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

function renderPanel(contact: TestContact = makeContact()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ContactDetailPanel
        contact={contact}
        onClose={vi.fn()}
        onOpenChat={vi.fn()}
        onEdit={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

/** Abre o catálogo pelo botão do painel e escolhe um produto → dialog de envio. */
const enviarProduto = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Enviar produto/i }));
  const card = await screen.findByRole('button', { name: 'Abrir envio p1' });
  fireEvent.click(card);
};

beforeEach(() => {
  mockCatalog.mockReset();
  mockCatalog.mockReturnValue(baseCatalog([mockProduct()]));
  mockFavorites.mockReset();
  mockFavorites.mockReturnValue({
    favorites: [], favoriteIds: new Set<string>(), isFavorite: () => false, isLoading: false, toggle: vi.fn(),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CT-51 — botão "Enviar produto" no painel do contato', () => {
  it('o botão existe e abre o catálogo do chat ao clicar', async () => {
    renderPanel();

    const botao = screen.getByRole('button', { name: /Enviar produto/i });
    expect(botao).toBeInTheDocument();

    fireEvent.click(botao);

    expect(await screen.findByRole('button', { name: 'Abrir envio p1' })).toBeInTheDocument();
  });
});

describe('CT-52 — o envio leva o contato do painel como presetContact', () => {
  it('id/nome/telefone/avatar do contato do painel chegam ao dialog de envio', async () => {
    renderPanel(makeContact({ id: 'c9', name: 'Maria Silva', phone: '5541999990000', avatar_url: 'https://x/maria.png' }));

    await enviarProduto();

    const dialog = await screen.findByTestId('send-dialog');
    expect(dialog).toHaveAttribute('data-contact-id', 'c9');
    expect(dialog).toHaveAttribute('data-contact-name', 'Maria Silva');
    expect(dialog).toHaveAttribute('data-contact-phone', '5541999990000');
    expect(dialog).toHaveAttribute('data-contact-avatar', 'https://x/maria.png');
  });

  it('sem avatar, o presetContact não inventa imagem (avatar nulo)', async () => {
    renderPanel(makeContact({ avatar_url: null }));

    await enviarProduto();

    const dialog = await screen.findByTestId('send-dialog');
    expect(dialog).toHaveAttribute('data-contact-id', 'c9');
    expect(dialog).toHaveAttribute('data-contact-avatar', '');
  });

  // Decisão de produto (Joaquim, 01/10/2026): sem WhatsApp não há como enviar
  // produto — o botão fica DESABILITADO e explica o motivo. O critério de
  // "tem WhatsApp" é o mesmo do resto do app: `normalizeE164BR` de
  // src/lib/calls/phone.ts (telefone inutilizável → null).
  it('sem telefone, o botão fica DESABILITADO com o aviso "Contato sem WhatsApp"', () => {
    renderPanel(makeContact({ phone: '' }));

    const botao = screen.getByRole('button', { name: /Enviar produto/i });
    expect(botao).toBeDisabled();
    expect(screen.getByTitle('Contato sem WhatsApp')).toBeInTheDocument();

    // e o catálogo NÃO abre: o envio fica bloqueado de verdade
    fireEvent.click(botao);
    expect(screen.queryByRole('button', { name: 'Abrir envio p1' })).not.toBeInTheDocument();
  });

  it('telefone inválido (curto/lixo) também desabilita o envio', () => {
    renderPanel(makeContact({ phone: '123' }));

    const botao = screen.getByRole('button', { name: /Enviar produto/i });
    expect(botao).toBeDisabled();
    expect(screen.getByTitle('Contato sem WhatsApp')).toBeInTheDocument();
  });

  it('telefone válido mantém o envio habilitado e envia para o contato do painel', async () => {
    renderPanel(makeContact({ phone: '5541999990000' }));

    const botao = screen.getByRole('button', { name: /Enviar produto/i });
    expect(botao).toBeEnabled();
    expect(screen.queryByTitle('Contato sem WhatsApp')).not.toBeInTheDocument();

    await enviarProduto();

    const dialog = await screen.findByTestId('send-dialog');
    expect(dialog).toHaveAttribute('data-contact-id', 'c9');
    expect(dialog).toHaveAttribute('data-contact-phone', '5541999990000');
  });
});
