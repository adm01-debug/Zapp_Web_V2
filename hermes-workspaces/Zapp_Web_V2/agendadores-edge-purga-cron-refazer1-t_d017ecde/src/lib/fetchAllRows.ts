/**
 * Percorre **todas** as páginas de uma consulta PostgREST.
 *
 * Por que existe: um `select()` sem `range` devolve só a primeira página (o teto de linhas
 * aplicado pelo PostgREST no projeto — achado A6/A11). Telas que chamam o array devolvido de
 * "total do período" então subcontam em silêncio. Aqui a leitura é paginada de forma estável
 * (a consulta precisa ordenar por uma chave única, ex.: `id`) e a incompletude é **explícita**:
 * quem consome sabe se o número é o total ou apenas o que deu para ler.
 */

export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export interface AllRowsResult<T> {
  rows: T[];
  /** `true` quando a leitura não cobriu tudo: erro no meio do caminho ou teto de páginas atingido. */
  incomplete: boolean;
  /** Presente só quando `incomplete` veio de uma falha de leitura. */
  error?: { message: string };
}

export interface FetchAllRowsOptions {
  /** Tamanho da página pedido ao PostgREST (default 1000). */
  pageSize?: number;
  /** Trava de segurança: acima disso a leitura para e é marcada incompleta (default 100). */
  maxPages?: number;
}

/**
 * Chama `fetchPage(from, to)` até a última página voltar menor que `pageSize`.
 * Nunca lança: erro de leitura vira `{ incomplete: true, error }` com as linhas já lidas.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { pageSize = 1000, maxPages = 100 }: FetchAllRowsOptions = {},
): Promise<AllRowsResult<T>> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { rows, incomplete: true, error };
    const lote = data ?? [];
    rows.push(...lote);
    if (lote.length < pageSize) return { rows, incomplete: false };
  }
  return { rows, incomplete: true };
}
