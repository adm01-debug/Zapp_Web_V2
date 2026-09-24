#!/usr/bin/env node
/**
 * Medidor de tipografia — paridade ZAPP Web V2 <-> Promo Gifts V4.
 *
 * Analise estatica: resolve font-size e line-height de cada uso de `text-*`
 * em src/, cruzando com a escala declarada em tailwind.config.ts.
 *
 * Mede line-height alem de font-size de proposito: a troca de um arbitrario
 * (`text-[12px]`, que so define font-size e herda o line-height) por uma classe
 * nomeada (`text-xs`, que define os dois) NAO e neutra. O DoD original do plano
 * so conferia tamanho e deixaria essa mudanca passar despercebida.
 *
 * F8 (24/09/2026, PLANO_AUDITORIA_FONTES_100_ETAPAS, achado A15): as 4
 * checagens abaixo fecham a zona cega que deixou passar os achados A1/A2/
 * A9/A10 sem nenhum guard reprovar — o guard original so lia `text-*` em
 * `src/**\/*.tsx`:
 *   - meia-medida e tamanho cru em CSS puro (src/styles/*.css), nao so JSX
 *   - `fontSize: N` inline em .tsx fora do tema de graficos centralizado
 *   - `font-family: 'Nome'` literal fora de `var(--font-*)`
 *   - peso de font-weight pedido no CSS fora da faixa que o Google Fonts
 *     carrega em index.html (a causa raiz do achado A1)
 * Todas seguem o mesmo padrao ratchet dos outros guards do repo
 * (lint-ratchet.mjs, typecheck-ratchet.mjs): o teto vem do budget
 * versionado, reprova so se a divida SOBE — nao exige zerar tudo de uma vez.
 *
 * Uso:
 *   node scripts/qa/medir-tipografia.cjs                 # relatorio humano
 *   node scripts/qa/medir-tipografia.cjs --json out.json # baseline versionavel
 *   node scripts/qa/medir-tipografia.cjs --check         # modo guard-rail (F6/F8)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');
const STYLES = path.join(ROOT, 'src/styles');
const CONFIG = path.join(ROOT, 'tailwind.config.ts');
const INDEX_HTML = path.join(ROOT, 'index.html');

// line-height herdado quando a classe nao declara um (preflight do Tailwind).
const INHERITED_LH_RATIO = 1.5;

function parseScale() {
  const src = fs.readFileSync(CONFIG, 'utf8');
  const block = src.match(/fontSize:\s*\{([\s\S]*?)\n      \}/);
  if (!block) throw new Error('bloco fontSize nao encontrado em tailwind.config.ts');
  const scale = {};
  const re = /["']?([a-z0-9-]+)["']?:\s*\[\s*["']([^"']+)["']\s*,\s*\{\s*lineHeight:\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(block[1]))) {
    scale[m[1]] = { fontSize: m[2], lineHeight: m[3] };
  }
  return scale;
}

const toPx = (v) => {
  if (!v) return null;
  if (v.endsWith('rem')) return parseFloat(v) * 16;
  if (v.endsWith('px')) return parseFloat(v);
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n; // unitless ratio, resolvido depois
};

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function walkCss(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkCss(p, acc);
    else if (e.name.endsWith('.css')) acc.push(p);
  }
  return acc;
}

/** src/styles/*.css: mesma regra de meia-medida do JSX (achado A10), mais
 *  font-family literal fora de var(--font-*) (achado A2/A3/A15). */
function scanCss(stylesDir = STYLES) {
  const files = fs.existsSync(stylesDir) ? walkCss(stylesDir) : [];
  const halfStep = [];
  const literalFamily = [];
  const fontSizeRe = /font-size:\s*([0-9.]+)px/g;
  const familyRe = /font-family:\s*(['"])((?:(?!\1).)+)\1/g;
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const txt = fs.readFileSync(f, 'utf8');
    let m;
    fontSizeRe.lastIndex = 0;
    while ((m = fontSizeRe.exec(txt))) {
      const px = parseFloat(m[1]);
      if (!Number.isInteger(px)) {
        const line = txt.slice(0, m.index).split('\n').length;
        halfStep.push({ where: `${rel}:${line}`, px });
      }
    }
    if (rel.endsWith('tokens.css')) continue; // declara as variaveis --font-*, nao e violacao
    familyRe.lastIndex = 0;
    while ((m = familyRe.exec(txt))) {
      const line = txt.slice(0, m.index).split('\n').length;
      literalFamily.push({ where: `${rel}:${line}`, value: m[2] });
    }
  }
  return { halfStep, literalFamily };
}

/** .tsx: fontSize numerico inline (achado A9) e fontFamily literal (achado
 *  A2/A3). Um arquivo migrado para src/lib/chart-theme.ts passa a usar
 *  identificadores (CHART_TICK_FONT_SIZE), nao numeros — some do regex
 *  sozinho, sem precisar checar import. */
function scanTsxInline(srcDir = SRC) {
  const files = walk(srcDir);
  const fontSizeInline = [];
  const literalFamily = [];
  const fontSizeRe = /fontSize:\s*([0-9.]+)\b/g;
  const familyRe = /fontFamily:\s*(['"])((?:(?!\1).)+)\1/g;
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const txt = fs.readFileSync(f, 'utf8');
    let m;
    fontSizeRe.lastIndex = 0;
    while ((m = fontSizeRe.exec(txt))) {
      const line = txt.slice(0, m.index).split('\n').length;
      fontSizeInline.push({ where: `${rel}:${line}`, px: +m[1] });
    }
    familyRe.lastIndex = 0;
    while ((m = familyRe.exec(txt))) {
      const line = txt.slice(0, m.index).split('\n').length;
      literalFamily.push({ where: `${rel}:${line}`, value: m[2] });
    }
  }
  return { fontSizeInline, literalFamily };
}

/** Faixa de peso que cada familia carrega, extraida da URL do Google Fonts
 *  em index.html. wght@min..max (variavel) vira [min,max]; wght@a;b;c
 *  (lista estatica) vira [min(lista),max(lista)]. */
function parseLoadedWeights(indexHtmlPath = INDEX_HTML) {
  if (!fs.existsSync(indexHtmlPath)) return {};
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const urlMatch = html.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^"']+/);
  if (!urlMatch) return {};
  const families = {};
  const familyRe = /family=([^&"']+)/g;
  let m;
  while ((m = familyRe.exec(urlMatch[0]))) {
    const [namePart, spec] = m[1].split(':wght@');
    const name = decodeURIComponent(namePart.replace(/\+/g, ' '));
    if (!spec) { families[name] = [400, 400]; continue; }
    const range = spec.match(/^([0-9]+)\.\.([0-9]+)$/);
    if (range) {
      families[name] = [+range[1], +range[2]];
    } else {
      const weights = spec.split(';').map(Number).filter((n) => !Number.isNaN(n));
      if (weights.length) families[name] = [Math.min(...weights), Math.max(...weights)];
    }
  }
  return families;
}

/** Achado A1: font-weight pedido no CSS "sans" (base/utilities/tokens —
 *  onde vivem as regras de peso do dark) fora da faixa que a fonte padrao
 *  (Plus Jakarta Sans) carrega. E exatamente o bug original: 450/550/650
 *  pedidos sem nenhum peso estatico cobrindo. 900 (font-black) fica fora
 *  do eixo publicado da Jakarta (max 800) por limitacao da propria fonte —
 *  vira teto no budget, nao zero, ver PR que introduziu a faixa variavel. */
function scanOrphanWeights(stylesDir = STYLES, indexHtmlPath = INDEX_HTML) {
  const loaded = parseLoadedWeights(indexHtmlPath);
  const jakarta = loaded['Plus Jakarta Sans'];
  if (!jakarta) return []; // URL ausente/formato mudou — nao quebra o guard por conta disso
  const files = ['base.css', 'utilities.css', 'tokens.css']
    .map((f) => path.join(stylesDir, f))
    .filter((f) => fs.existsSync(f));
  const orphan = [];
  const re = /font-weight:\s*([0-9]{2,3})\b/g;
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const txt = fs.readFileSync(f, 'utf8');
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(txt))) {
      const w = +m[1];
      if (w < jakarta[0] || w > jakarta[1]) {
        const line = txt.slice(0, m.index).split('\n').length;
        orphan.push({ where: `${rel}:${line}`, weight: w, faixaCarregada: jakarta });
      }
    }
  }
  return orphan;
}

function main() {
  const scale = parseScale();
  const named = Object.keys(scale);
  // so tokens de tamanho; evita text-primary / text-foreground (cores)
  const namedRe = new RegExp(`\\btext-(${named.map((n) => n.replace(/[-]/g, '\\-')).join('|')})\\b`, 'g');
  const arbRe = /\btext-\[([0-9.]+)(px|rem|em)\]/g;

  const files = walk(SRC);
  const usage = { named: {}, arbitrary: {} };
  const byFile = {};
  const violations = { halfStep: [], above16: [], hasExactEquivalent: [] };

  // px -> classe nomeada equivalente exata
  const pxToNamed = {};
  for (const [k, v] of Object.entries(scale)) {
    const px = toPx(v.fontSize);
    if (px != null && pxToNamed[px] === undefined) pxToNamed[px] = k;
  }

  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const txt = fs.readFileSync(f, 'utf8');
    let m;
    namedRe.lastIndex = 0;
    while ((m = namedRe.exec(txt))) {
      usage.named[m[1]] = (usage.named[m[1]] || 0) + 1;
      (byFile[rel] ||= { named: 0, arbitrary: 0 }).named++;
    }
    arbRe.lastIndex = 0;
    while ((m = arbRe.exec(txt))) {
      const raw = parseFloat(m[1]);
      const px = m[2] === 'px' ? raw : raw * 16; // rem/em: 1 unidade = 16px (raiz do documento)
      usage.arbitrary[px] = (usage.arbitrary[px] || 0) + 1;
      (byFile[rel] ||= { named: 0, arbitrary: 0 }).arbitrary++;
      const line = txt.slice(0, m.index).split('\n').length;
      const where = `${rel}:${line}`;
      if (!Number.isInteger(px)) violations.halfStep.push({ where, px });
      if (px > 16) violations.above16.push({ where, px });
      if (pxToNamed[px] !== undefined) {
        violations.hasExactEquivalent.push({ where, px, equivalent: `text-${pxToNamed[px]}` });
      }
    }
  }

  const resolved = {};
  for (const [k, v] of Object.entries(scale)) {
    const fsPx = toPx(v.fontSize);
    const lhRaw = v.lineHeight;
    // line-height sem unidade e razao: resolve multiplicando pelo font-size
    const unitless = !/rem|px|em|%/.test(lhRaw);
    const lhPx = unitless ? +(fsPx * parseFloat(lhRaw)).toFixed(2) : toPx(lhRaw);
    resolved[k] = { fontSizePx: fsPx, lineHeightPx: lhPx, lineHeightDeclarado: lhRaw, usos: usage.named[k] || 0 };
  }
  const arbitraryResolved = {};
  for (const [px, n] of Object.entries(usage.arbitrary)) {
    arbitraryResolved[px] = {
      fontSizePx: +px,
      lineHeightPx: +(px * INHERITED_LH_RATIO).toFixed(2),
      lineHeightOrigem: 'herdado (preflight 1.5)',
      usos: n,
      equivalenteNaEscala: pxToNamed[px] ? `text-${pxToNamed[px]}` : null,
    };
  }

  const totalArb = Object.values(usage.arbitrary).reduce((a, b) => a + b, 0);
  const totalNamed = Object.values(usage.named).reduce((a, b) => a + b, 0);

  // F8 — zona cega fora de text-* em .tsx (achados A1/A2/A9/A10/A15).
  const css = scanCss();
  const tsxInline = scanTsxInline();
  const orphanWeights = scanOrphanWeights();

  const report = {
    geradoEm: new Date().toISOString(),
    commit: process.env.GIT_SHA || null,
    escala: resolved,
    arbitrarios: arbitraryResolved,
    totais: {
      usosNomeados: totalNamed,
      usosArbitrarios: totalArb,
      arquivosAnalisados: files.length,
    },
    violacoes: {
      meiaMedida: violations.halfStep.length,
      acima16px: violations.above16.length,
      comEquivalenteExato: violations.hasExactEquivalent.length,
      cssMeiaMedida: css.halfStep.length,
      cssFontFamilyLiteral: css.literalFamily.length,
      tsxFontSizeInline: tsxInline.fontSizeInline.length,
      tsxFontFamilyLiteral: tsxInline.literalFamily.length,
      pesoOrfao: orphanWeights.length,
    },
    detalheViolacoes: {
      ...violations,
      cssMeiaMedida: css.halfStep,
      cssFontFamilyLiteral: css.literalFamily,
      tsxFontSizeInline: tsxInline.fontSizeInline,
      tsxFontFamilyLiteral: tsxInline.literalFamily,
      pesoOrfao: orphanWeights,
    },
  };

  const jsonIdx = process.argv.indexOf('--json');
  if (jsonIdx > -1 && process.argv[jsonIdx + 1]) {
    const out = path.resolve(ROOT, process.argv[jsonIdx + 1]);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    console.log(`baseline gravado: ${path.relative(ROOT, out)}`);
  }

  console.log('=== ESCALA (tailwind.config.ts) ===');
  for (const [k, v] of Object.entries(resolved)) {
    console.log(`  text-${k.padEnd(6)} ${String(v.fontSizePx).padStart(5)}px / lh ${String(v.lineHeightPx).padStart(5)}px   usos: ${v.usos}`);
  }
  console.log('\n=== ARBITRARIOS ===');
  Object.entries(arbitraryResolved)
    .sort((a, b) => b[1].usos - a[1].usos)
    .forEach(([px, v]) => {
      const eq = v.equivalenteNaEscala ? `  -> ${v.equivalenteNaEscala}` : '';
      console.log(`  text-[${px}px]`.padEnd(18) + `usos: ${String(v.usos).padStart(4)}  lh herdado ${v.lineHeightPx}px${eq}`);
    });
  console.log('\n=== VIOLACOES (src/**/*.tsx, text-*) ===');
  console.log(`  meia-medida (N.5px)      : ${report.violacoes.meiaMedida}`);
  console.log(`  arbitrario > 16px        : ${report.violacoes.acima16px}`);
  console.log(`  tem equivalente na escala: ${report.violacoes.comEquivalenteExato}`);
  console.log('\n=== VIOLACOES (F8 — CSS puro, inline, pesos) ===');
  console.log(`  CSS meia-medida           : ${report.violacoes.cssMeiaMedida}`);
  console.log(`  CSS font-family literal   : ${report.violacoes.cssFontFamilyLiteral}`);
  console.log(`  tsx fontSize inline       : ${report.violacoes.tsxFontSizeInline}`);
  console.log(`  tsx fontFamily literal    : ${report.violacoes.tsxFontFamilyLiteral}`);
  console.log(`  peso orfao (fora do eixo) : ${report.violacoes.pesoOrfao}`);
  console.log(`\n  totais: ${totalNamed} nomeados / ${totalArb} arbitrarios em ${files.length} arquivos`);

  if (process.argv.includes('--check')) {
    const budgetPath = path.join(ROOT, 'scripts/qa/tipografia-budget.json');
    if (!fs.existsSync(budgetPath)) {
      console.error('\nERRO: budget ausente. Gere com --json scripts/qa/tipografia-budget.json');
      process.exit(2);
    }
    const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
    let failed = false;
    const checked = [
      'meiaMedida', 'acima16px', 'comEquivalenteExato',
      'cssMeiaMedida', 'cssFontFamilyLiteral',
      'tsxFontSizeInline', 'tsxFontFamilyLiteral',
      'pesoOrfao',
    ];
    for (const k of checked) {
      const atual = report.violacoes[k];
      const teto = budget.violacoes[k];
      const ok = atual <= teto;
      console.log(`  ${ok ? 'OK  ' : 'FALHA'} ${k}: ${atual} (teto ${teto})`);
      if (!ok) failed = true;
    }
    if (failed) { console.error('\nguard-rail de tipografia reprovado: a divida subiu.'); process.exit(1); }
    console.log('\nguard-rail de tipografia aprovado.');
  }
}

module.exports = { parseScale, toPx, walk, walkCss, scanCss, scanTsxInline, parseLoadedWeights, scanOrphanWeights, main };

if (require.main === module) main();
