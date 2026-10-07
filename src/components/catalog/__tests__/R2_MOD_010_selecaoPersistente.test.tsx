/**
 * R2-MOD-010 — "Catálogo conta seleção persistente mas envia somente produtos
 * do filtro visível".
 *
 * O contador da barra anuncia a seleção INTEIRA (`selectedIds.size`), mas o
 * envio em lote, a exportação e o "Favoritar N" usavam a INTERSEÇÃO com a lista
 * exibida (`displayedProducts`). Trocar o filtro (ou o chip "Meus favoritos")
 * deixava o número anunciado diferente do payload: o produto que saiu da tela
 * era descartado em silêncio.
 *
 * Aqui a seleção é provada pelos DOIS lados, depois de um filtro que tira o
 * primeiro produto da tela: o que a barra anuncia e o que chega ao envio/CSV.
 * O card e os dialogs são mocks (a fiação entre eles é o objeto do teste), como
 * no CT-28.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductCatalog } from '../ExternalProductCatalog';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: toastSuccess, error: vi.fn(), warning: vi.fn() }),
}));

const triggerCsvDownload = vi.hoisted(() => vi.fn());
vi.mock('../catalogExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalogExport')>();
  return { ...actual, triggerCsvDownload };
});

const mockCatalog = vi.hoisted(() => vi.fn());
const mockFavorites = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/integrations/useExternalCatalog', () => ({
  useExternalCatalog: (...args: unknown[]) => mockCatalog(...args),
  useCatalogFavorites: (...args: unknown[]) => mockFavorites(...args),
  useExternalProduct: () => ({ data: null, isFetching: false }),
}));

vi.mock('../CatalogProductCard', () => ({
  CatalogProductCard: ({
    product,
    isSelected,
    onToggleSelect,
  }: {
    product: ExternalProduct;
    isSelected?: boolean;
    onToggleSelect?: (id: string) => void;
  }) => (
    <div data-testid={`card-${product.id}`} data-selected={isSelected ? 'true' : 'false'}>
      <span>{product.name}</span>
      <button type="button" onClick={() => onToggleSelect?.(product.id)}>Selecionar item</button>
    </div>
  ),
  CatalogProductCardSkeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('../SendProductDialog', () => ({
  SendProductDialog: ({ product }: { product: ExternalProduct }) => (
    <div data-testid="send-dialog">{product.name}</div>
  ),
}));

vi.mock('../CatalogBulkSendDialog', () => ({
  CatalogBulkSendDialog: ({ products, open, onSent }: { products: ExternalProduct[]; open: boolean; onSent?: (ids: string[]) => void }) =>
    open ? (
      <div data-testid="bulk-send-dialog">
        {products.map((p) => p.id).join(',')}
        {/* R2-MOD-007 — o dialog devolve só os ids concluídos ao fechar o lote. */}
        <button type="button" onClick={() => onSent?.(['p1'])}>Concluir envio</button>
      </div>
    ) : null,
}));

const product = (id: string, name = `Produto ${id}`): ExternalProduct =>
  ({ id, name, sku: `SKU-${id}`, slug: `slug-${id}`, sale_price: 10, stock_quantity: 5, variants: [] } as unknown as ExternalProduct);

const baseCatalog = (products: ExternalProduct[]) => ({
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
  fetchCategories: vi.fn(),
  fetchSuppliers: vi.fn(),
});

const renderCatalog = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExternalProductCatalog open onOpenChange={vi.fn()} />
    </QueryClientProvider>
  );
};

const entrarNoModoSelecao = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));

/** Marca o card de `id` — o card só existe para produto exibido. */
const selecionarCard = (id: string) =>
  fireEvent.click(within(screen.getByTestId(`card-${id}`)).getByRole('button', { name: 'Selecionar item' }));

/** Aplica a busca (o filtro que troca o resultado exibido). */
const buscar = (termo: string) =>
  fireEvent.change(screen.getByPlaceholderText(/Buscar por nome, SKU ou marca/), { target: { value: termo } });

/** Barra de seleção em massa com o contador anunciado. */
const barra = () => screen.getByRole('button', { name: /Favoritar \d+/ });

const favorito = (productId: string, sku: string, nome: string) => ({
  id: `fav-${productId}`,
  product_id: productId,
  product_name: nome,
  product_sku: sku,
  primary_image_url: null,
  created_at: '2026-10-06T10:00:00Z',
});

beforeEach(() => {
  mockCatalog.mockReset();
  mockFavorites.mockReset();
  triggerCsvDownload.mockReset();
  toastSuccess.mockReset();
  mockCatalog.mockReturnValue(baseCatalog([product('p1'), product('p2'), product('p3')]));
  mockFavorites.mockReturnValue({
    favorites: [],
    favoriteIds: new Set<string>(),
    isFavorite: () => false,
    isLoading: false,
    toggle: vi.fn(),
  });
});

describe('R2-MOD-010 — seleção persistente × filtro visível', () => {
  it('o filtro não descarta produto selecionado: o envio em lote entrega a contagem anunciada', async () => {
    renderCatalog();
    entrarNoModoSelecao();
    selecionarCard('p1');
    expect(barra()).toHaveTextContent('Favoritar 1');
    expect(screen.getByTestId('card-p1')).toHaveAttribute('data-selected', 'true');

    // O filtro troca o resultado exibido: p1 sai da tela, mas segue selecionado.
    mockCatalog.mockReturnValue(baseCatalog([product('p2'), product('p3')]));
    buscar('caneca');

    expect(screen.queryByTestId('card-p1')).not.toBeInTheDocument();
    expect(barra()).toHaveTextContent('Favoritar 1');

    selecionarCard('p2');
    expect(barra()).toHaveTextContent('Favoritar 2');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar (2)' }));

    // CT-71 — o dialog entra por React.lazy: precisa aguardar o chunk.
    const dialog = await screen.findByTestId('bulk-send-dialog');
    expect(dialog).toHaveTextContent('p1,p2');
  });

  it('"Exportar seleção" leva o produto escondido pelo filtro (CSV com a contagem anunciada)', () => {
    renderCatalog();
    entrarNoModoSelecao();
    selecionarCard('p1');

    mockCatalog.mockReturnValue(baseCatalog([product('p2'), product('p3')]));
    buscar('caneca');
    selecionarCard('p2');

    fireEvent.click(screen.getByRole('button', { name: 'Exportar seleção' }));

    expect(triggerCsvDownload).toHaveBeenCalledTimes(1);
    const [csv] = triggerCsvDownload.mock.calls[0] as [string, string];
    const linhas = csv.split('\n');
    expect(linhas).toHaveLength(3); // cabeçalho + os 2 anunciados na barra
    expect(linhas[1]).toContain('SKU-p1');
    expect(linhas[2]).toContain('SKU-p2');
    expect(toastSuccess).toHaveBeenCalledWith('2 produto(s) exportado(s) em CSV');
  });

  it('o chip "Meus favoritos" também mantém a seleção inteira no envio', async () => {
    mockFavorites.mockReturnValue({
      favorites: [favorito('p9', 'SKU-P9', 'Caneca Favorita')],
      favoriteIds: new Set(['p9']),
      isFavorite: (id: string) => id === 'p9',
      isLoading: false,
      toggle: vi.fn(),
    });
    renderCatalog();
    entrarNoModoSelecao();
    selecionarCard('p1');

    // O chip troca a lista exibida (favoritos) — p1 sai da tela.
    fireEvent.click(screen.getByRole('button', { name: /Meus favoritos/i }));
    expect(screen.queryByTestId('card-p1')).not.toBeInTheDocument();
    expect(barra()).toHaveTextContent('Favoritar 1');

    selecionarCard('p9');
    expect(barra()).toHaveTextContent('Favoritar 2');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar (2)' }));

    const dialog = await screen.findByTestId('bulk-send-dialog');
    expect(dialog).toHaveTextContent('p1,p9');
  });

  it('a seleção continua honesta ao voltar o filtro: nenhum id some nem duplica', async () => {
    renderCatalog();
    entrarNoModoSelecao();
    selecionarCard('p1');

    mockCatalog.mockReturnValue(baseCatalog([product('p2')]));
    buscar('caneca');
    selecionarCard('p2');
    expect(barra()).toHaveTextContent('Favoritar 2');

    // Volta o resultado original: p1 reaparece JÁ marcado; p2 sai da tela.
    mockCatalog.mockReturnValue(baseCatalog([product('p1'), product('p2'), product('p3')]));
    buscar('');

    expect(screen.getByTestId('card-p1')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('card-p2')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('card-p3')).toHaveAttribute('data-selected', 'false');
    expect(barra()).toHaveTextContent('Favoritar 2');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar (2)' }));
    const dialog = await screen.findByTestId('bulk-send-dialog');
    expect(dialog).toHaveTextContent('p1,p2');
  });

  // ─── Comportamento ANTERIOR que o diff não pode perder ─────────────────────
  it('trocar de página continua limpando a seleção — sem contador órfão', () => {
    mockCatalog.mockReturnValue({
      ...baseCatalog(Array.from({ length: 24 }, (_, i) => product(`p${i + 1}`))),
      totalProducts: 30,
    });
    renderCatalog();
    entrarNoModoSelecao();
    selecionarCard('p1');
    expect(barra()).toHaveTextContent('Favoritar 1');

    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));

    expect(screen.queryByRole('button', { name: /Favoritar \d+/ })).not.toBeInTheDocument();
  });

  it('"Selecionar página" completa a página e "Desselecionar página" desmarca só ela', () => {
    renderCatalog();
    entrarNoModoSelecao();
    selecionarCard('p1');
    expect(barra()).toHaveTextContent('Favoritar 1');

    fireEvent.click(screen.getByRole('button', { name: 'Selecionar página' }));
    // p1 não duplica: a página inteira (3) fica marcada uma vez só
    expect(barra()).toHaveTextContent('Favoritar 3');

    fireEvent.click(screen.getByRole('button', { name: 'Desselecionar página' }));
    expect(screen.queryByRole('button', { name: /Favoritar \d+/ })).not.toBeInTheDocument();
  });

  it('só os ids concluídos saem da seleção; o que sobrou é o que o próximo envio leva (R2-MOD-007)', async () => {
    renderCatalog();
    entrarNoModoSelecao();
    selecionarCard('p1');

    mockCatalog.mockReturnValue(baseCatalog([product('p2')]));
    buscar('caneca');
    selecionarCard('p2');
    expect(barra()).toHaveTextContent('Favoritar 2');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar (2)' }));
    const dialog = await screen.findByTestId('bulk-send-dialog');
    expect(dialog).toHaveTextContent('p1,p2');

    // O lote concluiu só p1: ele sai da seleção, p2 fica para reenvio.
    // (o dialog mock fica fora do portal do Radix, então é aria-hidden para o
    // `getByRole` — a busca por texto não é afetada por isso)
    fireEvent.click(within(dialog).getByText('Concluir envio'));

    expect(barra()).toHaveTextContent('Favoritar 1');
    expect(screen.getByTestId('bulk-send-dialog')).toHaveTextContent('p2');
    expect(screen.getByTestId('bulk-send-dialog')).not.toHaveTextContent('p1');
  });
});
