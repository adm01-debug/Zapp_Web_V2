#!/usr/bin/env node
// Gera o contexto de projeto para agentes de IA (inventario/ia/*).
// Zero dependências. Node >= 18. Funciona em qualquer repositório JS/TS
// (React/Vite/Next + Supabase são detectados; o resto degrada para "não detectado").
//
// Uso: node scripts/ai-context/gerar.mjs [--root <dir>] [--out <dir>] [--quiet]
// Saída determinística: só manifest.json carrega data/hora; os demais arquivos
// mudam somente quando o conteúdo do repositório muda (o workflow usa isso para
// decidir se commita).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const FORMAT_VERSION = 1;
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const ROOT = path.resolve(argOf('--root', process.env.AI_CONTEXT_ROOT || process.cwd()));
const OUT = path.resolve(ROOT, argOf('--out', process.env.AI_CONTEXT_DIR || 'inventario/ia'));
const QUIET = args.includes('--quiet');
const log = (...m) => { if (!QUIET) console.log('[contexto-ia]', ...m); };

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.turbo', '.vercel', 'coverage',
  'out', '.cache', '.parcel-cache', 'tmp', '.tmp', 'vendor', '__pycache__', '.venv', 'venv', 'playwright-report', 'test-results',
  'storybook-static', '.idea', '.vscode', 'supabase-export']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const TEST_RE = /(\.(test|spec|e2e|contract|contracts|unit|fixture|fixtures|stories)\.[cm]?[jt]sx?$)|(^|\/)(__tests__|tests?|e2e|qa|__mocks__)\//;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

// ---------- util ----------
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const abs = (p) => path.join(ROOT, p);
const exists = (p) => fs.existsSync(abs(p));
const readText = (p) => { try { const a = path.isAbsolute(p) ? p : abs(p); if (fs.statSync(a).size > MAX_FILE_BYTES) return ''; return fs.readFileSync(a, 'utf8'); } catch { return ''; } };
const readJson = (p) => { try { return JSON.parse(readText(p)); } catch { return null; } };
const uniq = (a) => [...new Set(a)].sort();
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const countLines = (s) => (s ? s.split('\n').length : 0);
const git = (cmd) => { try { return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
const cap = (arr, n = 200) => arr.slice(0, n);

// ---------- walk ----------
const ALL = [];
function walk(dir) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name.startsWith('.') && e.name !== '.github' && e.name !== '.env.example' && e.name !== '.nvmrc' && e.name !== '.husky') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (SKIP_DIRS.has(e.name) || full === OUT) continue; walk(full); }
    else if (e.isFile()) ALL.push(rel(full));
  }
}
walk(ROOT);
ALL.sort();
log(`arquivos no repo: ${ALL.length}`);

// ---------- stack ----------
const pkg = readJson('package.json') || {};
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const has = (d) => Object.prototype.hasOwnProperty.call(deps, d);
const SRC_DIR = ['src', 'app', 'lib'].find((d) => exists(d)) || '.';
const tsconfig = readJson('tsconfig.json') || readJson('tsconfig.app.json') || {};
const aliases = {};
for (const [k, v] of Object.entries((tsconfig.compilerOptions && tsconfig.compilerOptions.paths) || {})) {
  aliases[k.replace(/\*$/, '')] = String(v[0] || '').replace(/^\.\//, '').replace(/\*$/, '');
}
if (!Object.keys(aliases).length && exists('src')) aliases['@/'] = 'src/';
const stack = {
  linguagem: Object.keys(deps).some((d) => d === 'typescript') || ALL.some((f) => f.endsWith('.ts') || f.endsWith('.tsx')) ? 'TypeScript' : 'JavaScript',
  framework: has('next') ? 'Next.js' : has('react') ? 'React' : has('vue') ? 'Vue' : has('svelte') ? 'Svelte' : 'não detectado',
  bundler: has('vite') ? 'Vite' : has('next') ? 'Next' : has('webpack') ? 'webpack' : 'não detectado',
  roteador: has('react-router-dom') || has('react-router') ? 'react-router' : has('next') ? 'next (file-system)' : 'não detectado',
  backend: exists('supabase') || has('@supabase/supabase-js') ? 'Supabase' : exists('prisma') ? 'Prisma' : 'não detectado',
  testes: [has('vitest') && 'vitest', has('jest') && 'jest', has('@playwright/test') && 'playwright', has('cypress') && 'cypress'].filter(Boolean),
  ui: [has('tailwindcss') && 'tailwind', has('@radix-ui/react-dialog') && 'radix/shadcn', has('@mui/material') && 'mui'].filter(Boolean),
  estado: [has('@tanstack/react-query') && 'react-query', has('zustand') && 'zustand', has('redux') && 'redux'].filter(Boolean),
  gerenciador_pacotes: exists('bun.lock') || exists('bun.lockb') ? 'bun' : exists('pnpm-lock.yaml') ? 'pnpm' : exists('yarn.lock') ? 'yarn' : 'npm',
  node: readText('.nvmrc').trim() || (pkg.engines && pkg.engines.node) || null,
  deploy: [exists('vercel.json') && 'vercel', exists('netlify.toml') && 'netlify', exists('Dockerfile') && 'docker', exists('fly.toml') && 'fly'].filter(Boolean),
  alias_imports: aliases,
};

// ---------- análise por arquivo ----------
const CODE_FILES = ALL.filter((f) => CODE_EXT.has(path.extname(f)) && !f.endsWith('.d.ts'));
const FILE = new Map(); // rel -> facts

function resolveImport(fromFile, spec) {
  if (!spec) return null;
  let target = null;
  if (spec.startsWith('.')) target = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  else {
    for (const [a, dir] of Object.entries(aliases)) if (spec.startsWith(a)) { target = path.posix.normalize(dir + spec.slice(a.length)); break; }
    if (!target && spec.startsWith('/')) target = spec.slice(1);
  }
  if (!target) return null;
  const cands = [target, ...[...CODE_EXT].map((e) => target + e), ...[...CODE_EXT].map((e) => target + '/index' + e)];
  for (const c of cands) if (FILESET.has(c)) return c;
  return null;
}
const FILESET = new Set(ALL);

const RE = {
  imp: /import\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]/g,
  dyn: /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  req: /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  hook: /\b(use[A-Z]\w*)\s*\(/g,
  from: /\.from\(\s*['"`]([\w.]+)['"`]/g,
  rpc: /\.rpc\(\s*['"`](\w+)['"`]/g,
  invoke: /functions\.invoke\(\s*['"`]([\w-]+)['"`]/g,
  fnUrl: /\/functions\/v1\/([\w-]+)/g,
  envVite: /import\.meta\.env\.(\w+)/g,
  envNode: /process\.env\.(\w+)/g,
  envDeno: /Deno\.env\.get\(\s*['"](\w+)['"]/g,
  exp: /export\s+(?:default\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|enum|interface|type)\s+([A-Za-z_$][\w$]*)/g,
  expList: /export\s*\{([^}]+)\}/g,
  expDefault: /export\s+default\s+([A-Za-z_$][\w$]*)/g,
  todo: /\b(TODO|FIXME|HACK|XXX|WIP)\b[:\s-]*([^\n]{0,120})/g,
  storage: /storage\.from\(\s*['"`]([\w-]+)['"`]/g,
  channel: /\.channel\(\s*['"`]([^'"`]+)['"`]/g,
  urlHost: /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?=[\/'"`\s)]|$)/gi,
};
const allMatches = (re, s, g = 1) => { const out = []; re.lastIndex = 0; let m; while ((m = re.exec(s))) out.push(m[g]); return out; };

for (const f of CODE_FILES) {
  const raw = readText(f);
  const src = stripComments(raw);
  const specs = [...allMatches(RE.imp, src), ...allMatches(RE.dyn, src), ...allMatches(RE.req, src)];
  const local = uniq(specs.map((s) => resolveImport(f, s)).filter(Boolean));
  const external = uniq(specs.filter((s) => !s.startsWith('.') && !Object.keys(aliases).some((a) => s.startsWith(a))).map((s) => (s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0])));
  const exportsNamed = uniq([...allMatches(RE.exp, src), ...allMatches(RE.expList, src).flatMap((l) => l.split(',').map((x) => x.trim().split(/\s+as\s+/).pop()).filter((x) => x && /^[A-Za-z_$][\w$]*$/.test(x)))]);
  const todos = [];
  RE.todo.lastIndex = 0; let tm; let ln = 0;
  for (const line of raw.split('\n')) { ln++; const m = /\b(TODO|FIXME|HACK|XXX)\b[:\s-]*([^\n]{0,100})/.exec(line); if (m) todos.push({ linha: ln, tipo: m[1], texto: m[2].trim() }); }
  const isTest = TEST_RE.test(f);
  const base = path.posix.basename(f).replace(/\.[^.]+$/, '');
  FILE.set(f, {
    linhas: countLines(raw),
    bytes: Buffer.byteLength(raw),
    imports: local,
    externos: external,
    exports: exportsNamed,
    hooks: uniq(allMatches(RE.hook, src)),
    tabelas: uniq(allMatches(RE.from, src)),
    rpcs: uniq(allMatches(RE.rpc, src)),
    edges: uniq([...allMatches(RE.invoke, src), ...allMatches(RE.fnUrl, src)]),
    env: uniq([...allMatches(RE.envVite, src), ...allMatches(RE.envNode, src), ...allMatches(RE.envDeno, src)]),
    buckets: uniq(allMatches(RE.storage, src)),
    canais_realtime: uniq(allMatches(RE.channel, src)),
    hosts_externos: uniq(allMatches(RE.urlHost, src).map((h) => h.toLowerCase())).filter((h) => !/localhost|example\.com|w3\.org|schema\.org/.test(h)),
    todos,
    teste: isTest,
    componente: /\.(tsx|jsx)$/.test(f) && !isTest && exportsNamed.some((e) => /^[A-Z]/.test(e)),
    hook_arquivo: /^use[A-Z]/.test(base) && !isTest,
    any_count: (src.match(/:\s*any\b|<any>|as any\b/g) || []).length,
    console_count: (src.match(/console\.(log|debug)\(/g) || []).length,
    ts_ignore: (src.match(/@ts-(ignore|expect-error|nocheck)/g) || []).length,
    conteudo: src, // descartado antes de escrever
  });
}
// usado_por (grafo reverso)
const USED_BY = new Map();
for (const [f, d] of FILE) for (const i of d.imports) { if (!USED_BY.has(i)) USED_BY.set(i, []); USED_BY.get(i).push(f); }
for (const [, v] of USED_BY) v.sort();
const usedBy = (f) => USED_BY.get(f) || [];

// fecho transitivo (o que uma tela "puxa") — só arquivos locais, sem testes
const closureCache = new Map();
function closure(f) {
  if (closureCache.has(f)) return closureCache.get(f);
  const seen = new Set(); const stack = [f];
  while (stack.length) { const c = stack.pop(); if (seen.has(c)) continue; seen.add(c); const d = FILE.get(c); if (d) for (const i of d.imports) if (!seen.has(i) && !FILE.get(i)?.teste) stack.push(i); }
  seen.delete(f);
  const arr = [...seen].sort();
  closureCache.set(f, arr);
  return arr;
}
function aggregate(files) {
  const agg = { hooks: new Set(), tabelas: new Set(), rpcs: new Set(), edges: new Set(), env: new Set(), buckets: new Set(), canais_realtime: new Set() };
  for (const f of files) { const d = FILE.get(f); if (!d) continue; for (const k of Object.keys(agg)) for (const v of d[k]) agg[k].add(v); }
  return Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, [...v].sort()]));
}
const localHooks = (hooks) => hooks.filter((h) => HOOK_FILES_BY_NAME.has(h));

// ---------- hooks ----------
const HOOK_FILES_BY_NAME = new Map();
const hooksOut = [];
for (const [f, d] of FILE) {
  if (d.teste) continue;
  const names = d.exports.filter((e) => /^use[A-Z]/.test(e));
  if (!names.length && !d.hook_arquivo) continue;
  for (const n of names) HOOK_FILES_BY_NAME.set(n, f);
  hooksOut.push({
    arquivo: f, hooks_exportados: names, linhas: d.linhas,
    tabelas: d.tabelas, rpcs: d.rpcs, edges: d.edges, hooks_internos: d.hooks.filter((h) => h !== names[0]),
    canais_realtime: d.canais_realtime, usado_por: usedBy(f).length, usado_por_arquivos: cap(usedBy(f), 30),
    dominio: dominioDe(f),
  });
}
function dominioDe(f) {
  const m = /^(?:src\/)?(components|features|modules|pages|app|views|hooks|services|lib|utils|stores?|contexts?|providers|integrations|adapters|segments|data|config|types)\/([^/]+)/.exec(f);
  if (!m) return null;
  return m[2].includes('.') ? m[1] : `${m[1]}/${m[2]}`;
}

// ---------- rotas / telas ----------
const lazyMap = new Map(); // ComponentName -> file
for (const [f, d] of FILE) {
  const re = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:lazy\w*|React\.lazy)\s*\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]/g;
  let m; re.lastIndex = 0;
  while ((m = re.exec(d.conteudo))) { const t = resolveImport(f, m[2]); if (t) lazyMap.set(m[1], t); }
}
function componentFile(name, fromFile) {
  if (lazyMap.has(name)) return lazyMap.get(name);
  const d = FILE.get(fromFile);
  if (d) {
    // import direto no arquivo das rotas
    const re = new RegExp(`import\\s+(?:\\{[^}]*\\b${name}\\b[^}]*\\}|${name})\\s+from\\s+['"]([^'"]+)['"]`);
    const m = re.exec(d.conteudo); if (m) { const t = resolveImport(fromFile, m[1]); if (t) return t; }
    // export de lazyViews reexportado
    for (const i of d.imports) { const di = FILE.get(i); if (di && di.exports.includes(name)) return lazyMap.get(name) || i; }
  }
  for (const [f2, d2] of FILE) if (d2.exports.includes(name) && !d2.teste && /\.(tsx|jsx)$/.test(f2)) return f2;
  return null;
}
const rotas = [];
const routeFiles = CODE_FILES.filter((f) => !FILE.get(f).teste && (/<Route\b/.test(FILE.get(f).conteudo) || /createBrowserRouter|createHashRouter/.test(FILE.get(f).conteudo)));
for (const rf of routeFiles) {
  const src = FILE.get(rf).conteudo;
  // <Route path="..." element={<X .../>}> (multi-linha)
  const re = /<Route\b((?:[^>{]|\{(?:[^{}]|\{[^{}]*\})*\})*)>/g; let m;
  while ((m = re.exec(src))) {
    const attrs = m[1];
    const p = /\bpath=["']([^"']+)["']/.exec(attrs); if (!p) continue;
    const el = /element=\{\s*(?:<([A-Z]\w*)[^>]*>\s*)*<([A-Z]\w*)/.exec(attrs) || /element=\{\s*<([A-Z]\w*)/.exec(attrs);
    const wrappers = [...attrs.matchAll(/<([A-Z]\w*)/g)].map((x) => x[1]);
    const comp = wrappers.length ? wrappers[wrappers.length - 1] : null;
    const file = comp ? componentFile(comp, rf) : null;
    const protegida = wrappers.some((w) => /Protected|Private|Auth|Guard|Require/i.test(w));
    rotas.push({ caminho: p[1], componente: comp, arquivo: file, protegida, wrappers: wrappers.slice(0, -1), definida_em: rf, lazy: comp ? lazyMap.has(comp) : false });
  }
  // createBrowserRouter([{ path: '/x', element: <X/> }])
  const re2 = /\{\s*path:\s*['"]([^'"]+)['"][^{}]*?(?:element|Component):\s*(?:<)?([A-Z]\w*)/g;
  while ((m = re2.exec(src))) rotas.push({ caminho: m[1], componente: m[2], arquivo: componentFile(m[2], rf), protegida: false, wrappers: [], definida_em: rf, lazy: lazyMap.has(m[2]) });
}
// Next.js file-system routes
for (const f of ALL) {
  const m = /^(?:src\/)?app\/((?:.*\/)?)(page|route|layout)\.(tsx|jsx|ts|js)$/.exec(f);
  if (m) rotas.push({ caminho: '/' + m[1].replace(/\/$/, '').replace(/\(.*?\)\/?/g, ''), componente: m[2], arquivo: f, protegida: false, wrappers: [], definida_em: 'next/app', lazy: false });
  const m2 = /^(?:src\/)?pages\/(.+)\.(tsx|jsx)$/.exec(f);
  if (m2 && stack.framework === 'Next.js' && !/^_/.test(m2[1])) rotas.push({ caminho: '/' + m2[1].replace(/\/index$/, ''), componente: path.posix.basename(m2[1]), arquivo: f, protegida: false, wrappers: [], definida_em: 'next/pages', lazy: false });
}
// view router por id (ex.: ViewRouter.tsx: case 'inbox': return <RealtimeInboxView/>  |  { inbox: RealtimeInboxView })
const vistas = [];
for (const [f, d] of FILE) {
  if (d.teste || !/ViewRouter|viewRegistry|viewMap|VIEW_MAP|VIEW_COMPONENTS|SPECIAL_VIEWS|renderView/i.test(f + d.conteudo.slice(0, 4000))) continue;
  const src = d.conteudo; let m;
  const re1 = /case\s+['"]([\w-]+)['"]\s*:[\s\S]{0,200}?<([A-Z]\w*)/g;
  while ((m = re1.exec(src))) vistas.push({ id: m[1], componente: m[2], arquivo: componentFile(m[2], f), registrada_em: f });
  const re2 = /['"]?([\w-]+)['"]?\s*:\s*(?:<)?(?:[A-Z]\w*\.)?([A-Z]\w*)\s*(?:\/?>|,|\}|as\b)/g;
  while ((m = re2.exec(src))) if (lazyMap.has(m[2]) || (FILE.get(f).imports.some((i) => FILE.get(i)?.exports.includes(m[2])))) vistas.push({ id: m[1], componente: m[2], arquivo: componentFile(m[2], f), registrada_em: f });
}
const vistasUniq = Object.values(Object.fromEntries(vistas.map((v) => [v.id + '|' + v.componente, v]))).sort((a, b) => a.id.localeCompare(b.id));
const enrich = (r) => {
  if (!r.arquivo) return { ...r, hooks: [], hooks_locais: [], tabelas: [], rpcs: [], edges: [], arquivos_puxados: 0 };
  const files = [r.arquivo, ...closure(r.arquivo)];
  const a = aggregate(files);
  return { ...r, hooks: a.hooks, hooks_locais: localHooks(a.hooks), tabelas: a.tabelas, rpcs: a.rpcs, edges: a.edges, canais_realtime: a.canais_realtime, arquivos_puxados: files.length - 1 };
};
const rotasDedup = Object.values(Object.fromEntries(rotas.map((r) => [`${r.caminho}|${r.componente}|${r.definida_em}`, r])));
const rotasEnriched = rotasDedup.sort((a, b) => a.caminho.localeCompare(b.caminho)).map(enrich);
const vistasEnriched = vistasUniq.map(enrich);

// ---------- menu ----------
const menu = [];
for (const [f, d] of FILE) {
  if (d.teste || !/nav|menu|sidebar/i.test(f)) continue;
  const src = d.conteudo;
  const re = /\{[^{}]*?\b(?:label|title|name)\s*:\s*(['"`])([^'"`]+)\1[^{}]*?\b(?:path|href|to|view|id|route)\s*:\s*(['"`])([^'"`]+)\3[^{}]*\}|\{[^{}]*?\b(?:path|href|to|view|id|route)\s*:\s*(['"`])([^'"`]+)\5[^{}]*?\b(?:label|title|name)\s*:\s*(['"`])([^'"`]+)\7[^{}]*\}/g;
  let m;
  while ((m = re.exec(src))) {
    const label = m[2] || m[8]; const dest = m[4] || m[6]; const block = m[0];
    const group = (() => { const before = src.slice(0, m.index); const g = [...before.matchAll(/(?:title|label|group|section|id)\s*:\s*['"`]([^'"`]+)['"`]\s*,?\s*\n?\s*items\s*:/g)]; return g.length ? g[g.length - 1][1] : null; })();
    const roles = [...block.matchAll(/(?:roles?|permissions?|allowedRoles)\s*:\s*\[([^\]]*)\]/g)].flatMap((x) => x[1].split(',').map((s) => s.replace(/['"`\s]/g, '')).filter(Boolean));
    menu.push({ rotulo: label, destino: dest, grupo: group, papeis: uniq(roles), definido_em: f });
  }
}
const menuUniq = Object.values(Object.fromEntries(menu.map((v) => [v.destino + '|' + v.rotulo, v]))).sort((a, b) => (a.grupo || '').localeCompare(b.grupo || '') || a.rotulo.localeCompare(b.rotulo));
const resolveDestino = (dest) => rotasEnriched.find((r) => r.caminho === dest) || vistasEnriched.find((v) => v.id === dest) || rotasEnriched.find((r) => r.caminho.replace(/^\//, '') === dest.replace(/^\//, '')) || null;

// ---------- módulos (menu → domínio → hooks → edges → tabelas) ----------
const dominios = new Map();
for (const [f, d] of FILE) { const dom = dominioDe(f); if (!dom) continue; if (!dominios.has(dom)) dominios.set(dom, []); dominios.get(dom).push(f); }
const modulos = [...dominios.entries()].sort().map(([dom, files]) => {
  const prod = files.filter((f) => !FILE.get(f).teste);
  const a = aggregate(prod);
  const telas = [...rotasEnriched, ...vistasEnriched].filter((r) => r.arquivo && dominioDe(r.arquivo) === dom);
  const itensMenu = menuUniq.filter((mi) => { const t = resolveDestino(mi.destino); return t && telas.includes(t); });
  return {
    modulo: dom, arquivos: prod.length, testes: files.length - prod.length, linhas: prod.reduce((s, f) => s + FILE.get(f).linhas, 0),
    itens_menu: itensMenu.map((x) => x.rotulo), telas: telas.map((t) => t.caminho || t.id),
    componentes: prod.filter((f) => FILE.get(f).componente).length,
    hooks_locais: localHooks(a.hooks), hooks_definidos: hooksOut.filter((h) => h.arquivo.startsWith(prod[0] ? path.posix.dirname(prod[0]).split('/').slice(0, 3).join('/') : '\0')).flatMap((h) => h.hooks_exportados),
    edges: a.edges, tabelas: a.tabelas, rpcs: a.rpcs, buckets: a.buckets, canais_realtime: a.canais_realtime, env: a.env,
    importado_por_outros_modulos: uniq(prod.flatMap((f) => usedBy(f)).map((u) => dominioDe(u)).filter((x) => x && x !== dom)),
    depende_de_modulos: uniq(prod.flatMap((f) => FILE.get(f).imports).map((u) => dominioDe(u)).filter((x) => x && x !== dom)),
  };
});

// ---------- componentes ----------
const componentes = [...FILE.entries()].filter(([, d]) => d.componente).map(([f, d]) => ({
  arquivo: f, exports: d.exports.filter((e) => /^[A-Z]/.test(e)), linhas: d.linhas, dominio: dominioDe(f),
  hooks_locais: localHooks(d.hooks), tabelas: d.tabelas, edges: d.edges, usado_por: usedBy(f).length,
  orfao: usedBy(f).length === 0 && !rotasEnriched.some((r) => r.arquivo === f) && !vistasEnriched.some((v) => v.arquivo === f) && !lazyMap.has(d.exports[0]),
})).sort((a, b) => a.arquivo.localeCompare(b.arquivo));

// ---------- edge functions (Supabase) ----------
const edgeDir = 'supabase/functions';
const configToml = readText('supabase/config.toml');
const verifyJwt = {}; { const re = /\[functions\.([\w-]+)\]\s*\n\s*verify_jwt\s*=\s*(true|false)/g; let m; while ((m = re.exec(configToml))) verifyJwt[m[1]] = m[2] === 'true'; }
const edges = [];
if (exists(edgeDir)) {
  for (const name of fs.readdirSync(abs(edgeDir)).sort()) {
    const dir = `${edgeDir}/${name}`;
    if (!fs.statSync(abs(dir)).isDirectory() || name.startsWith('_')) continue;
    const entry = ['index.ts', 'index.js', 'main.ts'].map((e) => `${dir}/${e}`).find((p) => FILESET.has(p));
    const files = ALL.filter((f) => f.startsWith(dir + '/') && CODE_EXT.has(path.extname(f)));
    const a = aggregate(files);
    const srcAll = files.map((f) => FILE.get(f)?.conteudo || '').join('\n');
    const metodos = uniq([...srcAll.matchAll(/req(?:uest)?\.method\s*(?:===|==|!==)\s*['"](\w+)['"]/g)].map((m) => m[1]));
    const callers = uniq([...FILE.entries()].filter(([f, d]) => !f.startsWith(edgeDir) && d.edges.includes(name)).map(([f]) => f));
    const chamadaPorEdges = uniq([...FILE.entries()].filter(([f, d]) => f.startsWith(edgeDir) && !f.startsWith(dir + '/') && !f.includes('/_shared/') && d.edges.includes(name)).map(([f]) => f.split('/')[2]));
    edges.push({
      nome: name, entrada: entry || null, arquivos: files.length, linhas: files.reduce((s, f) => s + (FILE.get(f)?.linhas || 0), 0),
      verify_jwt: name in verifyJwt ? verifyJwt[name] : true, metodos,
      tabelas: a.tabelas, rpcs: a.rpcs, env: a.env, buckets: a.buckets, chama_edges: a.edges.filter((e) => e !== name),
      hosts_externos: uniq(files.flatMap((f) => FILE.get(f)?.hosts_externos || [])).filter((h) => !/supabase\.co$/.test(h)),
      usa_shared: uniq(files.flatMap((f) => FILE.get(f)?.imports || []).filter((i) => i.includes('/_shared/')).map((i) => path.posix.basename(i))),
      chamada_pelo_front: callers, chamada_por_edges: chamadaPorEdges,
      orfa: callers.length === 0 && chamadaPorEdges.length === 0 && !(name in verifyJwt && !verifyJwt[name]),
      testes: ALL.filter((f) => TEST_RE.test(f) && (f.includes(`/${name}/`) || f.includes(`${name}.test`))).length,
    });
  }
}
const edgesNoCodigoSemPasta = uniq([...FILE.values()].flatMap((d) => d.edges)).filter((e) => !edges.some((x) => x.nome === e));

// ---------- banco (migrations + types) ----------
const banco = { tabelas: {}, funcoes: new Set(), triggers: [], views: new Set(), enums: {}, extensoes: new Set(), migrations: 0, fonte: [] };
const migDir = ['supabase/migrations', 'migrations', 'db/migrations', 'prisma/migrations'].find((d) => exists(d));
const T = (name) => { const n = name.replace(/^public\./, '').replace(/"/g, ''); if (!banco.tabelas[n]) banco.tabelas[n] = { colunas: {}, rls: false, policies: [], indices: [], fks: [], criada_em: null }; return banco.tabelas[n]; };
const parseCols = (body, table) => {
  let depth = 0, cur = '', parts = [];
  for (const ch of body) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
  parts.push(cur);
  for (let p of parts) {
    p = p.trim().replace(/\s+/g, ' '); if (!p) continue;
    const m = /^"?([a-zA-Z_]\w*)"?\s+([a-zA-Z_][\w\[\]]*(?:\s*\([^)]*\))?(?:\s+with time zone|\s+without time zone)?)(.*)$/i.exec(p);
    if (!m || /^(constraint|primary|foreign|unique|check|exclude|like)$/i.test(m[1])) {
      const fk = /foreign key\s*\(\s*"?(\w+)"?\s*\)\s*references\s+"?(?:public\.)?"?(\w+)/i.exec(p); if (fk) table.fks.push({ coluna: fk[1], ref: fk[2] });
      continue;
    }
    const rest = m[3] || '';
    const ref = /references\s+"?(?:public\.)?"?(\w+)/i.exec(rest);
    table.colunas[m[1]] = { tipo: m[2].toLowerCase(), nn: /not null/i.test(rest), pk: /primary key/i.test(rest), default: (/default\s+(.+?)(?:\s+(?:not null|null|references|check|unique|primary)|$)/i.exec(rest) || [])[1] || null, ref: ref ? ref[1] : null };
    if (ref) table.fks.push({ coluna: m[1], ref: ref[1] });
  }
};
if (migDir) {
  const migs = ALL.filter((f) => f.startsWith(migDir + '/') && f.endsWith('.sql')).sort();
  banco.migrations = migs.length; banco.fonte.push(migDir);
  for (const f of migs) {
    // ordem importa (DROP POLICY + CREATE POLICY no mesmo arquivo): processa por statement, sem corpos $$...$$
    const sql = readText(f).replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "''");
    for (const stRaw of sql.split(';')) {
      const st = stRaw.trim(); if (!st) continue; let m;
      if ((m = /^create\s+table\s+(?:if\s+not\s+exists\s+)?("?[\w.]+"?)\s*\(/i.exec(st))) {
        let i = m[0].length, depth = 1, body = '';
        while (i < st.length && depth > 0) { const ch = st[i++]; if (ch === '(') depth++; if (ch === ')') depth--; if (depth > 0) body += ch; }
        const t = T(m[1]); if (!t.criada_em) t.criada_em = path.posix.basename(f); parseCols(body, t); continue;
      }
      if ((m = /^drop\s+table\s+(?:if\s+exists\s+)?("?[\w.]+"?)/i.exec(st))) { delete banco.tabelas[m[1].replace(/^public\./, '').replace(/"/g, '')]; continue; }
      if ((m = /^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?("?[\w.]+"?)\s+rename\s+to\s+("?\w+"?)/i.exec(st))) { const o = m[1].replace(/^public\./, '').replace(/"/g, ''); if (banco.tabelas[o]) { banco.tabelas[m[2].replace(/"/g, '')] = banco.tabelas[o]; delete banco.tabelas[o]; } continue; }
      if ((m = /^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?("?[\w.]+"?)\s+([\s\S]+)$/i.exec(st))) {
        const t = T(m[1]); const ops = m[2].split(/,\s*(?=(?:add|drop|alter|enable|disable|force)\s)/i);
        for (const op of ops) {
          let x;
          if ((x = /^add\s+column\s+(?:if\s+not\s+exists\s+)?([\s\S]+)$/i.exec(op))) parseCols(x[1], t);
          else if ((x = /^add\s+(?:constraint\s+\S+\s+)?foreign\s+key\s*\(\s*"?(\w+)"?\s*\)\s*references\s+"?(?:public\.)?"?(\w+)/i.exec(op))) t.fks.push({ coluna: x[1], ref: x[2] });
          else if ((x = /^drop\s+column\s+(?:if\s+exists\s+)?"?(\w+)"?/i.exec(op))) delete t.colunas[x[1]];
          else if ((x = /^alter\s+column\s+"?(\w+)"?\s+(?:set\s+data\s+)?type\s+([\w\s()\[\]]+?)(?:\s+using|$)/i.exec(op)) && t.colunas[x[1]]) t.colunas[x[1]].tipo = x[2].trim().toLowerCase();
          else if (/^enable\s+row\s+level\s+security/i.test(op)) t.rls = true;
          else if (/^disable\s+row\s+level\s+security/i.test(op)) t.rls = false;
        }
        continue;
      }
      if ((m = /^create\s+policy\s+("[^"]+"|\w+)\s+on\s+("?[\w.]+"?)(?:\s+as\s+(permissive|restrictive))?(?:\s+for\s+(select|insert|update|delete|all))?(?:\s+to\s+([\w, ]+?))?\s+(?:using|with\s+check)/i.exec(st))) {
        const t = T(m[2]); const nome = m[1].replace(/"/g, ''); t.policies = t.policies.filter((p) => p.nome !== nome);
        t.policies.push({ nome, comando: (m[4] || 'all').toLowerCase(), para: (m[5] || 'public').trim(), tipo: (m[3] || 'permissive').toLowerCase() }); continue;
      }
      if ((m = /^drop\s+policy\s+(?:if\s+exists\s+)?("[^"]+"|\w+)\s+on\s+("?[\w.]+"?)/i.exec(st))) { const t = T(m[2]); t.policies = t.policies.filter((p) => p.nome !== m[1].replace(/"/g, '')); continue; }
      if ((m = /^create\s+(unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?("?\w+"?)\s+on\s+(?:only\s+)?("?[\w.]+"?)\s*(?:using\s+\w+\s*)?\(([^)]+)\)/i.exec(st))) {
        const t = T(m[3]); const nome = m[2].replace(/"/g, ''); t.indices = t.indices.filter((i) => i.nome !== nome); t.indices.push({ nome, colunas: m[4].replace(/\s+/g, ' ').trim(), unico: !!m[1] }); continue;
      }
      if ((m = /^drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/i.exec(st))) { for (const t of Object.values(banco.tabelas)) t.indices = t.indices.filter((i) => i.nome !== m[1]); continue; }
      if ((m = /^create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?(\w+)"?/i.exec(st))) { banco.funcoes.add(m[1]); continue; }
      if ((m = /^drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/i.exec(st))) { banco.funcoes.delete(m[1]); continue; }
      if ((m = /^create\s+(?:or\s+replace\s+)?trigger\s+"?(\w+)"?\s+(before|after|instead\s+of)\s+([\w\s]+?)\s+on\s+("?[\w.]+"?)[\s\S]*?execute\s+(?:function|procedure)\s+(?:public\.)?"?(\w+)"?/i.exec(st))) {
        const tb = m[4].replace(/^public\./, '').replace(/"/g, ''); banco.triggers = banco.triggers.filter((t) => !(t.nome === m[1] && t.tabela === tb));
        banco.triggers.push({ nome: m[1], quando: m[2].toLowerCase(), evento: m[3].replace(/\s+/g, ' ').toLowerCase(), tabela: tb, funcao: m[5] }); continue;
      }
      if ((m = /^drop\s+trigger\s+(?:if\s+exists\s+)?"?(\w+)"?\s+on\s+("?[\w.]+"?)/i.exec(st))) { const tb = m[2].replace(/^public\./, '').replace(/"/g, ''); banco.triggers = banco.triggers.filter((t) => !(t.nome === m[1] && t.tabela === tb)); continue; }
      if ((m = /^create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:public\.)?"?(\w+)"?/i.exec(st))) { banco.views.add(m[1]); continue; }
      if ((m = /^drop\s+(?:materialized\s+)?view\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/i.exec(st))) { banco.views.delete(m[1]); continue; }
      if ((m = /^create\s+type\s+(?:public\.)?"?(\w+)"?\s+as\s+enum\s*\(([^)]*)\)/i.exec(st))) { banco.enums[m[1]] = m[2].split(',').map((v) => v.trim().replace(/'/g, '')).filter(Boolean); continue; }
      if ((m = /^alter\s+type\s+(?:public\.)?"?(\w+)"?\s+add\s+value\s+(?:if\s+not\s+exists\s+)?'([^']+)'/i.exec(st))) { (banco.enums[m[1]] = banco.enums[m[1]] || []).push(m[2]); continue; }
      if ((m = /^create\s+extension\s+(?:if\s+not\s+exists\s+)?"?([\w-]+)"?/i.exec(st))) { banco.extensoes.add(m[1]); continue; }
    }
  }
}
// types.ts gerado pelo Supabase (colunas "oficiais")
const typesFile = ALL.find((f) => /(supabase|database)[\/.-].*types\.ts$|types\/supabase\.ts$|database\.types\.ts$/.test(f) && !TEST_RE.test(f));
const tabelasTypes = {};
if (typesFile) {
  banco.fonte.push(typesFile);
  const src = readText(typesFile);
  const pub = src.indexOf('public: {'); const tablesIdx = src.indexOf('Tables: {', pub);
  if (tablesIdx > 0) {
    const re = /\n\s{6}(\w+):\s*\{\s*\n\s+Row:\s*\{([\s\S]*?)\n\s{8}\}/g; let m;
    while ((m = re.exec(src))) tabelasTypes[m[1]] = Object.fromEntries([...m[2].matchAll(/^\s*(\w+)\??:\s*(.+?)\s*$/gm)].map((c) => [c[1], c[2].replace(/\s+/g, ' ')]));
  }
}
for (const [t, cols] of Object.entries(tabelasTypes)) { const tb = T(t); tb.colunas_types = cols; }
const tabelasUsadas = new Map();
for (const [f, d] of FILE) for (const t of d.tabelas) { if (!tabelasUsadas.has(t)) tabelasUsadas.set(t, { front: [], edges: [] }); (f.startsWith(edgeDir) ? tabelasUsadas.get(t).edges : tabelasUsadas.get(t).front).push(f); }
const bancoOut = {
  fonte: banco.fonte, migrations: banco.migrations, extensoes: [...banco.extensoes].sort(), enums: sortObj(banco.enums), views: [...banco.views].sort(), funcoes: [...banco.funcoes].sort(),
  triggers: banco.triggers.sort((a, b) => a.tabela.localeCompare(b.tabela) || a.nome.localeCompare(b.nome)),
  tabelas: sortObj(Object.fromEntries(Object.entries(banco.tabelas).map(([n, t]) => {
    const uso = tabelasUsadas.get(n) || { front: [], edges: [] };
    return [n, { ...t, colunas: sortObj(t.colunas), colunas_types: t.colunas_types ? sortObj(t.colunas_types) : undefined, policies: t.policies.sort((a, b) => a.nome.localeCompare(b.nome)), indices: t.indices.sort((a, b) => a.nome.localeCompare(b.nome)), fks: uniq(t.fks.map((x) => `${x.coluna}->${x.ref}`)), usada_no_front: uniq(uso.front).length, usada_em_edges: uniq(uso.edges.map((f) => f.split('/')[2])), sem_rls: !t.rls, nao_usada: !uso.front.length && !uso.edges.length }];
  }))),
  tabelas_usadas_no_codigo_sem_migration: uniq([...tabelasUsadas.keys()]).filter((t) => !banco.tabelas[t] && !banco.views.has(t)),
  rpcs_usadas_no_codigo: uniq([...FILE.values()].flatMap((d) => d.rpcs)).map((r) => ({ nome: r, definida_em_migration: banco.funcoes.has(r) })),
  buckets_usados: uniq([...FILE.values()].flatMap((d) => d.buckets)),
};

// ---------- ferramentas / scripts / workflows ----------
const workflows = ALL.filter((f) => /^\.github\/workflows\/.+\.ya?ml$/.test(f)).map((f) => {
  const y = readText(f);
  const name = (/^name:\s*(.+)$/m.exec(y) || [])[1]?.trim().replace(/^['"]|['"]$/g, '') || path.posix.basename(f);
  const onBlock = y.split(/^on:/m)[1] || '';
  const gatilhos = uniq([...onBlock.matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]));
  const crons = [...y.matchAll(/cron:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const jobs = [...(y.split(/^jobs:/m)[1] || '').matchAll(/^\s{2}([\w-]+):\s*$/gm)].map((m) => m[1]);
  const scriptsRef = uniq([...y.matchAll(/(?:node|bash|sh|npx tsx|bun)\s+((?:scripts|\.github)\/[\w./-]+)/g)].map((m) => m[1]));
  const npmRef = uniq([...y.matchAll(/(?:npm|bun|pnpm|yarn)\s+(?:run\s+)?([\w:-]+)/g)].map((m) => m[1]).filter((s) => pkg.scripts && pkg.scripts[s]));
  return { arquivo: f, nome: name, gatilhos, crons, jobs, permissoes: (/^permissions:[ \t]*\n((?:[ \t]+[\w-]+:[^\n]*\n)+)/m.exec(y) || [])[1]?.trim().split('\n').map((l) => l.trim()) || [], scripts_usados: scriptsRef, npm_scripts: npmRef, secrets: uniq([...y.matchAll(/secrets\.(\w+)/g)].map((m) => m[1])) };
}).sort((a, b) => a.arquivo.localeCompare(b.arquivo));
const TEXT_CORPUS = ALL.filter((o) => /\.(mjs|cjs|js|ts|tsx|sh|ya?ml|json|md|toml)$/.test(o) && !o.startsWith(rel(OUT))).map((o) => [o, FILE.get(o)?.conteudo ?? readText(o)]);
const scriptsRepo = ALL.filter((f) => /^(scripts|bin|tools)\//.test(f) && /\.(mjs|cjs|js|ts|sh|py|sql)$/.test(f) && !TEST_RE.test(f)).map((f) => {
  const src = readText(f); const first = src.split('\n').slice(0, 15).map((l) => l.trim()).filter((l) => /^(\/\/|#|\*|\/\*)/.test(l) && !/^#!/.test(l) && !/eslint|@ts-/.test(l)).map((l) => l.replace(/^(\/\/|#|\*|\/\*)\s?/, '')).filter(Boolean);
  const usadoPorNpm = Object.entries(pkg.scripts || {}).filter(([, v]) => v.includes(f) || v.includes(path.posix.basename(f))).map(([k]) => k);
  const usadoPorWf = workflows.filter((w) => w.scripts_usados.includes(f)).map((w) => path.posix.basename(w.arquivo));
  return { arquivo: f, descricao: first.slice(0, 2).join(' ').slice(0, 200) || null, linhas: countLines(src), npm_scripts: usadoPorNpm, workflows: usadoPorWf, orfao: !usadoPorNpm.length && !usadoPorWf.length && !TEXT_CORPUS.some(([o, t]) => o !== f && t.includes(path.posix.basename(f))) };
});
const envExample = uniq([...readText(ALL.find((f) => /^\.env\.example$|^\.env\.sample$|^\.env\.template$/.test(f)) || '').matchAll(/^\s*([A-Z][A-Z0-9_]+)\s*=/gm)].map((m) => m[1]));
const envUsadas = uniq([...FILE.entries()].filter(([f]) => f.startsWith(SRC_DIR + '/') && !f.startsWith(edgeDir)).flatMap(([, d]) => d.env));
const envEdges = uniq([...FILE.entries()].filter(([f]) => f.startsWith(edgeDir)).flatMap(([, d]) => d.env));
const configs = ['vite.config.ts', 'vite.config.js', 'next.config.js', 'next.config.mjs', 'next.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'jest.config.js', 'eslint.config.js', '.eslintrc.json', '.prettierrc', 'tailwind.config.ts', 'tailwind.config.js', 'postcss.config.js', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.strict.json', 'vercel.json', 'netlify.toml', 'Dockerfile', 'docker-compose.yml', 'docker-stack.yml', 'supabase/config.toml', 'components.json', '.nvmrc', '.husky/pre-commit', 'CODEOWNERS', '.github/CODEOWNERS', 'performance-budget.json'].filter((c) => FILESET.has(c));
const docsRaiz = ALL.filter((f) => /^[A-Za-z][\w.-]*\.md$/.test(f) || /^docs\/[^/]+\.md$/.test(f));
const docsProfundos = ALL.filter((f) => /^docs\/.+\/.+\.md$/.test(f)).length;
const ferramentas = {
  stack, package: { nome: pkg.name || null, versao: pkg.version || null, scripts: sortObj(pkg.scripts || {}), dependencias: Object.keys(pkg.dependencies || {}).length, dev_dependencias: Object.keys(pkg.devDependencies || {}).length, principais: sortObj(Object.fromEntries(Object.entries(pkg.dependencies || {}).filter(([k]) => /^(react|next|vue|@supabase|@tanstack|zustand|react-router|zod|react-hook-form|tailwindcss|vite|typescript|axios|date-fns|i18next|framer-motion|recharts)/.test(k)))) },
  configs, workflows, hooks_git: ALL.filter((f) => f.startsWith('.husky/')), docs_raiz: docsRaiz, docs_em_subpastas: docsProfundos,
  env: { declaradas_no_env_example: envExample, usadas_no_front: envUsadas, usadas_nas_edges: envEdges, usadas_mas_nao_declaradas: envUsadas.filter((e) => !envExample.includes(e)), secrets_em_workflows: uniq(workflows.flatMap((w) => w.secrets)) },
  hosts_externos: uniq([...FILE.values()].flatMap((d) => d.hosts_externos)).filter((h) => !/supabase\.co$/.test(h)),
};

// ---------- testes ----------
const testFiles = [...FILE.entries()].filter(([, d]) => d.teste);
const cobertoPor = new Map();
for (const [f, d] of testFiles) for (const i of d.imports) { if (FILE.get(i)?.teste) continue; if (!cobertoPor.has(i)) cobertoPor.set(i, []); cobertoPor.get(i).push(f); }
const tipoTeste = (f) => (/\/e2e\/|\.e2e\./.test(f) ? 'e2e' : /contract/.test(f) ? 'contrato' : /\/qa\//.test(f) ? 'qa' : /supabase\/tests|\.sql$/.test(f) ? 'banco' : 'unit');
const testes = {
  frameworks: stack.testes, total: testFiles.length + ALL.filter((f) => /^supabase\/tests\/.*\.sql$/.test(f)).length,
  por_tipo: testFiles.reduce((acc, [f]) => { const t = tipoTeste(f); acc[t] = (acc[t] || 0) + 1; return acc; }, {}),
  arquivos: testFiles.map(([f, d]) => ({ arquivo: f, tipo: tipoTeste(f), linhas: d.linhas, testa: d.imports.filter((i) => !FILE.get(i)?.teste), casos: (d.conteudo.match(/\b(it|test)\s*\(/g) || []).length })).sort((a, b) => a.arquivo.localeCompare(b.arquivo)),
  sql: ALL.filter((f) => /^supabase\/tests\/.*\.sql$/.test(f)),
  cobertura_por_arquivo: sortObj(Object.fromEntries([...cobertoPor.entries()].map(([f, t]) => [f, t.length]))),
  sem_teste: { telas: rotasEnriched.filter((r) => r.arquivo && !cobertoPor.has(r.arquivo)).map((r) => r.arquivo).filter(Boolean), hooks: hooksOut.filter((h) => !cobertoPor.has(h.arquivo)).map((h) => h.arquivo), edges: edges.filter((e) => !e.testes).map((e) => e.nome), servicos: [] },
};

// ---------- lógica (services/lib/stores/contexts) ----------
const LOGIC_RE = /^(?:src\/)?(services?|lib|utils?|stores?|contexts?|providers|integrations|adapters|api|domain|core|helpers|config|data|segments)\//;
const logica = [...FILE.entries()].filter(([f, d]) => LOGIC_RE.test(f) && !d.teste && !d.componente).map(([f, d]) => ({
  arquivo: f, camada: LOGIC_RE.exec(f)[1], exports: d.exports, linhas: d.linhas, tabelas: d.tabelas, rpcs: d.rpcs, edges: d.edges, env: d.env, externos: d.externos,
  usado_por: usedBy(f).length, usado_por_modulos: uniq(usedBy(f).map(dominioDe).filter(Boolean)), coberto_por_testes: (cobertoPor.get(f) || []).length,
  orfao: usedBy(f).length === 0 && !/index\.[tj]sx?$|main\.[tj]sx?$|\.d\.ts$/.test(f),
})).sort((a, b) => a.arquivo.localeCompare(b.arquivo));
testes.sem_teste.servicos = logica.filter((l) => !l.coberto_por_testes && l.usado_por > 0 && l.camada.startsWith('serv')).map((l) => l.arquivo);

// ---------- grafo ----------
const prodFiles = [...FILE.entries()].filter(([, d]) => !d.teste).map(([f]) => f);
const idx = new Map(prodFiles.map((f, i) => [f, i]));
let index = 0; const low = new Map(), ord = new Map(), onS = new Set(), S = [], sccs = [];
function tarjan(v) {
  ord.set(v, index); low.set(v, index); index++; S.push(v); onS.add(v);
  for (const w of FILE.get(v).imports) { if (!idx.has(w)) continue; if (!ord.has(w)) { tarjan(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (onS.has(w)) low.set(v, Math.min(low.get(v), ord.get(w))); }
  if (low.get(v) === ord.get(v)) { const c = []; let w; do { w = S.pop(); onS.delete(w); c.push(w); } while (w !== v); if (c.length > 1) sccs.push(c.sort()); }
}
for (const f of prodFiles) if (!ord.has(f)) tarjan(f);
const entradas = new Set([...rotasEnriched.map((r) => r.arquivo), ...vistasEnriched.map((v) => v.arquivo), ...edges.map((e) => e.entrada), ...ALL.filter((f) => /^(src\/)?(main|index|App)\.[tj]sx?$/.test(f) || /^scripts\//.test(f))].filter(Boolean));
const grafo = {
  nos: prodFiles.length, arestas: prodFiles.reduce((s, f) => s + FILE.get(f).imports.length, 0),
  hubs: [...USED_BY.entries()].filter(([f]) => !FILE.get(f)?.teste).map(([f, u]) => ({ arquivo: f, importado_por: u.length })).sort((a, b) => b.importado_por - a.importado_por || a.arquivo.localeCompare(b.arquivo)).slice(0, 40),
  ciclos: { total: sccs.length, maiores: sccs.sort((a, b) => b.length - a.length).slice(0, 15).map((c) => ({ tamanho: c.length, arquivos: c.slice(0, 12) })) },
  orfaos: prodFiles.filter((f) => !usedBy(f).length && !entradas.has(f) && !/\.d\.ts$|\.config\.|^supabase\/functions\/_shared|^src\/types\//.test(f) && !lazyMap.has(FILE.get(f).exports[0])).slice(0, 300),
  arestas_lista: Object.fromEntries(prodFiles.filter((f) => FILE.get(f).imports.length).map((f) => [f, FILE.get(f).imports])),
};

// ---------- baseline ----------
const gitInfo = {
  commit: git('rev-parse HEAD') || null, branch: git('rev-parse --abbrev-ref HEAD') || null, data_commit: git('log -1 --format=%cI') || null,
  ultimos_commits: git('log -25 --format=%h|%cs|%s').split('\n').filter(Boolean).map((l) => { const [h, d, ...s] = l.split('|'); return { sha: h, data: d, assunto: s.join('|').slice(0, 120) }; }),
  arquivos_mudados_7d: uniq(git('log --since=7.days --name-only --format=').split('\n').filter(Boolean)).length,
  pastas_mais_mudadas_30d: Object.entries(git('log --since=30.days --name-only --format=').split('\n').filter(Boolean).reduce((a, f) => { const k = f.split('/').slice(0, 3).join('/'); a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([pasta, n]) => ({ pasta, mudancas: n })),
};
const byDir = {};
for (const [f, d] of FILE) { const k = f.split('/').slice(0, 2).join('/'); byDir[k] = byDir[k] || { arquivos: 0, linhas: 0 }; byDir[k].arquivos++; byDir[k].linhas += d.linhas; }
const baseline = {
  git: gitInfo,
  contagens: { arquivos_total: ALL.length, arquivos_codigo: CODE_FILES.length, linhas_codigo: [...FILE.values()].reduce((s, d) => s + d.linhas, 0), rotas: rotasEnriched.length, vistas_por_id: vistasEnriched.length, itens_menu: menuUniq.length, modulos: modulos.length, componentes: componentes.length, hooks: hooksOut.length, edge_functions: edges.length, tabelas: Object.keys(bancoOut.tabelas).length, migrations: bancoOut.migrations, testes: testes.total, workflows: workflows.length, scripts: scriptsRepo.length },
  por_pasta: sortObj(byDir),
  maiores_arquivos: [...FILE.entries()].filter(([, d]) => !d.teste).map(([f, d]) => ({ arquivo: f, linhas: d.linhas })).sort((a, b) => b.linhas - a.linhas).slice(0, 25),
  qualidade: { any: [...FILE.values()].reduce((s, d) => s + d.any_count, 0), console_log: [...FILE.values()].reduce((s, d) => s + d.console_count, 0), ts_ignore: [...FILE.values()].reduce((s, d) => s + d.ts_ignore, 0), todos: [...FILE.values()].reduce((s, d) => s + d.todos.length, 0) },
  todos: cap([...FILE.entries()].flatMap(([f, d]) => d.todos.map((t) => ({ arquivo: f, ...t }))), 300),
  alertas: {
    rotas_sem_arquivo: rotasEnriched.filter((r) => !r.arquivo).map((r) => r.caminho),
    menu_sem_destino: menuUniq.filter((m) => !resolveDestino(m.destino)).map((m) => `${m.rotulo} -> ${m.destino}`),
    edges_orfas: edges.filter((e) => e.orfa).map((e) => e.nome),
    edges_chamadas_sem_pasta: edgesNoCodigoSemPasta,
    tabelas_sem_rls: Object.entries(bancoOut.tabelas).filter(([, t]) => t.sem_rls).map(([n]) => n),
    tabelas_usadas_sem_migration: bancoOut.tabelas_usadas_no_codigo_sem_migration,
    rpcs_sem_definicao: bancoOut.rpcs_usadas_no_codigo.filter((r) => !r.definida_em_migration).map((r) => r.nome),
    componentes_orfaos: componentes.filter((c) => c.orfao).map((c) => c.arquivo).slice(0, 200),
    scripts_orfaos: scriptsRepo.filter((s) => s.orfao).map((s) => s.arquivo),
    env_usadas_nao_declaradas: ferramentas.env.usadas_mas_nao_declaradas,
    ciclos_de_import: grafo.ciclos.total,
    possiveis_segredos_no_codigo: cap([...FILE.entries()].flatMap(([f, d]) => { const out = []; let ln = 0; for (const line of d.conteudo.split('\n')) { ln++; if (/eyJ[a-zA-Z0-9_-]{30,}\.|sk_live_|sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{30,}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE/.test(line)) out.push(`${f}:${ln}`); } return out; }), 50),
  },
};

// ---------- montagem e escrita ----------
fs.mkdirSync(OUT, { recursive: true });
const outRel = rel(OUT);
const AVISO = 'GERADO AUTOMATICAMENTE por scripts/ai-context/gerar.mjs — não editar à mão; será sobrescrito.';
const files = {
  'rotas.json': { aviso: AVISO, format_version: FORMAT_VERSION, resumo: { urls: rotasEnriched.length, vistas_por_id: vistasEnriched.length, itens_menu: menuUniq.length, lazy: lazyMap.size }, urls: rotasEnriched, vistas: vistasEnriched, menu: menuUniq.map((m) => ({ ...m, resolve_para: (resolveDestino(m.destino) || {}).arquivo || null })), lazy: sortObj(Object.fromEntries(lazyMap)) },
  'modulos.json': { aviso: AVISO, format_version: FORMAT_VERSION, descricao: 'menu → módulo (pasta de domínio) → telas → hooks → edge functions → tabelas', modulos },
  'componentes.json': { aviso: AVISO, format_version: FORMAT_VERSION, total: componentes.length, orfaos: componentes.filter((c) => c.orfao).length, componentes },
  'hooks.json': { aviso: AVISO, format_version: FORMAT_VERSION, total: hooksOut.length, hooks: hooksOut.sort((a, b) => a.arquivo.localeCompare(b.arquivo)) },
  'edge-functions.json': { aviso: AVISO, format_version: FORMAT_VERSION, total: edges.length, verify_jwt_false: edges.filter((e) => !e.verify_jwt).map((e) => e.nome), shared: ALL.filter((f) => f.startsWith(edgeDir + '/_shared/')), edges, chamadas_sem_pasta: edgesNoCodigoSemPasta },
  'banco.json': { aviso: AVISO, format_version: FORMAT_VERSION, nota: 'Reconstruído das migrations e do types.ts do repo — é a visão do CÓDIGO, não do banco vivo. Diferenças entre colunas (migrations) e colunas_types (types.ts) indicam drift.', ...bancoOut },
  'ferramentas.json': { aviso: AVISO, format_version: FORMAT_VERSION, ...ferramentas },
  'scripts.json': { aviso: AVISO, format_version: FORMAT_VERSION, total: scriptsRepo.length, scripts: scriptsRepo },
  'testes.json': { aviso: AVISO, format_version: FORMAT_VERSION, ...testes },
  'logica.json': { aviso: AVISO, format_version: FORMAT_VERSION, total: logica.length, por_camada: logica.reduce((a, l) => { a[l.camada] = (a[l.camada] || 0) + 1; return a; }, {}), arquivos: logica },
  'grafo.json': { aviso: AVISO, format_version: FORMAT_VERSION, ...grafo },
  'baseline.json': { aviso: AVISO, format_version: FORMAT_VERSION, ...baseline },
};
const hashes = {};
for (const [name, data] of Object.entries(files)) { const txt = JSON.stringify(data, null, 1) + '\n'; fs.writeFileSync(path.join(OUT, name), txt); hashes[name] = sha(txt); }

// INDEX.md — ponto de entrada dos agentes
const c = baseline.contagens;
const li = (arr, f = (x) => x) => (arr.length ? arr.map((x) => `- ${f(x)}`).join('\n') : '- (nenhum)');
const indexMd = `# Contexto do projeto para agentes de IA

${AVISO}
Publicado na branch \`contexto-ia\` (= main + 1 commit) a cada push em \`main\` e a cada 10 minutos pelo workflow \`contexto-ia.yml\`; gere local com \`node scripts/ai-context/gerar.mjs\`. Commit-base: \`${gitInfo.commit || 'n/d'}\` (${gitInfo.data_commit || 'n/d'}).

## Como usar (leia antes de planejar ou executar qualquer tarefa)
1. **Tarefa em tela/rota** → \`rotas.json\` (url → arquivo → hooks → tabelas → edges) e \`modulos.json\` (o módulo inteiro: menu, telas, hooks, edges, tabelas, dependências entre módulos).
2. **Tarefa em hook/serviço** → \`hooks.json\` / \`logica.json\` (quem usa, que tabelas/edges toca, se tem teste).
3. **Tarefa em edge function** → \`edge-functions.json\` (verify_jwt, tabelas, env, quem chama, órfãs).
4. **Tarefa em banco** → \`banco.json\` (colunas, RLS, policies, índices, FKs, triggers, uso no código) — visão do código; para o banco vivo use o MCP do Supabase.
5. **Antes de criar arquivo novo** → \`componentes.json\` e \`grafo.json\` (evite duplicar; veja hubs e órfãos).
6. **Antes de tocar CI/scripts** → \`ferramentas.json\` (workflows, scripts npm, env, secrets por nome) e \`scripts.json\`.
7. **Antes de abrir PR** → \`testes.json\` (o que já tem teste, o que não tem) e \`baseline.json\` (alertas, TODOs, métricas de qualidade, o que mudou nos últimos dias).
Os JSONs são grandes: leia com \`grep\`/\`jq\` pelo caminho/arquivo/tabela da sua tarefa; não carregue tudo.

## Stack
${Object.entries(stack).filter(([k]) => k !== 'alias_imports').map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') || 'n/d' : v ?? 'n/d'}`).join('\n')}
- alias de import: ${Object.entries(aliases).map(([a, d]) => `\`${a}\` → \`${d}\``).join(', ') || 'nenhum'}

## Números
| item | qtd |
|---|---|
${Object.entries(c).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Módulos (menu → domínio)
| módulo | itens de menu | telas | arquivos | hooks locais | edges | tabelas |
|---|---|---|---|---|---|---|
${modulos.filter((m) => m.itens_menu.length || m.telas.length || m.arquivos >= 5).map((m) => `| ${m.modulo} | ${m.itens_menu.length} | ${m.telas.length} | ${m.arquivos} | ${m.hooks_locais.length} | ${m.edges.length} | ${m.tabelas.length} |`).join('\n')}

## Rotas (url → arquivo)
${li(rotasEnriched, (r) => `\`${r.caminho}\` → ${r.arquivo || '**ARQUIVO NÃO RESOLVIDO**'}${r.protegida ? ' (protegida)' : ''}`)}

## Vistas por id (menu/ViewRouter → arquivo)
${li(vistasEnriched, (v) => `\`${v.id}\` → ${v.arquivo || '**NÃO RESOLVIDO**'}`)}

## Edge functions
${li(edges, (e) => `\`${e.nome}\`${e.verify_jwt ? '' : ' (verify_jwt=false)'} — tabelas: ${e.tabelas.join(', ') || '-'}; chamada por ${e.chamada_pelo_front.length} arquivo(s) do front${e.orfa ? ' — **ÓRFÃ**' : ''}`)}

## Alertas (do baseline.json)
${Object.entries(baseline.alertas).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.length : v}`).join('\n')}

## Workflows
${li(workflows, (w) => `\`${path.posix.basename(w.arquivo)}\` — ${w.nome} (${w.gatilhos.join(', ')}${w.crons.length ? '; cron ' + w.crons.join(' | ') : ''})`)}

## Scripts npm
${li(Object.entries(pkg.scripts || {}), ([k, v]) => `\`${k}\`: \`${v}\``)}

## Documentos na raiz
${li(docsRaiz)}

## Últimos commits
${li(gitInfo.ultimos_commits.slice(0, 15), (x) => `${x.data} \`${x.sha}\` ${x.assunto}`)}

## Arquivos deste diretório
${Object.keys(files).map((f) => `- \`${outRel}/${f}\``).join('\n')}
- \`${outRel}/manifest.json\` (commit, data, hashes — único arquivo com data/hora)
`;
fs.writeFileSync(path.join(OUT, 'INDEX.md'), indexMd);
hashes['INDEX.md'] = sha(indexMd);
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ aviso: AVISO, format_version: FORMAT_VERSION, gerado_em: new Date().toISOString(), commit: gitInfo.commit, branch: gitInfo.branch, gerador: 'scripts/ai-context/gerar.mjs', arquivos: sortObj(hashes), contagens: c }, null, 1) + '\n');
log(`escrito em ${outRel}/ (${Object.keys(files).length + 2} arquivos)`);
log(`rotas=${c.rotas} vistas=${c.vistas_por_id} menu=${c.itens_menu} modulos=${c.modulos} hooks=${c.hooks} edges=${c.edge_functions} tabelas=${c.tabelas} testes=${c.testes}`);
