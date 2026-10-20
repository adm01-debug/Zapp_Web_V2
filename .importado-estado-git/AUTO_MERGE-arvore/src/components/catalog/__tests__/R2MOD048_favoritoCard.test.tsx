/**
 * R2-MOD-048 — favorito (snapshot de catalog_favorites) convertia preço e
 * estoque desconhecidos em zero real na interface: o card mostrava "R$ 0,00",
 * rotulava "Esgotado" (bloqueando o envio) e `buildMessage` escrevia
 * "Valor: R$ 0,00 / Em estoque: 0 un." na mensagem.
 *
 * O card é o componente REAL, alimentado com o produto que o favorito produz
 * de verdade (`favoriteToProduct`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CatalogProductCard } from '../CatalogProductCard';
import { favoriteToProduct, UNKNOWN_PRICE_LABEL } from '../catalogShared';
import { buildMessage } from '../sendProductUtils';
import type { CatalogFavorite, ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

// Radix (DropdownMenu) mede o trigger com ResizeObserver, API que o jsdom não
// implementa — mesmo polyfill dos testes de catálogo existentes.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

// O detalhe (lazy dentro do card) não é o alvo deste teste: só precisa abrir.
vi.mock('../ProductDetailDialog', () => ({
  ProductDetailDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="detail-dialog" /> : null),
}));

const favorito: CatalogFavorite = {
  id: 'f1',
  product_id: 'p1',
  product_name: 'Caneta Bambu',
  product_sku: 'CB-001',
  primary_image_url: null,
  created_at: '2026-10-01T12:00:00.000Z',
};

/** Exatamente o produto que a tela de favoritos monta hoje. */
const snapshot = favoriteToProduct(favorito);

const produtoReal = (o: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1', name: 'Caneta Bambu', description: null, short_description: null,
  sku: 'CB-001', sale_price: 12.5, suggested_price: null, stock_quantity: 100,
  primary_image_url: null, colors: null, brand: null, origin_country: null,
  min_quantity: null, dimensions_display: null, weight_g: null, combined_sizes: null,
  product_type: null, is_kit: false, is_active: true, is_stockout: false,
  allows_personalization: false, lead_time_days: null, supply_mode: null, category_id: null,
  supplier_id: null, slug: null, capacity_ml: null, ncm_code: null, categories: null,
  suppliers: null, variants: [],
  ...o,
});

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe('R2-MOD-048 — card do favorito não inventa preço nem estoque', () => {
  it('grade: preço desconhecido, sem "R$ 0,00", sem "Esgotado" e sem badge de estoque', () => {
    render(<CatalogProductCard product={snapshot} onSend={vi.fn()} onToggleFavorite={vi.fn()} />);

    // Sem a correção o card mostrava "R$ 0,00" e o rótulo "Esgotado".
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.queryByText('Esgotado')).not.toBeInTheDocument();
    expect(screen.queryByText('Em estoque')).not.toBeInTheDocument();
    expect(screen.getByText(UNKNOWN_PRICE_LABEL)).toBeInTheDocument();
  });

  it('lista: o mesmo tratamento na linha densa', () => {
    render(<CatalogProductCard product={snapshot} mode="list" onSend={vi.fn()} />);

    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.queryByText('Esgotado')).not.toBeInTheDocument();
    expect(screen.getByText(UNKNOWN_PRICE_LABEL)).toBeInTheDocument();
  });

  it('o envio do card continua liberado e entrega o produto do favorito', () => {
    const onSend = vi.fn();
    render(<CatalogProductCard product={snapshot} onSend={onSend} onToggleFavorite={vi.fn()} />);

    const botao = screen.getByRole('button', { name: 'Enviar' });
    expect(botao).toBeEnabled();
    fireEvent.click(botao);

    expect(onSend).toHaveBeenCalledWith(snapshot);
  });

  it('produto real (preço e estoque de verdade) segue mostrando os valores reais', () => {
    render(<CatalogProductCard product={produtoReal()} onSend={vi.fn()} />);

    expect(screen.getByText(/R\$[\s\u00a0]*12,50/)).toBeInTheDocument();
    expect(screen.queryByText(UNKNOWN_PRICE_LABEL)).not.toBeInTheDocument();
  });
});

describe('R2-MOD-048 — buildMessage não materializa os zeros do favorito', () => {
  it('nenhum modelo escreve "R$ 0,00", "0 un." ou "Em estoque" para a snapshot', () => {
    (['formal', 'informal', 'promo'] as const).forEach((template) => {
      const mensagem = buildMessage(snapshot, template);

      expect(mensagem).toContain('Caneta Bambu');
      expect(mensagem).not.toMatch(/R\$[\s\u00a0]*0,00/);
      expect(mensagem).not.toContain('un.');
      expect(mensagem).not.toContain('Em estoque');
    });
  });

  it('produto real mantém valor e estoque na mensagem (regressão)', () => {
    const mensagem = buildMessage(produtoReal(), 'formal');

    expect(mensagem).toMatch(/Valor: R\$[\s\u00a0]*12,50/);
    expect(mensagem).toContain('Em estoque: 100 un.');
  });
});
