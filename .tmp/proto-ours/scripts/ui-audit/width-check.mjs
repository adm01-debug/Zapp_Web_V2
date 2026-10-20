/**
 * width-check.mjs — predicado puro do teste de regressão de largura
 * (LT-LAYOUT-03 / P017 etapa 28).
 *
 * Por que existe: o script original só comparava `document.documentElement.scrollWidth`
 * com `window.innerWidth` (overflow) a 1280x800. Ele NÃO comparava
 * `main.clientWidth - content.clientWidth`, então uma view que deixasse o conteúdo
 * mais estreito que o main (faixa morta) passava sem preencher, desde que não houvesse
 * overflow. O aceite do plano é: falha se `main.clientWidth - content.clientWidth > 1`.
 *
 * O predicado é puro para poder ser provado sem navegador (ver
 * scripts/ci/width-regression.unit.mjs); o script apenas coleta as medições no DOM
 * e as entrega aqui.
 */

// Aceite do plano: diferença de largura tolerada é 1px (subpixel/arredondamento).
export const TOLERANCIA_PX = 1;

/**
 * Avalia as medições de largura de uma view.
 *
 * @param {object} m
 * @param {number} m.innerWidth     window.innerWidth
 * @param {number} m.docScrollWidth document.documentElement.scrollWidth
 * @param {number|null} m.mainWidth largura do `main` (null se ausente)
 * @param {number|null} m.contentWidth largura do conteúdo dentro do `main` (null se ausente)
 * @param {number} [toleranciaPx]
 * @returns {{ok:boolean, overflow:boolean, faixaMorta:boolean, diferenca:number|null, ocupacao:number|null}}
 */
export function avaliarLargura(m, toleranciaPx = TOLERANCIA_PX) {
  const overflow = m.docScrollWidth > m.innerWidth + 1;

  const temMain = Number.isFinite(m.mainWidth) && m.mainWidth > 0;
  const temConteudo = Number.isFinite(m.contentWidth);
  // Faixa morta: o conteúdo não ocupa o main (defeito que o predicado antigo deixava passar).
  const diferenca = temMain && temConteudo ? m.mainWidth - m.contentWidth : null;
  const faixaMorta = diferenca !== null && diferenca > toleranciaPx;
  const ocupacao = temMain && temConteudo ? m.contentWidth / m.mainWidth : null;

  return {
    ok: !overflow && !faixaMorta,
    overflow,
    faixaMorta,
    diferenca,
    ocupacao,
  };
}
