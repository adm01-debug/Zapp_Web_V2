/**
 * CT-69 (metade do contraste) / SL-041 — as badges de destaque do card
 * (Novo/Top/Promo) fecham **4,5:1** de texto nos 4 temas.
 *
 * ── O defeito ─────────────────────────────────────────────────────────────
 * `CatalogProductCard.tsx` pintava as 3 badges com a paleta CRUA do Tailwind
 * (`bg-emerald-500` / `bg-orange-500` / `bg-rose-500`) e o texto com
 * `text-primary-foreground`: o fundo não acompanhava o tema e o par ficava em
 * **2,54 / 2,80 / 3,67** no claro, no escuro e no alto contraste (tabela em
 * `docs/catalogo/CONTRASTE.md`) — abaixo de 4,5:1 e até abaixo do 3:1 de
 * componente de UI (WCAG 1.4.11). A badge é `text-[9px] font-bold`: **texto
 * pequeno**, então o limiar é 4,5:1, não 3:1.
 *
 * ── O que este teste prova ────────────────────────────────────────────────
 * Renderiza o `CatalogProductCard` REAL (sem mock do card) nos 3 estados de
 * badge, lê o `className` que o componente de fato aplicou e resolve o par
 * FUNDO×TEXTO contra os tokens dos 4 temas (claro, escuro, claro+alto
 * contraste, escuro+alto contraste), lidos de `tokens.css` +
 * `accessibility.css`:
 *   1. fundo e texto resolvem a um TOKEN do tema — `bg-emerald-500` não
 *      resolve a token nenhum, e é exatamente isso que deixa este arquivo
 *      VERMELHO antes da correção;
 *   2. o par fecha 4,5:1 nos 4 temas (o aceite do cartão).
 *
 * ── O que este teste NÃO prova ────────────────────────────────────────────
 * Cor em pixel: o jsdom não carrega o CSS do app. A medida é do par que a
 * classe aplicada resolve (`hsl()` do token → sRGB → luminância relativa
 * WCAG), o mesmo medidor já usado no repo
 * (`src/components/tasks/__tests__/quadroLarguraFocoContraste.test.tsx`).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, cleanup } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import './catalogMocks';
import { CatalogProductCard } from '../CatalogProductCard';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

// O card carrega o detalhe por `import()`; aqui só o card importa.
vi.mock('../ProductDetailDialog', () => ({ ProductDetailDialog: () => null }));

afterEach(() => cleanup());

const produto = (o: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1',
  name: 'Caneta Bambu',
  sku: 'CB-001',
  sale_price: 12.5,
  stock_quantity: 42,
  primary_image_url: 'https://x/a.jpg',
  primary_image_fallback_url: null,
  colors: [],
  variants: [],
  ...o,
} as unknown as ExternalProduct);

// ─── tokens reais dos 4 temas ─────────────────────────────────────────────
type Hsl = [number, number, number];

const tokensCss = fs.readFileSync(path.resolve(__dirname, '../../../styles/tokens.css'), 'utf8');
const acessibilidadeCss = fs.readFileSync(path.resolve(__dirname, '../../../styles/accessibility.css'), 'utf8');

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Variáveis `hsl(H S% L%)` de um bloco por seletor EXATO, com chaves balanceadas. */
function bloco(css: string, seletor: string): Record<string, Hsl> {
  const re = new RegExp('(^|\\n)[ \\t]*' + escapar(seletor) + '[ \\t]*\\{', 'm');
  const achado = re.exec(css);
  if (!achado) throw new Error(`bloco \`${seletor}\` ausente no CSS do app`);
  const abre = css.indexOf('{', achado.index);
  let nivel = 1;
  let i = abre + 1;
  while (nivel > 0 && i < css.length) {
    if (css[i] === '{') nivel += 1;
    else if (css[i] === '}') nivel -= 1;
    i += 1;
  }
  const vars: Record<string, Hsl> = {};
  const valores = /--([a-z0-9-]+):\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*;/g;
  let m: RegExpExecArray | null;
  const corpo = css.slice(abre + 1, i - 1);
  while ((m = valores.exec(corpo))) vars[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  return vars;
}

const raiz = bloco(tokensCss, ':root');
const escuroBase = bloco(tokensCss, '.dark');
const TEMAS: Record<string, Record<string, Hsl>> = {
  claro: raiz,
  escuro: { ...raiz, ...escuroBase },
  'claro+alto contraste': { ...raiz, ...bloco(acessibilidadeCss, '.high-contrast') },
  // `.dark.high-contrast` vence `.dark` e `.high-contrast` (mais específico e por último).
  'escuro+alto contraste': { ...raiz, ...escuroBase, ...bloco(acessibilidadeCss, '.dark.high-contrast') },
};

// ─── medidor WCAG (HSL → sRGB → luminância relativa) ──────────────────────
function hslParaRgb([h, s, l]: Hsl): [number, number, number] {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}

function luminancia([r, g, b]: [number, number, number]): number {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razão WCAG entre dois tokens do tema; explode se o token não existir nele. */
function razaoToken(tema: Record<string, Hsl>, fundo: string, texto: string): number {
  if (!tema[fundo]) throw new Error(`--${fundo} não existe neste tema`);
  if (!tema[texto]) throw new Error(`--${texto} não existe neste tema`);
  const l1 = luminancia(hslParaRgb(tema[fundo]));
  const l2 = luminancia(hslParaRgb(tema[texto]));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const LIMIAR = 4.5;
const NOMES_DE_TOKEN = new Set(Object.keys(raiz));

/**
 * `bg-success` → `success`; `text-[hsl(var(--destructive-text))]` →
 * `destructive-text`. Devolve `null` para o que NÃO é token do tema — é o caso
 * da paleta crua (`bg-emerald-500`), que é o que fazia a badge reprovar.
 */
function tokenDaClasse(classe: string): { papel: 'fundo' | 'texto'; token: string } | null {
  const direto = /^(bg|text)-([a-z0-9-]+)$/.exec(classe);
  const viaVar = /^(bg|text)-\[hsl\(var\(--([a-z0-9-]+)\)\)\]$/.exec(classe);
  const token = direto ? direto[2] : viaVar ? viaVar[2] : null;
  if (!token || !NOMES_DE_TOKEN.has(token)) return null;
  const prefixo = (direto ?? viaVar)![1];
  return { papel: prefixo === 'bg' ? 'fundo' : 'texto', token };
}

/** Par FUNDO×TEXTO que o card realmente aplicou naquela badge. */
function parDaBadge(texto: string): { fundo: string | null; texto: string | null } {
  const alvo = screen.getByText(texto);
  const classes = alvo.className.split(/\s+/);
  const resolvidos = classes.map(tokenDaClasse).filter((r) => r !== null);
  return {
    fundo: resolvidos.find((r) => r!.papel === 'fundo')?.token ?? null,
    texto: resolvidos.find((r) => r!.papel === 'texto')?.token ?? null,
  };
}

function medirBadge(produtoComFlag: Partial<ExternalProduct>, rotulo: string) {
  render(
    <TooltipProvider>
      <CatalogProductCard product={produto(produtoComFlag)} onSend={vi.fn()} />
    </TooltipProvider>
  );
  const { fundo, texto } = parDaBadge(rotulo);

  const alvo = screen.getByText(rotulo);
  expect(
    /(^|\s)(bg|text)-(emerald|orange|rose|amber)-\d+(\s|$)/.test(alvo.className),
    `badge "${rotulo}" voltou à paleta crua do Tailwind: ${alvo.className}`,
  ).toBe(false);

  expect(fundo, `badge "${rotulo}": o FUNDO não é um token do tema (era o defeito do CT-69)`).not.toBeNull();
  expect(texto, `badge "${rotulo}": o TEXTO não é um token do tema`).not.toBeNull();

  for (const [nome, tema] of Object.entries(TEMAS)) {
    const razao = razaoToken(tema, fundo!, texto!);
    expect(
      razao,
      `${rotulo} em "${nome}": --${fundo} × --${texto} = ${razao.toFixed(2)}:1 (limiar ${LIMIAR})`,
    ).toBeGreaterThanOrEqual(LIMIAR);
  }
}

describe('CT-69 — contraste das badges de destaque do card (4,5:1 nos 4 temas)', () => {
  it('Novo (is_new) fecha 4,5:1 nos 4 temas', () => {
    medirBadge({ is_new: true }, 'Novo');
  });

  it('Top (is_bestseller) fecha 4,5:1 nos 4 temas', () => {
    medirBadge({ is_bestseller: true }, 'Top');
  });

  it('Promo (is_on_sale) fecha 4,5:1 nos 4 temas', () => {
    medirBadge({ is_on_sale: true }, 'Promo');
  });
});

describe('CT-69 — o medidor não é vácuo (ele pega a regressão)', () => {
  it('com as classes antigas, a MESMA badge renderizada reprova na resolução de token', () => {
    render(
      <TooltipProvider>
        <CatalogProductCard product={produto({ is_new: true })} onSend={vi.fn()} />
      </TooltipProvider>
    );
    const alvo = screen.getByText('Novo');
    // O `className` que o card aplicava ANTES desta correção: fundo na paleta crua.
    alvo.className =
      'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500 text-primary-foreground';

    // Pelo caminho real da medida (elemento renderizado → classes → token):
    expect(
      parDaBadge('Novo').fundo,
      'a paleta crua do Tailwind não resolve a token — é isso que deixava este arquivo VERMELHO antes da correção',
    ).toBeNull();
  });

  it('o par cru do vermelho (--destructive × --destructive-foreground) reprova no claro e no escuro', () => {
    // É o motivo de a badge Promo não usar o par sólido do vermelho: escurecer
    // `--destructive` é mudança global de cor vetada pelo dono do produto
    // (mesmo desvio registrado em
    // `tests/contracts/contraste-aa-componentes.contract.test.ts`).
    expect(razaoToken(TEMAS.claro, 'destructive', 'destructive-foreground')).toBeLessThan(LIMIAR);
    expect(razaoToken(TEMAS.escuro, 'destructive', 'destructive-foreground')).toBeLessThan(LIMIAR);
  });
});
