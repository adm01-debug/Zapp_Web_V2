import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'sonner';
import {
  CATALOG_EXPORT_BOM,
  CATALOG_EXPORT_COLUMNS,
  CATALOG_EXPORT_MAX_ROWS,
  CATALOG_EXPORT_PAGE_SIZE,
  PROMOGIFTS_BASE_URL,
  esc,
  buildCatalogCsv,
  catalogExportRow,
  catalogExportFilename,
  filterKeyToEdgeParams,
  promogiftsProductUrl,
  collectCatalogExportRows,
  exportCatalogCsv,
  triggerCsvDownload,
  defaultCatalogExportFetcher,
  type CatalogExportProduct,
} from '../catalogExport';

// CT-20 — o módulo fala com a edge real e com o sonner; nos testes os dois
// entram por injeção (fetchPage/download) ou por mock.
vi.mock('sonner', () => ({
  toast: { loading: vi.fn(() => 'toast-1'), success: vi.fn(), error: vi.fn() },
}));

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

const prod = (o: Partial<CatalogExportProduct> = {}): CatalogExportProduct => ({
  id: 'p1',
  name: 'Caneta Bambu',
  sku: 'CB-1',
  brand: 'Eco',
  sale_price: 3.9,
  suggested_price: 5,
  stock_quantity: 12,
  colors: ['Natural'],
  allows_personalization: true,
  lead_time_days: 5,
  min_quantity: 50,
  slug: 'caneta-bambu',
  categories: { name: 'Canetas' },
  suppliers: { name: 'Eco Brindes' },
  ...o,
});

describe('CT-20 — esc (escape CSV)', () => {
  it('deixa passar valor simples', () => {
    expect(esc('Caneta')).toBe('Caneta');
  });

  it('envolve em aspas quando ha virgula, aspas ou quebra de linha', () => {
    expect(esc('Caneta, azul')).toBe('"Caneta, azul"');
    expect(esc('Caneta "premium"')).toBe('"Caneta ""premium"""');
    expect(esc('linha1\nlinha2')).toBe('"linha1\nlinha2"');
    expect(esc('a\r\nb')).toBe('"a\r\nb"');
  });

  it('null/undefined viram vazio (nunca a string "null")', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc('')).toBe('');
  });

  it('converte numero e booleano', () => {
    expect(esc(3.9)).toBe('3.9');
    expect(esc(true)).toBe('true');
  });
});

describe('CT-20 — buildCatalogCsv', () => {
  it('comeca com BOM UTF-8 (o Excel pt-BR precisa dele para acentos)', () => {
    const csv = buildCatalogCsv([prod()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith(CATALOG_EXPORT_BOM)).toBe(true);
  });

  it('tem cabecalho do E29.3 e uma linha por produto', () => {
    const csv = buildCatalogCsv([prod(), prod({ id: 'p2', sku: 'CB-2' })]);
    const lines = csv.slice(1).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(CATALOG_EXPORT_COLUMNS.join(','));
    expect(lines[1]).toContain('Caneta Bambu');
    expect(lines[2]).toContain('CB-2');
  });

  it('preserva acentos e escapa os campos que precisam', () => {
    const csv = buildCatalogCsv([prod({ name: 'Caneca "Ação", 300ml' })]);
    // O acento atravessa intacto; o campo ambíguo (virgula + aspas) vai entre
    // aspas com as aspas internas duplicadas.
    expect(csv).toContain('Ação');
    expect(csv).toContain('"Caneca ""Ação"", 300ml"');
  });

  it('lista vazia gera so o cabecalho', () => {
    const csv = buildCatalogCsv([]);
    expect(csv).toBe(`${CATALOG_EXPORT_BOM}${CATALOG_EXPORT_COLUMNS.join(',')}`);
  });
});

describe('CT-20 — linha do produto (colunas do E29.3)', () => {
  it('monta as 13 colunas na ordem do plano', () => {
    const cells = catalogExportRow(prod()).split(',');
    expect(cells).toHaveLength(CATALOG_EXPORT_COLUMNS.length);
    expect(cells[0]).toBe('CB-1');
    expect(cells[1]).toBe('Caneta Bambu');
    expect(cells[2]).toBe('Eco');
    expect(cells[3]).toBe('Eco Brindes');
    expect(cells[4]).toBe('Canetas');
    expect(cells[5]).toBe('3.90');
    expect(cells[6]).toBe('5.00');
    expect(cells[7]).toBe('12');
    expect(cells[8]).toBe('Natural');
    expect(cells[9]).toBe('Sim');
    expect(cells[10]).toBe('5 dias');
    expect(cells[11]).toBe('50');
    expect(cells[12]).toBe(`${PROMOGIFTS_BASE_URL}/caneta-bambu`);
  });

  it('campos ausentes viram vazio e personalizacao vira Nao', () => {
    const line = catalogExportRow({
      id: 'p9',
      name: 'Sem dados',
      allows_personalization: false,
    });
    const cells = line.split(',');
    expect(cells[0]).toBe('');
    expect(cells[5]).toBe('');
    expect(cells[9]).toBe('Não');
    expect(cells[12]).toBe('');
  });

  it('varias cores e slug com espaco', () => {
    const cells = catalogExportRow(prod({ colors: ['Azul', 'Verde'], slug: 'copo 500ml' })).split(',');
    expect(cells[8]).toBe('Azul | Verde');
    expect(cells[12]).toBe(`${PROMOGIFTS_BASE_URL}/copo%20500ml`);
  });

  it('promogiftsProductUrl sem slug nao inventa link', () => {
    expect(promogiftsProductUrl(null)).toBe('');
    expect(promogiftsProductUrl('copos')).toBe(`${PROMOGIFTS_BASE_URL}/copos`);
  });
});

describe('CT-20 — nome do arquivo e filtros da edge', () => {
  it('usa catalogo_<filtro>_<yyyymmdd>.csv', () => {
    expect(catalogExportFilename('in_stock', new Date(2026, 9, 1))).toBe('catalogo_in_stock_20261001.csv');
  });

  it('sem filtro usa "todos"', () => {
    expect(catalogExportFilename(null, new Date(2026, 0, 5))).toBe('catalogo_todos_20260105.csv');
  });

  it('normaliza filtro com caractere estranho', () => {
    expect(catalogExportFilename('Novos & Destaques', new Date(2026, 11, 31))).toBe(
      'catalogo_novos_destaques_20261231.csv',
    );
  });

  it('traduz a chave do rail para os params da edge', () => {
    expect(filterKeyToEdgeParams('in_stock')).toEqual({ only_in_stock: true });
    expect(filterKeyToEdgeParams('featured')).toEqual({ is_featured: true });
    expect(filterKeyToEdgeParams('new_30d')).toEqual({ is_new: true });
    expect(filterKeyToEdgeParams('todos')).toEqual({});
    expect(filterKeyToEdgeParams(null)).toEqual({});
  });
});

describe('CT-20 — paginacao 100 em 100 ate 1.000', () => {
  const batch = (from: number, size: number) =>
    Array.from({ length: size }, (_, i) => prod({ id: `p${from + i}`, sku: `S${from + i}` }));

  it('usa o tamanho de pagina da edge (100)', () => {
    expect(CATALOG_EXPORT_PAGE_SIZE).toBe(100);
    expect(CATALOG_EXPORT_MAX_ROWS).toBe(1000);
  });

  it('pagina ate a pagina incompleta', async () => {
    const pages: CatalogExportProduct[][] = [batch(0, 100), batch(100, 100), batch(200, 20)];
    const calls: { offset: number; limit: number }[] = [];
    const fetchPage = vi.fn(async ({ offset, limit }: { offset: number; limit: number }) => {
      calls.push({ offset, limit });
      return { data: pages[offset / limit] ?? [] };
    });

    const rows = await collectCatalogExportRows(fetchPage);

    expect(rows).toHaveLength(220);
    expect(calls).toEqual([
      { offset: 0, limit: 100 },
      { offset: 100, limit: 100 },
      { offset: 200, limit: 100 },
    ]);
  });

  it('para no limite de 1.000 linhas', async () => {
    const fetchPage = vi.fn(async ({ offset }: { offset: number; limit: number }) => ({
      data: batch(offset, 100),
    }));

    const rows = await collectCatalogExportRows(fetchPage);

    expect(rows).toHaveLength(CATALOG_EXPORT_MAX_ROWS);
    expect(fetchPage).toHaveBeenCalledTimes(10);
  });

  it('descarta id repetido entre paginas (ordem por nome tem empate)', async () => {
    const fetchPage = vi.fn(async ({ offset }: { offset: number; limit: number }) => {
      if (offset === 0) return { data: [prod({ id: 'a' }), prod({ id: 'b' })] };
      if (offset === 2) return { data: [prod({ id: 'b' }), prod({ id: 'c' })] };
      return { data: [prod({ id: 'c' })] };
    });

    const rows = await collectCatalogExportRows(fetchPage, { pageSize: 2 });

    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('pagina vazia encerra a coleta', async () => {
    const fetchPage = vi.fn(async () => ({ data: [] as CatalogExportProduct[] }));
    await expect(collectCatalogExportRows(fetchPage)).resolves.toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('erro numa pagina rejeita (nao devolve parcial)', async () => {
    const fetchPage = vi.fn(async ({ offset }: { offset: number; limit: number }) => {
      if (offset === 0) return { data: batch(0, 100) };
      throw new Error('edge fora do ar');
    });

    await expect(collectCatalogExportRows(fetchPage)).rejects.toThrow('edge fora do ar');
  });
});

describe('CT-20 — exportCatalogCsv (toast loading -> success, sem parcial)', () => {
  const fullPage = (from: number, size: number) =>
    Array.from({ length: size }, (_, i) => prod({ id: `q${from + i}`, sku: `Q${from + i}` }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('baixa o CSV completo e troca o toast de loading por success', async () => {
    const fetchPage = vi.fn(async () => ({
      data: [prod(), prod({ id: 'p2', sku: 'CB-2', name: 'Squeeze Inox' })],
    }));
    const download = vi.fn();

    const result = await exportCatalogCsv({ filterKey: 'in_stock', date: new Date(2026, 9, 1), fetchPage, download });

    expect(result).toEqual({
      ok: true,
      rows: 2,
      filename: 'catalogo_in_stock_20261001.csv',
      downloaded: true,
    });
    expect(download).toHaveBeenCalledTimes(1);
    const [csv, filename] = download.mock.calls[0] as [string, string];
    expect(filename).toBe('catalogo_in_stock_20261001.csv');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\n')).toHaveLength(3);
    expect(toast.loading).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith(
      '2 produto(s) exportado(s) em catalogo_in_stock_20261001.csv',
      { id: 'toast-1' },
    );
  });

  it('erro de pagina aborta SEM baixar arquivo parcial', async () => {
    const fetchPage = vi.fn(async ({ offset }: { offset: number; limit: number }) => {
      // 1a pagina cheia (forca ir para a 2a), 2a pagina estoura.
      if (offset === 0) return { data: fullPage(0, 100) };
      throw new Error('timeout na edge');
    });
    const download = vi.fn();

    const result = await exportCatalogCsv({ filterKey: 'todos', fetchPage, download });

    expect(download).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.downloaded).toBe(false);
    expect(result.rows).toBe(0);
    expect(result.error).toBe('timeout na edge');
    expect(toast.error).toHaveBeenCalledWith('Exportação cancelada: timeout na edge', { id: 'toast-1' });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('filtro sem produto nao gera arquivo vazio', async () => {
    const download = vi.fn();
    const result = await exportCatalogCsv({ fetchPage: vi.fn(async () => ({ data: [] })), download });

    expect(download).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, rows: 0, downloaded: false, error: 'empty' });
    expect(toast.error).toHaveBeenCalledWith('Nenhum produto no filtro atual — nada para exportar.', { id: 'toast-1' });
  });

  it('sem filtro explicito exporta o catalogo inteiro com params vazios', async () => {
    const fetchPage = vi.fn(async () => ({ data: [prod()] }));
    const download = vi.fn();

    const result = await exportCatalogCsv({ filterKey: 'todos', date: new Date(2026, 9, 1), fetchPage, download });

    expect(result.filename).toBe('catalogo_todos_20261001.csv');
    expect(download).toHaveBeenCalledTimes(1);
  });
});

describe('CT-20 — fetcher de producao (edge promogifts-catalog)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('chama list_products com compact, offset e limit por pagina', async () => {
    invokeMock.mockResolvedValue({ data: { data: [prod()] }, error: null });

    const rows = await collectCatalogExportRows(
      defaultCatalogExportFetcher({ only_in_stock: true, is_featured: true }),
    );

    expect(rows).toHaveLength(1);
    expect(invokeMock).toHaveBeenCalledWith('promogifts-catalog', {
      body: {
        action: 'list_products',
        params: { only_in_stock: true, is_featured: true, compact: true, offset: 0, limit: 100 },
      },
    });
  });

  it('erro da edge vira excecao (nada de CSV pela metade)', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code' } });

    await expect(collectCatalogExportRows(defaultCatalogExportFetcher())).rejects.toThrow(
      'Edge Function returned a non-2xx status code',
    );
  });

  it('erro no corpo da resposta tambem rejeita', async () => {
    invokeMock.mockResolvedValue({ data: { error: 'Catalog database is temporarily unavailable' }, error: null });

    await expect(collectCatalogExportRows(defaultCatalogExportFetcher())).rejects.toThrow(
      'Catalog database is temporarily unavailable',
    );
  });
});

describe('CT-20 — download real (Blob + link)', () => {
  const createObjectURL = vi.fn((_blob: Blob | MediaSource) => 'blob:mock-url');
  const revokeObjectURL = vi.fn((_url: string) => undefined);


  beforeEach(() => {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    // jsdom nao navega: o click do <a download> so precisa existir.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('baixa um text/csv com o nome pedido e revoga a URL', async () => {
    triggerCsvDownload(`${CATALOG_EXPORT_BOM}A,B\n1,2`, 'catalogo_todos_20260101.csv');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8;');
    // O BOM tem de estar nos BYTES do arquivo (é o que o Excel lê): Blob.text()
    // remove o BOM ao decodificar, então a prova é no arrayBuffer.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)).toBe(`${CATALOG_EXPORT_BOM}A,B\n1,2`);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(document.querySelector('a[download="catalogo_todos_20260101.csv"]')).toBeNull();

  });
});
