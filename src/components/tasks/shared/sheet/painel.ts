/**
 * Etapas 145–146 do painel "Detalhes da tarefa": as duas decisões que valem
 * função pura — quando o painel deixa de ser modal e qual é a largura dele.
 *
 * Mora em `sheet/` pelo mesmo motivo da `PainelRodape`/`PlanejamentoSection`:
 * o `WorkItemSheet.tsx` está no teto de linhas do CI e não pode crescer.
 *
 * D14 (imagem 03): a partir de `md` (768px) o painel é um painel de DETALHES
 * não modal — sem overlay, com o Quadro visível e clicável (é assim que se
 * troca de tarefa: clicar em outro cartão troca o item do painel). Abaixo de
 * `md` continua o bottom sheet modal, como o celular pede (etapa 23/81).
 *
 * D11: a preferência de exibição (expandido ou não) é do usuário e do
 * NAVEGADOR, não do registro — vai para o `localStorage` do dispositivo, ao
 * lado do `tasks-mode` do módulo.
 */

/** Mesma chave de forma do `tasks-mode` (TasksModule): minúsculas e hífen. */
export const CHAVE_PAINEL_EXPANDIDO = 'tasks-painel-expandido';

/** Valor gravado quando o painel está expandido. */
const VALOR_EXPANDIDO = '1';

/**
 * Etapa 145: o painel NÃO é modal de `md` para cima. `narrow` é a MESMA
 * resposta de `useNarrowViewport()` (max-width: 767px) que já decide o lado do
 * Sheet — uma fonte só evita que a armadilha de foco e o corte divirjam.
 */
export function painelNaoModal(narrow: boolean): boolean {
  return !narrow;
}

/**
 * Etapa 146: expandido ≈ 70% da largura da janela (descrição ampla); recolhido
 * mantém os 420px do painel. O `sm:max-w-*` repete o valor porque a variante do
 * SheetContent traz `sm:max-w-sm` (384px) — sem o override o painel ficaria
 * preso em 384px e a largura pedida nunca apareceria.
 */
export function classeDeLargura(expandido: boolean): string {
  return expandido
    ? 'w-[70vw] sm:max-w-[70vw]'
    : 'w-[420px] sm:max-w-[420px]';
}

/** Lê a preferência gravada; qualquer erro (modo privado, storage cheio) = recolhido. */
export function lerExpandidoArmazenado(): boolean {
  try {
    return typeof localStorage !== 'undefined'
      && localStorage.getItem(CHAVE_PAINEL_EXPANDIDO) === VALOR_EXPANDIDO;
  } catch {
    return false;
  }
}

/** Grava a preferência. Falha em silêncio: é conforto de exibição, não dado. */
export function gravarExpandidoArmazenado(expandido: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (expandido) localStorage.setItem(CHAVE_PAINEL_EXPANDIDO, VALOR_EXPANDIDO);
    else localStorage.removeItem(CHAVE_PAINEL_EXPANDIDO);
  } catch {
    /* sem storage: a escolha vale só nesta sessão. */
  }
}
