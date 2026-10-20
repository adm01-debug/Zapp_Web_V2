// Exact function extracted read-only from baseline. Native Node TS stripping; no application imports.
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

