/**
 * U1 — padrão único das ações do inbox que só apareciam no hover.
 *
 * Antes: 21 pontos escreviam `opacity-0 group-hover:opacity-100`. O `group-hover`
 * só dispara com ponteiro que tem hover: no celular/tablet (sem hover) a ação
 * ficava invisível, e no teclado o Tab até chegava ao botão, mas o foco não
 * acendia nada na tela (o usuário não via onde estava). Não havia `focus-within`
 * nem um caminho para `(hover: none)`.
 *
 * O padrão (mesmas classes em todos os 21 pontos, agora numa constante só):
 * - `opacity-0 group-hover:opacity-100` — o comportamento de antes, no mouse;
 * - `group-focus-within:opacity-100` — o Tab entra no grupo e a camada aparece
 *   (o botão passa a ser visível antes mesmo de receber o foco);
 * - `focus-visible:opacity-100` — o próprio alvo se acende quando recebe o foco
 *   por teclado;
 * - `[@media(hover:none)]:opacity-100` — em dispositivo sem hover (toque) a
 *   camada já nasce visível.
 *
 * `HOVER_REVEAL_TAP` acrescenta o alvo de toque mínimo de 40 px
 * (`min-h-10`/`min-w-10` = 2,5rem) e SÓ sob `(pointer: coarse)` — o mesmo
 * critério de `src/components/tasks/shared/pointerMedia.ts`: com mouse nada
 * muda de tamanho. Onde o ponto é um contêiner de ações, o mínimo vale para a
 * linha/barra (altura confortável de dedo); os botões internos dos grupos
 * compactos seguem no tamanho pequeno de propósito, para não roubar o toque do
 * vizinho (grade de 5 colunas do `CustomEmojiPicker`, fila de reações).
 *
 * Sem cor nova, sem sombra nova e sem animação nova: o `transition-opacity` que
 * já existia em cada ponto continua sendo o do elemento.
 */
export const HOVER_REVEAL =
  'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100';

/** O padrão acima + alvo de toque de 40 px em ponteiro grosso. */
export const HOVER_REVEAL_TAP =
  `${HOVER_REVEAL} [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:min-w-10`;
