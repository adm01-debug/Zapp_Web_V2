/**
 * Medições numéricas executadas DENTRO da página (Playwright serializa a função).
 * Arquivo separado para as medidas serem funções de verdade — passar o corpo como
 * string para `locator.evaluate` devolve a própria função (sem valor), o que
 * zerou a primeira execução desta evidência.
 *
 * Mesma matemática do `e2e/fixtures/arquivos-local/tema.ts` do cartão t_6c2d8281:
 * contraste WCAG 2.x com o fundo composto subindo os ancestrais.
 */

/** Contraste WCAG do texto do elemento contra o fundo efetivo. */
export function contrasteNumerico(el) {
  const parse = (css) => {
    const m = /rgba?\(([^)]+)\)/.exec(css);
    if (!m) return [0, 0, 0, 0];
    const p = m[1].split(',').map((x) => Number.parseFloat(x));
    return [p[0], p[1], p[2], p[3] ?? 1];
  };
  const sobrepor = (top, base) => {
    const a = top[3] + base[3] * (1 - top[3]);
    if (a === 0) return [0, 0, 0, 0];
    return [
      (top[0] * top[3] + base[0] * base[3] * (1 - top[3])) / a,
      (top[1] * top[3] + base[1] * base[3] * (1 - top[3])) / a,
      (top[2] * top[3] + base[2] * base[3] * (1 - top[3])) / a,
      a,
    ];
  };
  const lum = ([r, g, b]) => {
    const lin = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const razao = (c1, c2) => {
    const l1 = lum(c1);
    const l2 = lum(c2);
    return l1 > l2 ? (l1 + 0.05) / (l2 + 0.05) : (l2 + 0.05) / (l1 + 0.05);
  };
  const fundo = () => {
    let camada = [255, 255, 255, 0];
    let atual = el;
    while (atual && camada[3] < 1) {
      const cor = parse(getComputedStyle(atual).backgroundColor);
      if (cor[3] > 0) camada = sobrepor(cor, camada);
      atual = atual.parentElement;
    }
    if (camada[3] < 1) camada = sobrepor([255, 255, 255, 1], camada);
    return camada;
  };
  const cs = getComputedStyle(el);
  const f = fundo();
  const texto = parse(cs.color).slice(0, 3);
  const sombra = cs.boxShadow && cs.boxShadow !== 'none' ? cs.boxShadow : null;
  const bruto = sombra ? /rgba?\(([^)]+)\)/.exec(sombra) : null;
  const anel = bruto ? bruto[1].split(',').map((x) => Number.parseFloat(x)) : null;
  return {
    textoCss: cs.color,
    fundoCss: `rgb(${f[0]}, ${f[1]}, ${f[2]})`,
    fontSize: cs.fontSize,
    razaoTexto: razao(texto, [f[0], f[1], f[2]]),
    boxShadow: sombra,
    corAnelCss: anel ? `rgba(${anel.join(', ')})` : null,
    razaoAnel:
      anel && anel[3] > 0
        ? razao(sobrepor([anel[0], anel[1], anel[2], anel[3]], f).slice(0, 3), [f[0], f[1], f[2]])
        : null,
  };
}

/** Maior duração (ms) de transição/animação no elemento e descendentes. */
export function duracaoMaximaDeTransicao(raiz) {
  const paraMs = (lista) =>
    lista.split(',').reduce((max, item) => {
      const t = item.trim();
      const ms = t.endsWith('ms') ? Number.parseFloat(t) : Number.parseFloat(t) * 1000;
      return Number.isFinite(ms) && ms > max ? ms : max;
    }, 0);
  let maior = 0;
  for (const el of [raiz, ...raiz.querySelectorAll('*')]) {
    const cs = getComputedStyle(el);
    maior = Math.max(maior, paraMs(cs.transitionDuration), paraMs(cs.animationDuration));
  }
  return maior;
}

/** Descrição curta do elemento com foco (para provar ordem de Tab e devolução de foco). */
export function descreveFoco(el) {
  if (!el) return null;
  return {
    tag: el.tagName.toLowerCase(),
    testid: el.getAttribute('data-testid'),
    ariaLabel: el.getAttribute('aria-label'),
    texto: (el.textContent || '').trim().slice(0, 40),
    tipo: el.getAttribute('type'),
  };
}

/** O mesmo, para o elemento com foco no momento (usado como `page.evaluate(focoAtual)`). */
export function focoAtual() {
  const el = document.activeElement;
  if (!el) return null;
  return {
    tag: el.tagName.toLowerCase(),
    testid: el.getAttribute('data-testid'),
    ariaLabel: el.getAttribute('aria-label'),
    texto: (el.textContent || '').trim().slice(0, 40),
    tipo: el.getAttribute('type'),
  };
}
