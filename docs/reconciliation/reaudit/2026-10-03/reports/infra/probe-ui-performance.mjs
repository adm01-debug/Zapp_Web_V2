// Finite offline probes. Source text and compiler are pinned before loading.
// Product modules/packages, browser, network and database are not imported.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = '/workspace/scratch/f8f9b9cbce53/reaudit/source';
const pinFile = path.join(here, 'ui-performance-probe-pins.json');
const pins = JSON.parse(fs.readFileSync(pinFile, 'utf8'));
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
for (const p of pins.sources) assert.equal(hash(fs.readFileSync(path.join(root, p.path))), p.sha256, `source pin ${p.path}`);
assert.equal(hash(fs.readFileSync(pins.compiler.path)), pins.compiler.sha256, 'compiler pin');
const ts = createRequire(import.meta.url)(pins.compiler.path);
const sources = new Map();
function source(p) {
  if (!sources.has(p)) sources.set(p, ts.createSourceFile(p, fs.readFileSync(path.join(root, p), 'utf8'), ts.ScriptTarget.Latest, true, p.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
  return sources.get(p);
}
function node(p, name, scopeName) {
  const sf = source(p); let scope = sf;
  if (scopeName) {
    const roots = sf.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === scopeName);
    assert.equal(roots.length, 1, `scope ${scopeName}`); scope = roots[0];
  }
  const matches = [];
  function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(sf) === name) matches.push(n); ts.forEachChild(n, visit); }
  visit(scope); assert.equal(matches.length, 1, `unique node ${name}`);
  let value = matches[0].initializer;
  if (ts.isCallExpression(value) && /^(React\.)?(useMemo|useCallback|useDebounce)$/.test(value.expression.getText(sf))) value = value.arguments[0];
  return value.getText(sf);
}
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true };
function callback(p, name, context, scope) {
  const code = ts.transpileModule(`(${node(p, name, scope)})`, { compilerOptions: options }).outputText;
  assert.equal(/(?:require\(|import\()/u.test(code), false, 'callback has no imports');
  return vm.runInNewContext(code, context, { timeout: 2000 });
}
function moduleText(p, modules, extra = {}) {
  const exports = {};
  const code = ts.transpileModule(source(p).text, { compilerOptions: options }).outputText;
  assert.equal(/import\(/u.test(code), false, 'no dynamic imports');
  vm.runInNewContext(code, { exports, require: name => { assert.ok(Object.hasOwn(modules, name), `import denied ${name}`); return modules[name]; }, ...extra }, { timeout: 2000 });
  return exports;
}
const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), forwardRef: render => render, useCallback: x => x, useRef: current => ({ current }) };
const iconNames = ['Inbox', 'LayoutDashboard', 'Users', 'Phone', 'Zap', 'BarChart3', 'Shield', 'Settings', 'Plus', 'Keyboard'];
const dataPath = 'src/components/ui/command-palette-data.tsx';
const data = moduleText(dataPath, { react: React, 'lucide-react': Object.fromEntries(iconNames.map(n => [n, `Icon:${n}`])) });
const palette = 'src/components/ui/command-palette.tsx';
const cases = [];
const plain = x => JSON.parse(JSON.stringify(x));
const allCommands = [...data.defaultNavigationCommands, ...data.defaultActionCommands];
function groups(query, searchResults) {
  const filteredCommands = callback(palette, 'filteredCommands', { query, allCommands, fuzzyMatch: data.fuzzyMatch }, 'CommandPalette')();
  return callback(palette, 'groupedCommands', { query, filteredCommands, searchResults }, 'CommandPalette')();
}

// P01: use the real debounce implementation; manually advance its timer
// boundary. Both calls start after their 300 ms timers, then B resolves first.
{
  const scheduled = new Map(); let timerId = 0; const requested = []; const resolvers = {};
  const state = { query: 'azul', searchResults: [], searching: false };
  const search = callback(palette, 'debouncedSearch', {
    onSearch: query => { requested.push(query); return new Promise(resolve => { resolvers[query] = resolve; }); },
    setSearchResults: x => { state.searchResults = x; },
    setIsSearching: x => { state.searching = x; },
    log: { error: () => assert.fail('unexpected swallowed harness error') },
  }, 'CommandPalette');
  const inFlight = new Map();
  const trackedSearch = query => { const completion = search(query); inFlight.set(query, completion); return completion; };
  const debounce = moduleText('src/hooks/system/useDebounce.ts', { react: React }, {
    setTimeout: (fn, delay) => { assert.equal(delay, 300); scheduled.set(++timerId, fn); return timerId; },
    clearTimeout: id => scheduled.delete(id),
  }).useDebounce(trackedSearch, 300);
  const flushTimers = () => { const fns = [...scheduled.values()]; scheduled.clear(); fns.forEach(fn => fn()); };
  debounce('azul'); flushTimers();
  state.query = 'vermelho'; debounce('vermelho'); flushTimers();
  assert.deepEqual(requested, ['azul', 'vermelho']);
  const resultB = [{ id: 'catalog-B', title: 'Produto vermelho', category: 'search', href: '/?view=catalog&product=B&send=1' }];
  const resultA = [{ id: 'catalog-A', title: 'Produto azul', category: 'search', href: '/?view=catalog&product=A&send=1' }];
  resolvers.vermelho(resultB); await inFlight.get('vermelho');
  const afterB = plain(state);
  assert.equal(state.searchResults[0].id, 'catalog-B');
  resolvers.azul(resultA); await inFlight.get('azul');
  assert.equal(state.query, 'vermelho'); assert.equal(state.searchResults[0].id, 'catalog-A');
  const visible = groups(state.query, state.searchResults);
  assert.equal(visible.flatMap(g => g.items).some(i => i.id === 'catalog-A'), true);
  // Control: pending debounce calls coalesce before a request begins.
  debounce('pendente-A'); debounce('pendente-B');
  assert.equal(scheduled.size, 1); flushTimers();
  assert.equal(requested.includes('pendente-A'), false); assert.equal(requested.at(-1), 'pendente-B');
  resolvers['pendente-B']([]); await inFlight.get('pendente-B');
  cases.push({ id: 'INF-UI-P01', finding: 'R2-INF-032', executed: 'actual debounce module + async search/group callbacks', observed: { query: 'vermelho', after_B: afterB.searchResults, after_late_A: plain(visible) }, control: 'Pending timers coalesce; already-started async requests do not cancel or fence each other.', limitation: 'Synthetic successful result envelopes. No catalog Edge invocation, React renderer, browser navigation or message send.' });
}

// P02: source default commands are filtered and fed to source executor.
{
  const effects = []; const closed = []; const queries = [];
  const window = { location: { href: 'unchanged' } };
  const execute = callback(palette, 'executeCommand', { window, onNavigate: v => effects.push(['navigate', v]), onOpenChange: v => closed.push(v), setQuery: v => queries.push(v) }, 'CommandPalette');
  const observations = [];
  for (const item of data.defaultActionCommands) {
    assert.equal(groups(item.title, []).flatMap(g => g.items).some(i => i.id === item.id), true, 'default action appears for its title');
    const before = { effects: effects.length, closes: closed.length };
    execute(item);
    assert.equal(effects.length, before.effects); assert.equal(closed.length, before.closes + 1); assert.equal(window.location.href, 'unchanged');
    observations.push({ id: item.id, visible: true, performed_action_or_navigation: false, closed: closed.at(-1) === false });
  }
  execute(data.defaultNavigationCommands[0]); assert.deepEqual(effects.at(-1), ['navigate', 'inbox']);
  execute({ id: 'explicit', action: () => effects.push(['action', 'explicit']) }); assert.deepEqual(effects.at(-1), ['action', 'explicit']);
  const beforeDisabled = closed.length; execute({ id: 'disabled', disabled: true, action: () => assert.fail('disabled') }); assert.equal(closed.length, beforeDisabled);
  cases.push({ id: 'INF-UI-P02', finding: 'R2-INF-033', executed: 'entire default data module + actual filtering and executeCommand', observed: observations, controls: { navigation_dispatch: true, explicit_action_dispatch: true, disabled_no_effect: true }, limitation: 'Host wiring is separately read in full; fake navigation records calls without opening any page.' });
}

// P03: the initial displayed quick list is not the source keyboard list.
{
  const groupedCommands = groups('', []);
  const allItems = callback(palette, 'allItems', { groupedCommands }, 'CommandPalette')();
  const quickItems = data.defaultNavigationCommands.slice(0, 5);
  const executions = []; const prevented = [];
  const state = { open: true, allItems, selectedIndex: 0, executeCommand: item => executions.push(item.id) };
  state.setSelectedIndex = fn => { state.selectedIndex = fn(state.selectedIndex); };
  const key = callback(palette, 'h', state, 'CommandPalette');
  const emit = name => key({ key: name, preventDefault: () => prevented.push(name) });
  assert.equal(quickItems.length, 5); assert.equal(allItems.length, 0);
  emit('ArrowDown'); emit('Enter');
  assert.equal(state.selectedIndex, 0); assert.equal(executions.length, 0);
  const observed = { visible_quick_items: quickItems.map(i => i.id), keyboard_items: allItems.length, selected_index_after_down: state.selectedIndex, executions: [...executions], prevented: [...prevented] };
  // Control: a queried item is entered into allItems and Enter invokes it.
  state.allItems = [data.defaultNavigationCommands[0]]; emit('Enter');
  assert.deepEqual(executions, ['nav-inbox']);
  cases.push({ id: 'INF-UI-P03', finding: 'R2-INF-034', executed: 'actual grouping/allItems and scoped keyboard callback', observed, control: { queried_item_enter_executes: executions[0] }, limitation: 'No DOM/default button activation simulated. Claim is specifically arrow/Enter handler from the focused search input with empty query; Tab/click remain separate working paths.' });
}

// P04 captures the actual wrapper JSX boundary. The Radix package is NOT
// loaded or emulated; accessible DOM semantics are a documented contract.
{
  const component = moduleText('src/components/ui/progress.tsx', { react: React, '@radix-ui/react-progress': { Root: 'RadixRoot', Indicator: 'RadixIndicator' }, '@/lib/utils': { cn: (...xs) => xs.filter(Boolean).join(' ') } }).Progress;
  const tree = component({ value: 25, max: 100, 'aria-label': 'Envio sintético', className: 'sample' }, null);
  assert.equal(tree.type, 'RadixRoot'); assert.equal(Object.hasOwn(tree.props, 'value'), false);
  assert.equal(tree.props.max, 100); assert.equal(tree.props['aria-label'], 'Envio sintético');
  assert.equal(tree.props.children[0].props.style.transform, 'translateX(-75%)');
  const complete = component({ value: 100 }, null);
  assert.equal(complete.props.children[0].props.style.transform, 'translateX(-0%)'); assert.equal(Object.hasOwn(complete.props, 'value'), false);
  cases.push({ id: 'INF-UI-P04', finding: 'R2-INF-035', executed: 'entire Progress wrapper with inert React element capture', observed: { input_value: 25, root_has_value: false, indicator_transform: tree.props.children[0].props.style.transform, complete_root_has_value: false }, controls: { max_forwarded: tree.props.max, aria_label_forwarded: tree.props['aria-label'] }, reference: 'https://www.radix-ui.com/primitives/docs/components/progress', limitation: 'Does not import locked Radix1.1.16, render DOM or test assistive technology. Proves missing Root.value, not an observed screen-reader announcement. Adjacent textual percentages remain available in inspected consumers.' });
}

assert.equal(cases.length, 4);
const result = { schema_version: 1, baseline_sha: pins.baseline_sha, probe_source_sha256: hash(fs.readFileSync(new URL(import.meta.url))), pins_sha256: hash(fs.readFileSync(pinFile)), case_count: cases.length, finding_ids: cases.map(x => x.finding), cases, controls: { source_and_compiler_pins_before_import: true, production_imports: 0, product_network_calls: 0, database_calls: 0, product_mutations: 0, source_writes: 0, react_dom_render: false, compiler_scope: 'transpileModule only, not typecheck/build/suite success', no_hidden_error_handler_success: true }, limitations: 'Four bounded evidence cases, not four additional findings. Synthetic boundary values only; only this audit output file is written.' };
fs.writeFileSync(path.join(here, 'ui-performance-probes.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ case_count: cases.length, source_pins_checked: pins.sources.length, finding_ids: result.finding_ids, output: 'ui-performance-probes.json' }));
