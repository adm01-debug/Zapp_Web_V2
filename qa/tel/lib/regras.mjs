/**
 * Núcleo puro dos scripts de QA da Telefonia (E.2/E.3/E.5).
 *
 * Sem browser e sem disco: recebe o que foi MEDIDO e decide OK/FALHA. Mora
 * separado porque é a parte que se prova por tabela — os quatro scripts
 * (`measure.mjs`, `colors.mjs`, `func.mjs`, `axe.mjs`) são a casca que coleta.
 *
 * Nada aqui CRIA cor: as funções só convertem o que a página já pinta, para
 * poder comparar com o token que ela própria declara.
 */

/** |valor - alvo| <= tolerancia. Não-finito nunca passa. */
export function dentroDaTolerancia(valor, alvo, tolerancia) {
  if (![valor, alvo, tolerancia].every(Number.isFinite)) return false;
  return Math.abs(valor - alvo) <= tolerancia;
}

/**
 * Um eixo medido com alvo numérico.
 *
 * `medir` é o único lugar que decide "igual/mínimo/máximo"; um valor que não foi
 * medido (NaN/undefined) vira REPROVAÇÃO com motivo, nunca um OK silencioso por
 * falta de dado — foi assim que nasceu o "teste que não prova" que o revisor
 * recusou em 06/10.
 */
export function medir(eixo, valor, alvo, tolerancia, detalhe = {}, sentido = 'igual') {
  if (detalhe.skip === true) {
    return { eixo, valor: null, alvo, tolerancia, sentido, ok: true, motivo: detalhe.motivo ?? 'não aplicável', ...detalhe };
  }
  if (!Number.isFinite(valor)) {
    return { eixo, valor: null, alvo, tolerancia, sentido, ok: false, motivo: 'não medido', ...detalhe };
  }
  if (!Number.isFinite(alvo)) {
    return { eixo, valor, alvo: null, tolerancia, sentido, ok: false, motivo: 'alvo inválido', ...detalhe };
  }
  let ok;
  let motivo;
  if (sentido === 'min') {
    ok = valor >= alvo;
    motivo = `${valor} < mínimo ${alvo}`;
  } else if (sentido === 'max') {
    ok = valor <= alvo;
    motivo = `${valor} > máximo ${alvo}`;
  } else {
    ok = dentroDaTolerancia(valor, alvo, tolerancia);
    motivo = `|${valor} - ${alvo}| > ${tolerancia}`;
  }
  return { eixo, valor, alvo, tolerancia, sentido, ok, ...(ok ? {} : { motivo }), ...detalhe };
}

/** Checagem de existência (sem número de referência). */
export function estrutural(eixo, presente, detalhe = {}) {
  const ok = presente === true;
  return { eixo, valor: ok ? 1 : 0, ok, ...(ok ? {} : { motivo: 'ausente' }), ...detalhe };
}

/**
 * Fecha o relatório de um script.
 * Formato do aceite E.5: `{ ok, fail, consoleErrors }` — `ok` é a CONTAGEM dos
 * eixos aprovados, `fail` a lista dos reprovados (vazia = tudo verde).
 */
export function resumo(etapa, checks, consoleErrors = []) {
  const falhas = checks.filter((c) => !c.ok).map((c) => c.eixo);
  return {
    etapa,
    ok: checks.length - falhas.length,
    total: checks.length,
    fail: falhas,
    consoleErrors: consoleErrors.length,
    checks,
  };
}

// ── Cor: conversão para poder comparar (nada de cor nova) ─────────────────────

/** h em graus, s e l em 0..1 (convenção de `hsl()`). */
export function hslParaRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
      : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r1, g1, b1].map((v) => Math.round((v + m) * 255));
}

/**
 * "221 83% 53%" (a forma dos tokens em `src/styles/tokens.css`, sem `hsl()`)
 * ou "hsl(221 83% 53%)" → [r, g, b]. `null` quando não é uma tripla HSL.
 */
export function triplaHslParaRgb(texto) {
  const m = String(texto).match(/(-?[\d.]+)\s*,?\s*([\d.]+)%\s*,?\s*([\d.]+)%/);
  if (!m) return null;
  const h = (((+m[1] % 360) + 360) % 360);
  return hslParaRgb(h, +m[2] / 100, +m[3] / 100);
}

/** "rgb(1, 2, 3)" / "rgba(1, 2, 3, 0.5)" (separador vírgula OU espaço) → [r, g, b]. */
export function rgbDoCss(texto) {
  const m = String(texto).match(/rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)/);
  if (!m) return null;
  return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
}

function canalLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** sRGB → CIE L*a*b* (D65). */
export function rgbParaLab([r, g, b]) {
  const R = canalLinear(r);
  const G = canalLinear(g);
  const B = canalLinear(b);
  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  const Z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X / 0.95047);
  const fy = f(Y / 1);
  const fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** ΔE (CIE76) entre duas cores já em Lab. */
export function deltaE76(labA, labB) {
  return Math.hypot(labA[0] - labB[0], labA[1] - labB[1], labA[2] - labB[2]);
}

/** ΔE entre duas cores em RGB. */
export function deltaE(a, b) {
  return deltaE76(rgbParaLab(a), rgbParaLab(b));
}
