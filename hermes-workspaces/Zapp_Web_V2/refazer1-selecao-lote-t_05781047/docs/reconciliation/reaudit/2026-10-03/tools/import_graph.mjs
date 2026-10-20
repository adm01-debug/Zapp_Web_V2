import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const [root, integrityFile, parserPath, outDir] = process.argv.slice(2);
const ts = require(parserPath);
const inventory = JSON.parse(fs.readFileSync(integrityFile, 'utf8'));
const tracked = new Map(inventory.files.map(r => [r.path, r]));
const modulePaths = [...tracked.keys()].filter(p => /\.(?:[cm]?[jt]sx?)$/.test(p));
const isTest = p => /(?:^|\/)(?:__tests__|tests|test|e2e|qa|fixtures)(?:\/|$)|\.(?:test|spec)\./.test(p);
const references = [];
function resolve(from, spec) {
  if (!(spec.startsWith('.') || spec.startsWith('@/'))) return null;
  const base = spec.startsWith('@/') ? 'src/' + spec.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  const opts = [base, ...['.ts','.tsx','.js','.jsx','.mts','.mjs','.cts','.cjs','.json'].map(e => base + e), ...['.ts','.tsx','.js','.jsx'].map(e => base + '/index' + e)];
  if (/\.[cm]?js$/.test(base)) opts.push(base.replace(/\.[cm]?js$/, '.ts'), base.replace(/\.[cm]?js$/, '.tsx'));
  return opts.find(p => tracked.has(p)) || null;
}
for (const file of modulePaths) {
  const buf = fs.readFileSync(path.join(root, file));
  const sha = crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
  if (sha !== tracked.get(file).git_blob_sha) throw new Error(`Source changed: ${file}`);
  const sf = ts.createSourceFile(file, buf.toString('utf8'), ts.ScriptTarget.Latest, true);
  const add = (node, spec, kind, typeOnly = false) => {
    const local = spec.startsWith('.') || spec.startsWith('@/');
    if (!local) return;
    references.push({ from: file, to: resolve(file, spec), specifier: spec, kind, type_only: typeOnly, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
  };
  const visit = n => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) add(n, n.moduleSpecifier.text, 'import', !!n.importClause?.isTypeOnly);
    else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) add(n, n.moduleSpecifier.text, 'export', !!n.isTypeOnly);
    else if (ts.isCallExpression(n) && n.arguments.length && ts.isStringLiteral(n.arguments[0])) {
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword) add(n, n.arguments[0].text, 'dynamic_import_literal');
      else if (ts.isIdentifier(n.expression) && n.expression.text === 'require') add(n, n.arguments[0].text, 'require_literal');
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
const incoming = new Map();
const outgoing = new Map();
for (const r of references.filter(r => r.to && !r.type_only && !isTest(r.from))) {
  if (!incoming.has(r.to)) incoming.set(r.to, []);
  incoming.get(r.to).push(r);
  if (!outgoing.has(r.from)) outgoing.set(r.from, []);
  outgoing.get(r.from).push(r.to);
}
const roots = ['src/main.tsx','src/main.ts','src/index.tsx'].filter(p => tracked.has(p));
const reachable = new Set(); const queue = [...roots];
while (queue.length) { const p = queue.pop(); if (reachable.has(p)) continue; reachable.add(p); queue.push(...(outgoing.get(p) || [])); }
const files = modulePaths.map(p => ({ path: p, is_test: isTest(p), incoming_non_test_runtime_references: incoming.get(p)?.length || 0, potentially_reachable_from_frontend_entry: reachable.has(p) }));
const limitations = [
  'An import/re-export graph is not a symbol call graph: a re-export can be unused, and a reachable module can contain dormant functions.',
  'Literal local imports, exports, require and dynamic import are indexed. Computed imports, framework conventions, HTML/script entrypoints and remote modules need separate inspection.',
  'Only src/main.tsx, src/main.ts and src/index.tsx are frontend roots; edge/server/script entrypoints must not be classified as dead because they are outside those roots.',
  'Unresolved local references are candidates (including bundler query strings/assets), not automatically build errors.',
];
fs.mkdirSync(outDir, {recursive:true});
fs.writeFileSync(path.join(outDir,'import-graph.json'), JSON.stringify({ head_sha: inventory.head_sha, parser: ts.version, roots, limitations, references, files }, null, 2)+'\n');
const frontend = files.filter(f => f.path.startsWith('src/') && !f.is_test);
const summary = { head_sha: inventory.head_sha, parsed_modules: modulePaths.length, local_references: references.length, resolved: references.filter(r=>r.to).length, unresolved: references.filter(r=>!r.to).length, frontend_modules: frontend.length, frontend_modules_potentially_reachable: frontend.filter(r=>r.potentially_reachable_from_frontend_entry).length, frontend_modules_without_incoming_runtime_reference: frontend.filter(r=>!r.incoming_non_test_runtime_references).length, roots, limitations };
fs.writeFileSync(path.join(outDir,'import-graph-summary.json'), JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
