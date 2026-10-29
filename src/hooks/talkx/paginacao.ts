/**
 * Talk X — leitura COMPLETA de uma lista do PostgREST (HZ2-012/HZ2-013).
 *
 * O PostgREST corta a resposta no teto de linhas do projeto (1000) e não avisa:
 * uma consulta sem `.range()` mostra um recorte silencioso — 1500 supressões (ou
 * 1500 destinatários de uma campanha) viram 1000 linhas na tela, sem nenhum
 * indicador de que há mais. Este laço pede fatias até a última vir incompleta.
 *
 * A ORDEM precisa ser determinística e com desempate (`created_at` + `id`): a
 * fatia é calculada sobre a lista ordenada, então duas linhas com o mesmo
 * `created_at` sem desempate podem ficar de fora ou se repetir entre fatias.
 * Quem chama monta a ordem, junto dos filtros.
 *
 * `buildPage(from, to)` monta a consulta a CADA chamada — o builder do supabase
 * não aceita reescrever o `range` da mesma cadeia de forma confiável.
 */

/** Teto de linhas do projeto (o mesmo que o PostgREST aplica por resposta). */
export const TALKX_PAGE_SIZE = 1000;

export async function fetchAllTalkXPages<T>(
  buildPage: (from: number, to: number) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += TALKX_PAGE_SIZE) {
    const { data, error } = await buildPage(from, from + TALKX_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    rows.push(...page);
    // Fatia incompleta = fim da lista; cheia = pode haver mais.
    if (page.length < TALKX_PAGE_SIZE) return rows;
  }
}
