/* Finite, read-only probes of exact production code. No browser, DB or network. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ts = require('/workspace/scratch/8b95153002da/audit/tools/ast/node_modules/typescript');
const base = '/workspace/scratch/f8f9b9cbce53/reaudit';
const sources = new Map();
process.env.TZ = 'UTC'; // This process only: explicit alternate-browser-timezone precondition.
function read(path, first, last) {
  const raw = fs.readFileSync(`${base}/source/${path}`);
  sources.set(path, { path, git_blob_sha: crypto.createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex') });
  const text = raw.toString();
  return first ? text.split('\n').slice(first - 1, last).join('\n') : text;
}
function load(source, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const context = vm.createContext({ module, exports: module.exports, Date, Map, Set, Promise, ...globals,
    require(name) { assert(name in mocks, `Unmocked import ${name}`); return mocks[name]; } });
  vm.runInContext(compiled, context, { timeout: 2000 });
  return module.exports;
}
function effectsDriver() {
  let cursor = 0, pending = [];
  const refs = [], previous = [];
  return { react: {
    useRef(value) { return refs[cursor++] ??= { current: value }; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn, deps) {
      const i = cursor++, old = previous[i];
      if (!old || deps.some((d,j) => !Object.is(d, old.deps[j]))) pending.push(() => { old?.cleanup?.(); previous[i] = { deps, cleanup: fn() }; });
    },
  }, render(fn) { cursor = 0; pending = []; const value = fn(); pending.forEach(f => f()); return value; } };
}
const drain = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

(async () => {
  const probes = [];
  let history = Array.from({ length: 52 }, (_, i) => ({ id: `old-${i}`, source: 'sla-monitor', is_read: false, alert_type: 'critical', created_at: `synthetic-${i}` }));
  let page = history.slice(0, 50), queryConfig, realtime, insertCount = 0, invalidations = 0;
  const pageLimits = [], cycleResults = [], timers = new Set();
  const driver = effectsDriver();
  const queryClient = { invalidateQueries() { invalidations++; } };
  const supabase = {
    from(table) {
      if (table === 'conversation_sla') return { select() { return { async eq() { return { data: Array.from({ length: 60 }, (_, i) => ({ id: `sla-${i}`, first_response_breached: true })) }; } }; } };
      assert.equal(table, 'warroom_alerts');
      return {
        select() { const q = { eq() { return q; }, order() { return q; }, async limit(n) { pageLimits.push(n); return { data: history.slice(0, n), error: null }; } }; return q; },
        async insert(payload) {
          const row = { ...payload, id: `new-${++insertCount}`, is_read: false, created_at: `synthetic-new-${insertCount}` };
          history.unshift(row);
          realtime?.({ new: row });
          return { data: null, error: null };
        },
        update() { return { async eq() { return { error: null }; } }; },
      };
    },
    channel() { const channel = { on(_kind, _filter, callback) { realtime = callback; return channel; }, subscribe() { return channel; } }; return channel; },
    removeChannel() {},
  };
  const war = load(read('src/hooks/business/useWarRoomAlerts.ts'), {
    react: driver.react,
    '@tanstack/react-query': { useQueryClient: () => queryClient, useQuery(config) { queryConfig = config; return { data: page }; } },
    '@/integrations/supabase/client': { supabase },
    '../system/usePushNotifications': { usePushNotifications: () => ({ showNotification() {}, permission: 'denied' }) },
    '../system/useNotificationSettings': { useNotificationSettings: () => ({ settings: { soundEnabled: false, soundVolume: 40 }, isQuietHours: () => true }) },
  }, { Audio: class { play() { return Promise.resolve(); } }, setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); } }).useWarRoomAlerts;
  for (let cycle = 1; cycle <= 3; cycle++) {
    driver.render(() => war(false));
    await drain();
    cycleResults.push({ cycle, visible_alerts: page.length, total_persisted_alerts: history.length, inserted: insertCount, invalidations });
    page = await queryConfig.queryFn();
  }
  assert.equal(insertCount, 3);
  assert.equal(invalidations, 3);
  assert.deepEqual(pageLimits, [50, 50, 50]);
  assert(cycleResults.every(r => r.visible_alerts === 50));
  probes.push({ id: 'R2-MOD-074', kind: 'actual_hook_effects_with_bounded_cache_republication', result: { breaches: 60, cycles: cycleResults, query_limits: pageLimits }, limitation: 'Three finite cycles, not an infinite runtime test. Insert/read success and realtime delivery are controlled preconditions; query cache republishes the changed first page. Source SQL independently permits duplicates for admin/supervisor.' });

  const calendar = {
    startOfDay(date) { const d = new Date(date); d.setHours(0,0,0,0); return d; },
    subDays(date, amount) { const d = new Date(date); d.setDate(d.getDate() - amount); return d; },
    format(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; },
  };
  const aggregate = load(read('src/hooks/dashboard/useTodayHourlyVolume.ts'), {
    '@tanstack/react-query': { useQuery() {} }, '@/integrations/supabase/client': { supabase: {} }, 'date-fns': calendar,
  }).aggregateHourlyVolume;
  const now = new Date('2026-10-04T01:30:00Z');
  const hourly = aggregate([{ day: '2026-10-03', hour: 22, message_count: 7 }], now);
  assert.equal(hourly.currentHour, 1);
  assert.equal(hourly.currentHourCount, 0);
  assert.equal(hourly.last7ByDay.at(-2).count, 7);
  probes.push({ id: 'R2-MOD-075', kind: 'actual_aggregate_with_explicit_UTC_calendar_stubs', result: { now: now.toISOString(), sql_bucket_day: '2026-10-03', sql_bucket_hour: 22, sql_count: 7, frontend_current_hour: hourly.currentHour, frontend_current_hour_count: hourly.currentHourCount, count_in_previous_day: hourly.last7ByDay.at(-2).count }, limitation: 'The original aggregate runs with explicit Date-based UTC stubs for the three date-fns calls; no date-fns package or SQL executed. SQL timezone is independently fixed from the winning migration.' });

  const clock = new Date('2026-10-04T12:30:00Z');
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [clock.getTime()])); } static now() { return clock.getTime(); } }
  const demand = load(read('src/hooks/business/useDemandPrediction.ts'), {
    react: { useMemo: fn => fn() },
    '@tanstack/react-query': { useQuery: () => ({ data: [{ hour: 8, count: 30 }, { hour: 12, count: 10 }, { hour: 16, count: 20 }] }) },
    '@/integrations/supabase/client': { supabase: {} },
  }, { Date: FixedDate }).useDemandPrediction();
  assert.equal(demand.data.find(p => p.time === '12:30').actual, 10);
  assert.equal(demand.insights.currentActual, 30);
  assert.equal(demand.insights.trend, 'down');
  probes.push({ id: 'R2-MOD-076', kind: 'actual_demand_hook_with_fixed_historical_buckets', result: { current_point: demand.data.find(p => p.time === '12:30'), selected_current_actual: demand.insights.currentActual, final_prediction: demand.data.at(-1).predicted, reported_trend: demand.insights.trend, comparison_to_current_point: '20 > 10 (up)' }, limitation: 'Historical buckets are query fixtures; exact generator/insights body executed. No statistical or forecasting quality certification, database or visual chart.' });

  fs.writeFileSync(`${base}/reports/modules/final-frontend-proofs.json`, JSON.stringify({ head_sha: 'da307ba5626dce892f0b37cb6762463f55d14a96', execution: 'Local Node/TypeScript with bounded synthetic inputs and explicit mocks; source untouched.', sources: [...sources.values()], probes }, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ passed: probes.length, ids: probes.map(p => p.id) }) + '\n');
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
