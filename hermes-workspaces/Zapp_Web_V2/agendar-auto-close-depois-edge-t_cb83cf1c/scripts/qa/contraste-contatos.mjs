#!/usr/bin/env node
// Contraste WCAG dos pares de cor do módulo Contatos, lidos de src/styles/tokens.css
// nos dois temas (:root = claro, .dark = escuro). Fundos com alpha (`bg-x/15`) são
// compostos sobre `--card`, que é onde esses elementos aparecem.
//
// Uso: node scripts/qa/contraste-contatos.mjs [--check]   (--check: exit 1 se algum par < 4.5:1)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** [rótulo, token do texto, token do fundo, alpha do fundo sobre --card] */
export const PAIRS = [
  ['ContactCard e-mail (text-muted-foreground)', 'muted-foreground', 'card', 1],
  ['Ativo primário (text-primary-foreground on bg-primary)', 'primary-foreground', 'primary', 1],
  ['Botão sucesso (text-success-foreground on bg-success)', 'success-foreground', 'success', 1],
  ['Botão sucesso hover (text-success-foreground on bg-success/90)', 'success-foreground', 'success', 0.9],
  ['ContactForm aviso (text-foreground on bg-warning/10)', 'foreground', 'warning', 0.1],
  ...['primary', 'info', 'success', 'warning', 'destructive', 'muted-foreground'].map((bg) => [
    `ContactMapView ícone (text-foreground on bg-${bg}/15)`, 'foreground', bg, 0.15,
  ]),
];

export function parseThemes(css) {
  const block = (selector) => {
    const start = css.indexOf(`${selector} {`);
    if (start < 0) throw new Error(`bloco ${selector} ausente`);
    let depth = 0;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) return css.slice(start, i);
    }
    throw new Error(`bloco ${selector} sem fechamento`);
  };
  const vars = (text) => Object.fromEntries(
    [...text.matchAll(/--([a-z0-9-]+):\s*([0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)%\s*;/g)]
      .map(([, name, h, s, l]) => [name, [Number(h), Number(s), Number(l)]]),
  );
  const light = vars(block(':root'));
  return { claro: light, escuro: { ...light, ...vars(block('.dark')) } };
}

export function hslToRgb([h, s, l]) {
  const sat = s / 100, lig = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  return [0, 8, 4].map((n) => lig - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
}

const luminance = (rgb) => {
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contrast(fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

export function measure(themes) {
  return PAIRS.flatMap(([label, fgToken, bgToken, alpha]) =>
    Object.entries(themes).map(([theme, vars]) => {
      for (const t of [fgToken, bgToken, 'card']) if (!vars[t]) throw new Error(`--${t} ausente (${theme})`);
      const card = hslToRgb(vars.card);
      const bg = hslToRgb(vars[bgToken]).map((c, i) => c * alpha + card[i] * (1 - alpha));
      return { label, theme, ratio: contrast(hslToRgb(vars[fgToken]), bg) };
    }),
  );
}

/**
 * Etapa 65: badges de `contactTypeConfig.tsx` (receitas literais `hsl(...)` no
 * texto + `rgba(r,g,b,a)` no fundo, compostas sobre `--card`). O script lê as
 * classes do próprio arquivo — se a receita mudar de forma, `parseBadges` lança
 * em vez de medir silenciosamente o que não existe.
 */
const CONFIG_SRC = path.join(ROOT, 'src/components/contacts/contactTypeConfig.tsx');

export function parseBadges(tsx) {
  const entries = [
    ...tsx.matchAll(/(\w+):\s*\{\s*\n\s*label:\s*'([^']+)'[\s\S]*?badgeClass:\s*'([^']+)'/g),
  ].map(([, key, label, badgeClass]) => ({ key, label, badgeClass }));
  if (entries.length === 0) throw new Error('nenhum badge encontrado em contactTypeConfig.tsx');

  return entries.map(({ key, label, badgeClass }) => {
    const light = badgeClass.match(/(?:^|\s)text-\[hsl\((\d+)_(\d+)%_(\d+)%\)\]/);
    const dark = badgeClass.match(/ dark:text-\[hsl\((\d+)_(\d+)%_(\d+)%\)\]/);
    const bg = badgeClass.match(/bg-\[rgba\((\d+),(\d+),(\d+),([\d.]+)\)\]/);
    if (!light || !dark || !bg) {
      throw new Error(
        `badge ${key} sem receita esperada (texto claro+escuro e fundo rgba): ${badgeClass}`,
      );
    }
    const hsl = (m) => [Number(m[1]), Number(m[2]), Number(m[3])];
    return {
      key,
      label,
      lightText: hsl(light),
      darkText: hsl(dark),
      bgRgb: [Number(bg[1]) / 255, Number(bg[2]) / 255, Number(bg[3]) / 255],
      bgAlpha: Number(bg[4]),
    };
  });
}

export function measureBadges(themes, badges) {
  return badges.flatMap((badge) =>
    Object.entries(themes).map(([theme, vars]) => {
      const card = hslToRgb(vars.card);
      const bg = badge.bgRgb.map((c, i) => c * badge.bgAlpha + card[i] * (1 - badge.bgAlpha));
      const text = theme === 'escuro' ? badge.darkText : badge.lightText;
      return {
        label: `Badge ${badge.label} (texto sobre bg-rgba/${badge.bgAlpha * 100})`,
        theme,
        ratio: contrast(hslToRgb(text), bg),
      };
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const themes = parseThemes(readFileSync(path.join(ROOT, 'src/styles/tokens.css'), 'utf8'));
  const rows = [
    ...measure(themes),
    ...measureBadges(themes, parseBadges(readFileSync(CONFIG_SRC, 'utf8'))),
  ];
  console.log('| Par | Tema | Contraste | AA (4.5:1) |\n|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.label} | ${r.theme} | ${r.ratio.toFixed(2)}:1 | ${r.ratio >= 4.5 ? 'ok' : 'FALHA'} |`);
  const fails = rows.filter((r) => r.ratio < 4.5).length;
  console.log(`\n${fails} par(es) abaixo de 4.5:1`);
  if (process.argv.includes('--check') && fails > 0) process.exit(1);
}
