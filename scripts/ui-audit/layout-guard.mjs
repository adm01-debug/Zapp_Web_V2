#!/usr/bin/env node
/**
 * layout-guard.mjs — Etapa 27
 *
 * Audits view root components for layout anti-patterns:
 *   1. `overflow-y-auto` or `overflow-auto` at the view root
 *   2. `h-full` without `w-full` or `flex-1` at the view root
 *   3. `p-6` duplicating the wrapper padding
 *
 * Exit 0 = no violations. Exit 1 = violations found.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

/**
 * Arquivos auditados: os que lazyViews.ts exporta, que e exatamente o que o
 * ViewRouter monta. Filtrar por sufixo no nome (View|Dashboard) deixava de fora
 * views roteadas como ExternalProductManagement.tsx.
 */
function routedViewFiles() {
  const lazy = readFileSync(path.join(SRC, "pages", "lazyViews.ts"), "utf8");
  const files = new Set();
  for (const m of lazy.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    const spec = m[1];
    if (!spec.startsWith("@/")) continue;
    const base = path.join(SRC, spec.slice(2));
    for (const ext of [".tsx", ".ts"]) {
      if (existsSync(base + ext)) { files.add(base + ext); break; }
    }
  }
  if (files.size === 0) {
    throw new Error("lazyViews.ts nao rendeu nenhum arquivo — auditoria incompleta");
  }
  return files;
}

// FULL_SCREEN_VIEWS — these manage their own layout
const FULL_SCREEN = new Set([
  "RealtimeInboxView",
  "SalesPipelineView",
  "OmnichannelInbox",
  "TeamChatView",
  "EmailChatView",
]);

/** Walk a directory and yield .tsx files */
function* walkTsx(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch (e) { throw e; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      yield* walkTsx(full);
    } else if (e.isFile() && e.name.endsWith(".tsx")) {
      yield full;
    }
  }
}

/**
 * Heuristic: find the root element's className in the LAST exported component's return.
 * The main view export is typically the last `export function` in the file.
 */
function extractRootClassName(source) {
  // Find all `export function`/`export const` declarations
  const exportMatches = [...source.matchAll(/\bexport\s+(?:function|const)\s+/g)];
  if (exportMatches.length === 0) return null;

  // Use the last export — usually the main view component
  const lastExport = exportMatches[exportMatches.length - 1];
  const fromLastExport = source.slice(lastExport.index);

  const returnIdx = fromLastExport.search(/\breturn\s*[\(<]/);
  if (returnIdx === -1) return null;

  // Recorta APENAS a tag de abertura do primeiro elemento JSX retornado. Sem
  // isso, um root com cn(...) faz o regex escorregar para o className de um
  // descendente e o guard afere o elemento errado.
  const after = fromLastExport.slice(returnIdx);
  const tagStart = after.indexOf('<');
  if (tagStart === -1) return null;

  let depth = 0;
  let tagEnd = -1;
  for (let i = tagStart; i < after.length; i += 1) {
    const ch = after[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) { tagEnd = i; break; }
  }
  if (tagEnd === -1) return null;
  const openTag = after.slice(tagStart, tagEnd + 1);

  // Match className="..." or className={'...'} or className={`...`}
  const m = openTag.match(/className=(?:["'`]([^"'`]+)["'`]|\{(?:cn\([^)]*?["'`]([^"'`]+)["'`]|\`([^`]+)`|"([^"]+)"|'([^']+)'))/);
  if (!m) return null;
  return m[1] || m[2] || m[3] || m[4] || m[5] || "";
}

const ANTI_PATTERNS = [
  {
    name: "overflow-y-auto at root",
    test: (cn) => /\boverflow-y-auto\b/.test(cn) || /\boverflow-auto\b/.test(cn),
    message: "View root must NOT own the scroll. Only ViewContainer scrolls.",
  },
  {
    name: "h-full without w-full/flex-1",
    test: (cn) => /\bh-full\b/.test(cn) && !/\bw-full\b/.test(cn) && !/\bflex-1\b/.test(cn),
    message: "h-full without w-full or flex-1 — will size to content width.",
  },
  {
    name: "p-6 duplicate padding",
    test: (cn) => /\bp-6\b/.test(cn),
    message: "p-6 at view root duplicates ViewContainer's --layout-gutter padding.",
  },
];

let violations = 0;
let checked = 0;

const AUDITED = routedViewFiles();

// Rotas proprias, renderizadas fora do AppShell/ViewContainer — o padding e o
// scroll sao delas mesmas.
const STANDALONE = /QueuesComparison|ComparisonDashboard|CSATDashboard|EmailThreadView/;

for (const file of AUDITED) {
  const rel = path.relative(ROOT, file);

  if (/\.(test|spec|stories)\./.test(file)) continue;
  if (STANDALONE.test(file)) continue;

  let source;
  try { source = readFileSync(file, "utf8"); } catch { continue; }

  // Skip full-screen views
  if ([...FULL_SCREEN].some((name) =>
    source.includes(`export function ${name}`) ||
    source.includes(`export const ${name}`)
  )) continue;

  const cn = extractRootClassName(source);
  if (!cn) continue;

  checked++;
  for (const { name, test, message } of ANTI_PATTERNS) {
    if (test(cn)) {
      console.error(`VIOLATION [${name}]`);
      console.error(`  file: ${rel}`);
      console.error(`  className: "${cn}"`);
      console.error(`  ${message}`);
      console.error();
      violations++;
    }
  }
}

if (violations === 0) {
  console.log(`✓ layout-guard: 0 violations across ${checked} view files`);
  process.exit(0);
} else {
  console.error(`✗ layout-guard: ${violations} violation(s) across ${checked} view files`);
  process.exit(1);
}
