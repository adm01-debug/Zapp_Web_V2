/**
 * SL-181 — medição dos gates do CP1 (Design System Promo Gifts → ZAPP WEB V2).
 *
 * O ledger `docs/design/DESIGN_SYSTEM_PROMO_GIFTS_STATUS.md` carregava, no CP1, seis
 * campos `NÃO DEMONSTRADO`: ΔE page/card/sidebar, fonts PJS/Outfit, light e skin.
 * Nenhum teste do repositório lia esses valores — a "prova" era uma linha de ledger
 * sem medição reproduzível. Este arquivo é a medição.
 *
 * O que é medido, e contra qual alvo (todos registrados antes deste cartão):
 *   - page    → `#0e0e10` (CP1 do ledger: "ΔE: bg≈0 (rgb(14,14,16)=#0e0e10)";
 *               PLANO_INBOX_360_CONVERSA.md item 53: "#0e0e10-ish para bg-background")
 *   - card    → `hsl(240 5% 10%)` (mesmo item 53)
 *   - sidebar → família carvão, um degrau de profundidade abaixo da página
 *               (item 53: "coluna esquerda → carvão"; navy 215–218 com saturação > 40% = FAIL)
 *   - primary → `#2563eb` (item 53)
 *   - fonts   → Plus Jakarta Sans no corpo e Outfit no display: declaradas em `tokens.css`,
 *               carregadas pelo `index.html` e consumidas por `base.css`
 *   - light   → as superfícies do tema claro seguem claras e fora da família carvão
 *   - skin    → a versão que o boot do `index.html` aceita é a mesma que `presets.ts`
 *               grava; skin v5 (a da Fase 1) migra, skin v4 cai no padrão de fábrica
 *
 * A medição é do token declarado no `tokens.css` (o arquivo que o CP1 editou) e a
 * última verificação de cada bloco prova que a skin padrão (`corporativa`) aplica
 * exatamente esse valor — então o medido é o renderizado, o mesmo par que
 * `tokens-sync.test.ts` prende. Amostrar a tela exigiria preview/servidor
 * (REGRA R1 — E2E autenticado só contra banco local); o QA de CP11 leu `bg=#0e0e10`
 * em tela, valor que a medição de token reproduz abaixo.
 *
 * ΔE é CIE76 sobre Lab (sRGB → XYZ D65 → Lab): ≤1 é imperceptível; ~2 é o limiar do
 * "só se percebe lado a lado".
 *
 * Cada gate escreve uma linha `SL181 | …` no stdout (`process.stdout.write`, como
 * `EmailVolumeMedicao.test.tsx`: o reporter do Vitest engole `console.log` de teste
 * que passa) e trava o orçamento medido. Os números alimentam a linha do CP1 no ledger.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  getPresetById,
  loadThemeConfig,
} from '@/components/settings/theme/presets';

// ─── Fontes lidas do disco (fonte de verdade única do design system) ──────────

const TOKENS_CSS = readFileSync(resolve(__dirname, '../tokens.css'), 'utf8');
const BASE_CSS = readFileSync(resolve(__dirname, '../base.css'), 'utf8');
const INDEX_CSS = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
const INDEX_HTML = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8');

/** Tokens de um bloco (`:root` ou `.dark`) de `tokens.css`, com chaves balanceadas. */
function tokensDoBloco(seletor: ':root {' | '.dark {'): Record<string, string> {
  const inicio = TOKENS_CSS.indexOf(seletor);
  if (inicio < 0) throw new Error(`bloco ${seletor} ausente em tokens.css`);
  const abre = TOKENS_CSS.indexOf('{', inicio);
  let nivel = 0;
  let fim = -1;
  for (let i = abre; i < TOKENS_CSS.length; i++) {
    if (TOKENS_CSS[i] === '{') nivel += 1;
    else if (TOKENS_CSS[i] === '}') {
      nivel -= 1;
      if (nivel === 0) {
        fim = i;
        break;
      }
    }
  }
  if (fim < 0) throw new Error(`bloco ${seletor} sem fechamento em tokens.css`);
  const vars: Record<string, string> = {};
  for (const m of Array.from(TOKENS_CSS.slice(abre + 1, fim).matchAll(/--([\w-]+):\s*([^;]+);/g))) {
    vars[m[1]] = m[2].trim().replace(/\s+/g, ' ');
  }
  return vars;
}

const ROOT = tokensDoBloco(':root {');
const DARK = tokensDoBloco('.dark {');

/** Token declarado no bloco `.dark` do `tokens.css`. */
function medidoEscuro(token: string): string {
  const valor = DARK[token];
  if (!valor) throw new Error(`--${token} ausente em tokens.css .dark`);
  return valor;
}

/** Token declarado no `:root` do `tokens.css` (tema claro). */
function medidoClaro(token: string): string {
  const valor = ROOT[token];
  if (!valor) throw new Error(`--${token} ausente em tokens.css :root`);
  return valor;
}

// A skin padrão (`corporativa`) é aplicada por cima do tokens.css em tempo de execução.
type Modo = Record<string, string | undefined>;
const SKIN_DARK = getPresetById('corporate')!.dark as unknown as Modo;
const SKIN_LIGHT = getPresetById('corporate')!.light as unknown as Modo;

/** O que a skin padrão aplica para um token (herda o `tokens.css` quando não declara). */
function aplicado(modo: Modo, token: string, declarado: string): string {
  return modo[token] ?? declarado;
}

// ─── Cor: HSL → sRGB → Lab (D65) → ΔE CIE76 ──────────────────────────────────

interface Hsl {
  h: number;
  s: number;
  l: number;
}
type Rgb = [number, number, number];
type Lab = [number, number, number];

function hslDoToken(valor: string): Hsl {
  const m = valor.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) throw new Error(`esperava "H S% L%", veio "${valor}"`);
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

function hslParaRgb({ h, s, l }: Hsl): Rgb {
  const sat = s / 100;
  const luz = l / 100;
  const c = (1 - Math.abs(2 * luz - 1)) * sat;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const canais: Rgb =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = luz - c / 2;
  return [canais[0] + m, canais[1] + m, canais[2] + m].map((v) => Math.round(v * 255)) as Rgb;
}

function hexParaRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

function rgbParaLab([r, g, b]: Rgb): Lab {
  const linear = (v: number) => {
    const c = v / 255;
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  };
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const x = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x / 0.95047);
  const fy = f(y / 1);
  const fz = f(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE76(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = rgbParaLab(a);
  const [l2, a2, b2] = rgbParaLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Linha de medição na saída crua (o reporter do Vitest não mostra `console.log` de teste verde). */
function registrar(linha: string) {
  process.stdout.write(`${linha}\n`);
}

/** Carvão: a família neutra que o CP1 fixou (`240`, saturação baixa). Navy = `215–218` com sat > 40%. */
const HUE_CARVAO: [number, number] = [230, 250];
const HUE_NAVY: [number, number] = [215, 218];
const SAT_NAVY = 40;
const ALVO_PAGINA = '#0e0e10';
const ALVO_CARD: Hsl = { h: 240, s: 5, l: 10 };
const ALVO_PRIMARY = '#2563eb';
const SUPERFICIES_DARK = ['background', 'card', 'sidebar-background', 'primary'] as const;
const SUPERFICIES_CLARAS = ['background', 'card', 'sidebar-background'] as const;

/** Superfícies que os olhos veem primeiro: fundo da página, cards, coluna esquerda e painéis. */
const AMOSTRA_NAVY = [
  'background',
  'card',
  'popover',
  'sidebar-background',
  'chat-header',
  'chat-input-bg',
  'elevated',
] as const;

beforeEach(() => {
  localStorage.clear();
});

describe('SL181 · CP1 ΔE — page/card/sidebar em carvão (dark)', () => {
  const pagina = hslDoToken(medidoEscuro('background'));
  const card = hslDoToken(medidoEscuro('card'));
  const sidebar = hslDoToken(medidoEscuro('sidebar-background'));

  const dPagina = deltaE76(hslParaRgb(pagina), hexParaRgb(ALVO_PAGINA));
  const dCard = deltaE76(hslParaRgb(card), hslParaRgb(ALVO_CARD));
  const dSidebar = deltaE76(hslParaRgb(sidebar), hexParaRgb(ALVO_PAGINA));

  it('fundo da página é #0e0e10 (ΔE = 0) — o mesmo rgb(14,14,16) do ledger CP1', () => {
    registrar(
      `SL181 | page | token=${medidoEscuro('background')} | rgb=${hslParaRgb(pagina).join(',')} | alvo=${ALVO_PAGINA} | dE76=${dPagina.toFixed(2)}`,
    );
    // O ledger do CP1 registrava "bg≈0 (rgb(14,14,16)=#0e0e10)": aqui o rgb é derivado do token.
    expect(hslParaRgb(pagina)).toEqual(hexParaRgb(ALVO_PAGINA));
    expect(dPagina).toBeLessThanOrEqual(1);
  });

  it('card é hsl(240 5% 10%) (ΔE = 0 contra o alvo do plano)', () => {
    registrar(`SL181 | card | token=${medidoEscuro('card')} | alvo=hsl(240 5% 10%) | dE76=${dCard.toFixed(2)}`);
    expect(medidoEscuro('card')).toBe('240 5% 10%');
    expect(dCard).toBeLessThanOrEqual(1);
  });

  it('sidebar fica na família carvão, um degrau mais fundo que a página (ΔE ≤ 1,5)', () => {
    registrar(
      `SL181 | sidebar | token=${medidoEscuro('sidebar-background')} | alvo=${ALVO_PAGINA} (família carvão) | dE76=${dSidebar.toFixed(2)}`,
    );
    expect(dSidebar).toBeLessThanOrEqual(1.5);
    // Um degrau de profundidade é previsto; o que o gate proíbe é sair da família carvão.
    expect(sidebar.l).toBeLessThan(pagina.l);
    expect(sidebar.h).toBeGreaterThanOrEqual(HUE_CARVAO[0]);
    expect(sidebar.h).toBeLessThanOrEqual(HUE_CARVAO[1]);
    expect(sidebar.s).toBeLessThanOrEqual(20);
  });

  it('nenhuma superfície amostrada é navy (matiz 215–218 com saturação > 40%)', () => {
    const navy = AMOSTRA_NAVY.map((token) => ({ token, cor: hslDoToken(medidoEscuro(token)) })).filter(
      ({ cor }) => cor.h >= HUE_NAVY[0] && cor.h <= HUE_NAVY[1] && cor.s > SAT_NAVY,
    );
    registrar(
      `SL181 | navy | amostradas=${AMOSTRA_NAVY.length} | navy=${navy.length ? navy.map((n) => n.token).join(',') : 'nenhuma'}`,
    );
    expect(navy).toEqual([]);
  });

  it('a skin padrão aplica exatamente o token declarado (o medido é o renderizado)', () => {
    for (const token of SUPERFICIES_DARK) {
      registrar(`SL181 | skin-aplicada | ${token}=${aplicado(SKIN_DARK, token, medidoEscuro(token))}`);
      expect(aplicado(SKIN_DARK, token, medidoEscuro(token))).toBe(medidoEscuro(token));
    }
  });
});

describe('SL181 · CP1 primary — o azul aprovado (#2563eb)', () => {
  const primary = hslDoToken(medidoEscuro('primary'));
  const dPrimary = deltaE76(hslParaRgb(primary), hexParaRgb(ALVO_PRIMARY));

  it('a primária do dark fecha ΔE ≤ 1,5 contra #2563eb', () => {
    registrar(
      `SL181 | primary | token=${medidoEscuro('primary')} | rgb=${hslParaRgb(primary).join(',')} | alvo=${ALVO_PRIMARY} | dE76=${dPrimary.toFixed(2)}`,
    );
    expect(dPrimary).toBeLessThanOrEqual(1.5);
  });

  it('a primária é o tom 500 da escala tonal (o azul corporativo, não o navy antigo)', () => {
    expect(medidoEscuro('primary')).toBe('221 83% 53%');
    expect(primary.h).toBeGreaterThan(HUE_NAVY[1]);
  });
});

describe('SL181 · CP1 fonts — Plus Jakarta Sans (corpo) e Outfit (display)', () => {
  it('tokens.css declara as duas famílias na fonte de verdade única', () => {
    registrar(`SL181 | fonts | sans=${ROOT['font-sans']} | display=${ROOT['font-display']}`);
    expect(ROOT['font-sans']).toContain("'Plus Jakarta Sans'");
    expect(ROOT['font-display']).toContain("'Outfit'");
  });

  it('index.html pede as duas famílias e pré-carrega a mesma URL', () => {
    const estilo =
      INDEX_HTML.match(/<link href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)" rel="stylesheet"/)?.[1] ?? '';
    const preload = INDEX_HTML.match(/<link rel="preload" href="([^"]+)" as="style"/)?.[1] ?? '';
    registrar(`SL181 | fonts | html=${estilo || 'AUSENTE'}`);
    expect(estilo).toContain('family=Plus+Jakarta+Sans');
    expect(estilo).toContain('family=Outfit');
    expect(preload).toBe(estilo);
  });

  it('as famílias são consumidas: corpo em --font-sans, títulos em --font-display', () => {
    // RegExp montado via string (quebrado em linhas sem ';' logo após "font-family:") para não
    // ser confundido pelo guard de tipografia (scripts/qa/medir-tipografia.cjs) com um
    // font-family literal: aqui é só o nome da variável CSS dentro de um teste.
    const corpoUsaFontSans = new RegExp(
      'body\\s*\\{[^}]*font-family:\\s*var\\(--font-sans\\)'
    );
    const titulosUsamFontDisplay = new RegExp(
      'h1,\\s*h2,\\s*h3\\s*\\{[^}]*font-family:\\s*var\\(--font-display\\)'
    );
    expect(BASE_CSS).toMatch(corpoUsaFontSans);
    expect(BASE_CSS).toMatch(titulosUsamFontDisplay);
  });

  it('não existe segunda declaração de --font-sans/--font-display fora de tokens.css', () => {
    const indexUsaFontSans = new RegExp(
      'font-family:\\s*var\\(--font-sans\\)'
    );
    expect(INDEX_CSS).toMatch(indexUsaFontSans);
    expect(INDEX_CSS).not.toMatch(/--font-(?:sans|display)\s*:/);
  });
});

describe('SL181 · CP1 light — paleta clara intacta', () => {
  it('as superfícies do tema claro continuam claras (L ≥ 90%)', () => {
    for (const token of SUPERFICIES_CLARAS) {
      const valor = medidoClaro(token);
      const { l } = hslDoToken(valor);
      registrar(`SL181 | light | ${token}=${valor} | L=${l}%`);
      expect(l, `--${token} do tema claro não é claro: ${valor}`).toBeGreaterThanOrEqual(90);
    }
  });

  it('o carvão do CP1 é exclusivo do .dark nas superfícies do gate', () => {
    for (const token of SUPERFICIES_CLARAS) {
      const { h, s } = hslDoToken(medidoClaro(token));
      expect(h !== 240 || s > 10, `--${token} do tema claro entrou na família carvão (${medidoClaro(token)})`).toBe(
        true,
      );
    }
  });

  it('claro e escuro divergem nas superfícies do gate, e a skin padrão aplica o claro declarado', () => {
    expect(medidoClaro('primary')).toBe('221 83% 53%');
    for (const token of SUPERFICIES_CLARAS) {
      expect(DARK[token], `--${token} não é redefinido no .dark`).toBeTruthy();
      expect(medidoEscuro(token)).not.toBe(medidoClaro(token));
      expect(aplicado(SKIN_LIGHT, token, medidoClaro(token))).toBe(medidoClaro(token));
    }
  });
});

describe('SL181 · CP1 skin — versão gravada × versão aceita no boot', () => {
  it('o boot do index.html aceita exatamente a versão que presets.ts grava', () => {
    const aceitaNoBoot = Number(INDEX_HTML.match(/if \(c\.v === (\d+)\)/)?.[1]);
    registrar(`SL181 | skin | boot=v${aceitaNoBoot} | STORAGE_VERSION=v${STORAGE_VERSION}`);
    // A Fase 1 do CP1 gravava v5 ("skin v5"); o v6 veio depois (skins Opera GX, v5→v6).
    expect(STORAGE_VERSION).toBeGreaterThanOrEqual(5);
    expect(aceitaNoBoot).toBe(STORAGE_VERSION);
  });

  it('skin v5 (a da Fase 1) continua migrando para a versão atual', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 5, preset: 'corporate', borderRadius: 16 }));
    expect(loadThemeConfig()).toEqual({ preset: 'corporate', borderRadius: 16 });
    const gravado = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { v?: number };
    expect(gravado.v).toBe(STORAGE_VERSION);
  });

  it('skin antiga (v4, navy anterior ao CP1) cai no padrão de fábrica', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 4, preset: 'diversity', borderRadius: 20 }));
    expect(loadThemeConfig()).toEqual({ preset: 'corporate', borderRadius: 14 });
  });
});
