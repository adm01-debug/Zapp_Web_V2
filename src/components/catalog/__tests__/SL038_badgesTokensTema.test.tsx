/**
 * SL-038 — as badges de destaque do card (Novo/Top/Promo) pintam por TOKEN do
 * tema, não pela paleta crua do Tailwind.
 *
 * O defeito (inventário DEC-2, `docs/catalogo/HANDOFF_v1.md` §3.2): em
 * `CatalogProductCard.tsx:79-89` o FUNDO era `bg-emerald-500`/`bg-orange-500`/
 * `bg-rose-500` — cor fixa, igual nos 4 temas — enquanto o texto era o token
 * `text-primary-foreground`, que muda (é branco em 3 dos 4 temas). Ou seja: o
 * par não acompanhava o tema; só o texto acompanhava.
 *
 * ── O que este teste prova ────────────────────────────────────────────────
 * Renderiza o `CatalogProductCard` REAL nos 3 estados de badge e resolve o par
 * FUNDO×TEXTO a partir do `className` que o componente de fato aplica, contra
 * os tokens dos 4 temas lidos de `tokens.css`/`accessibility.css` (claro,
 * escuro, claro+alto contraste, escuro+alto contraste):
 *   1. o fundo e o texto resolvem a um TOKEN do tema (`bg-success` → `--success`);
 *      `bg-emerald-500` NÃO resolve a token nenhum — é exatamente a diferença
 *      entre "cor crua" e "token";
 *   2. o token existe nos 4 temas (não some no escuro/alto contraste);
 *   3. o fundo pintado não é o mesmo valor nos 4 temas — o par segue o tema;
 *   4. o par fecha o mínimo de 3:1 de componente de UI (WCAG 1.4.11) nos 4.
 *
 * ── O que este teste NÃO prova ────────────────────────────────────────────
 * Cor em pixel: o jsdom não carrega o CSS do app (medida visual exigiria
 * navegador). A medida abaixo é do par que a classe aplicada resolve, com o
 * mesmo medidor WCAG (HSL → sRGB → luminância) já usado no repo
 * (`src/components/tasks/__tests__/quadroLarguraFocoContraste.test.tsx`).
 * O limiar de TEXTO (4,5:1) dos badges é o item SL-041 / CT-69 — decisão de
 * produto, fora deste cartão; aqui o alvo é o badge parar de usar cor crua.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, cleanup, screen } from '@testing-library/react';

// Mesmo harness do CT-72: o detalhe (Sheet) entra por `import()` no clique;
// mockado, o único componente real sob teste é o card.
vi.mock('../ProductDetailDialog', () => ({
  ProductDetailDialog: () => <div data-testid="detail-dialog" />,
}));

import { CatalogProductCard } from '../CatalogProductCard';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

afterEach(() => cleanup());

// ─── CSS real do app (é dele que saem os tokens medidos) ──────────────────
const lerCss = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
const tokensCss = lerCss('../../../styles/tokens.css');
const acessibilidadeCss = lerCss('../../../styles/accessibility.css');

/** Variáveis de um bloco (`:root {` / `.dark {` / `.high-contrast {`). */
function variaveis(css: string, cabecalho: string): Record<string, string> {
  const idx = css.indexOf(cabecalho);
  if (idx === -1) return {};
  const abre = css.indexOf('{', idx);
  let profundidade = 1;
  let i = abre + 1;
  while (profundidade > 0 && i < css.length) {
    if (css[i] === '{') profundidade++;
    else if (css[i] === '}') profundidade--;
    i++;
  }
  const vars: Record<string, string> = {};
  const re = /--([a-z0-9-]+):\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css.slice(abre + 1, i - 1)))) vars[m[1]] = m[2].trim().replace(/\s+/g, ' ');
  return vars;
}

const claro = variaveis(tokensCss, ':root {');
const escuro = { ...claro, ...variaveis(tokensCss, '.dark {') };
/** Os 4 temas do design system. */
const TEMAS: Record<string, Record<string, string>> = {
  claro,
  escuro,
  'claro+alto contraste': { ...claro, ...variaveis(acessibilidadeCss, '.high-contrast {') },
  'escuro+alto contraste': { ...escuro, ...variaveis(acessibilidadeCss, '.dark.high-contrast {') },
};

// ─── Medidor WCAG (HSL → sRGB → luminância relativa) ─────────────────────
type RGB = [number, number, number];
function parseHsl(s: string): RGB {
  const m = s.match(/(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/)!;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}
function hslToRgb(h: number, s: number, l: number): RGB {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function luminancia([r, g, b]: RGB): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function razaoRgb(a: RGB, b: RGB): number {
  const l1 = luminancia(a), l2 = luminancia(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
/** Razão WCAG entre dois tokens do tema; explode se o token não existir nele. */
function razaoToken(vars: Record<string, string>, fundo: string, texto: string): number {
  const nome = (t: string) => t.replace(/^--/, '');
  if (vars[nome(fundo)] === undefined) throw new Error(`token ${fundo} não existe no tema`);
  if (vars[nome(texto)] === undefined) throw new Error(`token ${texto} não existe no tema`);
  return razaoRgb(hslToRgb(...parseHsl(vars[nome(fundo)])), hslToRgb(...parseHsl(vars[nome(texto)])));
}

// ─── Classe RENDERIZADA → token do tema ──────────────────────────────────
/**
 * `bg-success` → `success`; `text-success-foreground` → `success-foreground`.
 * Devolve `null` quando a classe não é uma variável do tema — é o caso da
 * paleta crua (`bg-emerald-500`), que não existe em `tokens.css`.
 */
function tokenDaClasse(className: string, tipo: 'bg' | 'text'): string | null {
  for (const classe of className.split(/\s+/)) {
    const semVariante = classe.slice(classe.lastIndexOf(':') + 1);
    const m = semVariante.match(new RegExp(`^${tipo}-([a-z0-9-]+)$`));
    if (!m) continue;
    if (claro[m[1]] !== undefined) return m[1];
  }
  return null;
}

// ─── Fixture e casos ─────────────────────────────────────────────────────
const produto = (overrides: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1', name: 'Caneta Bambu', sku: 'CB-001', sale_price: 12.5, stock_quantity: 100,
  primary_image_url: 'https://x/a.jpg', colors: [], variants: [], is_kit: false,
  ...overrides,
} as unknown as ExternalProduct);

/** Os 3 estados de destaque, na ordem em que o card os escolhe. */
const BADGES = [
  { rotulo: 'Novo', estado: { is_new: true }, esperado: { fundo: 'success', texto: 'success-foreground' } },
  { rotulo: 'Top', estado: { is_bestseller: true }, esperado: { fundo: 'warning', texto: 'warning-foreground' } },
  { rotulo: 'Promo', estado: { is_on_sale: true }, esperado: { fundo: 'destructive', texto: 'destructive-foreground' } },
] as const;

/** Renderiza o card real e devolve a badge do estado pedido (o `<span>` do rótulo). */
function badgeDe(estado: Record<string, boolean>): HTMLElement {
  cleanup();
  render(<CatalogProductCard product={produto(estado)} mode="grade" />);
  const rotulo = Object.keys(estado)[0];
  const esperado = { is_new: 'Novo', is_bestseller: 'Top', is_on_sale: 'Promo' }[rotulo as 'is_new'];
  return screen.getByText(esperado);
}

describe('SL-038 — as badges de destaque seguem os tokens dos 4 temas', () => {
  it('pinta fundo e texto por token do tema (não pela paleta crua)', () => {
    for (const { rotulo, estado, esperado } of BADGES) {
      const badge = badgeDe(estado);
      const classe = badge.className;

      const fundo = tokenDaClasse(classe, 'bg');
      expect(
        fundo,
        `badge ${rotulo}: o fundo ("${classe}") não é token do tema — cor crua não acompanha claro/escuro/alto contraste`,
      ).toBe(esperado.fundo);

      const texto = tokenDaClasse(classe, 'text');
      expect(
        texto,
        `badge ${rotulo}: o texto ("${classe}") não é token do tema`,
      ).toBe(esperado.texto);

      for (const [tema, vars] of Object.entries(TEMAS)) {
        expect(vars[fundo!], `${rotulo}: --${fundo} não está definido em ${tema}`).toBeDefined();
        expect(vars[texto!], `${rotulo}: --${texto} não está definido em ${tema}`).toBeDefined();
      }
    }
  });

  it('o fundo pintado não é o mesmo valor nos 4 temas — o par segue o tema', () => {
    for (const { rotulo, estado } of BADGES) {
      const badge = badgeDe(estado);
      const fundo = tokenDaClasse(badge.className, 'bg')!;

      const valores = new Set(Object.values(TEMAS).map((vars) => vars[fundo]));
      expect(
        valores.size,
        `${rotulo}: o fundo é o mesmo valor nos 4 temas (cor fixa, não segue o tema)`,
      ).toBeGreaterThan(1);
    }
  });

  it('o par fundo×texto fecha o mínimo de componente de UI (3:1, WCAG 1.4.11) nos 4 temas', () => {
    const medido: Record<string, number[]> = {};

    for (const { rotulo, estado } of BADGES) {
      const badge = badgeDe(estado);
      const fundo = tokenDaClasse(badge.className, 'bg');
      const texto = tokenDaClasse(badge.className, 'text');
      expect(fundo, `${rotulo}: fundo sem token resolvido`).not.toBeNull();
      expect(texto, `${rotulo}: texto sem token resolvido`).not.toBeNull();

      medido[rotulo] = [];
      for (const [tema, vars] of Object.entries(TEMAS)) {
        const razao = razaoToken(vars, `--${fundo}`, `--${texto}`);
        medido[rotulo].push(Number(razao.toFixed(2)));
        expect(razao, `${rotulo} — ${tema}`).toBeGreaterThanOrEqual(3);
      }
    }

    // Medida registrada em 08/10/2026, na ordem [claro, escuro, claro+HC,
    // escuro+HC]. Antes desta correção os 3 badges pintavam a paleta crua
    // (2,54 / 2,80 / 3,67 em 3 dos 4 temas, CONTRASTE.md), os mesmos números em
    // todos eles. Se um token mudar de valor, esta tabela falha DE PROPÓSITO:
    // a medida precisa ser refeita.
    expect(medido).toEqual({
      Novo: [5.66, 7.8, 5.66, 7.8],
      Top: [7.15, 10.34, 7.15, 10.34],
      Promo: [3.78, 3.0, 5.89, 5.77],
    });
  });
});
