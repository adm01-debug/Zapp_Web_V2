/**
 * CT-25 — menu de ações do card (`RowActionsMenu`) e teclado.
 *
 * Aqui o card é o REAL (mesmo componente da grade e da lista): o menu é o
 * `RowActionsMenu` do Talk X e as ações são as do plano — Ver detalhes,
 * Enviar, Copiar SKU, Copiar link, Abrir no PromoGifts e Favoritar (esta só
 * quando o caller passa `onToggleFavorite`, senão nem é renderizada).
 * Teclado: `Enter` abre o detalhe, `e` envia — no próprio card, então digitar
 * num campo de busca não dispara envio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CatalogProductCard } from '../CatalogProductCard';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

// Radix (DropdownMenu) mede o trigger com ResizeObserver, API que o jsdom não
// implementa — mesmo polyfill dos testes de catálogo já existentes.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: toastSuccess, error: vi.fn() }),
}));

// O detalhe depende de auth/hook de produto; o que interessa aqui é que ele
// abre — o mock só existe quando `open`.
vi.mock('../ProductDetailDialog', () => ({
  ProductDetailDialog: ({ open, products }: { open: boolean; products?: unknown[] }) =>
    open ? <div data-testid="detail-dialog" data-products={products?.length ?? 0} /> : null,
}));

const product = (overrides: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1', name: 'Caneta Bambu', sku: 'CB-001', sale_price: 12.5, stock_quantity: 10,
  primary_image_url: null, slug: 'caneta-bambu', colors: [], variants: [],
  ...overrides,
} as unknown as ExternalProduct);

const MENU_LABEL = 'Ações do produto Caneta Bambu';

/** Abre o menu pelo teclado (ArrowDown), como o usuário faria no trigger. */
const abrirMenu = () => {
  fireEvent.keyDown(screen.getByRole('button', { name: MENU_LABEL }), { key: 'ArrowDown' });
};

beforeEach(() => {
  toastSuccess.mockReset();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  vi.restoreAllMocks();
});

describe('CT-25 — RowActionsMenu do card', () => {
  it('grade: o menu lista as ações do plano (sem Favoritar se o caller não passar onToggleFavorite)', () => {
    render(<CatalogProductCard product={product()} onSend={vi.fn()} />);

    abrirMenu();

    const itens = screen.getAllByRole('menuitem').map((i) => (i.textContent ?? '').trim());
    expect(itens).toEqual(['Ver detalhes', 'Enviar', 'Copiar SKU', 'Copiar link', 'Abrir no PromoGifts']);
    expect(screen.queryByRole('menuitem', { name: 'Favoritar' })).not.toBeInTheDocument();
  });

  it('lista: o menu fica fixo (sem hover) e ganha Favoritar/Remover quando há favorito', () => {
    const onToggleFavorite = vi.fn();
    render(
      <CatalogProductCard
        product={product()}
        mode="list"
        onSend={vi.fn()}
        isFavorite
        onToggleFavorite={onToggleFavorite}
      />
    );

    abrirMenu();
    expect(screen.getByRole('menuitem', { name: 'Remover dos favoritos' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Remover dos favoritos' }));
    expect(onToggleFavorite).toHaveBeenCalledWith('p1');
  });

  it('"Ver detalhes" abre o ProductDetailDialog', () => {
    render(<CatalogProductCard product={product()} onSend={vi.fn()} />);
    expect(screen.queryByTestId('detail-dialog')).not.toBeInTheDocument();

    abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver detalhes' }));

    expect(screen.getByTestId('detail-dialog')).toBeInTheDocument();
  });

  it('clicar no menu não abre o detalhe junto (o clique não vaza para o card)', () => {
    render(<CatalogProductCard product={product()} onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: MENU_LABEL }));

    expect(screen.queryByTestId('detail-dialog')).not.toBeInTheDocument();
  });

  it('"Enviar" dispara o onSend do card e some (desabilitada) quando não há onSend', () => {
    const onSend = vi.fn();
    const { unmount } = render(<CatalogProductCard product={product()} onSend={onSend} />);

    abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Enviar' }));
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
    unmount();

    // sem onSend não existe destino: a ação fica desabilitada (nada morto)
    render(<CatalogProductCard product={product()} />);
    abrirMenu();
    expect(screen.getByRole('menuitem', { name: 'Enviar' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('"Copiar SKU" copia o SKU; "Copiar link" copia a URL do PromoGifts pelo slug', () => {
    render(<CatalogProductCard product={product()} onSend={vi.fn()} />);

    abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copiar SKU' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('CB-001');

    abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copiar link' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://promogifts.com.br/caneta-bambu');
  });

  it('sem slug, "Copiar link" e "Abrir no PromoGifts" ficam desabilitadas (nenhum destino real)', () => {
    render(<CatalogProductCard product={product({ slug: null })} onSend={vi.fn()} />);

    abrirMenu();
    expect(screen.getByRole('menuitem', { name: 'Copiar link' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: 'Abrir no PromoGifts' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('"Abrir no PromoGifts" abre a URL do produto em nova aba', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<CatalogProductCard product={product()} onSend={vi.fn()} />);

    abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Abrir no PromoGifts' }));

    expect(openSpy).toHaveBeenCalledWith('https://promogifts.com.br/caneta-bambu', '_blank', 'noopener,noreferrer');
  });
});

describe('CT-25 — teclado do card', () => {
  it('Enter abre o detalhe e "e" envia, no próprio card', () => {
    const onSend = vi.fn();
    const { container } = render(<CatalogProductCard product={product()} onSend={onSend} />);
    const card = container.querySelector('.catalog-card') as HTMLElement;

    fireEvent.keyDown(card, { key: 'Enter' });
    expect(screen.getByTestId('detail-dialog')).toBeInTheDocument();

    fireEvent.keyDown(card, { key: 'e' });
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
  });

  it('card esgotado não envia no "e"', () => {
    const onSend = vi.fn();
    // card esgotado monta um Tooltip (radix) → precisa do provider.
    const { container } = render(
      <TooltipProvider>
        <CatalogProductCard product={product({ is_stockout: true })} onSend={onSend} />
      </TooltipProvider>
    );
    const card = container.querySelector('.catalog-card') as HTMLElement;

    fireEvent.keyDown(card, { key: 'e' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('tecla digitada em campo/botão interno não abre nem envia', () => {
    const onSend = vi.fn();
    render(<CatalogProductCard product={product()} onSend={onSend} />);

    // o botão "Enviar" do rodapé é descendente do card: o evento sobe com
    // target diferente do currentTarget e o handler do card ignora.
    fireEvent.keyDown(screen.getByRole('button', { name: /^Enviar$/ }), { key: 'e' });

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.queryByTestId('detail-dialog')).not.toBeInTheDocument();
  });
});
