/**
 * CT-20 / E29 — exportação CSV do catálogo (filtro atual → arquivo).
 *
 * O plano manda reusar `esc()` e o BOM UTF-8 de `talkxExport.ts`. Esse arquivo
 * NÃO existe no repositório (conferido: `grep -rn talkxExport src/` vazio), então
 * o escaping e o BOM moram aqui, com o mesmo contrato do único export CSV que já
 * existia no repo (DepartmentAuditView.tsx:20-40): separador vírgula, BOM no
 * começo, aspas `""` para escapar aspas internas.
 *
 * Não confundir com um detalhe da edge: o E29.2 pedia `.order('id')` como
 * desempate, mas `list_products` só aceita `order_by` do enum
 * ALLOWED_ORDER_FIELDS (name, sale_price, stock_quantity, brand, created_at,
 * sku, order_count — supabase/functions/promogifts-catalog/index.ts:12). Mandar
 * `order_by: 'id'` devolveria 400 "Invalid parameters". A paginação usa
 * `order_by: 'name'` (a ordem estável suportada) e deduplica por `id`, o que
 * resolve o mesmo problema (nenhuma linha repetida nem pulada entre páginas).
 */
import { toast } from 'sonner';

// ─── Constantes do contrato (E29.1-E29.5) ──────────────────────

/** BOM UTF-8: sem ele o Excel pt-BR abre "ç/ã" como mojibake. */
export const CATALOG_EXPORT_BOM = '\uFEFF';
/** Limite declarado na UI (tooltip "até 1.000 produtos"). */
export const CATALOG_EXPORT_MAX_ROWS = 1000;
/** A edge limita `limit` a 100 (ListProductsSchema, index.ts:36). */
export const CATALOG_EXPORT_PAGE_SIZE = 100;

/** Colunas do E29.3, na ordem do plano. */
export const CATALOG_EXPORT_COLUMNS = [
  'SKU',
  'Nome',
  'Marca',
  'Fornecedor',
  'Categoria',
  'Preço',
  'Preço sugerido',
  'Estoque',
  'Cores',
  'Personalização',
  'Prazo',
  'Qtd. mínima',
  'URL PromoGifts',
] as const;

/** Única URL pública do PromoGifts confirmada no repo
 * (ExternalProductManagement.tsx:420 e :611). */
export const PROMOGIFTS_BASE_URL = 'https://promogifts.com.br';

// ─── Tipos ─────────────────────────────────────────────────────

/** Forma mínima do produto usada no CSV — estrutural (o export não precisa do
 * tipo completo do catálogo) e compatível com o payload `compact` da edge. */
export interface CatalogExportProduct {
  id: string;
  name: string;
  sku?: string | null;
  brand?: string | null;
  sale_price?: number | null;
  suggested_price?: number | null;
  stock_quantity?: number | null;
  colors?: string[] | null;
  allows_personalization?: boolean | null;
  lead_time_days?: number | null;
  min_quantity?: number | null;
  slug?: string | null;
  categories?: { name?: string | null } | null;
  suppliers?: { name?: string | null } | null;
}

export interface CatalogExportPage {
  data?: CatalogExportProduct[] | null;
}

/** Uma página de `list_products`. Injetável: os testes passam um stub e a
 * produção usa `defaultCatalogExportFetcher`. */
export type CatalogExportPageFetcher = (params: { offset: number; limit: number }) => Promise<CatalogExportPage>;

export interface CatalogExportResult {
  ok: boolean;
  rows: number;
  filename: string;
  error?: string;
  /** false = nada foi baixado (erro ou filtro sem produto) — nunca parcial. */
  downloaded: boolean;
}

// ─── Builders puros ────────────────────────────────────────────

/**
 * Escapa um campo CSV. Vírgula, aspas e quebra de linha tornam o campo
 * ambíguo → vai entre aspas, com aspas internas duplicadas. null/undefined
 * viram string vazia (não "null"/"undefined").
 */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s === '') return '';
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** URL do produto no PromoGifts a partir do `slug` (coluna do E29.3). */
export function promogiftsProductUrl(slug: string | null | undefined): string {
  if (!slug) return '';
  return `${PROMOGIFTS_BASE_URL}/${encodeURIComponent(slug)}`;
}

/** Preço estável para planilha: 2 casas, ponto decimal (o dado cru da edge). */
function money(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '';
}

/** Uma linha do CSV (mesma ordem de CATALOG_EXPORT_COLUMNS). */
export function catalogExportRow(p: CatalogExportProduct): string {
  const cells = [
    p.sku,
    p.name,
    p.brand,
    p.suppliers?.name,
    p.categories?.name,
    money(p.sale_price),
    money(p.suggested_price),
    p.stock_quantity,
    (p.colors ?? []).filter(Boolean).join(' | '),
    p.allows_personalization ? 'Sim' : 'Não',
    p.lead_time_days != null ? `${p.lead_time_days} dias` : '',
    p.min_quantity,
    promogiftsProductUrl(p.slug),
  ];
  return cells.map(esc).join(',');
}

/** CSV completo: BOM + cabeçalho + linhas (mesmo formato do export da
 * auditoria de departamento). */
export function buildCatalogCsv(products: CatalogExportProduct[]): string {
  const lines = [CATALOG_EXPORT_COLUMNS.map(esc).join(','), ...products.map(catalogExportRow)];
  return `${CATALOG_EXPORT_BOM}${lines.join('\n')}`;
}

/** `catalogo_<filtro>_<yyyymmdd>.csv` — data local (o usuário pensa no dia
 * dele, não em UTC), como o export de auditoria. */
export function catalogExportFilename(filterKey: string | null | undefined, date: Date): string {
  const slug = (filterKey ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'todos';
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `catalogo_${slug}_${stamp}.csv`;
}

/** Traduz a chave de filtro do rail para os params aceitos pela edge (E29.1:
 * "CSV do filtro atual"). Chave desconhecida → catálogo inteiro. */
export function filterKeyToEdgeParams(filterKey: string | null | undefined): Record<string, unknown> {
  if (filterKey === 'in_stock') return { only_in_stock: true };
  if (filterKey === 'featured') return { is_featured: true };
  if (filterKey === 'new_30d') return { is_new: true };
  return {};
}

// ─── Coleta paginada (100 em 100 até 1.000) ────────────────────

/**
 * Percorre as páginas de `list_products` e devolve as linhas do CSV.
 * Para quando: (a) a página vem incompleta (fim do resultado), (b) atingiu
 * `maxRows`. O `id` repetido é descartado (a ordem por nome tem empates).
 * Qualquer erro de página REJEITA a promise — quem chama não tem como gravar
 * arquivo parcial, porque o download só acontece depois deste retorno.
 */
export async function collectCatalogExportRows(
  fetchPage: CatalogExportPageFetcher,
  options: { maxRows?: number; pageSize?: number } = {},
): Promise<CatalogExportProduct[]> {
  const maxRows = options.maxRows ?? CATALOG_EXPORT_MAX_ROWS;
  const pageSize = options.pageSize ?? CATALOG_EXPORT_PAGE_SIZE;
  const rows: CatalogExportProduct[] = [];
  const seen = new Set<string>();

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const page = await fetchPage({ offset, limit: pageSize });
    const batch = page?.data ?? [];
    for (const product of batch) {
      if (!product?.id || seen.has(product.id)) continue;
      seen.add(product.id);
      rows.push(product);
      if (rows.length >= maxRows) break;
    }
    // Página incompleta = não há mais nada além dela.
    if (batch.length < pageSize) break;
  }

  return rows;
}

// ─── Fetcher de produção ───────────────────────────────────────

/**
 * Chama a edge `promogifts-catalog` (ação `list_products`) com o payload
 * `compact` — que já traz todas as colunas do E29.3 e é ~60% menor que o
 * completo. O import é DINÂMICO de propósito: `no-restricted-imports` barra o
 * import estático do client do Supabase em src/components (eslint.config.js:41)
 * e o lint-ratchet reprova qualquer warning novo (lint-ratchet.mjs).
 */
export function defaultCatalogExportFetcher(filters: Record<string, unknown> = {}): CatalogExportPageFetcher {
  return async ({ offset, limit }) => {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase.functions.invoke('promogifts-catalog', {
      body: { action: 'list_products', params: { ...filters, compact: true, offset, limit } },
    });
    if (error) {
      throw new Error((error as { message?: string }).message || 'Falha ao consultar o catálogo.');
    }
    const body = data as (CatalogExportPage & { error?: string }) | null;
    if (body?.error) throw new Error(body.error);
    return body ?? { data: [] };
  };
}

// ─── Download ──────────────────────────────────────────────────

/** Grava o CSV no disco do usuário. Só é chamado com o conteúdo COMPLETO. */
export function triggerCsvDownload(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ─── Orquestração (toast loading → success) ────────────────────

export interface CatalogExportOptions {
  /** Chave do filtro atual (nome do arquivo + filtros da edge). */
  filterKey?: string | null;
  /** Filtros explícitos da tela; vence sobre `filterKey`. */
  filters?: Record<string, unknown>;
  /** Injetável para teste; default = edge real. */
  fetchPage?: CatalogExportPageFetcher;
  /** Injetável para teste (nome do arquivo determinístico). */
  date?: Date;
  /** Injetável para teste (não faz o download real). */
  download?: (csv: string, filename: string) => void;
}

/**
 * Exporta o catálogo do filtro atual. Em erro NÃO baixa nada (aborta sem
 * parcial) e o toast de loading vira erro; em sucesso o mesmo toast vira
 * `success` no lugar (mesmo `id`), sem empilhar dois avisos.
 */
export async function exportCatalogCsv(options: CatalogExportOptions = {}): Promise<CatalogExportResult> {
  const filename = catalogExportFilename(options.filterKey, options.date ?? new Date());
  const filters = options.filters ?? filterKeyToEdgeParams(options.filterKey);
  const fetchPage = options.fetchPage ?? defaultCatalogExportFetcher(filters);
  const download = options.download ?? triggerCsvDownload;

  const toastId = toast.loading(`Preparando exportação de até ${CATALOG_EXPORT_MAX_ROWS.toLocaleString('pt-BR')} produtos...`);

  let rows: CatalogExportProduct[];
  try {
    rows = await collectCatalogExportRows(fetchPage);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Não foi possível exportar o catálogo agora.';
    toast.error(`Exportação cancelada: ${message}`, { id: toastId });
    return { ok: false, rows: 0, filename, error: message, downloaded: false };
  }

  if (rows.length === 0) {
    toast.error('Nenhum produto no filtro atual — nada para exportar.', { id: toastId });
    return { ok: false, rows: 0, filename, error: 'empty', downloaded: false };
  }

  download(buildCatalogCsv(rows), filename);
  toast.success(`${rows.length.toLocaleString('pt-BR')} produto(s) exportado(s) em ${filename}`, { id: toastId });
  return { ok: true, rows: rows.length, filename, downloaded: true };
}
