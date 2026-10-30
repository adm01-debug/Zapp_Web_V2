/**
 * Segurança > IPs — o bloco de erro (falha de consulta) fecha contraste AA e
 * usa o par de TEXTO do estado, não a cor de preenchimento, nos dois temas.
 *
 * Isto é a "captura claro/escuro" do cartão no idioma que o repo adota para
 * tema (mesmo medidor de `inbox/__tests__/SLAIndicator.contrasteSelos.test.tsx`
 * e `tasks/__tests__/movimentoEContraste.test.tsx`): renderiza o painel REAL,
 * lê a lista de classes que o bloco de erro realmente recebeu, resolve dela o
 * token de fundo, o alfa da tinta e o token de texto, compõe a tinta sobre o
 * card (como o navegador pinta) e mede a razão WCAG 2.1 contra
 * `src/styles/tokens.css`. Nada de literal pinado: se a classe do componente
 * mudar, a razão medida muda com ela.
 *
 * O que NÃO prova: cor em pixel — o jsdom não carrega o CSS do app.
 */
import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IPWhitelistPanel } from '../IPWhitelistPanel';
import { BlockedIPsPanel } from '../BlockedIPsPanel';

const orderMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fromMock } }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// ─── WCAG 2.1: HSL (formato dos tokens) → sRGB, composição alfa e razão ────
type Rgb = [number, number, number];

function hslParaRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const luz = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(luz, 1 - luz);
  const f = (n: number) => luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
}

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

/** A tinta `bg-<token>/<alfa>` sobre a superfície, como o navegador pinta. */
function sobreTinta(tinta: Rgb, alfa: number, base: Rgb): Rgb {
  return [0, 1, 2].map((i) => tinta[i] * alfa + base[i] * (1 - alfa)) as Rgb;
}

function variaveisDoBloco(css: string, cabecalho: string): Record<string, Rgb> {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const alvo = `${cabecalho} {`;
  const i = limpo.indexOf(alvo);
  if (i < 0) throw new Error(`bloco ${alvo} ausente no CSS`);
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
  throw new Error(`bloco ${alvo} sem fechamento`);
}

const TOKENS_CSS = readFileSync('src/styles/tokens.css', 'utf8');
const CLARO = variaveisDoBloco(TOKENS_CSS, ':root');
const ESCURO = { ...CLARO, ...variaveisDoBloco(TOKENS_CSS, '.dark') };
const TEMAS: Array<[string, Record<string, Rgb>]> = [
  ['claro', CLARO],
  ['escuro', ESCURO],
];

/** Tinta do bloco: `bg-destructive/10` → ['destructive', 0.1]. */
function tintaDaClasse(className: string): { token: string; alfa: number } {
  const m = className.match(/(?:^|\s)bg-([a-z][a-z0-9-]*)\/(\d+)(?:\s|$)/);
  if (!m) throw new Error(`bloco de erro sem tinta \`bg-<token>/<alfa>\`: "${className}"`);
  return { token: m[1], alfa: Number(m[2]) / 100 };
}

/** Token de texto: `text-[hsl(var(--destructive-text))]`. */
function textoDaClasse(className: string): string {
  const literal = className.match(/(?:^|\s)text-\[hsl\(var\(--([\w-]+)\)\)\](?:\s|$)/);
  if (literal) return literal[1];
  for (const c of className.split(/\s+/)) {
    const m = c.match(/^text-([a-z][a-z0-9-]*)$/);
    if (m && CLARO[m[1]]) return m[1];
  }
  throw new Error(`bloco de erro sem token de texto do sistema: "${className}"`);
}

interface BlocoErro {
  painel: string;
  testid: string;
  texto: string;
  tinta: string;
  alfa: number;
}

/** Renderiza os painéis REAIS em falha de consulta e devolve as classes do bloco. */
async function medirBlocos(): Promise<BlocoErro[]> {
  orderMock.mockResolvedValue({ data: null, error: { message: 'falha', code: '500' } });
  fromMock.mockImplementation(() => ({ select: () => ({ order: orderMock }) }));

  const blocos: BlocoErro[] = [];
  for (const [painel, Elemento, testid] of [
    ['Whitelist', IPWhitelistPanel, 'whitelist-erro'],
    ['Bloqueados', BlockedIPsPanel, 'bloqueados-erro'],
  ] as const) {
    cleanup();
    render(<Elemento />);
    const el = await screen.findByTestId(testid);
    const { token, alfa } = tintaDaClasse(el.className);
    blocos.push({ painel, testid, texto: textoDaClasse(el.className), tinta: token, alfa });
  }
  cleanup();
  return blocos;
}

const MIN_TEXTO = 4.5;

afterEach(() => cleanup());

describe('bloco de erro dos painéis de IP — claro/escuro', () => {
  it('renderiza o bloco de erro nos dois painéis em falha de consulta', async () => {
    const blocos = await medirBlocos();
    expect(blocos.map((b) => b.painel)).toEqual(['Whitelist', 'Bloqueados']);
  });

  it('o texto do bloco é o par de TEXTO (destructive-text), não a cor de preenchimento', async () => {
    for (const bloco of await medirBlocos()) {
      expect(bloco.texto, `${bloco.painel}: texto do bloco (${bloco.texto})`).toBe('destructive-text');
      expect(bloco.tinta, `${bloco.painel}: tinta do bloco`).toBe('destructive');
      expect(bloco.alfa, `${bloco.painel}: alfa da tinta`).toBe(0.1);
    }
  });

  for (const [nome, tokens] of TEMAS) {
    it(`${nome}: o bloco de erro fecha 4,5:1 sobre a própria tinta composta no card`, async () => {
      for (const bloco of await medirBlocos()) {
        const texto = tokens[bloco.texto];
        const tinta = tokens[bloco.tinta];
        expect(texto, `--${bloco.texto} não definido em ${nome}`).toBeDefined();
        expect(tinta, `--${bloco.tinta} não definido em ${nome}`).toBeDefined();
        const medido = razao(texto, sobreTinta(tinta, bloco.alfa, tokens.card));
        expect(medido, `${bloco.painel} — ${nome}`).toBeGreaterThanOrEqual(MIN_TEXTO);
      }
    });
  }

  it('a medida registrada é a real (muda de propósito se um token mudar)', async () => {
    const blocos = await medirBlocos();
    const medido = blocos.map((b) => ({
      painel: b.painel,
      razao: TEMAS.map(([, tokens]) =>
        Number(razao(tokens[b.texto], sobreTinta(tokens[b.tinta], b.alfa, tokens.card)).toFixed(2)),
      ),
    }));
    // Sem o par de texto (usando text-destructive como texto) o claro cairia a 3,32:1.
    expect(medido).toEqual([
      { painel: 'Whitelist', razao: [6.02, 5.32] },
      { painel: 'Bloqueados', razao: [6.02, 5.32] },
    ]);
  });
});
