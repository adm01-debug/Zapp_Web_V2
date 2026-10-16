/**
 * CT-15/CT-16 — o catálogo dentro do dialog do chat.
 *
 * Cobre: grade/lista reusando CatalogProductCard, paginação TalkXPagination,
 * estados de vazio/erro do Talk X e o chip "Meus favoritos" (catalog_favorites).
 * CT-26 — cabeçalho sticky da lista (`talkx-table`, linhas de 72px, role="row").
 * CT-29 — paginação sem flash (opacity-60 + barra fina em `isFetching`).
 * A virtualização do CT-27 tem teste próprio (usa o virtualizador real e mede
 * a janela renderizada): ExternalProductCatalog.virtualizacao.test.tsx.
 */
import { toastError } from './catalogMocks';
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { toast } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductCatalog } from '../ExternalProductCatalog';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

const mockCatalog = vi.hoisted(() => vi.fn());
const mockFavorites = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/integrations/useExternalCatalog', () => ({
  useExternalCatalog: (...args: unknown[]) => mockCatalog(...args),
  useCatalogFavorites: (...args: unknown[]) => mockFavorites(...args),
  useExternalProduct: () => ({ data: null, isFetching: false }),
}));

// O card real precisa de dezenas de campos; aqui interessa apenas que o
// catálogo o use (CT-15) e que o clique em "Enviar" chegue ao dialog (CT-14).
vi.mock('../CatalogProductCard', () => ({
  CatalogProductCard: ({
    product,
    onSend,
    mode,
    priority,
    sizes,
    isFavorite,
    onToggleFavorite,
    onToggleSelect,
  }: {
    product: ExternalProduct;
    onSend?: (p: ExternalProduct) => void;
    mode?: string;
    priority?: boolean;
    sizes?: string;
    isFavorite?: boolean;
    onToggleFavorite?: (id: string) => void;
    onToggleSelect?: (id: string) => void;
  }) => (
    <div
      data-testid={`card-${product.id}`}
      data-mode={mode}
      data-priority={priority ? 'true' : 'false'}
      data-sizes={sizes ?? ''}
      data-favorite={isFavorite ? 'true' : 'false'}
    >
      <span>{product.name}</span>
      <button type="button" onClick={() => onSend?.(product)}>Enviar</button>
      <button type="button" onClick={() => onToggleFavorite?.(product.id)}>Favoritar</button>
      {onToggleSelect && (
        <button type="button" onClick={() => onToggleSelect(product.id)}>Sel</button>
      )}
    </div>
  ),
  CatalogProductCardSkeleton: ({ mode }: { mode?: string }) => (
    <div data-testid="skeleton" data-mode={mode} />
  ),
}));

vi.mock('../SendProductDialog', () => ({
  SendProductDialog: ({
    product,
    presetContact,
  }: {
    product: ExternalProduct;
    presetContact?: { name: string } | null;
  }) => (
    <div data-testid="send-dialog">{`${product.name}|${presetContact?.name ?? 'sem-contato'}`}</div>
  ),
}));

const CONTACT = { id: 'c1', name: 'Cliente da Conversa', phone: '5541999990000', avatar_url: null };

const product = (id: string, name: string): ExternalProduct =>
  ({ id, name, sku: `SKU-${id}`, sale_price: 10, stock_quantity: 5, variants: [] } as unknown as ExternalProduct);

const FAVORITE = {
  id: 'f1',
  product_id: 'p9',
  product_name: 'Caneca Favorita',
  product_sku: 'SKU-P9',
  primary_image_url: null,
  created_at: '2026-09-29T10:00:00Z',
};

const renderCatalog = (props: Record<string, unknown> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExternalProductCatalog open onOpenChange={vi.fn()} {...props} />
    </QueryClientProvider>
  );
};

/** Estado base do hook do catálogo; cada teste sobrescreve o que interessa. */
const baseCatalog = () => ({
  products: [product('p1', 'Caneta Bambu'), product('p2', 'Squeeze Aço')],
  totalProducts: 60,
  categories: [{ id: 'cat1', name: 'Brindes', parent_id: null, products_count: 12 }],
  suppliers: [{ id: 'sup1', name: 'Promo Brindes' }],
  loading: false,
  // CT-29 — o hook real expõe as duas flags separadas (loading = isLoading ||
  // isFetching); a UI usa isInitialLoading p/ skeleton e isFetching p/ a barra.
  isInitialLoading: false,
  isFetching: false,
  error: null as string | null,
  errorCode: null as string | null,
  errorStatus: null as number | null,
  fetchProducts: vi.fn(),
  fetchCategories: vi.fn(),
  fetchSuppliers: vi.fn(),
});

beforeEach(() => {
  mockCatalog.mockReset();
  mockFavorites.mockReset();
  toastError.mockReset();
  vi.mocked(toast.success).mockClear();
  mockCatalog.mockReturnValue(baseCatalog());
  mockFavorites.mockReturnValue({
    favorites: [FAVORITE],
    favoriteIds: new Set(['p9']),
    isFavorite: (id: string) => id === 'p9',
    isLoading: false,
    toggle: vi.fn(),
  });
});

describe('ExternalProductCatalog — CT-15 (primitivos da tela principal)', () => {
  it('renderiza a grade com CatalogProductCard e a paginação do Talk X', () => {
    renderCatalog();

    expect(screen.getByTestId('card-p1')).toHaveAttribute('data-mode', 'grade');
    expect(screen.getByTestId('card-p2')).toBeInTheDocument();
    expect(screen.getByText('Mostrando 1-24 de 60')).toBeInTheDocument();
    // TalkXPagination (60 produtos / 24 por página = 3 páginas) substituiu a
    // paginação própria: 3 botões de página + o resumo "1 a 24 de 60 produtos".
    expect(screen.getByText('1 a 24 de 60 produtos', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^3$/ }).length).toBeGreaterThan(0);
  });

  it('mostra o estado vazio do Talk X quando não há produtos', () => {
    mockCatalog.mockReturnValue({ ...baseCatalog(), products: [], totalProducts: 0 });
    renderCatalog();

    expect(screen.getByText('Nenhum produto encontrado')).toBeInTheDocument();
  });

  it('mostra o estado de dados indisponíveis quando a edge falha (CATALOG_UPSTREAM_ERROR)', () => {
    mockCatalog.mockReturnValue({
      ...baseCatalog(),
      products: [],
      totalProducts: 0,
      error: 'Catalog database is temporarily unavailable',
      errorCode: 'CATALOG_UPSTREAM_ERROR',
      errorStatus: 503,
    });
    renderCatalog();

    expect(screen.getByText('Dados indisponíveis')).toBeInTheDocument();
  });
});

describe('ExternalProductCatalog — CT-59 (estado de erro por código da edge)', () => {
  const renderWithError = (overrides: Record<string, unknown>) => {
    const hookReturn = { ...baseCatalog(), products: [], totalProducts: 0, ...overrides };
    mockCatalog.mockReturnValue(hookReturn);
    renderCatalog();
    return hookReturn;
  };

  it('CATALOG_UPSTREAM_ERROR: TalkXDataUnavailableState + "Tentar de novo" refaz a busca', () => {
    const hookReturn = renderWithError({
      error: 'Catalog database is temporarily unavailable',
      errorCode: 'CATALOG_UPSTREAM_ERROR',
      errorStatus: 503,
    });

    expect(screen.getByText('Dados indisponíveis')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(hookReturn.fetchProducts).toHaveBeenCalled();
  });

  it('CATALOG_NOT_CONFIGURED: mostra o código para o admin, sem retry de agente', () => {
    renderWithError({
      error: 'Catalog is not configured',
      errorCode: 'CATALOG_NOT_CONFIGURED',
      errorStatus: 503,
    });

    expect(screen.getByText(/Código do erro:/)).toBeInTheDocument();
    expect(screen.getByText('CATALOG_NOT_CONFIGURED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
  });

  it('CATALOG_CREDENTIALS_INVALID: mostra o código real da edge (o plano escreve CREDENTIALS_INVALID)', () => {
    renderWithError({
      error: 'Catalog credentials are not authorized for the requested resource',
      errorCode: 'CATALOG_CREDENTIALS_INVALID',
      errorStatus: 503,
    });

    expect(screen.getByText('CATALOG_CREDENTIALS_INVALID')).toBeInTheDocument();
  });

  it('429: dispara o toast "Muitas requisições, aguarde 1 min" e desabilita os botões', async () => {
    renderWithError({
      error: 'Too many requests. Try again in 1 minute.',
      errorCode: 'CATALOG_RATE_LIMITED',
      errorStatus: 429,
    });

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Muitas requisições, aguarde 1 min');
    });
    // botões de ação desabilitados durante o cooldown de 10 s
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeDisabled();
    expect(screen.getByPlaceholderText('Buscar por nome, SKU ou marca...')).toBeDisabled();
    expect(screen.getAllByRole('combobox')[0]).toBeDisabled();
  });
});

describe('ExternalProductCatalog — CT-60 (contagem nos filtros)', () => {
  it('select de categoria em árvore com contagem: raiz semibold, filho indentado', () => {
    mockCatalog.mockReturnValue({
      ...baseCatalog(),
      categories: [
        { id: 'cat1', name: 'Brindes', parent_id: null, products_count: 42 },
        { id: 'cat2', name: 'Canecas', parent_id: 'cat1', products_count: 7 },
        { id: 'cat3', name: 'Sem contagem', parent_id: null },
      ],
    });
    renderCatalog();

    fireEvent.keyDown(screen.getAllByRole('combobox')[0], { key: 'ArrowDown' });

    const root = screen.getByRole('option', { name: 'Brindes (42)' });
    expect(root.className).toContain('font-semibold');
    const child = screen.getByRole('option', { name: 'Canecas (7)' });
    expect(child.className).toContain('pl-6');
    // sem products_count a fonte não tem número — o rótulo fica sem contagem
    expect(screen.getByRole('option', { name: 'Sem contagem' })).toBeInTheDocument();
  });

  it('select de fornecedor não inventa contagem (não há fonte real)', () => {
    renderCatalog();

    fireEvent.keyDown(screen.getAllByRole('combobox')[1], { key: 'ArrowDown' });

    expect(screen.getByRole('option', { name: 'Promo Brindes' })).toBeInTheDocument();
  });
});

describe('ExternalProductCatalog — CT-16 (chip Meus favoritos)', () => {
  it('alterna para os favoritos salvos em catalog_favorites', () => {
    renderCatalog();

    expect(screen.queryByTestId('card-p9')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Meus favoritos/i }));

    expect(screen.getByTestId('card-p9')).toBeInTheDocument();
    expect(screen.getByText('Caneca Favorita')).toBeInTheDocument();
    expect(screen.getByText('Mostrando 1 produto(s) favorito(s)')).toBeInTheDocument();
    // sem paginação na visão de favoritos
    expect(screen.queryByText(/Mostrando 1-24 de/)).not.toBeInTheDocument();
  });

  it('sem favoritos, mostra o estado vazio', () => {
    mockFavorites.mockReturnValue({
      favorites: [],
      favoriteIds: new Set<string>(),
      isFavorite: () => false,
      isLoading: false,
      toggle: vi.fn(),
    });
    renderCatalog();

    fireEvent.click(screen.getByRole('button', { name: /Meus favoritos/i }));

    expect(screen.getByText('Sem favoritos ainda')).toBeInTheDocument();
  });

  it('envia pelo SendProductDialog já com o contato da conversa (CT-14)', async () => {
    renderCatalog({ presetContact: CONTACT });

    fireEvent.click(screen.getAllByRole('button', { name: 'Enviar' })[0]);

    // CT-71 — o dialog entra por React.lazy: aguarda o chunk resolver.
    const dialog = await screen.findByTestId('send-dialog');
    expect(dialog).toHaveTextContent('Caneta Bambu|Cliente da Conversa');
  });
});

describe('ExternalProductCatalog — CT-72 (capas acima da dobra)', () => {
  it('só as 4 primeiras capas da grade nascem acima da dobra (priority)', () => {
    mockCatalog.mockReturnValue({
      ...baseCatalog(),
      products: Array.from({ length: 6 }, (_, i) => product(`p${i + 1}`, `Produto ${i + 1}`)),
      totalProducts: 6,
    });
    renderCatalog();

    const prioridades = [1, 2, 3, 4, 5, 6].map(
      (i) => screen.getByTestId(`card-p${i}`).getAttribute('data-priority')
    );

    expect(prioridades).toEqual(['true', 'true', 'true', 'true', 'false', 'false']);
  });
});

describe('ExternalProductCatalog — CT-26 (cabeçalho sticky no modo lista)', () => {
  it('lista: tabela .talkx-table com cabeçalho sticky, 5 colunas e linhas de 72px com role="row"', () => {
    mockCatalog.mockReturnValue({
      ...baseCatalog(),
      products: [product('p1', 'Caneta Bambu'), product('p2', 'Squeeze Aço')],
      totalProducts: 2,
    });
    const { container } = renderCatalog();

    fireEvent.click(screen.getByRole('button', { name: 'Ver em lista' }));

    // o DialogContent (Radix) é portalado para o body — não está dentro de
    // `container`; por isso as buscas de tabela usam o document.
    const table = document.querySelector('table.talkx-table');
    expect(table).not.toBeNull();

    // cabeçalho de colunas fixo no topo do container de scroll (mesmo padrão
    // de stickyHeader do talkxShared.TalkXTable)
    const thead = table!.querySelector('thead') as HTMLElement;
    expect(thead.className).toContain('sticky');
    expect(thead.className).toContain('top-0');
    expect(Array.from(thead.querySelectorAll('th')).map((th) => th.textContent)).toEqual([
      'Produto',
      'Marca / Fornecedor',
      'Preço',
      'Estoque',
      'Ações',
    ]);
    expect(thead.querySelectorAll('th[scope="col"]')).toHaveLength(5);

    const linhas = Array.from(document.querySelectorAll('tbody tr[role="row"]'));
    expect(linhas).toHaveLength(2);
    linhas.forEach((linha) => expect((linha as HTMLElement).style.height).toBe('72px'));
    // a linha cobre as 5 colunas do cabeçalho e o conteúdo é o card em modo lista
    expect(linhas[0].querySelector('td')?.getAttribute('colspan')).toBe('5');
    expect(screen.getByTestId('card-p1')).toHaveAttribute('data-mode', 'list');
    expect(screen.getByTestId('card-p2')).toHaveAttribute('data-mode', 'list');
  });

  it('grade continua sem tabela (o cabeçalho é só da lista)', () => {
    mockCatalog.mockReturnValue({
      ...baseCatalog(),
      products: [product('p1', 'Caneta Bambu')],
      totalProducts: 1,
    });
    const { container } = renderCatalog();

    expect(document.querySelector('table.talkx-table')).toBeNull();
    expect(container.querySelector('table')).toBeNull();
    expect(screen.getByTestId('card-p1')).toHaveAttribute('data-mode', 'grade');
  });
});

describe('ExternalProductCatalog — CT-29 (paginação sem flash)', () => {
  it('isFetching durante a paginação: mantém os cards com opacity-60 + barra, sem skeleton', () => {
    // o hook real mantém `loading` true durante qualquer fetch (isLoading ||
    // isFetching) — é justamente esse valor que trocava os cards por skeleton.
    mockCatalog.mockReturnValue({ ...baseCatalog(), loading: true, isInitialLoading: false, isFetching: true });
    renderCatalog();

    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-p1')).toBeInTheDocument();
    expect(screen.getByTestId('card-p2')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-products')).toHaveClass('opacity-60');
    expect(screen.getByTestId('catalog-fetching-bar')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Atualizando produtos' })).toBeInTheDocument();
  });

  it('carga inicial (isInitialLoading): aí sim mostra os skeletons e nenhuma barra', () => {
    mockCatalog.mockReturnValue({
      ...baseCatalog(),
      products: [],
      totalProducts: 0,
      loading: true,
      isInitialLoading: true,
      isFetching: true,
    });
    renderCatalog();

    expect(screen.getAllByTestId('skeleton')).toHaveLength(8);
    expect(screen.queryByTestId('catalog-fetching-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('catalog-products')).not.toBeInTheDocument();
  });

  it('modo lista também esmaece as linhas antigas em refetch (sem skeleton)', () => {
    mockCatalog.mockReturnValue({ ...baseCatalog(), isFetching: true });
    renderCatalog();

    fireEvent.click(screen.getByRole('button', { name: 'Ver em lista' }));

    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-p1')).toHaveAttribute('data-mode', 'list');
    expect(screen.getByTestId('catalog-products')).toHaveClass('opacity-60');
    expect(screen.getByTestId('catalog-fetching-bar')).toBeInTheDocument();
  });

  it('sem fetch em andamento: cards sem opacity reduzida e sem barra', () => {
    renderCatalog();

    expect(screen.getByTestId('catalog-products')).not.toHaveClass('opacity-60');
    expect(screen.queryByTestId('catalog-fetching-bar')).not.toBeInTheDocument();
  });
});

describe('ExternalProductCatalog — CT-25 (favoritar pelo card)', () => {
  it('o card recebe isFavorite + onToggleFavorite: clicar favorita via hook (id → produto)', () => {
    const toggle = vi.fn();
    mockFavorites.mockReturnValue({
      favorites: [],
      favoriteIds: new Set<string>(),
      isFavorite: () => false,
      isLoading: false,
      toggle,
    });
    renderCatalog();

    // o catálogo liga o toggle do hook ao card (sem ele o menu/coração nem
    // renderiza — o item "Favoritar" é condicionado ao callback)
    expect(screen.getByTestId('card-p1')).toHaveAttribute('data-favorite', 'false');
    fireEvent.click(screen.getAllByRole('button', { name: 'Favoritar' })[0]);

    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', name: 'Caneta Bambu', sku: 'SKU-p1' })
    );
  });

  it('no chip "Meus favoritos" o card mostra o estado favorito e remove pelo mesmo toggle', () => {
    const toggle = vi.fn();
    mockFavorites.mockReturnValue({
      favorites: [FAVORITE],
      favoriteIds: new Set(['p9']),
      isFavorite: (id: string) => id === 'p9',
      isLoading: false,
      toggle,
    });
    renderCatalog();

    fireEvent.click(screen.getByRole('button', { name: /Meus favoritos/i }));

    expect(screen.getByTestId('card-p9')).toHaveAttribute('data-favorite', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Favoritar' }));
    expect(toggle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p9', name: 'Caneca Favorita', sku: 'SKU-P9' })
    );
  });

  // R2-MOD-009 — voltar para a 1ª página não consultava nada: o efeito de
  // paginação só buscava com `page > 0`, então o rótulo ia para 1 e os produtos
  // da página anterior ficavam na tela.
  it('R2-MOD-009: voltar para a 1ª página emite a consulta (offset 0) e devolve os produtos da 1ª', async () => {
    const TOTAL = 60;
    const emitidos: number[] = [];
    const fetchCategories = vi.fn();
    const fetchSuppliers = vi.fn();
    // Hook "com servidor": a página exibida é a que o próprio componente
    // consultou (offset do último fetchProducts) — assim os cards provam a
    // consulta, não só o número mostrado.
    mockCatalog.mockImplementation(() => {
      const [params, setParams] = useState<Record<string, unknown> | null>(null);
      const fetchProducts = (p: Record<string, unknown> = {}) => {
        emitidos.push(Number(p.offset ?? 0));
        setParams(p);
      };
      const offset = Number(params?.offset ?? 0);
      const limit = Number(params?.limit ?? 24);
      const products = Array.from(
        { length: Math.max(0, Math.min(limit, TOTAL - offset)) },
        (_, i) => product(`p${offset + i + 1}`, `Produto ${offset + i + 1}`)
      );
      return {
        ...baseCatalog(),
        products,
        totalProducts: TOTAL,
        fetchProducts,
        fetchCategories,
        fetchSuppliers,
      };
    });

    renderCatalog();
    // assenta o debounce do mount (300ms) antes de navegar
    await new Promise((r) => setTimeout(r, 350));
    expect(screen.getByTestId('card-p1')).toBeInTheDocument();
    expect(screen.queryByTestId('card-p25')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Próxima página'));
    expect(await screen.findByTestId('card-p25')).toBeInTheDocument();
    expect(screen.queryByTestId('card-p1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Página anterior'));
    // volta para a 1ª: busca de novo e mostra os mesmos ids do começo
    expect(await screen.findByTestId('card-p1')).toBeInTheDocument();
    expect(screen.queryByTestId('card-p25')).not.toBeInTheDocument();
    // a consulta de retorno saiu: 2ª página (offset 24) e, depois, a 1ª (0)
    expect(emitidos.slice(-2)).toEqual([24, 0]);
  });
});

describe('ExternalProductCatalog — CT-28/R2-MOD-043 (favoritar em lote)', () => {
  /** Seleciona os dois produtos da página e devolve o botão "Favoritar N". */
  const selecionarEPreparar = () => {
    renderCatalog();
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Sel' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Sel' })[1]);
    return screen.getByRole('button', { name: 'Favoritar 2' });
  };

  it('só anuncia o sucesso depois de a escrita confirmar', async () => {
    const pending: Array<(ok: boolean) => void> = [];
    const toggle = vi.fn(() => new Promise<boolean>((resolve) => { pending.push(resolve); }));
    mockFavorites.mockReturnValue({
      favorites: [], favoriteIds: new Set<string>(), isFavorite: () => false,
      isLoading: false, toggle,
    });

    fireEvent.click(selecionarEPreparar());

    // Escrita ainda pendente: nada de confirmação na tela.
    expect(toggle).toHaveBeenCalledTimes(2);
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();

    await act(async () => { pending.forEach((resolve) => resolve(true)); });

    await waitFor(() =>
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith('2 produto(s) adicionado(s) aos favoritos'),
    );
  });

  it('avisa quando a persistência falha, em vez de confirmar', async () => {
    const toggle = vi.fn().mockResolvedValue(false);
    mockFavorites.mockReturnValue({
      favorites: [], favoriteIds: new Set<string>(), isFavorite: () => false,
      isLoading: false, toggle,
    });

    fireEvent.click(selecionarEPreparar());

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('2 produto(s) não foram salvos nos favoritos. Tente novamente.'),
    );
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
  });
});
