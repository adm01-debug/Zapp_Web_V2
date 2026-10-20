/**
 * Helpers de tema e medição numérica para a prova E2E da aba Arquivos.
 *
 * Os temas do app são classes no <html> alimentadas por localStorage:
 *   `theme` ('light'|'dark') → classe `dark` (lida no boot, index.html);
 *   `highContrast` ('true')  → classe `high-contrast` (accessibility.css);
 *   `reducedMotion` ('true') → classe `reduced-motion` (animation ≤ 0.001 ms).
 */
import type { Locator, Page } from '@playwright/test';

export type TemaE2E = 'claro' | 'escuro' | 'alto-contraste';

/** WCAG 2.x: texto comum exige contraste >= 4.5:1 sobre o fundo. */
export const CONTRASTE_MINIMO = 4.5;

/** Aplica o mesmo estado que o ThemeProvider/HighContrastToggle gravariam. */
export async function aplicarTema(page: Page, tema: TemaE2E): Promise<void> {
  await page.evaluate((t) => {
    const root = document.documentElement;
    localStorage.setItem('theme', t === 'escuro' ? 'dark' : 'light');
    localStorage.setItem('highContrast', String(t === 'alto-contraste'));
    root.classList.toggle('dark', t === 'escuro');
    root.classList.toggle('high-contrast', t === 'alto-contraste');
  }, tema);
}

/**
 * Contraste numérico (WCAG) entre a cor do texto do elemento e o fundo efetivo —
 * o fundo é composto subindo os ancestrais, então `bg-muted/40` conta certo.
 */
export async function contrasteNumerico(alvo: Locator): Promise<number> {
  return alvo.evaluate((el) => {
    const parse = (css: string): [number, number, number, number] => {
      const m = /rgba?\(([^)]+)\)/.exec(css);
      if (!m) return [0, 0, 0, 0];
      const partes = m[1].split(',').map((p) => Number.parseFloat(p));
      return [partes[0], partes[1], partes[2], partes[3] ?? 1];
    };
    const sobrepor = (top: [number, number, number, number], base: [number, number, number, number]) => {
      const a = top[3] + base[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0] as [number, number, number, number];
      return [
        (top[0] * top[3] + base[0] * base[3] * (1 - top[3])) / a,
        (top[1] * top[3] + base[1] * base[3] * (1 - top[3])) / a,
        (top[2] * top[3] + base[2] * base[3] * (1 - top[3])) / a,
        a,
      ] as [number, number, number, number];
    };
    const luminancia = ([r, g, b]: [number, number, number]) => {
      const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };

    const texto = parse(getComputedStyle(el).color).slice(0, 3) as [number, number, number];
    // Fundo efetivo: camada a camada do elemento até o body (alpha composto).
    let fundo: [number, number, number, number] = [255, 255, 255, 0];
    // `el` chega como HTMLElement | SVGElement; a subida pelos ancestrais só usa Element.
    let atual: Element | null = el;
    while (atual && fundo[3] < 1) {
      const cor = parse(getComputedStyle(atual).backgroundColor);
      if (cor[3] > 0) fundo = sobrepor(cor, fundo);
      atual = atual.parentElement;
    }
    if (fundo[3] < 1) fundo = sobrepor([255, 255, 255, 1], fundo); // fallback branco

    const l1 = luminancia(texto);
    const l2 = luminancia([fundo[0], fundo[1], fundo[2]]);
    return l1 > l2 ? (l1 + 0.05) / (l2 + 0.05) : (l2 + 0.05) / (l1 + 0.05);
  });
}

/**
 * Maior duração de transição/animação (ms) no elemento e descendentes.
 * Com `prefers-reduced-motion: reduce` o CSS global força <= 0.01 ms.
 */
export async function duracaoMaximaDeTransicao(alvo: Locator): Promise<number> {
  return alvo.evaluate((raiz) => {
    const paraMs = (lista: string) =>
      lista.split(',').reduce((max, item) => {
        const t = item.trim();
        const ms = t.endsWith('ms') ? Number.parseFloat(t) : Number.parseFloat(t) * 1000;
        return Number.isFinite(ms) && ms > max ? ms : max;
      }, 0);
    let maior = 0;
    const todos = [raiz, ...Array.from(raiz.querySelectorAll<HTMLElement>('*'))];
    for (const el of todos) {
      const cs = getComputedStyle(el);
      maior = Math.max(maior, paraMs(cs.transitionDuration), paraMs(cs.animationDuration));
    }
    return maior;
  });
}
