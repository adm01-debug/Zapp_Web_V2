/* Parse/format a read-only copy for review. Never evaluates the vendored code. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('/workspace/scratch/8b95153002da/audit/tools/ast/node_modules/typescript');
const root = '/workspace/scratch/f8f9b9cbce53/reaudit';
const relative = 'public/vendor/lamejs-1.2.1.min.js';
const raw = fs.readFileSync(path.join(root, 'source', relative));
const original = raw.toString('utf8');
const parsed = ts.createSourceFile(relative, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
if (parsed.parseDiagnostics.length) throw new Error('Original parser diagnostics');
const printed = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(parsed);
const formatted = ts.createSourceFile('lamejs.readable.js', printed, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
if (formatted.parseDiagnostics.length) throw new Error('Formatted parser diagnostics');
function bodies(file) {
  const rows = [];
  function visit(node) {
    if (ts.isFunctionLike(node) && node.body) {
      const label = node.name?.getText(file) || (node.parent && ts.isBinaryExpression(node.parent) ? node.parent.left.getText(file) : '<anonymous>');
      const start = file.getLineAndCharacterOfPosition(node.getStart(file));
      const end = file.getLineAndCharacterOfPosition(node.end);
      rows.push({ name: label, kind: ts.SyntaxKind[node.kind], start: node.getStart(file), end: node.end, line_start: start.line + 1, line_end: end.line + 1 });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return rows;
}
const before = bodies(parsed), after = bodies(formatted);
if (before.length !== after.length || before.some((r, i) => r.name !== after[i].name || r.kind !== after[i].kind)) throw new Error('Function traversal mismatch');
const out = path.join(root, 'reports/modules/vendor');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'lamejs.readable.js'), printed);
const manifest = {
  head_sha: 'da307ba5626dce892f0b37cb6762463f55d14a96', source_path: relative,
  source_git_blob_sha: crypto.createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex'),
  original_bytes: raw.length, original_lines: original.split('\n').length - (original.endsWith('\n') ? 1 : 0),
  formatted_lines: printed.split('\n').length - 1,
  formatted_sha256: crypto.createHash('sha256').update(printed).digest('hex'),
  function_count: before.length, method: 'TypeScript printer of parsed original; no source mutation or evaluation; function traversal names/kinds/count matched.',
  functions: before.map((item, i) => ({ id: `VENDOR-${String(i + 1).padStart(3, '0')}`, name: item.name, kind: item.kind, source: item, formatted: after[i], review_status: 'NOT_YET_READ' })),
};
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ source_path: relative, original_bytes: manifest.original_bytes, original_lines: manifest.original_lines, formatted_lines: manifest.formatted_lines, function_count: manifest.function_count, source_git_blob_sha: manifest.source_git_blob_sha }));
