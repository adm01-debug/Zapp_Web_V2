// Offline source probes. Production modules are never imported; only pinned
// source text is transpiled inside VM contexts with explicitly supplied fakes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = '/workspace/scratch/f8f9b9cbce53/reaudit/source';
const pins = JSON.parse(fs.readFileSync(path.join(here, 'observability-probe-pins.json'), 'utf8'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
for (const p of pins.sources) assert.equal(sha(fs.readFileSync(path.join(root, p.path))), p.sha256, `source pin: ${p.path}`);
assert.equal(sha(fs.readFileSync(pins.compiler.path)), pins.compiler.sha256, 'compiler pin');
// Compiler is loaded only after every source/compiler pin passed.
const ts = createRequire(import.meta.url)(pins.compiler.path);
const src = p => fs.readFileSync(path.join(root, p), 'utf8');
const sourceFiles = new Map();
const ast = p => {
  if (!sourceFiles.has(p)) sourceFiles.set(p, ts.createSourceFile(p, src(p), ts.ScriptTarget.Latest, true, p.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
  return sourceFiles.get(p);
};
function named(p, name, kind) {
  const sf = ast(p); const found = [];
  function visit(n) {
    if ((kind === 'function' ? ts.isFunctionDeclaration(n) : ts.isVariableDeclaration(n)) && n.name?.getText(sf) === name) found.push(n);
    ts.forEachChild(n, visit);
  }
  visit(sf); assert.equal(found.length, 1, `${name}: unique source node`);
  let n = found[0];
  if (kind !== 'function') {
    n = n.initializer;
    if (ts.isCallExpression(n) && n.expression.getText(sf) === 'useCallback') n = n.arguments[0];
    assert.ok(ts.isArrowFunction(n) || ts.isFunctionExpression(n), `${name}: source callback`);
  }
  return n.getText(sf);
}
function runText(text, context) {
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  assert.equal(/(?:require\(|import\()/u.test(js), false, 'callback has no imports');
  return vm.runInNewContext(js, context, { timeout: 2000 });
}
function callback(p, name, context) { return runText(`(${named(p, name, 'variable')})`, context); }
const cases = [];
const nowMs = Date.parse('2026-10-04T12:30:00.000Z');
class ClockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [nowMs])); }
  static now() { return nowMs; }
}
assert.equal(new ClockDate().getTimezoneOffset(), 0, 'probe uses UTC labels');
const monitoringPath = 'src/components/monitoring/hooks/useMonitoringData.ts';
const typesPath = 'src/components/monitoring/hooks/types.ts';
const typesExports = {};
const typesCode = ts.transpileModule(src(typesPath), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
assert.equal(/(?:require\(|import\()/u.test(typesCode), false);
vm.runInNewContext(typesCode, { exports: typesExports }, { timeout: 2000 });
const helperText = ['computeUptime', 'computeInstanceUptimes', 'computeSparklines'].map(n => named(monitoringPath, n, 'function')).join('\n');
const helpers = runText(`${helperText}\n({computeUptime,computeInstanceUptimes,computeSparklines})`, { Date: ClockDate, ...typesExports });

// P01: fast, ordinary error results versus Edge's existing error guard.
{
  async function diagnostic(edgeError) {
    let health; let tick = 0; const calls = [];
    const failure = { data: null, count: null, error: { message: 'synthetic unavailable' } };
    const supabase = {
      from: table => ({ select: async () => { calls.push(`read:${table}`); return failure; } }),
      storage: { from: bucket => ({ list: async () => { calls.push(`storage:${bucket}`); return failure; } }) },
      functions: { invoke: async name => { calls.push(`edge:${name}`); return { data: {}, error: edgeError }; } },
    };
    await callback('src/hooks/system/useDiagnosticsData.ts', 'fetchSystemHealth', { supabase, performance: { now: () => ++tick }, setHealth: v => health = v })();
    return { health, calls };
  }
  const observed = await diagnostic(null);
  assert.equal(observed.health.database, 'healthy'); assert.equal(observed.health.storage, 'healthy');
  assert.equal(observed.health.realtime, 'healthy'); assert.equal(observed.calls.some(x => x.includes('realtime')), false);
  const control = await diagnostic({ message: 'synthetic Edge error' });
  assert.equal(control.health.edgeFunctions, 'degraded');
  cases.push({ id: 'INF-OBS-P01', finding: 'R2-INF-026', executed: 'actual fetchSystemHealth callback', observed, control: { edge_error_status: control.health.edgeFunctions }, limitation: 'SDK return envelopes and durations are synthetic; UI wording confirmed separately in source, no rendered browser or live health invocation.' });
}

function fakeQuery(rows, queryLog, table) {
  let selected = rows; const q = {
    select() { return q; },
    gte(column, cutoff) { queryLog.push({ table, column, cutoff }); selected = selected.filter(r => r[column] >= cutoff); return q; },
    order() { return q; }, limit() { return q; },
    then(resolve, reject) { return Promise.resolve({ data: selected, error: null }).then(resolve, reject); },
  }; return q;
}
async function monitoring(period, logs, messages) {
  const state = {}; const queryLog = []; const errors = [];
  const env = { Date: ClockDate, ...typesExports, ...helpers,
    supabase: { from: table => fakeQuery(table === 'connection_health_logs' ? logs : table === 'messages' ? messages : [], queryLog, table) },
    onConnectionsUpdate: undefined, log: { error: (...args) => errors.push(args) },
  };
  for (const name of ['Connections','HealthLogs','Uptime','InstanceUptimes','MessageStats','Sparklines','Loading']) env[`set${name}`] = v => state[name] = v;
  await callback(monitoringPath, 'fetchData', env)(period);
  assert.equal(errors.length, 0, 'source callback did not swallow a harness error');
  return { state, queryLog };
}
// P02: successful queries with differing periods, plus the zero-sample default.
{
  const logs = [
    { instance_id: 'synthetic', status: 'connected', checked_at: '2026-10-04T12:00:00.000Z' },
    { instance_id: 'synthetic', status: 'disconnected', checked_at: '2026-10-04T04:30:00.000Z' },
  ];
  const h1 = await monitoring('1h', logs, []); const h24 = await monitoring('24h', logs, []);
  const empty = helpers.computeUptime([], new ClockDate());
  assert.equal(h1.state.Uptime.percentage, 100); assert.equal(h24.state.Uptime.percentage, 50);
  assert.equal(empty.totalChecks, 0); assert.equal(empty.percentage, 100);
  cases.push({ id: 'INF-OBS-P02', finding: 'R2-INF-027', executed: 'actual fetchData and computeUptime', observed: { selection_1h: h1.state.Uptime, selection_24h: h24.state.Uptime, empty }, queries: h1.queryLog, limitation: 'Reference compares the same synthetic checks under1h/24h queries; it is not measured availability or real SLA.' });
}
// P03: daily bucket labels require an exact hour and silently discard valid rows.
{
  const messages = [
    { sender: 'contact', created_at: '2026-10-03T12:10:00.000Z' },
    { sender: 'contact', created_at: '2026-10-03T11:10:00.000Z' },
  ];
  const d7 = await monitoring('7d', [], messages); const h1 = await monitoring('1h', [], []);
  const stats = d7.state.MessageStats;
  const plotted = stats.hourlyData.reduce((n, b) => n + b.incoming + b.outgoing, 0);
  assert.equal(stats.total, 2); assert.equal(plotted, 1);
  assert.equal(h1.state.MessageStats.hourlyData.length, 2); assert.equal(typesExports.periodBuckets['1h'], 6);
  cases.push({ id: 'INF-OBS-P03', finding: 'R2-INF-028', executed: 'actual fetchData bucket loop', observed: { total: stats.total, plotted, buckets: stats.hourlyData, one_hour_unique_buckets: h1.state.MessageStats.hourlyData.length, configured_one_hour_buckets: typesExports.periodBuckets['1h'] }, control: 'The row matching the daily anchor hour is plotted; a valid row one hour earlier is not.', limitation: 'Complete successful synthetic query, no API row cap or timezone/DST assumption beyond explicit UTC fixture.' });
}
// P04: absence of memory/network APIs adds three good values without measurement.
{
  async function performanceSample(supportedPoor) {
    const state = {}; let snapshot;
    const performance = { getEntriesByType: () => [{ loadEventEnd: 1200, startTime: 0, domContentLoadedEventEnd: 1000, responseStart: 110, requestStart: 10 }], getEntriesByName: () => [{ startTime: 1400 }] };
    const navigator = {};
    if (supportedPoor) { performance.memory = { usedJSHeapSize: 90 * 1048576, totalJSHeapSize: 100 * 1048576 }; navigator.connection = { effectiveType: '2g', rtt: 500 }; }
    const env = { performance, navigator, Date: ClockDate, document: { querySelectorAll: () => ({ length: 800 }) }, localStorage: { getItem: () => null }, saveSnapshot: async v => snapshot = v };
    for (const name of ['Loading','Metrics','CacheStats']) env[`set${name}`] = v => state[name] = v;
    env.setLocalHistory = fn => state.LocalHistory = fn([]);
    await callback('src/components/performance/PerformanceMonitor.tsx', 'collectMetrics', env)();
    return { snapshot, metrics: state.Metrics };
  }
  const missing = await performanceSample(false); const control = await performanceSample(true);
  assert.equal(missing.snapshot.overall_score, 100); assert.equal(missing.snapshot.network_type, '4g'); assert.equal(missing.snapshot.memory_used, 0); assert.equal(missing.snapshot.memory_total, 256);
  assert.equal(control.snapshot.overall_score, 63);
  cases.push({ id: 'INF-OBS-P04', finding: 'R2-INF-029', executed: 'actual collectMetrics callback', observed: missing, control: control.snapshot, limitation: 'Source-produced snapshot payload captured at fake saveSnapshot; no browser measurement, React rendering, or database write.' });
}
// P05: resolved DELETE.error bypasses catch while a rejected promise hits it.
{
  async function cleanup(reject) {
    const notices = []; let reloads = 0;
    const supabase = { from: table => { assert.equal(table, 'performance_snapshots'); return { delete: () => ({ lt: async () => { if (reject) throw new Error('synthetic rejected promise'); return { data: null, error: { message: 'synthetic DELETE failure' } }; } }) }; } };
    const toast = { success: msg => notices.push({ kind: 'success', msg }), error: msg => notices.push({ kind: 'error', msg }) };
    await callback('src/hooks/analytics/usePerformanceSnapshots.ts', 'clearOldSnapshots', { Date: ClockDate, supabase, toast, loadHistory: async () => reloads++ })();
    return { notices, reloads };
  }
  const resolvedError = await cleanup(false); const rejected = await cleanup(true);
  assert.equal(resolvedError.notices[0].kind, 'success'); assert.equal(resolvedError.reloads, 1);
  assert.equal(rejected.notices[0].kind, 'error'); assert.equal(rejected.reloads, 0);
  cases.push({ id: 'INF-OBS-P05', finding: 'R2-INF-030', executed: 'actual clearOldSnapshots callback', observed: resolvedError, control: rejected, limitation: 'No DELETE sent. Normal SDK error envelope and thrown-error control are injected at boundary; RLS/live privileges not evaluated.' });
}

// P06: entire collector module with mocked browser observers; logger/budget
// imports are bounded and no network/analytics package can be imported.
{
  function collector(shifts, events) {
    const observers = {}; const listeners = {}; const exports = {};
    class PerformanceObserver {
      static supportedEntryTypes = ['layout-shift', 'event'];
      constructor(cb) { this.cb = cb; }
      observe(o) { observers[o.type] = this.cb; }
    }
    const document = { visibilityState: 'visible', addEventListener: (name, fn) => listeners[name] = fn };
    const env = { exports, Date: ClockDate, window: {}, document, PerformanceObserver, performance: { getEntriesByType: () => [] }, addEventListener: (name, fn) => listeners[name] = fn,
      require: name => { if (name === '@/lib/logger') return { getLogger: () => ({ info() {}, debug() {} }) }; if (name === '../../performance-budget.json') return JSON.parse(src('performance-budget.json')); throw new Error(`Import denied: ${name}`); },
    };
    const code = ts.transpileModule(src('src/lib/web-vitals.ts'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, env, { timeout: 2000 });
    exports.initWebVitals(); observers['layout-shift']({ getEntries: () => shifts }); observers.event({ getEntries: () => events });
    listeners.pagehide(); return exports.getWebVitalsReport();
  }
  const shifts = [{ value: 0.06, startTime: 100, hadRecentInput: false }, { value: 0.06, startTime: 2100, hadRecentInput: false }];
  const events = [...Array.from({ length: 48 }, (_, i) => ({ name: 'click', interactionId: i + 1, duration: 48 })), { name: 'click', interactionId: 49, duration: 160 }, { name: 'click', interactionId: 50, duration: 1000 }];
  const observed = collector(shifts, events);
  assert.equal(observed.find(m => m.name === 'CLS').value, 0.12); assert.equal(observed.find(m => m.name === 'INP').value, 1000);
  const control = collector(shifts.slice(0, 1), events.slice(-1));
  assert.equal(control.find(m => m.name === 'CLS').value, 0.06); assert.equal(control.find(m => m.name === 'INP').value, 1000);
  cases.push({ id: 'INF-OBS-P06', finding: 'R2-INF-031', executed: 'entire web-vitals.ts with mocked observer/require boundaries', observed, reference_for_fixture: { CLS: 0.06, INP: 160 }, control, reference_basis: ['https://web.dev/articles/cls: maximum session window; two shifts separated by2s are separate sessions.', 'https://web.dev/articles/inp: ignore one highest interaction per50 unique interactions.'], limitation: 'Synthetic observer entries, not certified browser RUM. Error belongs to local collector; no claim about independent Vercel Speed Insights.' });
}
const result = { schema_version: 1, baseline_sha: pins.baseline_sha, probe_source_sha256: sha(fs.readFileSync(new URL(import.meta.url))), pins_sha256: sha(fs.readFileSync(path.join(here, 'observability-probe-pins.json'))), case_count: cases.length, finding_ids: cases.map(c => c.finding), cases, controls: { all_source_pins_checked_before_compiler_import: true, compilation: 'TypeScript transpileModule only; not typecheck/build/test-suite pass', production_imports: 0, real_product_network_calls: 0, network_claim_basis: 'No networking module/import/capability supplied to VM; all SQL/storage/invoke labels are fake in-memory boundaries.', source_writes: 0, real_database_mutations: 0 }, limitations: 'Six finite cases are evidence for six findings, not six additional findings or a complete browser/backend test suite.' };
fs.writeFileSync(path.join(here, 'observability-probes.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ case_count: result.case_count, finding_ids: result.finding_ids, pins_checked: pins.sources.length + 1 }));
