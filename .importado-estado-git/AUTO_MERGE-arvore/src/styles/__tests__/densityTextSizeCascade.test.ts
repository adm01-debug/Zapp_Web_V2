/**
 * Prova EM CASCATA (DOM do jsdom, com o CSS injetado como folha de estilo real)
 * do tamanho de texto por densidade — item 141 (LT-TYPE-04).
 *
 * Complementa `densityTextSize.test.ts`, que lê o accessibility.css como texto e
 * confere literais por regex. Aqui o CSS entra no documento como folha de estilo e
 * quem responde é o motor de CSS do jsdom, o mesmo caminho que o navegador percorre:
 *
 *  1. `--density-text-size` resolve em cada modo para um valor CONCRETO. Na versão
 *     recusada ele apontava para `var(--text-xs|sm)`, ou seja, um valor que dependia
 *     de token de terceiro — o defeito auditado ("declarado 3 vezes e consumido 0").
 *  2. O consumidor `[data-density] #root { font-size: var(--density-text-size) }`
 *     existe NA CASCATA e casa com `#root` só quando o `<html>` tem data-density —
 *     que é exatamente o que `useDensity` aplica (src/hooks/ui/useDensity.ts).
 *
 * Este teste FALHA contra a versão sem correção (token com var() e sem consumidor)
 * e passa com ela. Ver `git log fc43af374`.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const css = readFileSync('src/styles/accessibility.css', 'utf8');

type Modo = 'comfortable' | 'compact' | 'dense';

/** Valor concreto esperado do token por modo (o modo padrão é 1rem). */
const ESPERADO: Record<Modo, string> = {
  comfortable: '1rem',
  compact: '0.875rem',
  dense: '0.75rem',
};

function montarApp(): HTMLElement {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-density');

  const folha = document.createElement('style');
  folha.textContent = css;
  document.head.appendChild(folha);

  const root = document.createElement('div');
  root.id = 'root';
  root.innerHTML = '<p id="texto-herdado">texto sem classe de tamanho</p>';
  document.body.appendChild(root);
  return root;
}

function aplicarDensidade(modo: Modo | null): void {
  if (modo) document.documentElement.setAttribute('data-density', modo);
  else document.documentElement.removeAttribute('data-density');
}

function tokenResolvido(root: HTMLElement): string {
  return getComputedStyle(root).getPropertyValue('--density-text-size').trim();
}

describe('densidade — tamanho do texto resolvido pela cascata', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = montarApp();
  });

  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-density');
  });

  it('resolve o token para um valor concreto em cada modo (nunca um var() de terceiro)', () => {
    for (const modo of ['comfortable', 'compact', 'dense'] as const) {
      aplicarDensidade(modo);
      const valor = tokenResolvido(root);

      expect(valor).toBe(ESPERADO[modo]);
      // A recusa anterior foi um token apontando para outro token indefinido.
      expect(valor).not.toContain('var(');
      expect(valor).toMatch(/^\d*(\.\d+)?(rem|px|em)$/);
    }
  });

  it('mantém 1rem quando nenhum modo foi escolhido — o padrão não muda a tipografia', () => {
    aplicarDensidade(null);

    expect(tokenResolvido(root)).toBe('1rem');
    // Sem data-density o consumidor não casa: #root não recebe font-size nenhum
    // (jsdom devolve o valor inicial do motor, não a declaração do token).
    expect(getComputedStyle(root).fontSize).not.toBe('var(--density-text-size)');
  });

  it('aplica os três modos em ordem decrescente de tamanho', () => {
    const px = (valor: string) =>
      valor.endsWith('rem') ? Number.parseFloat(valor) * 16 : Number.parseFloat(valor);

    const tamanhos = (['comfortable', 'compact', 'dense'] as const).map((modo) => {
      aplicarDensidade(modo);
      return px(tokenResolvido(root));
    });

    expect(tamanhos[0]).toBeGreaterThan(tamanhos[1]);
    expect(tamanhos[1]).toBeGreaterThan(tamanhos[2]);
  });

  it('o consumidor entra na cascata e casa com #root só com data-density no <html>', () => {
    const folha = document.styleSheets[0];
    const regras = Array.from(folha.cssRules).filter(
      (regra): regra is CSSStyleRule => regra.type === CSSRule.STYLE_RULE,
    );
    const consumidor = regras.find((regra) => /\[data-density\]\s*#root\b/.test(regra.selectorText));

    expect(consumidor, 'nenhuma regra [data-density] #root na folha de estilo').toBeTruthy();
    expect(consumidor!.style.getPropertyValue('font-size')).toBe('var(--density-text-size)');

    aplicarDensidade('dense');
    expect(root.matches(consumidor!.selectorText)).toBe(true);
    expect(getComputedStyle(root).fontSize).toBe('var(--density-text-size)');

    aplicarDensidade(null);
    expect(root.matches(consumidor!.selectorText)).toBe(false);
  });
});
