/**
 * Y18-2 (SHELL-04 e SHELL-09) — tela de Skins (`ThemeCustomizer`).
 *
 * Dois defeitos medidos pela auditoria Y18 (2026-10-07, 390 e 1280):
 *  - SHELL-04: a seta de voltar só tem o ícone (`ChevronLeft`) — sem nome acessível
 *    (`button-name` [critical] em 1 nó por combo);
 *  - SHELL-09: o badge da skin ativa (`✓ {nome}`) e o selo `GAMER` pintam
 *    `text-primary` sobre a própria tinta `bg-primary/15` — o preenchimento como texto
 *    não fecha AA (3,4:1 sobre superfície clara; 4,2:1 sobre a tinta /15).
 *
 * A correção é a do próprio design system: o texto passa a usar o par de TEXTO
 * `--primary-text` (o mesmo usado em `MobileHeader`, `PriorityChip` e `.chip-active`),
 * sem mexer no preenchimento. O teste renderiza o `ThemeCustomizer` REAL, lê a classe
 * que o badge REALMENTE recebeu e mede a razão WCAG nos 4 estados de tema.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ThemeCustomizer } from '../ThemeCustomizer';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/ui/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', resolvedTheme: 'dark', setTheme: vi.fn() }),
}));

// ─── WCAG 2.1: HSL → sRGB, composição alfa e razão (mesmo medidor de
//     `tasks/__tests__/movimentoEContraste.test.tsx`, sem módulo externo) ─────

type Rgb = [number, number, number];

function luminancia([r, g, b]: Rgb): number {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function razao(a: Rgb, b: Rgb): number {
  const [l1, l2] = [luminancia(a), luminancia(b)];
  const [alto, baixo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (alto + 0.05) / (baixo + 0.05);
}

function compor(fundo: Rgb, topo: Rgb, alfa: number): Rgb {
  return [0, 1, 2].map((i) => fundo[i] * (1 - alfa) + topo[i] * alfa) as Rgb;
}

function hslParaRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const luz = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(luz, 1 - luz);
  const f = (n: number) => luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
}

/** Tokens de UM bloco por cabeçalho em INÍCIO DE LINHA (senão `.high-contrast` casaria com `.dark.high-contrast`). */
function tokensDoBloco(css: string, cabecalho: string): Record<string, Rgb> {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const alvo = `\n${cabecalho} {`;
  const i = limpo.indexOf(alvo);
  if (i < 0) throw new Error(`bloco ${cabecalho} ausente`);
  const abre = i + alvo.length - 1;
  let nivel = 0;
  for (let j = abre; j < limpo.length; j++) {
    if (limpo[j] === '{') nivel += 1;
    else if (limpo[j] === '}') {
      nivel -= 1;
      if (nivel === 0) {
        const out: Record<string, Rgb> = {};
        for (const t of Array.from(
          limpo
            .slice(abre + 1, j)
            .matchAll(/--([\w-]+):\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*;/g),
        )) {
          out[t[1]] = hslParaRgb(Number(t[2]), Number(t[3]), Number(t[4]));
        }
        return out;
      }
    }
  }
  throw new Error(`bloco ${cabecalho} sem fechamento`);
}

const TOKENS = readFileSync('src/styles/tokens.css', 'utf8');
const A11Y = readFileSync('src/styles/accessibility.css', 'utf8');

const CLARO = tokensDoBloco(TOKENS, ':root');
const ESCURO = { ...CLARO, ...tokensDoBloco(TOKENS, '.dark') };
const HC_CLARO = { ...CLARO, ...tokensDoBloco(A11Y, '.high-contrast') };
const HC_ESCURO = {
  ...ESCURO,
  ...tokensDoBloco(A11Y, '.high-contrast'),
  ...tokensDoBloco(A11Y, '.dark.high-contrast'),
};

const ESTADOS = [
  ['claro', CLARO],
  ['escuro', ESCURO],
  ['alto contraste', HC_CLARO],
  ['alto contraste escuro', HC_ESCURO],
] as const;

const LIMIAR_TEXTO = 4.5;

const classes = (el: Element) => (el as HTMLElement).className ?? '';

/** Texto: `text-[hsl(var(--primary-text))]` ou `text-primary[/70]` → token + alfa. */
function textoDe(el: Element): { token: string; alfa: number } {
  const c = classes(el);
  const viaVar = c.match(/text-\[hsl\(var\(--([\w-]+)\)\)\]/);
  if (viaVar) return { token: viaVar[1], alfa: 1 };
  const m = c.match(/(?:^|\s)text-([a-z][a-z-]+)(?:\/(\d+))?(?:\s|$)/);
  if (!m) throw new Error(`sem classe text-* em: ${c}`);
  return { token: m[1], alfa: m[2] ? Number(m[2]) / 100 : 1 };
}

/** Tinta própria do elemento: `bg-primary/15` → token + alfa. */
function fundoProprio(el: Element): { token: string; alfa: number } {
  const m = classes(el).match(/(?:^|\s)bg-([a-z][a-z-]+)(?:\/(\d+))?(?:\s|$)/);
  if (!m) throw new Error(`sem classe bg-* em: ${classes(el)}`);
  return { token: m[1], alfa: m[2] ? Number(m[2]) / 100 : 1 };
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.presetId;
});

describe('SHELL-04 — a seta de voltar da tela de Skins tem nome acessível', () => {
  it('é alcançável pelo nome "Voltar"', () => {
    render(<ThemeCustomizer />);
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
  });

  it('o axe não acusa `button-name` na tela', async () => {
    render(<ThemeCustomizer />);
    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.filter((v) => v.id === 'button-name')).toEqual([]);
  });
});

describe('SHELL-09 — os selos das Skins usam o par de texto da primária', () => {
  it('badge da skin ativa e selo GAMER deixam de usar a cor de PREENCHIMENTO como texto', () => {
    render(<ThemeCustomizer />);

    for (const texto of [/✓ Padrão/, 'GAMER']) {
      const el = screen.getByText(texto);
      expect(textoDe(el).token, `${String(texto)}`).toBe('primary-text');
      expect(classes(el), `${String(texto)}`).toContain('bg-primary/15');
    }
  });

  for (const [nome, tokens] of ESTADOS) {
    it(`${nome}: os dois selos fecham 4,5:1 sobre a própria tinta`, () => {
      render(<ThemeCustomizer />);

      for (const texto of [/✓ Padrão/, 'GAMER']) {
        const el = screen.getByText(texto);
        const tinta = fundoProprio(el);
        const cor = textoDe(el);
        // A tela de Skins não pinta superfície própria: o selo fica sobre a página
        // (`--background`) e pode ficar sobre um card (`--card`). Os dois precisam fechar.
        for (const base of ['background', 'card'] as const) {
          const fundo = compor(tokens[base], tokens[tinta.token], tinta.alfa);
          expect(
            razao(compor(fundo, tokens[cor.token], cor.alfa), fundo),
            `${cor.token} sobre bg-${tinta.token}/${tinta.alfa * 100} (base ${base})`,
          ).toBeGreaterThanOrEqual(LIMIAR_TEXTO);
        }
      }
    });
  }
});
