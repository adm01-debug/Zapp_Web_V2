/**
 * CT-27 — virtualização do modo lista com `@tanstack/react-virtual`.
 *
 * Diferente de `ExternalProductCatalog.test.tsx` (que não precisa de layout),
 * aqui o virtualizador é o REAL: o jsdom não tem layout, então o container de
 * scroll do catálogo (`overflow-y-auto`) é medido com uma altura fixa
 * (720px = 10 linhas de 72px) e um ResizeObserver que dispara na hora. Assim a
 * asserção é sobre o número que o virtualizador de fato devolve ("renderiza só
 * as visíveis"), não sobre um mock.
 *
 * Os dois números medidos que alimentam docs/catalogo/PERF.md saem daqui:
 * a janela renderizada com pageSize >= 48 e a lista inteira com pageSize 24.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductCatalog } from '../ExternalProductCatalog';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

/** Altura do container de scroll no teste (10 linhas de 72px). */
const SCROLL_VIEWPORT_HEIGHT = 720;
/** Altura da linha do modo lista (CT-26) — é o `estimateSize` do virtualizador. */
const LIST_ROW_HEIGHT = 72;
/** Produtos na página — é o `count` do virtualizador. */
const TOTAL_PRODUCTS = 50;

// Só o container de scroll do catálogo tem altura; o resto do DOM continua com
// o 0 do jsdom (que é o default do offsetHeight).
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get(this: HTMLElement) {
    return this.classList?.contains('overflow-y-auto') ? SCROLL_VIEWPORT_HEIGHT : 0;
  },
});

// O ResizeObserver do teste chama o callback na hora da observação; sem isso o
// virtualizador mede 0 de altura e não acha janela nenhuma.
class ImmediateResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(element: Element) {
    this.callback(
      [{ target: element } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: ImmediateResizeObserver,
});

// jsdom não implementa scrollIntoView; o Radix Select chama no item ativo ao
// abrir (é o que o clique em "50 por página" dispara).
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));

const mockCatalog = vi.hoisted(() => vi.fn());
const mockFavorites = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/integrations/useExternalCatalog', () => ({
  useExternalCatalog: (...args: unknown[]) => mockCatalog(...args),
  useCatalogFavorites: (...args: unknown[]) => mockFavorites(...args),
  useExternalProduct: () => ({ data: null, isFetching: false }),
}));

vi.mock('../CatalogProductCard', () => ({
  CatalogProductCard: ({ product, mode }: { product: ExternalProduct; mode?: string }) => (
    <div data-testid={`card-${product.id}`} data-mode={mode}>
      {product.name}
    </div>
  ),
  CatalogProductCardSkeleton: ({ mode }: { mode?: string }) => <div data-testid="skeleton" data-mode={mode} />,
}));

vi.mock('../SendProductDialog', () => ({
  SendProductDialog: () => <div data-testid="send-dialog" />,
}));

const product = (id: string, name: string): ExternalProduct =>
  ({ id, name, sku: `SKU-${id}`, sale_price: 10, stock_quantity: 5, variants: [] } as unknown as ExternalProduct);

const renderCatalog = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExternalProductCatalog open onOpenChange={vi.fn()} />
    </QueryClientProvider>
  );
};

/** Troca o "por página" no select do TalkXPagination (o último combobox do dialog). */
const escolherTamanhoDePagina = async (rotulo: string) => {
  const selects = screen.getAllByRole('combobox');
  fireEvent.keyDown(selects[selects.length - 1], { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: rotulo }));
};

beforeEach(() => {
  mockCatalog.mockReset();
  mockFavorites.mockReset();
  toastError.mockReset();
  mockCatalog.mockReturnValue({
    products: Array.from({ length: TOTAL_PRODUCTS }, (_, i) => product(`p${i + 1}`, `Produto ${i + 1}`)),
    totalProducts: TOTAL_PRODUCTS,
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
  mockFavorites.mockReturnValue({
    favorites: [],
    favoriteIds: new Set<string>(),
    isFavorite: () => false,
    isLoading: false,
    toggle: vi.fn(),
  });
});

describe('ExternalProductCatalog — CT-27 (virtualização do modo lista)', () => {
  it('pageSize >= 48: renderiza só as linhas visíveis e repõe o resto em espaçador', async () => {
    renderCatalog();

    fireEvent.click(screen.getByRole('button', { name: 'Ver em lista' }));
    await escolherTamanhoDePagina('50 por página');

    await waitFor(() => {
      expect(document.querySelectorAll('tbody tr[role="row"]').length).toBeGreaterThan(0);
    });

    const linhas = document.querySelectorAll('tbody tr[role="row"]');
    // Medido: viewport de 720px (10 linhas de 72px) + overscan 6 = 16 das 50.
    expect(linhas.length).toBe(16);
    expect(linhas.length).toBeLessThan(TOTAL_PRODUCTS);
    // scroll no início → sem espaçador em cima; o de baixo repõe o resto da
    // lista (senão a barra de rolagem acharia que a página acabou na janela)
    expect(screen.queryByTestId('catalog-virtual-spacer-top')).not.toBeInTheDocument();
    const espacador = screen.getByTestId('catalog-virtual-spacer-bottom');
    const alturaEspacador = Number((espacador.querySelector('td') as HTMLElement).style.height.replace('px', ''));
    expect(alturaEspacador).toBe((TOTAL_PRODUCTS - linhas.length) * LIST_ROW_HEIGHT);
    // a altura total da lista é a mesma de sem virtualização
    expect(linhas.length * LIST_ROW_HEIGHT + alturaEspacador).toBe(TOTAL_PRODUCTS * LIST_ROW_HEIGHT);
    // as linhas renderizadas são as da janela, na ordem, e sem duplicata
    const nomes = Array.from(linhas).map((linha) => linha.textContent);
    expect(nomes[0]).toBe('Produto 1');
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(screen.getAllByTestId(/^card-/)).toHaveLength(linhas.length);
  });

  it('pageSize 24 (padrão): sem virtualização, todas as linhas da página entram no DOM', async () => {
    renderCatalog();

    fireEvent.click(screen.getByRole('button', { name: 'Ver em lista' }));

    const linhas = document.querySelectorAll('tbody tr[role="row"]');
    expect(linhas.length).toBe(TOTAL_PRODUCTS);
    expect(screen.queryByTestId('catalog-virtual-spacer-bottom')).not.toBeInTheDocument();
    expect(screen.queryByTestId('catalog-virtual-spacer-top')).not.toBeInTheDocument();
  });

  it('a grade não virtualiza nem com pageSize grande', async () => {
    renderCatalog();

    await escolherTamanhoDePagina('50 por página');

    expect(screen.getAllByTestId(/^card-/)).toHaveLength(TOTAL_PRODUCTS);
    expect(document.querySelector('table.talkx-table')).toBeNull();
  });
});
