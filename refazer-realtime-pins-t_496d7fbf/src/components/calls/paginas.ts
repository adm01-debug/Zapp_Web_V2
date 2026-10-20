/**
 * Janela de paginas do historico (T53).
 *
 * Fica fora do componente porque arquivo de componente so exporta componente
 * (react-refresh/only-export-components) - e uma funcao pura precisa ser testavel
 * sem renderizar nada.
 */
export const JANELA_PAGINAS = 7;

export const JANELA = 7;

/**
 * Janela de paginas do historico (T53).
 *
 * Mostra no maximo 7 botoes deslizando em volta da pagina atual, em vez de listar
 * todas as paginas: com 40 paginas uma lista inteira empurraria o layout e ficaria
 * impossivel de ler.
 */
export function janelaDePaginas(pagina: number, total: number, tamanho = JANELA): number[] {
  if (total <= tamanho) return Array.from({ length: total }, (_, i) => i + 1);
  const metade = Math.floor(tamanho / 2);
  let inicio = Math.max(1, pagina - metade);
  const fim = Math.min(total, inicio + tamanho - 1);
  inicio = Math.max(1, fim - tamanho + 1);
  return Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i);
}
