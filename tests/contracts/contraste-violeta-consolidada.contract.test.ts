import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guarda do violeta CONSOLIDADO (cartao t_290f3cdc).
 *
 * Liga a prova ao que os componentes REALMENTE aplicam: le a classe do
 * fonte do componente (ou a regra CSS real) e mede o WCAG 2.1 com os tokens
 * de `src/styles/tokens.css`. Nada de medir um literal copiado a mao.
 */
const raiz = path.resolve(__dirname, '../..');
const ler = (rel: string) => fs.readFileSync(path.join(raiz, rel), 'utf8');

interface Token { h: number; s: number; l: number }
const CSS = ler('src/styles/tokens.css');

function bloco(css: string, cabecalho: string): Record<string, Token> {
  const i0 = css.indexOf(cabecalho);
  let i = css.indexOf('{', i0) + 1;
  let p = 1;
  while (p > 0 && i < css.length) {
    if (css[i] === '{') p++;
    else if (css[i] === '}') p--;
    i++;
  }
  const vars: Record<string, Token> = {};
  for (const linha of css.slice(css.indexOf('{', i0) + 1, i - 1).split(';')) {
    const m = linha.match(/(--[a-z0-9-]+)\s*:\s*(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
    if (m) vars[m[1].slice(2)] = { h: +m[2], s: +m[3], l: +m[4] };
  }
  return vars;
}
const CLARO = bloco(CSS, ':root {');
const ESCURO = { ...CLARO, ...bloco(CSS, '.dark {') };
const ACESS = ler('src/styles/accessibility.css');
const TEMAS = {
  claro: CLARO,
  escuro: ESCURO,
  'claro+alto contraste': { ...CLARO, ...bloco(ACESS, '.high-contrast {') },
  'escuro+alto contraste': { ...ESCURO, ...bloco(ACESS, '.dark.high-contrast {') },
};

type RGB = [number, number, number];
function rgbDe(T: Record<string, Token>, nome: string): RGB {
  const t = T[nome];
  if (!t) throw new Error(`token --${nome} nao existe em tokens.css`);
  const s = t.s / 100, l = t.l / 100, c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((t.h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (t.h < 60) [r, g, b] = [c, x, 0];
  else if (t.h < 120) [r, g, b] = [x, c, 0];
  else if (t.h < 180) [r, g, b] = [0, c, x];
  else if (t.h < 240) [r, g, b] = [0, x, c];
  else if (t.h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
const lum = ([r, g, b]: RGB) =>
  0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
function f(v: number) { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const razao = (a: RGB, b: RGB) => {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const compor = (fg: RGB, bg: RGB, a: number): RGB =>
  [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];

// ── classes que os componentes aplicam (lidas do fonte real) ──
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
function fonteSrc(): string[] {
  return (fs.readdirSync(path.join(raiz, 'src'), { recursive: true }) as string[])
    .filter((f) => /\.(ts|tsx|css)$/.test(f))
    .map((f) => path.join('src', f).split(path.sep).join('/'));
}

const DASH = ler('src/components/dashboard/overview/DashboardCard.tsx');
const pillBloco = DASH.slice(DASH.indexOf('const pillTone'), DASH.indexOf('} as const;', DASH.indexOf('const pillTone')));
const pillVioleta = pillBloco.match(/violet:\s*'([^']+)'/)?.[1] ?? '';
const CONTATOS = ler('src/components/contacts/contactTypeConfig.tsx');
const fornecedorBloco = CONTATOS.slice(CONTATOS.indexOf('fornecedor:'));
const badgeFornecedor = fornecedorBloco.match(/badgeClass:\s*'([^']+)'/)?.[1] ?? '';
const regraNovidade = ler('src/styles/components.css').match(/\.catalog-badge--new\s*\{([^}]*)\}/)?.[1] ?? '';
const kitClasse = ler('src/components/catalog/CatalogProductCard.tsx').match(/bg-violeta\s+text-violeta-foreground/)?.[0] ?? '';

const tintaDe = (c: string) => {
  const m = c.match(/bg-([a-z][a-z-]*)\/(\d+)/);
  if (!m) throw new Error(`sem tinta de fundo em: ${c}`);
  return { token: m[1], alfa: +m[2] / 100 };
};
const textoDe = (c: string) => {
  const m = c.match(/text-\[hsl\(var\(--([a-z-]+)\)\)\]/);
  if (!m) throw new Error(`sem par de texto em: ${c}`);
  return m[1];
};

describe('violeta consolidado — um token fora do Talk X (t_290f3cdc)', () => {
  it('nenhum consumidor fora do Talk X usa badge-new/dash-tile-violet/dash-violet', () => {
    const restos: string[] = [];
    for (const f of fonteSrc()) {
      if (f === 'src/styles/tokens.css') continue;
      if (f.startsWith('src/components/talkx/')) continue;
      if (/\b(badge-new|dash-tile-violet|dash-violet)\b/.test(semComentarios(ler(f)))) restos.push(f);
    }
    expect(restos).toEqual([]);
  });

  it('`--badge-new` saiu do tokens.css', () => {
    expect(CSS).not.toMatch(/--badge-new\s*:/);
  });

  it('os consumidores aplicam mesmo o par --violeta/--violeta-text', () => {
    expect(pillVioleta).toContain('bg-violeta/');
    expect(textoDe(pillVioleta)).toBe('violeta-text');
    expect(textoDe(badgeFornecedor)).toBe('violeta-text');
    expect(tintaDe(badgeFornecedor).token).toBe('violeta');
    expect(regraNovidade).toContain('hsl(var(--violeta) / 0.15)');
    expect(regraNovidade).toContain('hsl(var(--violeta-text))');
    expect(kitClasse).toBe('bg-violeta text-violeta-foreground');
    const KPI = ler('src/components/dashboard/overview/DashboardKpiCard.tsx');
    expect(KPI).toContain("violet: 'bg-violeta',");
    expect(KPI).toContain("violet: 'hsl(var(--violeta))',");
    // o Catálogo não tem mais HSL cru (268°)
    expect(semComentarios(ler('src/styles/components.css'))).not.toMatch(/hsl\(\s*268/);
  });
});

describe('violeta consolidado — AA nos usos reais (claro e escuro)', () => {
  for (const tema of Object.keys(TEMAS) as (keyof typeof TEMAS)[]) {
    const T = TEMAS[tema];
    it(`${tema}: badge "Novidade" do Catálogo (--violeta-text sobre --violeta/15)`, () => {
      const bg = regraNovidade.match(/background:\s*hsl\(var\(--([a-z-]+)\)\s*\/\s*([\d.]+)\)/)!;
      const txt = regraNovidade.match(/color:\s*hsl\(var\(--([a-z-]+)\)\)/)!;
      const fundo = compor(rgbDe(T, bg[1]), rgbDe(T, 'card'), +bg[2]);
      expect(razao(rgbDe(T, txt[1]), fundo)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${tema}: badge do Kit do Catálogo (--violeta-foreground sobre --violeta)`, () => {
      expect(razao(rgbDe(T, 'violeta-foreground'), rgbDe(T, 'violeta'))).toBeGreaterThanOrEqual(4.5);
    });

    it(`${tema}: pill violeta do Dashboard (texto sobre a tinta)`, () => {
      const { token, alfa } = tintaDe(pillVioleta);
      const fundo = compor(rgbDe(T, token), rgbDe(T, 'card'), alfa);
      expect(razao(rgbDe(T, textoDe(pillVioleta)), fundo)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${tema}: badge de conta Fornecedor (texto sobre a tinta)`, () => {
      const { token, alfa } = tintaDe(badgeFornecedor);
      const fundo = compor(rgbDe(T, token), rgbDe(T, 'card'), alfa);
      expect(razao(rgbDe(T, textoDe(badgeFornecedor)), fundo)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${tema}: tinta violeta do KPI/gráfico fecha 3:1 sobre o card`, () => {
      expect(razao(rgbDe(T, 'violeta'), rgbDe(T, 'card'))).toBeGreaterThanOrEqual(3);
    });
  }
});


describe('violeta — tiles solidos pareiam fill/foreground (t_290f3cdc)', () => {
  it('os tiles --violeta usam text-violeta-foreground (nao text-white)', () => {
    expect(DASH).toContain("tileColor === 'violet' ? 'text-violeta-foreground'");
    expect(DASH).toContain("bg === 'bg-violeta' ? 'text-violeta-foreground'");
    expect(ler('src/components/dashboard/AIQuickAccess.tsx')).toContain("feature.id === 'transcription' ? 'text-violeta-foreground'");
    expect(ler('src/components/dashboard/overview/NowPanel.tsx')).toContain("row.tile === 'bg-violeta' ? 'text-violeta-foreground'");
    expect(ler('src/components/dashboard/ScheduledReportsManager.tsx')).toContain("TYPE_TILES[cfg.report_type] === 'bg-violeta' ? 'text-violeta-foreground'");
    expect(ler('src/components/integrations/IntegrationsHub.tsx')).toContain("foreground: 'text-violeta-foreground'");
  });
});
