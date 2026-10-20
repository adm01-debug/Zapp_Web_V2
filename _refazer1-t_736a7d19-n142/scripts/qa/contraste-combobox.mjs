#!/usr/bin/env node
// E62 — Contraste WCAG dos pares da LISTA DE SUGESTÕES do combobox de endereços
// (src/components/inbox/location-picker/SuggestionList.tsx) nos 3 temas do produto:
// claro (:root de tokens.css), escuro (.dark de tokens.css) e alto contraste
// (.high-contrast / .dark.high-contrast de accessibility.css).
//
// Pares medidos (o que o componente realmente pinta):
//   - texto secundário : --muted-foreground sobre --popover  (a lista usa `bg-popover`)
//   - <mark> (nome)    : --foreground   sobre o destaque, que é `hsl(var(--warning)/α)`
//                        composto sobre --popover (HighlightedText.tsx: bg /0.35 no claro,
//                        /0.25 no escuro)
//   - <mark> (endereço): --muted-foreground sobre o mesmo destaque composto
//
// Reusa o medidor WCAG (hslToRgb/contrast) de scripts/qa/contraste-contatos.mjs em vez de
// escrever outro — mesma régua do resto do repo.
//
// Uso: node scripts/qa/contraste-combobox.mjs [--check]   (--check: exit 1 se algum par < 4.5:1)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hslToRgb, contrast } from './contraste-contatos.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Corpo de um bloco `seletor { ... }` com chaves balanceadas. */
function bloco(css, seletor) {
  const i = css.indexOf(`${seletor} {`);
  if (i < 0) throw new Error(`bloco ${seletor} ausente`);
  let profundidade = 0;
  for (let k = css.indexOf('{', i); k < css.length; k++) {
    if (css[k] === '{') profundidade++;
    else if (css[k] === '}' && --profundidade === 0) return css.slice(i, k);
  }
  throw new Error(`bloco ${seletor} sem fechamento`);
}

/** `--token: H S% L%;` → { token: [H, S, L] }. */
function vars(texto) {
  return Object.fromEntries(
    [...texto.matchAll(/--([a-z0-9-]+):\s*([0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)%\s*;/g)]
      .map(([, nome, h, s, l]) => [nome, [Number(h), Number(s), Number(l)]]),
  );
}

/**
 * Os 3 temas da etapa (+ o alto contraste escuro, que o toggle do produto combina com `.dark`):
 * `:root` é a base comum do claro; cada tema sobrepõe os blocos que o navegador casaria.
 */
export function parseTemas(tokensCss, a11yCss) {
  const base = vars(bloco(tokensCss, ':root'));
  const dark = { ...base, ...vars(bloco(tokensCss, '.dark')) };
  const hc = { ...base, ...vars(bloco(a11yCss, '.high-contrast')) };
  const hcDark = {
    ...dark,
    ...vars(bloco(a11yCss, '.high-contrast')),
    ...vars(bloco(a11yCss, '.dark.high-contrast')),
  };
  return { claro: base, escuro: dark, altoContraste: hc, altoContrasteEscuro: hcDark };
}

/** Texto sobre o destaque `warning/α` composto sobre `popover` (como o navegador pinta). */
export function razaoMark(textoToken, tema, alpha) {
  const popover = hslToRgb(tema.popover);
  const destaque = hslToRgb(tema.warning).map((c, i) => c * alpha + popover[i] * (1 - alpha));
  return contrast(hslToRgb(tema[textoToken]), destaque);
}

/** `α` do destaque por tema — o componente usa /0.35 no claro e /0.25 quando há `.dark`. */
export function alphaDoTema(nomeTema) {
  return nomeTema === 'escuro' || nomeTema === 'altoContrasteEscuro' ? 0.25 : 0.35;
}

export function medir(temas) {
  const linhas = [];
  for (const [tema, vars] of Object.entries(temas)) {
    for (const t of ['muted-foreground', 'foreground', 'popover', 'warning']) {
      if (!vars[t]) throw new Error(`--${t} ausente (${tema})`);
    }
    const alpha = alphaDoTema(tema);
    linhas.push({
      tema,
      par: 'texto secundário (muted-foreground) sobre popover',
      ratio: contrast(hslToRgb(vars['muted-foreground']), hslToRgb(vars.popover)),
    });
    linhas.push({
      tema,
      par: 'mark nome (foreground) sobre popover',
      ratio: razaoMark('foreground', vars, alpha),
    });
    linhas.push({
      tema,
      par: 'mark endereço (muted-foreground) sobre popover',
      ratio: razaoMark('muted-foreground', vars, alpha),
    });
  }
  return linhas;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tokens = readFileSync(path.join(ROOT, 'src/styles/tokens.css'), 'utf8');
  const a11y = readFileSync(path.join(ROOT, 'src/styles/accessibility.css'), 'utf8');
  const rows = medir(parseTemas(tokens, a11y));
  console.log('| Tema | Par | Contraste | AA (4.5:1) |\n|---|---|---|---|');
  for (const r of rows) {
    console.log(`| ${r.tema} | ${r.par} | ${r.ratio.toFixed(2)}:1 | ${r.ratio >= 4.5 ? 'ok' : 'FALHA'} |`);
  }
  const fails = rows.filter((r) => r.ratio < 4.5);
  console.log(`\n${fails.length} par(es) abaixo de 4.5:1`);
  if (process.argv.includes('--check') && fails.length > 0) process.exit(1);
}
