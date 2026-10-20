/**
 * N-027 / A11Y-CHAT_INBOX_TEAMS-04 — contraste do subtítulo dos indicadores (KpiStrip).
 *
 * O defeito: o subtítulo da faixa de KPIs (o texto pequeno embaixo do número — "Mensagens,
 * ligações e ações" em `JourneyTab.tsx:123`) pintava `text-muted-foreground/70`. O alfa compõe
 * a tinta sobre o `bg-card` da faixa e derruba a razão abaixo da régua AA (4,5:1) para texto de
 * 11px (`text-2xs`). O axe acusa (`color-contrast`, serious) e o jsdom não mede cor — nenhum
 * contrato fechava essa conta.
 *
 * Como este teste prova: renderiza o `KpiStrip` REAL (jsdom), lê a lista de classes que o
 * subtítulo REALMENTE recebeu, extrai dela o token de texto, o alfa e a superfície que o
 * componente pinta (`bg-card`), resolve os tokens de `src/styles/tokens.css` +
 * `src/styles/accessibility.css` nos quatro estados de tema e fecha a razão WCAG. Nada de
 * literal pinado: se a classe do componente mudar, o número muda com ela.
 *
 * Medido no estado anterior (`muted-foreground/70` sobre `bg-card`): 3,16:1 no claro — abaixo
 * de 4,5:1. Depois (`muted-foreground` sem alfa): 6,11:1 claro, 9,34:1 escuro, 12,63:1 alto
 * contraste e 12,10:1 alto contraste escuro.
 */
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { CircleDot } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { KpiStrip } from '../KpiStrip';

// ─── WCAG 2.1: HSL (formato dos tokens) → sRGB, composição alfa e razão ─────

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

/** Texto com alfa sobre a superfície, como o navegador pinta (sRGB, canal a canal). */
function compor(fundo: Rgb, topo: Rgb, alfa: number): Rgb {
  return [0, 1, 2].map((i) => Math.round(fundo[i] * (1 - alfa) + topo[i] * alfa)) as Rgb;
}

function hslParaRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const luz = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(luz, 1 - luz);
  const f = (n: number) => luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

/**
 * Tokens de UM bloco por cabeçalho EXATO (`seletor {`). Um `indexOf` simples deixaria
 * `.high-contrast` casar também com `.dark.high-contrast` (substring) e o estado de alto
 * contraste CLARO seria medido com os tokens do ESCURO.
 */
function tokensDoBloco(css: string, cabecalho: string): Record<string, Rgb> {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const alvo = `${cabecalho} {`;
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

/** `text-2xs` (11px) não é negrito: a régua é a de texto normal (4,5:1). */
const LIMIAR_TEXTO = 4.5;

// ─── Extração das classes REAIS aplicadas pelo componente renderizado ───────

/** Classes do token de texto (com alfa opcional): `text-muted-foreground/70` → [token, 0.7]. */
function textoDaClasse(className: string): { token: string; alfa: number } {
  const m = className.match(/(?:^|\s)text-((?:[a-z-]+-)?foreground)(?:\/(\d+))?(?:\s|$)/);
  if (!m) throw new Error(`sem classe text-*-foreground em: ${className}`);
  return { token: m[1], alfa: m[2] ? Number(m[2]) / 100 : 1 };
}

/** Superfície que o componente pinta: `bg-card` / `bg-background` / `bg-muted` / `bg-popover`. */
function fundoDaClasse(className: string): string {
  const m = className.match(/(?:^|\s)bg-(card|background|muted|popover)(?:\s|$)/);
  if (!m) throw new Error(`sem classe de superfície em: ${className}`);
  return m[1];
}

interface Medicao {
  texto: string;
  fundo: string;
  alfa: number;
}

/** Renderiza a faixa REAL e devolve as classes que o subtítulo e a superfície receberam. */
function medirSublabel(): Medicao {
  const sublabel = 'Mensagens, ligações e ações';
  const { container, unmount } = render(
    <KpiStrip
      cells={[{ icon: CircleDot, label: 'Total de interações', value: 12, tone: 'blue', sublabel }]}
    />,
  );

  const alvo = Array.from(container.querySelectorAll('p')).find((p) => p.textContent === sublabel);
  if (!alvo) throw new Error('subtítulo do indicador não renderizou');

  // A superfície é o ancestral mais próximo que pinta a faixa (bg-card).
  let superficie: Element | null = alvo;
  let fundo: string | null = null;
  while (superficie && fundo === null) {
    try {
      fundo = fundoDaClasse(superficie.className);
    } catch {
      superficie = superficie.parentElement;
    }
  }
  if (fundo === null) throw new Error('superfície do KpiStrip (bg-card) não encontrada');

  const { token, alfa } = textoDaClasse(alvo.className);
  const medicao: Medicao = { texto: token, fundo, alfa };
  unmount();
  return medicao;
}

describe('N-027 — o subtítulo do KpiStrip fecha a régua AA nos quatro temas', () => {
  const medicao = medirSublabel();

  it('o subtítulo pinta --muted-foreground SEM opacidade sobre a superfície do card', () => {
    expect(medicao).toEqual({ texto: 'muted-foreground', fundo: 'card', alfa: 1 });
  });

  for (const [nome, tokens] of ESTADOS) {
    it(`${nome}: o subtítulo fecha 4,5:1 sobre bg-card`, () => {
      const fundo = tokens[medicao.fundo];
      if (!fundo) throw new Error(`token --${medicao.fundo} ausente no tema ${nome}`);
      const tinta = compor(fundo, tokens[medicao.texto], medicao.alfa);
      expect(
        razao(tinta, fundo),
        `${nome}: ${medicao.texto}/${medicao.alfa * 100} sobre bg-${medicao.fundo} = ${razao(tinta, fundo).toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(LIMIAR_TEXTO);
    });
  }
});
