/**
 * Cartão t_d9a31c1f — contraste WCAG AA do par oficial `--violeta` / `--violeta-foreground`
 * nos 2 usos reais fora do Talk X (badge "Novidade" do Catálogo e tiles do Dashboard),
 * nos temas claro e escuro. Lê os valores de `tokens.css` e recalcula a luminância relativa
 * (WCAG 2.x), então o teste quebra se alguém mexer num dos tokens e o par deixar de fechar AA.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve(__dirname, '../tokens.css'), 'utf8');

function extractBlock(header: string): Record<string, string> {
  const idx = css.indexOf(header);
  if (idx === -1) return {};
  const start = css.indexOf('{', idx);
  let depth = 1;
  let i = start + 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  const body = css.slice(start + 1, i - 1).replace(/\/\*[\s\S]*?\*\//g, '');
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

/** "265 80% 50%" -> [r,g,b] em 0..1 */
function hslToRgb(triplet: string): [number, number, number] {
  const m = triplet.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!m) throw new Error(`HSL inválido: ${triplet}`);
  const h = Number(m[1]);
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: string, bg: string): number {
  const a = luminance(hslToRgb(fg));
  const b = luminance(hslToRgb(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const themes = { claro: extractBlock(':root'), escuro: extractBlock('.dark') } as const;

// Badge (text-[9px] bold = texto pequeno) e ícone/iniciais dos tiles (w-4..w-7 = componente gráfico).
const USOS = [
  { uso: 'Catálogo — badge Novidade/Kit', limiar: 4.5 },
  { uso: 'Dashboard — tiles', limiar: 3 },
] as const;

describe('violeta oficial — contraste WCAG AA (t_d9a31c1f)', () => {
  for (const tema of ['claro', 'escuro'] as const) {
    for (const { uso, limiar } of USOS) {
      it(`${uso} / tema ${tema}: --violeta-foreground sobre --violeta >= ${limiar}:1`, () => {
        const vars = themes[tema];
        expect(vars['violeta']).toBeTruthy();
        expect(vars['violeta-foreground']).toBeTruthy();
        const ratio = contrast(vars['violeta-foreground'], vars['violeta']);
        expect(ratio).toBeGreaterThanOrEqual(limiar);
      });
    }
  }

  it('o cálculo reproduz os extremos conhecidos (preto/branco = 21:1)', () => {
    expect(contrast('0 0% 100%', '0 0% 0%')).toBeCloseTo(21, 5);
  });
});
