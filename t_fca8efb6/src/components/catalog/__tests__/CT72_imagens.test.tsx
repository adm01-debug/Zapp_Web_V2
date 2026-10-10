/**
 * CT-72 — imagens: `priority` nas 4 primeiras capas, `sizes` correto e
 * `content-visibility` nos cards fora da dobra.
 *
 * Cobre o fluxo real do dado: `ProductThumb` (o `<img>`) → `CatalogProductCard`
 * em grade (quem escolhe `sizes`/`priority`/classe de skip) → o gancho de CSS
 * `.catalog-card--offscreen`. A ligação "as 4 primeiras capas recebem
 * priority" é testada em ExternalProductCatalog.test.tsx, com o mock do card
 * expondo a prop.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ProductThumb } from '../catalogShared';
import { CatalogProductCard } from '../CatalogProductCard';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

// O card monta o ProductDetailDialog só no clique; mockado, o teste não precisa
// de auth/chat por trás do dialog.
vi.mock('../ProductDetailDialog', () => ({
  ProductDetailDialog: () => <div data-testid="detail-dialog" />,
}));

const CF_URL = 'https://imagedelivery.net/vKMs9Ow8bA_enuhLXZ2HAw/sm-po-13153-main/public';

const product = (overrides: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1', name: 'Açucareiro Bambu', sku: 'SM-13153', sale_price: 63.78, stock_quantity: 12,
  primary_image_url: CF_URL, colors: [], variants: [],
  ...overrides,
} as unknown as ExternalProduct);

describe('CT-72 — ProductThumb: loading/fetchpriority', () => {
  it('sem priority, a capa é lazy e não pede prioridade ao browser', () => {
    render(<ProductThumb src={CF_URL} alt="Capa normal" />);
    const img = screen.getByAltText('Capa normal') as HTMLImageElement;

    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('fetchpriority')).toBeNull();
  });

  it('com priority, a capa sai eager + fetchpriority=high', () => {
    render(<ProductThumb src={CF_URL} alt="Capa acima da dobra" priority />);
    const img = screen.getByAltText('Capa acima da dobra') as HTMLImageElement;

    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.getAttribute('fetchpriority')).toBe('high');
  });
});

describe('CT-72 — ProductThumb: sizes', () => {
  it('usa o default quando o caller não informa sizes', () => {
    render(<ProductThumb src={CF_URL} alt="Capa default" />);
    const img = screen.getByAltText('Capa default') as HTMLImageElement;

    expect(img.getAttribute('sizes')).toBe('(min-width: 1280px) 220px, (min-width: 768px) 33vw, 50vw');
  });

  it('o sizes do caller vence o default', () => {
    render(<ProductThumb src={CF_URL} alt="Capa 56px" sizes="56px" />);
    const img = screen.getByAltText('Capa 56px') as HTMLImageElement;

    expect(img.getAttribute('sizes')).toBe('56px');
  });

  it('sem srcSet (imagem fora do CF Images) não inventa sizes', () => {
    render(<ProductThumb src="https://example.com/foto.jpg" alt="Fora do CF" sizes="56px" />);
    const img = screen.getByAltText('Fora do CF') as HTMLImageElement;

    expect(img.getAttribute('sizes')).toBeNull();
  });
});

describe('CT-72 — CatalogProductCard em grade', () => {
  const gradeSizes = '(min-width: 1280px) 220px, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw';

  it('a capa da grade usa o sizes dos breakpoints reais da grade (2/3/4 colunas)', () => {
    render(<CatalogProductCard product={product()} mode="grade" />);
    const img = screen.getByAltText('Açucareiro Bambu') as HTMLImageElement;

    expect(img.getAttribute('sizes')).toBe(gradeSizes);
    expect(img.getAttribute('srcset')).toContain('w');
  });

  it('capa acima da dobra (priority) sai eager + fetchpriority=high', () => {
    render(<CatalogProductCard product={product()} mode="grade" priority />);
    const img = screen.getByAltText('Açucareiro Bambu') as HTMLImageElement;

    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.getAttribute('fetchpriority')).toBe('high');
  });

  it('card fora da dobra recebe a classe que pula layout/paint; o da dobra não', () => {
    const { container, unmount } = render(<CatalogProductCard product={product()} mode="grade" />);
    const card = container.querySelector('.catalog-card') as HTMLElement;
    expect(card.className).toContain('catalog-card--offscreen');
    unmount();

    const acima = render(<CatalogProductCard product={product()} mode="grade" priority />);
    const cardAcima = acima.container.querySelector('.catalog-card') as HTMLElement;
    expect(cardAcima.className).not.toContain('catalog-card--offscreen');
    acima.unmount();
  });
});

describe('CT-72 — CSS dos cards abaixo da dobra', () => {
  const css = readFileSync(path.resolve(__dirname, '../../../styles/components.css'), 'utf8');

  it('.catalog-card--offscreen aplica content-visibility: auto com contain-intrinsic-size', () => {
    const bloco = css.match(/\.catalog-card--offscreen\s*\{[^}]*\}/)?.[0] ?? '';

    expect(bloco).toContain('content-visibility: auto');
    // o keyword `auto` faz o placeholder usar a altura real já medida no 1º
    // render — sem ele, o palpite fixo viraria CLS em toda visita.
    expect(bloco).toMatch(/contain-intrinsic-size:\s*auto\s+\d+px/);
  });

  it('segue o padrão já existente no repo (.content-auto)', () => {
    const a11y = readFileSync(path.resolve(__dirname, '../../../styles/accessibility.css'), 'utf8');
    expect(a11y).toContain('.content-auto { content-visibility: auto; contain-intrinsic-size: auto');
  });
});
