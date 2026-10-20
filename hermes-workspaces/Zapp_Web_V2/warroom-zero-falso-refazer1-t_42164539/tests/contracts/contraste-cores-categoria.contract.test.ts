import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guarda dos tokens de CATEGORIA (`--violeta`/`--teal`/`--rosa`, cartão t_f3f17002).
 *
 * Os VALORES são lidos do `src/styles/tokens.css` real; o ESPERADO vem do cartão
 * (faixa de matiz + AA da WCAG 2.1), não de um literal copiado à mão. Sem os tokens,
 * a extração lança e este arquivo fica vermelho — é a prova "vermelho antes".
 */
const cssPath = process.env.TOKENS_CSS ?? path.resolve(__dirname, '../../src/styles/tokens.css');
const CSS = fs.readFileSync(cssPath, 'utf8');

/** Remove comentários CSS (um `{`/`}` em comentário desbalanceava a extração). */
const semComentarios = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

interface Hsl {
  h: number;
  s: number;
  l: number;
}
type Tokens = Record<string, Hsl>;

/** Extrai `--token: H S% L%` de TODOS os blocos cujo seletor é `seletor`. */
function tokensDoBloco(seletor: string): Tokens {
  const out: Tokens = {};
  let from = 0;
  for (;;) {
    const i = semComentarios.indexOf(seletor, from);
    if (i === -1) break;
    const abrir = semComentarios.indexOf('{', i);
    let depth = 1;
    let j = abrir + 1;
    while (depth > 0 && j < semComentarios.length) {
      const c = semComentarios[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      j++;
    }
    const corpo = semComentarios.slice(abrir + 1, j - 1);
    const re = /--([a-z0-9-]+):\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*;/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(corpo))) out[m[1]] = { h: +m[2], s: +m[3], l: +m[4] };
    from = j;
  }
  return out;
}

function hslParaRgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

function luminancia(cor: Hsl): number {
  const c = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = hslParaRgb(cor.h, cor.s, cor.l).map((v) => c(v / 255)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function razao(a: Hsl, b: Hsl): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

const CLARO = tokensDoBloco(':root {');
const ESCURO = tokensDoBloco('.dark {');

const CORES = [
  { nome: 'violeta', hMin: 255, hMax: 275 },
  { nome: 'teal', hMin: 180, hMax: 200 },
  { nome: 'rosa', hMin: 325, hMax: 345 },
] as const;

const FUNDOS = ['background', 'card', 'popover', 'input', 'muted'] as const;

describe('tokens de categoria: matiz e contraste WCAG 2.1 (claro e escuro)', () => {
  for (const { nome, hMin, hMax } of CORES) {
    for (const [tema, bloco] of [
      ['claro', CLARO],
      ['escuro', ESCURO],
    ] as const) {
      // Cascata do CSS: no escuro, o que não for redefinido herda do :root.
      const T: Tokens = tema === 'claro' ? bloco : { ...CLARO, ...bloco };

      it(`${nome} (${tema}) define preenchimento + foreground + text`, () => {
        for (const suf of ['', '-foreground', '-text']) {
          expect(T[`${nome}${suf}`], `--${nome}${suf} ausente em ${tema}`).toBeDefined();
        }
      });

      it(`${nome} (${tema}) está na faixa de matiz do cartão (${hMin}°–${hMax}°)`, () => {
        expect(T[`${nome}`].h).toBeGreaterThanOrEqual(hMin);
        expect(T[`${nome}`].h).toBeLessThanOrEqual(hMax);
      });

      it(`${nome} (${tema}): ${nome}-text atinge AA (>=4.5) em todo fundo`, () => {
        for (const f of FUNDOS) {
          expect(razao(T[`${nome}-text`], T[f]), `--${nome}-text sobre --${f}`).toBeGreaterThanOrEqual(4.5);
        }
      });

      it(`${nome} (${tema}): texto sobre o preenchimento atinge AA (>=4.5)`, () => {
        expect(
          razao(T[`${nome}-foreground`], T[`${nome}`]),
          `--${nome}-foreground sobre --${nome}`,
        ).toBeGreaterThanOrEqual(4.5);
      });

      it(`${nome} (${tema}): preenchimento visível sobre o card (>=3,0 componente)`, () => {
        expect(razao(T[`${nome}`], T['card']), `--${nome} sobre --card`).toBeGreaterThanOrEqual(3);
      });
    }
  }
});
