import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExternalProduct, ExternalProductVariant } from '@/hooks/integrations/useExternalCatalog';
import { groupVariantsByColor, buildMessage, collectAllImages, downloadImageAsBlob } from '../sendProductUtils';

const mockVariant = (overrides: Partial<ExternalProductVariant> = {}): ExternalProductVariant => ({
  id: 'v1',
  product_id: 'p1',
  sku: 'PO-13153-BAMBU',
  name: 'Bambu',
  attributes: null,
  stock_quantity: 1573,
  color_name: 'Bambu',
  color_hex: '#c9a06a',
  size_code: null,
  capacity_ml: null,
  selected_thumbnail: 'https://example.com/bambu.jpg',
  is_active: true,
  ...overrides,
});

const mockProduct = (overrides: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1',
  name: 'Açucareiro com formato de coração e colher em bambu',
  description: 'Açucareiro com formato de coração e colher em Bambu.',
  short_description: 'Açucareiro em bambu',
  sku: 'PO-13153',
  sale_price: 63.78,
  suggested_price: 43.67,
  stock_quantity: 1573,
  primary_image_url: 'https://example.com/main.jpg',
  colors: ['BAMBU'],
  brand: 'Só Marcas',
  origin_country: 'China',
  min_quantity: 1,
  dimensions_display: '11x10,2x4,5',
  weight_g: 210,
  combined_sizes: null,
  product_type: 'product',
  is_kit: false,
  is_active: true,
  is_stockout: false,
  allows_personalization: true,
  lead_time_days: 5,
  supply_mode: 'pronta_entrega_liso',
  category_id: 'cat1',
  supplier_id: 'sup1',
  slug: 'acucareiro-po-13153',
  capacity_ml: null,
  ncm_code: '44191900',
  categories: { id: 'cat1', name: 'Talheres', slug: 'talheres', parent_id: null },
  suppliers: { id: 'sup1', name: 'Só Marcas' },
  ...overrides,
});

describe('groupVariantsByColor', () => {
  it('agrupa variantes pela cor e coleta thumbs sem duplicar', () => {
    const groups = groupVariantsByColor([
      mockVariant({ id: 'v1', color_name: 'Bambu', selected_thumbnail: 'a.jpg' }),
      mockVariant({ id: 'v2', color_name: 'Bambu', selected_thumbnail: 'a.jpg' }), // mesma thumb
      mockVariant({ id: 'v3', color_name: 'Preto', color_hex: '#000', selected_thumbnail: 'b.jpg' }),
    ]);
    expect(groups).toHaveLength(2);
    const bambu = groups.find((g) => g.colorName === 'Bambu')!;
    expect(bambu.variants).toHaveLength(2);
    expect(bambu.images).toEqual(['a.jpg']);
    const preto = groups.find((g) => g.colorName === 'Preto')!;
    expect(preto.colorHex).toBe('#000');
  });

  it('usa "Padrão" quando não há cor nem nome', () => {
    const groups = groupVariantsByColor([mockVariant({ color_name: null, name: '' })]);
    expect(groups[0].colorName).toBe('Padrão');
  });

  it('lista vazia retorna array vazio', () => {
    expect(groupVariantsByColor([])).toEqual([]);
  });
});

describe('collectAllImages', () => {
  it('inclui a imagem principal com label "Principal"', () => {
    const imgs = collectAllImages(mockProduct());
    expect(imgs[0]).toEqual({ url: 'https://example.com/main.jpg', label: 'Principal' });
  });

  it('acrescenta thumbs de variantes sem duplicar a principal', () => {
    const p = mockProduct({
      variants: [
        mockVariant({ selected_thumbnail: 'https://example.com/main.jpg' }), // igual à principal
        mockVariant({ id: 'v2', color_name: 'Preto', selected_thumbnail: 'https://example.com/preto.jpg' }),
      ],
    });
    const imgs = collectAllImages(p);
    expect(imgs).toHaveLength(2);
    expect(imgs[1]).toEqual({ url: 'https://example.com/preto.jpg', label: 'Preto' });
  });

  it('produto sem imagem principal nem variantes retorna vazio', () => {
    expect(collectAllImages(mockProduct({ primary_image_url: null }))).toEqual([]);
  });
});

describe('buildMessage', () => {
  it('formal: inclui marca, preço, qtd mínima, dimensões, personalização e prazo', () => {
    const msg = buildMessage(mockProduct(), 'formal');
    expect(msg).toContain('Só Marcas');
    expect(msg).toContain('R$');
    expect(msg).toContain('Quantidade mínima: 1 unidades');
    expect(msg).toContain('11x10,2x4,5');
    expect(msg).toContain('Permite personalização.');
    expect(msg).toContain('5 dias úteis');
    expect(msg).toContain('Em estoque: 1573 un.');
  });

  it('informal: usa saudação e emoji, corta descrição em 200 chars', () => {
    const longDesc = 'x'.repeat(500);
    const msg = buildMessage(mockProduct({ short_description: null, description: longDesc }), 'informal');
    expect(msg).toContain('Olá! 😊');
    expect(msg).toContain('x'.repeat(200));
    expect(msg).not.toContain('x'.repeat(201));
  });

  it('promo: usa emojis e chamada de urgência', () => {
    const msg = buildMessage(mockProduct(), 'promo');
    expect(msg).toContain('OFERTA ESPECIAL');
    expect(msg).toContain('Estoque limitado');
  });

  it('produto esgotado: mostra aviso de sem estoque em vez da contagem', () => {
    const msg = buildMessage(mockProduct({ is_stockout: true }), 'formal');
    expect(msg).toContain('Sem estoque no momento');
    expect(msg).not.toContain('Em estoque:');
  });

  it('com variante selecionada: mostra a cor da variante em vez da lista de cores do produto', () => {
    const group = groupVariantsByColor([mockVariant({ color_name: 'Bambu', stock_quantity: 42 })])[0];
    const msg = buildMessage(mockProduct(), 'formal', group);
    expect(msg).toContain('Cor: Bambu');
    expect(msg).toContain('Estoque: 42 un.');
    expect(msg).not.toContain('Cores disponíveis:');
  });

  it('sem marca/qtd mínima/dimensões: não deixa linhas vazias soltas', () => {
    const msg = buildMessage(
      mockProduct({ brand: null, min_quantity: null, dimensions_display: null, allows_personalization: false, lead_time_days: null }),
      'formal'
    );
    expect(msg).not.toContain('Marca:');
    expect(msg).not.toContain('Quantidade mínima');
    expect(msg).not.toContain('undefined');
  });
});

describe('buildMessage — CT-45 (personalização {{nome}}/{{empresa}})', () => {
  it('sem contato usa o fallback "Olá!" e não deixa placeholder nem contato de exemplo', () => {
    const msg = buildMessage(mockProduct(), 'informal');
    expect(msg).toContain('Olá! 😊');
    expect(msg).not.toContain('{{');
    // O contato de exemplo do personalizePreview ("João Silva"/"Sua Empresa")
    // não pode vazar quando não há contato selecionado.
    expect(msg).not.toContain('João Silva');
    expect(msg).not.toContain('Sua Empresa');
  });

  it('com contato resolve {{nome}} pelo primeiro nome', () => {
    const msg = buildMessage(mockProduct(), 'informal', null, { name: 'Ana Paula Souza' });
    expect(msg).toContain('Olá, Ana! 😊');
    expect(msg).not.toContain('{{');
  });

  it('resolve {{empresa}} e não emite a linha vazia quando o contato não tem empresa', () => {
    const comEmpresa = buildMessage(mockProduct(), 'formal', null, { name: 'Ana', company: 'ACME Ltda' });
    expect(comEmpresa).toContain('Olá, Ana!');
    expect(comEmpresa).toContain('Empresa: ACME Ltda');
    expect(comEmpresa).not.toContain('{{');

    const semEmpresa = buildMessage(mockProduct(), 'formal', null, { name: 'Ana', company: null });
    expect(semEmpresa).toContain('Olá, Ana!');
    expect(semEmpresa).not.toContain('Empresa:');
  });

  it('mantém o template formal com a mesma informação comercial (sem regressão)', () => {
    const msg = buildMessage(mockProduct(), 'formal', null, { name: 'Ana', company: 'ACME' });
    expect(msg).toContain('Só Marcas');
    expect(msg).toContain('R$');
    expect(msg).toContain('Em estoque: 1573 un.');
  });
});

describe('downloadImageAsBlob — CT-39 (download real, sem zip)', () => {
  const createObjectURL = vi.fn((_blob: Blob | MediaSource) => 'blob:mock');
  const revokeObjectURL = vi.fn((_url: string) => undefined);
  let clicked: { href: string | null; download: string | null } | null;

  beforeEach(() => {
    clicked = null;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = { href: this.getAttribute('href'), download: this.getAttribute('download') };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('busca a imagem, baixa por object URL e revoga a URL', async () => {
    const blob = new Blob(['img'], { type: 'image/jpeg' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal('fetch', fetchMock);

    await expect(downloadImageAsBlob('https://x/a.jpg', 'produto_1.jpg')).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith('https://x/a.jpg', { mode: 'cors' });
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).not.toBeNull();
    expect(clicked!.download).toBe('produto_1.jpg');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');

    // O arquivo é buscado por fetch: o `download` de um <a> cross-origin é
    // ignorado pelo browser e o "download" seria falso sem o Blob.
    expect(clicked!.href).toBe('blob:mock');
  });

  it('sem CORS/resposta ok devolve false sem disparar click', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

    await expect(downloadImageAsBlob('https://x/a.jpg', 'produto_1.jpg')).resolves.toBe(false);

    expect(clicked).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
