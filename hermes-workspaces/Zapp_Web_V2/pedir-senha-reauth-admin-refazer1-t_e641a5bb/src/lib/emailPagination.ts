export async function collectEmailPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 1000,
  maxPages = 50,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const chunk = await fetchPage(from, from + pageSize - 1);
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }
  throw new Error(`A consulta de email excedeu o limite seguro de ${pageSize * maxPages} registros.`);
}

export function chunkEmailIds(ids: string[], chunkSize = 500): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += chunkSize) chunks.push(ids.slice(index, index + chunkSize));
  return chunks;
}
