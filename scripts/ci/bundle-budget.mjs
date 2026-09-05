#!/usr/bin/env node
// Guard do budget de bundle inicial. Le dist/index.html, soma o gzip de todo JS
// carregado no first paint (script[type=module] + link[rel=modulepreload]) e do
// CSS (link[rel=stylesheet]) e compara com performance-budget.json.
//
// Falha (exit 1) quando initial-js ou initial-css passam do maxKB. O budget e
// medido em gzip porque e o que o navegador baixa da Vercel (br/gzip).
//
// Uso: node scripts/ci/bundle-budget.mjs [--dist dist] [--budget performance-budget.json]

import { gzipSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function extractInitialAssets(html) {
  const js = new Set();
  const css = new Set();
  const tagRe = /<(script|link)\b([^>]*)>/giu;
  for (const match of html.matchAll(tagRe)) {
    const [, tag, attrs] = match;
    const attr = (name) => attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "iu"))?.[1] ?? null;
    if (tag.toLowerCase() === "script") {
      const src = attr("src");
      if (src && (attr("type") ?? "").toLowerCase() === "module") js.add(src);
      continue;
    }
    const rel = (attr("rel") ?? "").toLowerCase();
    const href = attr("href");
    // So assets do proprio dist (URL relativa a raiz); fontes/CSS externos
    // (fonts.googleapis.com) nao entram no budget do bundle.
    if (!href || !href.startsWith("/")) continue;
    if (rel === "modulepreload") js.add(href);
    if (rel === "stylesheet") css.add(href);
  }
  return { js: [...js].sort(), css: [...css].sort() };
}

export function gzipKB(buffer) {
  return gzipSync(buffer, { level: 9 }).length / 1024;
}

export function measure(distDir, html) {
  const assets = extractInitialAssets(html);
  const resolve = (href) => path.join(distDir, href.replace(/^\//u, ""));
  const size = (list) => list.map((href) => {
    const file = resolve(href);
    if (!existsSync(file)) throw new Error(`asset referenciado no index.html nao existe: ${href}`);
    return { href, kb: gzipKB(readFileSync(file)) };
  });
  const js = size(assets.js);
  const css = size(assets.css);
  const sum = (items) => items.reduce((total, item) => total + item.kb, 0);
  return { js, css, jsKB: sum(js), cssKB: sum(css) };
}

export function evaluate(result, budgets) {
  const failures = [];
  const jsMax = budgets["initial-js"]?.maxKB;
  const cssMax = budgets["initial-css"]?.maxKB;
  if (typeof jsMax === "number" && result.jsKB > jsMax) {
    failures.push(`initial-js: ${result.jsKB.toFixed(1)} KB gzip > budget ${jsMax} KB`);
  }
  if (typeof cssMax === "number" && result.cssKB > cssMax) {
    failures.push(`initial-css: ${result.cssKB.toFixed(1)} KB gzip > budget ${cssMax} KB`);
  }
  return failures;
}

function parseArgs(argv) {
  const args = { dist: "dist", budget: "performance-budget.json" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dist") args.dist = argv[++index];
    else if (argv[index] === "--budget") args.budget = argv[++index];
    else throw new Error(`Argumento desconhecido: ${argv[index]}`);
  }
  return args;
}

export function main(argv = process.argv.slice(2), root = process.cwd()) {
  const args = parseArgs(argv);
  const distDir = path.resolve(root, args.dist);
  const indexPath = path.join(distDir, "index.html");
  if (!existsSync(indexPath)) {
    console.error(`ERRO: ${indexPath} nao existe. Rode o build antes.`);
    return 2;
  }
  const budgets = JSON.parse(readFileSync(path.resolve(root, args.budget), "utf8")).budgets ?? {};
  const result = measure(distDir, readFileSync(indexPath, "utf8"));

  console.log("Bundle inicial (gzip):");
  for (const item of [...result.js].sort((a, b) => b.kb - a.kb)) {
    console.log(`  ${item.kb.toFixed(1).padStart(7)} KB  ${item.href}`);
  }
  console.log(`  JS inicial:  ${result.jsKB.toFixed(1)} KB (budget ${budgets["initial-js"]?.maxKB ?? "-"} KB, ${result.js.length} chunks)`);
  console.log(`  CSS inicial: ${result.cssKB.toFixed(1)} KB (budget ${budgets["initial-css"]?.maxKB ?? "-"} KB)`);

  const failures = evaluate(result, budgets);
  if (failures.length) {
    console.error("\nFALHA: budget de bundle estourado:");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error("Verifique imports estaticos de libs pesadas no grafo do entry (vite.config.ts codeSplitting).");
    return 1;
  }
  console.log("OK: bundle inicial dentro do budget.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main());
}
