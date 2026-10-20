'use strict';
// Offline source probe. Explicit React hook/effect scheduler; no product scripts or real services.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ROOT = path.resolve(process.env.REAUDIT_SOURCE_ROOT || path.join(__dirname, '../../source'));
const PINS_PATH = path.resolve(process.env.REAUDIT_SOURCE_PINS || path.join(__dirname, 'gamification-pins.json'));
const INTEGRITY_PATH = path.resolve(process.env.REAUDIT_INTEGRITY || path.join(ROOT, '../source-integrity.json'));
const OUT = path.resolve(process.env.REAUDIT_OUTPUT || path.join(__dirname, 'gamification-results.json'));
const pins = JSON.parse(fs.readFileSync(PINS_PATH, 'utf8'));
const manifestBytes = fs.readFileSync(INTEGRITY_PATH);
assert.equal(crypto.createHash('sha256').update(manifestBytes).digest('hex'), pins.integrity_manifest_sha256);
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.head_sha, pins.expected_head);
assert.equal(manifest.mismatches.length, 0);
const gitCheckout = fs.existsSync(path.join(ROOT, '.git'));
if (gitCheckout) {
  const head = require('node:child_process').execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(head, pins.expected_head);
}
const manifestPins = new Map(manifest.files.map(p => [p.path, p]));
const verified = new Map();
const blob = b => crypto.createHash('sha1').update(Buffer.from('blob ' + b.length + '\0')).update(b).digest('hex');
for (const p of pins.files) {
  assert.equal(manifestPins.get(p.path)?.git_blob_sha, p.git_blob_sha);
  const bytes = fs.readFileSync(path.join(ROOT, p.path));
  assert.equal(bytes.length, p.bytes);
  assert.equal(blob(bytes), p.git_blob_sha, 'Source differs from pins: ' + p.path);
  verified.set(p.path, bytes.toString('utf8'));
}
// No product source is parsed/transpiled/evaluated before the complete preflight above.
const ts = require(process.env.REAUDIT_TYPESCRIPT || '/workspace/scratch/8b95153002da/audit/tools/ast/node_modules/typescript');
const source = p => { assert(verified.has(p), 'Unpinned source: ' + p); return verified.get(p); };
function evaluate(file, declarationName, globals, variable = false) {
  const ast = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let node;
  function visit(n) {
    if (variable && ts.isVariableDeclaration(n) && n.name.getText(ast) === declarationName) node = n.initializer;
    if (!variable && ts.isFunctionDeclaration(n) && n.name?.text === declarationName) node = n;
    ts.forEachChild(n, visit);
  }
  visit(ast); assert(node, 'Missing declaration ' + declarationName);
  const code = variable ? 'exports.value = ' + node.getText(ast) + ';' : node.getText(ast) + '\nexports.value = ' + declarationName + ';';
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const scope = { ...globals, exports: {}, Math, JSON };
  vm.runInNewContext(compiled, scope, { filename: file + '#' + declarationName, timeout: 2000 });
  return scope.exports.value;
}
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  for (const child of tree.props?.children || []) { const hit = find(child, predicate); if (hit) return hit; }
  return null;
}
function findAll(tree, predicate, out = []) {
  if (!tree || typeof tree !== 'object') return out;
  if (predicate(tree)) out.push(tree);
  for (const child of tree.props?.children || []) findAll(child, predicate, out);
  return out;
}
const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }) };
const instances = { parent: { slots: [] }, typing: { slots: [] } };
let active, cursor, dirty = true, pendingEffects = [], nextTimer = 0;
const intervals = new Map(), toasts = [], celebrations = [], storage = new Map();
const hooks = {
  useState(initial) {
    const i = cursor++, owner = active;
    if (!(i in owner.slots)) owner.slots[i] = { value: typeof initial === 'function' ? initial() : initial };
    return [owner.slots[i].value, change => {
      const previous = owner.slots[i].value;
      const next = typeof change === 'function' ? change(previous) : change;
      if (!Object.is(previous, next)) { owner.slots[i].value = next; dirty = true; }
    }];
  },
  useEffect(fn, deps) {
    const i = cursor++, owner = active, slot = owner.slots[i];
    const changed = !slot || !deps || !slot.deps || deps.some((v, n) => !Object.is(v, slot.deps[n]));
    if (changed) pendingEffects.push(() => {
      if (slot?.cleanup) slot.cleanup();
      owner.slots[i] = { deps, cleanup: fn() };
    });
  },
};
const names = ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'Card', 'CardContent', 'CardHeader', 'CardTitle', 'Button', 'Badge', 'Progress', 'Input', 'Keyboard', 'Brain', 'Target', 'Timer', 'Zap', 'Star', 'Trophy', 'RotateCcw', 'Gamepad2', 'MessageSquare'];
const globals = { React, ...hooks, ...Object.fromEntries(names.map(n => [n, n])), motion: { button: 'motion.button' },
  secureRandomFloat: () => 0,
  setInterval: fn => { const id = ++nextTimer; intervals.set(id, fn); return id; },
  clearInterval: id => intervals.delete(id),
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  toast: value => toasts.push(value),
  useCelebration: () => ({ celebrate: value => celebrations.push(value) }),
};
const DATA = 'src/components/gamification/miniGamesData.ts';
globals.GAMES = evaluate(DATA, 'GAMES', globals, true);
globals.TYPING_PHRASES = evaluate(DATA, 'TYPING_PHRASES', globals, true);
const GAME = 'src/components/gamification/MiniGameDialogs.tsx';
const PARENT = 'src/components/gamification/TrainingMiniGames.tsx';
const Typing = evaluate(GAME, 'SpeedTypingGame', globals);
globals.SpeedTypingGame = Typing;
globals.QuizGame = 'QuizGame';
globals.EmojiDecodeGame = 'EmojiDecodeGame';
const Training = evaluate(PARENT, 'TrainingMiniGames', globals);
// The active consumer supplies no onXPEarned; assert this wiring in the pinned source.
assert.match(source('src/components/dashboard/DashboardWidgetRenderer.tsx'), /return <TrainingMiniGames \/>;/);
let parentTree, typingTree;
function flush() {
  let cycles = 0;
  while (dirty) {
    assert(++cycles < 30, 'Synthetic scheduler failed to settle');
    dirty = false; pendingEffects = [];
    active = instances.parent; cursor = 0; parentTree = Training({});
    const typingProps = find(parentTree, e => e.type === Typing).props;
    active = instances.typing; cursor = 0; typingTree = Typing(typingProps);
    const effects = pendingEffects; pendingEffects = [];
    for (const effect of effects) effect();
  }
}
flush();
let cards = findAll(parentTree, e => e.type === 'motion.button');
assert.equal(cards.length, 4);
cards[0].props.onClick(); flush();
const input = find(typingTree, e => e.type === 'Input');
input.props.onChange({ target: { value: globals.TYPING_PHRASES[0] } }); flush();
for (let n = 0; n < 60; n++) { for (const tick of [...intervals.values()]) tick(); flush(); }
assert.equal(instances.typing.slots[3].value, 0, 'Timer reached zero');
assert.equal(instances.typing.slots[4].value, true, 'Activity flag was never reset');
assert.equal(instances.parent.slots[1].value, false, 'First game closed');
const completionsAfterTyping = toasts.length;
assert(completionsAfterTyping >= 2, 'Completion repeats after parent close/rerender');
const typingScore = instances.parent.slots[2].value;
const toastOffset = toasts.length;
cards = findAll(parentTree, e => e.type === 'motion.button');
cards[1].props.onClick(); flush();
assert.equal(instances.parent.slots[0].value, 'quiz');
assert.equal(instances.parent.slots[1].value, false, 'Finished typing effect immediately closes newly opened quiz');
assert.equal(find(parentTree, e => e.type === 'QuizGame').props.isOpen, false);
assert(toasts.slice(toastOffset).some(t => t.title.includes('Quiz do Atendimento Completo!')));
const scores = JSON.parse(storage.get('miniGameHighScores'));
assert.equal(scores.quiz, typingScore, 'Typing score wrongly saved under quiz');
for (const p of pins.files) assert.equal(blob(fs.readFileSync(path.join(ROOT, p.path))), p.git_blob_sha, 'Source changed during probe');
const results = [{
  id: 'P-AUTH-11', status: 'PASS_REPRODUCED',
  source: pins.files.map(p => ({ file: p.path, blob_sha: p.git_blob_sha })),
  observed: { completions_after_typing: completionsAfterTyping, typing_score: typingScore, quiz_selected: true,
    quiz_open_after_effects: false, quiz_score_written_without_answer: scores.quiz, toasts_after_selecting_quiz: toasts.slice(toastOffset) },
  limitation: 'Exact SpeedTypingGame/TrainingMiniGames declarations and game constants. Synthetic React useState equality, persistent component slots and dependency-aware useEffect scheduler; virtual intervals advance60 ticks without waiting. Other games are rendered as element stubs, no answers submitted. Proves callback/closure effect ordering and local state/storage corruption, not browser timing or database XP.'
}];
const output = { created_at: new Date().toISOString(), source_head: pins.expected_head,
  provenance: { pins_path: PINS_PATH, integrity_path: INTEGRITY_PATH, integrity_manifest_sha256: pins.integrity_manifest_sha256,
    verified_source_files: pins.files.length, verified_before_execution: true, source_kind: gitCheckout ? 'git_checkout' : 'materialized_git_tree' },
  network_calls: 0, database_calls: 0, source_modified: false, results };
fs.writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ passed: results.length, probes: results.map(r => r.id), output: OUT, observed: results[0].observed }));
