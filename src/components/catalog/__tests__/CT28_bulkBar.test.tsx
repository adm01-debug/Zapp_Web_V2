/**
 * CT-28 — barra de seleção em massa (CatalogBulkBar) ligada no catálogo do
 * chat (grade e lista), com "Exportar seleção" (CT-20 com os ids escolhidos),
 * "Favoritar N" e o limite por envio com mensagem clara.
 * Aceite do plano: selecionar 11 → aviso; exportar 3 → CSV com 3 linhas.
 *
 * CT-34 — a cor escolhida no detalhe (2º argumento do onSend) chega ao
 * `SendProductDialog` como `initialVariantColor`.
 * CT-36 — a lista do resultado atual, na ordem exibida, é repassada ao card
 * (e daí ao `ProductDetailDialog`).
 *
 * O card e os dialogs são mocks: aqui o que se prova é a FIAÇÃO entre eles.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CatalogBulkBar } from '../CatalogBulkBar';
import { ExternalProductCatalog } from '../ExternalProductCatalog';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: toastSuccess, error: vi.fn() }),
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
    products,
    mode,
    isSelected,
    onToggleSelect,
    onSend,
  }: {
    product: ExternalProduct;
    products?: ExternalProduct[];
    mode?: string;
    isSelected?: boolean;
    onToggleSelect?: (id: string) => void;
    onSend?: (p: ExternalProduct, variantColor?: string) => void;
  }) => (
    <div
      data-testid={`card-${product.id}`}
      data-mode={mode}
      data-selected={isSelected ? 'true' : 'false'}
      data-products={(products ?? []).map((p) => p.id).join(',')}
    >
      <span>{product.name}</span>
      <button type="button" onClick={() => onToggleSelect?.(product.id)}>Selecionar item</button>
      <button type="button" onClick={() => onSend?.(product)}>Enviar</button>
      <button type="button" onClick={() => onSend?.(product, 'Vermelho')}>Enviar cor</button>
    </div>
  ),
  CatalogProductCardSkeleton: ({ mode }: { mode?: string }) => <div data-testid="skeleton" data-mode={mode} />,
}));

vi.mock('../SendProductDialog', () => ({
  SendProductDialog: ({ product, initialVariantColor }: { product: ExternalProduct; initialVariantColor?: string }) => (
    <div data-testid="send-dialog" data-variant={initialVariantColor ?? ''}>{product.name}</div>
  ),
}));

vi.mock('../CatalogBulkSendDialog', () => ({
  CatalogBulkSendDialog: ({ products, open }: { products: ExternalProduct[]; open: boolean }) =>
    open ? <div data-testid="bulk-send-dialog">{products.map((p) => p.id).join(',')}</div> : null,
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

/** Entra no modo seleção e marca os n primeiros cards da tela. */
const selecionarPrimeiros = (n: number) => {
  fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
  screen.getAllByRole('button', { name: 'Selecionar item' }).slice(0, n).forEach((b) => fireEvent.click(b));
};

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

// ─── CT-28 — barra em si (sem catálogo em volta) ───────────────────────────
describe('CT-28 — CatalogBulkBar', () => {
  const props = {
    pageTotal: 12,
    allPageSelected: false,
    onToggleSelectAll: vi.fn(),
    onClear: vi.fn(),
    onSend: vi.fn(),
    onExport: vi.fn(),
    onFavorite: vi.fn(),
  };

  it('acima do limite (11 > 10) mostra o aviso e bloqueia o envio', () => {
    render(<CatalogBulkBar {...props} count={11} />);

    expect(screen.getByText('Máximo de 10 produtos por envio — envie em lotes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar (11)' })).toBeDisabled();
    // exportar e favoritar continuam liberados: o limite é só do envio
    expect(screen.getByRole('button', { name: 'Exportar seleção' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Favoritar 11' })).toBeEnabled();
  });

  it('no limite (10) não há aviso e o envio funciona', () => {
    render(<CatalogBulkBar {...props} count={10} />);

    expect(screen.queryByText(/Máximo de/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar (10)' }));
    expect(props.onSend).toHaveBeenCalled();
  });

  it('o limite é parametrizável (maxSend)', () => {
    render(<CatalogBulkBar {...props} count={3} maxSend={2} />);
    expect(screen.getByText('Máximo de 2 produtos por envio — envie em lotes.')).toBeInTheDocument();
  });

  it('com 3 selecionados, exportar e favoritar chamam os handlers', () => {
    render(<CatalogBulkBar {...props} count={3} />);

    fireEvent.click(screen.getByRole('button', { name: 'Exportar seleção' }));
    fireEvent.click(screen.getByRole('button', { name: 'Favoritar 3' }));

    expect(props.onExport).toHaveBeenCalledTimes(1);
    expect(props.onFavorite).toHaveBeenCalledTimes(1);
  });
});

// ─── CT-28 — fiação no catálogo (grade e lista) ────────────────────────────
describe('CT-28 — seleção em massa no catálogo do chat', () => {
  it('fora do modo seleção o card não recebe seleção (clique segue abrindo o detalhe)', () => {
    renderCatalog();

    fireEvent.click(screen.getAllByRole('button', { name: 'Selecionar item' })[0]);

    expect(screen.getByTestId('card-p1')).toHaveAttribute('data-selected', 'false');
    expect(screen.queryByRole('button', { name: 'Enviar (1)' })).not.toBeInTheDocument();
  });

  it('modo grade: selecionar 3 abre a barra com "Exportar seleção" e "Favoritar 3"', () => {
    renderCatalog();

    selecionarPrimeiros(3);

    expect(screen.getByTestId('card-p1')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByRole('button', { name: 'Exportar seleção' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Favoritar 3' })).toBeInTheDocument();
  });

  it('modo lista: a mesma barra aparece (grade e lista)', () => {
    renderCatalog();

    fireEvent.click(screen.getByRole('button', { name: 'Ver em lista' }));
    selecionarPrimeiros(1);

    expect(screen.getByTestId('card-p1')).toHaveAttribute('data-mode', 'list');
    expect(screen.getByRole('button', { name: 'Favoritar 1' })).toBeInTheDocument();
  });

  it('"Selecionar página" marca a página inteira; com 11+ itens avisa o limite', () => {
    mockCatalog.mockReturnValue(baseCatalog(Array.from({ length: 12 }, (_, i) => product(`p${i + 1}`))));
    renderCatalog();

    selecionarPrimeiros(1);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar página' }));

    expect(screen.getByTestId('card-p12')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByText('Máximo de 10 produtos por envio — envie em lotes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar (12)' })).toBeDisabled();
  });

  it('"Exportar seleção" baixa CSV com cabeçalho + as 3 linhas selecionadas', () => {
    renderCatalog();

    selecionarPrimeiros(3);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar seleção' }));

    expect(triggerCsvDownload).toHaveBeenCalledTimes(1);
    const [csv, filename] = triggerCsvDownload.mock.calls[0] as [string, string];
    const linhas = csv.split('\n');
    expect(linhas).toHaveLength(4); // cabeçalho + 3 produtos
    expect(linhas[1]).toContain('SKU-p1');
    expect(linhas[3]).toContain('SKU-p3');
    expect(filename).toContain('selecao');
  });

  it('"Favoritar N" favorita só os selecionados que ainda não são favoritos', () => {
    const toggle = vi.fn();
    mockFavorites.mockReturnValue({
      favorites: [],
      favoriteIds: new Set(['p2']),
      isFavorite: (id: string) => id === 'p2',
      isLoading: false,
      toggle,
    });
    renderCatalog();

    selecionarPrimeiros(3);
    fireEvent.click(screen.getByRole('button', { name: 'Favoritar 3' }));

    expect(toggle).toHaveBeenCalledTimes(2);
    expect(toggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
    expect(toggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'p3' }));
    expect(toggle).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'p2' }));
  });

  it('"Enviar" da barra abre o envio em massa com os selecionados', () => {
    renderCatalog();

    selecionarPrimeiros(2);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar (2)' }));

    expect(screen.getByTestId('bulk-send-dialog')).toHaveTextContent('p1,p2');
  });

  it('sair do modo seleção limpa a seleção e esconde a barra', () => {
    renderCatalog();

    selecionarPrimeiros(2);
    expect(screen.getByRole('button', { name: 'Favoritar 2' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));

    expect(screen.queryByRole('button', { name: 'Favoritar 2' })).not.toBeInTheDocument();
    expect(screen.getByTestId('card-p1')).toHaveAttribute('data-selected', 'false');
  });
});

// ─── CT-34 / CT-36 — fiação entre catálogo, card e detalhe ─────────────────
describe('CT-34/CT-36 — fiação catálogo → card → detalhe/envio', () => {
  it('CT-34: a cor escolhida no detalhe chega ao SendProductDialog (initialVariantColor)', () => {
    renderCatalog();

    fireEvent.click(screen.getAllByRole('button', { name: 'Enviar cor' })[0]);

    expect(screen.getByTestId('send-dialog')).toHaveAttribute('data-variant', 'Vermelho');
  });

  it('CT-34: envio sem cor escolhida não inventa variante', () => {
    renderCatalog();

    fireEvent.click(screen.getAllByRole('button', { name: 'Enviar' })[0]);

    expect(screen.getByTestId('send-dialog')).toHaveAttribute('data-variant', '');
  });

  it('CT-36: o card recebe os produtos do resultado atual, na ordem exibida', () => {
    mockCatalog.mockReturnValue(baseCatalog([product('p3'), product('p1'), product('p2')]));
    renderCatalog();

    expect(screen.getByTestId('card-p3')).toHaveAttribute('data-products', 'p3,p1,p2');
    expect(screen.getByTestId('card-p1')).toHaveAttribute('data-products', 'p3,p1,p2');
  });

  it('CT-36: no chip "Meus favoritos" a lista é a de favoritos exibida', () => {
    mockFavorites.mockReturnValue({
      favorites: [{
        id: 'f1', product_id: 'p9', product_name: 'Caneca Favorita', product_sku: 'SKU-P9',
        primary_image_url: null, created_at: '2026-09-29T10:00:00Z',
      }],
      favoriteIds: new Set(['p9']),
      isFavorite: (id: string) => id === 'p9',
      isLoading: false,
      toggle: vi.fn(),
    });
    renderCatalog();

    fireEvent.click(screen.getByRole('button', { name: /Meus favoritos/i }));

    expect(screen.getByTestId('card-p9')).toHaveAttribute('data-products', 'p9');
  });
});
