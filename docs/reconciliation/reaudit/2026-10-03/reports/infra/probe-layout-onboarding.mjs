// Bounded offline source probes: no product package, network, browser or DB.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = '/workspace/scratch/f8f9b9cbce53/reaudit/source';
const pinFile = path.join(here, 'layout-onboarding-probe-pins.json');
const pins = JSON.parse(fs.readFileSync(pinFile, 'utf8'));
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
for (const p of pins.sources) assert.equal(hash(fs.readFileSync(path.join(root, p.path))), p.sha256, `source pin ${p.path}`);
assert.equal(hash(fs.readFileSync(pins.compiler.path)), pins.compiler.sha256, 'compiler pin');
const ts = createRequire(import.meta.url)(pins.compiler.path);
const ast = new Map();
const source = p => {
  if (!ast.has(p)) ast.set(p, ts.createSourceFile(p, fs.readFileSync(path.join(root, p), 'utf8'), ts.ScriptTarget.Latest, true, p.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
  return ast.get(p);
};
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true };
function evalText(text, env) {
  const code = ts.transpileModule(text, { compilerOptions: options }).outputText;
  assert.equal(/(?:require\(|import\()/u.test(code), false, 'extracted callback has no imports');
  return vm.runInNewContext(code, env, { timeout: 2000 });
}
function declaration(p, name) {
  const sf = source(p); const found = [];
  function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(sf) === name) found.push(n); ts.forEachChild(n, visit); }
  visit(sf); assert.equal(found.length, 1, `unique variable ${name}`);
  let n = found[0].initializer;
  if (ts.isCallExpression(n) && /^(React\.)?(useCallback|useMemo)$/.test(n.expression.getText(sf))) n = n.arguments[0];
  return n.getText(sf);
}
function callback(p, name, env) { return evalText(`(${declaration(p, name)})`, env); }
function effect(p, predicate, env) {
  const sf = source(p); const found = [];
  function visit(n) { if (ts.isCallExpression(n) && n.expression.getText(sf) === 'useEffect' && predicate(n.arguments[0].getText(sf))) found.push(n.arguments[0]); ts.forEachChild(n, visit); }
  visit(sf); assert.equal(found.length, 1, 'unique selected source effect');
  return evalText(`(${found[0].getText(sf)})`, env);
}
function moduleText(p, modules, extra = {}) {
  const exports = {};
  const code = ts.transpileModule(source(p).text, { compilerOptions: options }).outputText;
  assert.equal(/import\(/u.test(code), false, 'no dynamic product import');
  vm.runInNewContext(code, { exports, require: id => { assert.ok(Object.hasOwn(modules, id), `import denied ${id}`); return modules[id]; }, ...extra }, { timeout: 2000 });
  return exports;
}
const cases = [];

// P01: the real CHECKLIST_STEPS callbacks and actual card's checkAllSteps.
{
  async function check(themeEnvelope) {
    let completed; let loading; const sdkCalls = [];
    const supabase = {
      auth: { getUser: async () => ({ data: { user: { id: 'synthetic-user' } }, error: null }) },
      from: table => { let select;
        const q = {
          select: fields => { select = fields; return q; },
          eq: () => q,
          limit: async () => { sdkCalls.push([table, select]); return { data: [], error: null }; },
          maybeSingle: async () => { sdkCalls.push([table, select]);
            if (table === 'user_settings' && select === 'theme') return themeEnvelope;
            return { data: null, error: null };
          },
        }; return q;
      },
    };
    const icons = Object.fromEntries(['Users','MessageSquare','Clock','Sparkles','Bell','Palette'].map(x => [x,x]));
    const { CHECKLIST_STEPS } = moduleText('src/components/onboarding/checklistSteps.ts', { 'lucide-react': icons, '@/integrations/supabase/client': { supabase } });
    await callback('src/components/onboarding/OnboardingChecklist.tsx', 'checkAllSteps', { CHECKLIST_STEPS, setCompletedSteps: value => completed = value, setIsLoading: value => loading = value, log: { error: () => assert.fail('unexpected swallowed harness error') } })();
    assert.equal(loading, false);
    return { completed: [...completed], total_steps: CHECKLIST_STEPS.length, sdk_calls: sdkCalls.length };
  }
  const missing = await check({ data: null, error: null });
  const error = await check({ data: null, error: { message: 'synthetic unavailable' } });
  const system = await check({ data: { theme: 'system' }, error: null });
  const dark = await check({ data: { theme: 'dark' }, error: null });
  assert.deepEqual(missing.completed, ['theme']); assert.deepEqual(error.completed, ['theme']);
  assert.deepEqual(system.completed, []); assert.deepEqual(dark.completed, ['theme']);
  cases.push({ id: 'INF-LO-P01', finding: 'R2-INF-036', executed: 'entire checklistSteps module + actual card checkAllSteps callback', observed: { missing, error }, controls: { system, dark }, limitation: 'Only fake SDK envelopes; no settings changed. Visible green step/count is confirmed by JSX source separately.' });
}

// P02: active provider writes its real key; real route preference reads another.
{
  function preferences(initial, systemReduced) {
    const store = new Map(Object.entries(initial)); const classes = new Set();
    const localStorage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,String(v)) };
    effect('src/components/theme/HighContrastToggle.tsx', text => text.includes("localStorage.setItem('reducedMotion'"), {
      reducedMotion: true, localStorage, document: { documentElement: { classList: { add: x => classes.add(x), remove: x => classes.delete(x) } } },
    })();
    const config = moduleText('src/components/transitions/transitionConfig.ts', {}, { localStorage });
    const cells = []; const effects = []; let cursor = 0; let first = true;
    const react = {
      useState: init => { const idx = cursor++; if (!(idx in cells)) cells[idx] = typeof init === 'function' ? init() : init; return [cells[idx], value => { cells[idx] = typeof value === 'function' ? value(cells[idx]) : value; }]; },
      useEffect: fn => { if (first) effects.push(fn); },
    };
    const hooks = moduleText('src/components/transitions/useTransitionPreferences.ts', { react, './transitionConfig': config }, { window: { matchMedia: () => ({ matches: systemReduced, addEventListener() {}, removeEventListener() {} }) } });
    hooks.useTransitionPreferences(); effects.forEach(fn => fn()); first = false; cursor = 0;
    const result = hooks.useTransitionPreferences();
    const chosen = callback('src/components/transitions/RouteTransition.tsx', 'config', { reducedMotion: result.reducedMotion, location: { pathname: '/queues/comparison' }, resolveTransition: config.resolveTransition })();
    return { ui_key: store.get('reducedMotion'), ui_class_applied: classes.has('reduced-motion'), route_key: store.get('zapp:reduce-motion') ?? null, route_reduced: result.reducedMotion, chosen_variant: chosen.variant };
  }
  const observed = preferences({}, false);
  const routeKey = preferences({ 'zapp:reduce-motion': '1' }, false);
  const system = preferences({}, true);
  assert.equal(observed.ui_key, 'true'); assert.equal(observed.ui_class_applied, true);
  assert.equal(observed.route_reduced, false); assert.equal(observed.chosen_variant, 'slide');
  assert.equal(routeKey.chosen_variant, 'none'); assert.equal(system.chosen_variant, 'none');
  cases.push({ id: 'INF-LO-P02', finding: 'R2-INF-037', executed: 'actual HighContrast storage effect + transition config/preference modules + route config callback', observed, controls: { route_key: routeKey, system }, limitation: 'Minimal state/effect boundary rerender, no real React or Framer animation. Proves divergent preference/selected variant; CSS reduction remains present and visual movement is not measured.' });
}

// P03: producers are source IDs, not a fabricated "all targets exist" fixture.
// Execute missing-target retry and the real provider's next/end callbacks.
{
  const defaults = moduleText('src/components/onboarding/defaultTourSteps.ts', {}).DEFAULT_ONBOARDING_STEPS;
  const sf = source('src/services/navigation.service.ts'); const navIds = new Set();
  const klass = sf.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'NavigationService');
  assert.ok(klass);
  for (const methodName of ['getPrimaryNav','getGroups','getAdvancedNav']) {
    const method = klass.members.find(n => n.name?.getText(sf) === methodName); assert.ok(method);
    function visit(n) { if (ts.isPropertyAssignment(n) && n.name.getText(sf) === 'id' && ts.isStringLiteral(n.initializer)) navIds.add(n.initializer.text); ts.forEachChild(n, visit); }
    visit(method.body);
  }
  const missing = defaults.filter(s => !navIds.has(s.id));
  assert.deepEqual([...missing.map(x => x.id)], ['notifications','theme']);
  let active = true; let current = 4; let completed = 0; let cleared = false;
  const end = callback('src/components/onboarding/OnboardingTour.tsx', 'endTour', { setIsActive: x => active = x, setCurrentStep: x => current = x, setSteps: x => cleared = x.length === 0, onComplete: () => completed++ });
  const outcomes = [];
  for (const step of missing) {
    const before = current; let queries = 0; const timers = new Map(); let nextId = 0;
    const next = callback('src/components/onboarding/OnboardingTour.tsx', 'nextStep', { currentStep: current, steps: defaults, setCurrentStep: fn => current = fn(current), endTour: end });
    const cleanup = effect('src/components/onboarding/TourOverlay.tsx', text => text.includes('const updatePosition'), {
      isActive: active, currentStepData: step, nextStep: next,
      document: { querySelector: selector => { assert.equal(selector, step.target); queries++; return null; } },
      window: { addEventListener() {}, removeEventListener() {} },
      setTimeout: (fn, delay) => { assert.ok([100,200].includes(delay)); timers.set(++nextId,fn); return nextId; }, clearTimeout: id => timers.delete(id),
      requestAnimationFrame: () => assert.fail('resize not triggered'), cancelAnimationFrame() {},
      setTargetRect: () => assert.fail('absent target cannot measure'), setTooltipPosition: () => assert.fail('absent target cannot position'),
    })();
    let runs = 0;
    while (timers.size) { assert.ok(++runs <= 10); const [id,fn] = timers.entries().next().value; timers.delete(id); fn(); }
    cleanup(); assert.equal(queries, 10);
    outcomes.push({ target: step.id, attempts: queries, step_before: before, step_after: current, active_after: active, on_complete_count: completed });
  }
  assert.equal(active, false); assert.equal(completed, 1); assert.equal(cleared, true);
  cases.push({ id: 'INF-LO-P03', finding: 'R2-INF-038', executed: 'source default steps + AST extraction of navigation IDs + actual retry/next/end callbacks', observed: { missing_default_targets: [...missing.map(x => x.id)], outcomes }, control: { inbox_producer_exists: navIds.has('inbox'), contacts_producer_exists: navIds.has('contacts') }, limitation: 'Source-wide data-tour search found SidebarNavItem as producer. Nav IDs form a superset of currently visible items. No real DOM or onComplete persistence; callback is captured in memory.' });
}

assert.equal(cases.length,3);
const result = { schema_version: 1, baseline_sha: pins.baseline_sha, probe_source_sha256: hash(fs.readFileSync(new URL(import.meta.url))), pins_sha256: hash(fs.readFileSync(pinFile)), case_count: cases.length, finding_ids: cases.map(x => x.finding), cases, controls: { source_and_compiler_pins_before_import: true, production_imports: 0, product_network_calls: 0, real_database_calls: 0, source_writes: 0, browser_or_at_test: false, compilation: 'transpileModule only, not build/typecheck/suite success' }, limitations: 'Three cases for three findings; WelcomeModal focus finding is static source+APG analysis, not an additional executed test. Only this audit output is written.' };
fs.writeFileSync(path.join(here,'layout-onboarding-probes.json'), JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({ case_count: cases.length, finding_ids: result.finding_ids, source_pins: pins.sources.length }));
