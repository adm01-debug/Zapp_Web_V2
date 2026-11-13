/**
 * A07a — botão de ação do cartão de arquivo (28 px) numa constante única.
 *
 * O tamanho VISÍVEL não muda (28 px, `w-7 h-7`) e no desktop (mouse) nada muda.
 * Só com ponteiro de TOQUE — `@media (pointer: coarse)`, o mesmo critério de
 * `src/components/tasks/shared/pointerMedia.ts` — o botão ganha uma área
 * clicável maior, por um pseudo-elemento invisível centrado em cima dele:
 *
 * - altura 44 px (`after:h-11`) — o alvo confortável de dedo (no cartão o corte
 *   do `overflow-hidden` come 1 px embaixo, na lista e na tabela sobram 44 px);
 * - largura 32 px (`after:w-8`) — 2 px para cada lado, porque o botão vizinho
 *   fica a 4 px (`gap-1`); esticar mais que isso roubaria o toque do vizinho.
 *
 * O layout não muda: `relative` no botão e `absolute` no pseudo-elemento, que
 * fica centralizado (`left-1/2 top-1/2 -translate-*`) e sem fundo. Sem cor nova
 * e sem efeito novo — o foco visível continua o mesmo.
 */
const AREA_DE_TOQUE =
  "[@media(pointer:coarse)]:after:content-[''] [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:left-1/2 [@media(pointer:coarse)]:after:top-1/2 [@media(pointer:coarse)]:after:h-11 [@media(pointer:coarse)]:after:w-8 [@media(pointer:coarse)]:after:-translate-x-1/2 [@media(pointer:coarse)]:after:-translate-y-1/2";

/** Os 5 usos da aba Arquivos (cartão, lista, tabela e o play do áudio). */
export const FILE_ACTION_BUTTON =
  'relative w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  AREA_DE_TOQUE;
