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
 * Uso:
 *   node scripts/qa/medir-tipografia.cjs                 # relatorio humano
 *   node scripts/qa/medir-tipografia.cjs --json out.json # baseline versionavel
 *   node scripts/qa/medir-tipografia.cjs --check         # modo guard-rail (F6)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');
const CONFIG = path.join(ROOT, 'tailwind.config.ts');

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

function main() {
  const scale = parseScale();
  const named = Object.keys(scale);
  // so tokens de tamanho; evita text-primary / text-foreground (cores)
  const namedRe = new RegExp(`\\btext-(${named.map((n) => n.replace(/[-]/g, '\\-')).join('|')})\\b`, 'g');
  const arbRe = /\btext-\[([0-9.]+)px\]/g;

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
      const px = parseFloat(m[1]);
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
    },
    detalheViolacoes: violations,
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
  console.log('\n=== VIOLACOES ===');
  console.log(`  meia-medida (N.5px)      : ${report.violacoes.meiaMedida}`);
  console.log(`  arbitrario > 16px        : ${report.violacoes.acima16px}`);
  console.log(`  tem equivalente na escala: ${report.violacoes.comEquivalenteExato}`);
  console.log(`\n  totais: ${totalNamed} nomeados / ${totalArb} arbitrarios em ${files.length} arquivos`);

  if (process.argv.includes('--check')) {
    const budgetPath = path.join(ROOT, 'scripts/qa/tipografia-budget.json');
    if (!fs.existsSync(budgetPath)) {
      console.error('\nERRO: budget ausente. Gere com --json scripts/qa/tipografia-budget.json');
      process.exit(2);
    }
    const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
    let failed = false;
    for (const k of ['meiaMedida', 'acima16px', 'comEquivalenteExato']) {
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

main();
