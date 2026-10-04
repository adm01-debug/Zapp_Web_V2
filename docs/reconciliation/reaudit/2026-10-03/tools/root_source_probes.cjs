#!/usr/bin/env node
// Offline review evidence only. Product source is parsed/transpiled, never edited.
// Usage: node root_source_probes.cjs SOURCE INTEGRITY_JSON TYPESCRIPT_JS OUTPUT
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const [source, integrityPath, tsPath, output] = process.argv.slice(2);
if (!source || !integrityPath || !tsPath || !output) throw new Error('Four arguments required');
const ts = require(tsPath);
const integrity = JSON.parse(fs.readFileSync(integrityPath, 'utf8'));
assert.match(integrity.head_sha || '', /^[0-9a-f]{40}$/, 'Integrity record must identify a commit');
assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim(), integrity.head_sha, 'Checkout HEAD differs from pinned integrity record');
const entries = integrity.files || integrity.entries;
const byPath = new Map(entries.map(r => [r.path, r]));
const evidence = new Map();
function read(relative) {
  const content = fs.readFileSync(path.join(source, relative));
  const blob = crypto.createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
  const entry = byPath.get(relative);
  assert(entry, `Missing integrity entry: ${relative}`);
  assert.equal(blob, entry.git_blob_sha || entry.blob_sha || entry.sha || entry.expected_sha, `Source drift: ${relative}`);
  evidence.set(relative, { path: relative, blob_sha: blob, sha256: crypto.createHash('sha256').update(content).digest('hex') });
  return content.toString('utf8');
}
function getNode(relative, name) {
  const code = read(relative);
  const sf = ts.createSourceFile(relative, code, ts.ScriptTarget.Latest, true);
  let found;
  function visit(n) {
    if ((ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n)) && n.name?.getText(sf) === name) found = n;
    ts.forEachChild(n, visit);
  }
  visit(sf);
  assert(found, `Missing source symbol ${relative}:${name}`);
  return { sf, node: found, text: found.getText(sf) };
}
function callable(relative, name, dependencies = {}) {
  const { node, text } = getNode(relative, name);
  const declaration = ts.isVariableDeclaration(node) ? `const ${text};` : text.replace(/^export\s+/, '');
  const js = ts.transpileModule(`${declaration}\nreturn ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }}).outputText;
  return new Function(...Object.keys(dependencies), js)(...Object.values(dependencies));
}
const reports = [];
async function probe(id, description, fn) {
  const value = await fn();
  reports.push({ id, description, status: 'PASS', observed: value });
}
const fixedNow = new Date('2026-10-03T12:00:00Z');
const dateFns = {
  startOfDay(d) { const r = new Date(d); r.setUTCHours(0, 0, 0, 0); return r; },
  subDays(d, n) { const r = new Date(d); r.setUTCDate(r.getUTCDate() - n); return r; },
  differenceInDays(a, b) { return Math.round((dateFns.startOfDay(a) - dateFns.startOfDay(b)) / 86400000); },
  eachDayOfInterval({ start, end }) { const a = []; for (let d = dateFns.startOfDay(start); d <= end; d = new Date(+d + 86400000)) a.push(d); return a; },
  format(d, p) { return p === 'yyyy-MM-dd' ? new Date(d).toISOString().slice(0, 10) : new Date(d).toISOString().slice(5, 10); },
  ptBR: {},
};
function chain(result) {
  let p;
  p = new Proxy({ then: (ok, fail) => Promise.resolve(result).then(ok, fail) }, { get: (o, k) => k in o ? o[k] : () => p });
  return p;
}
async function main() {
  await probe('ROOT-P01', 'Assigned contacts are classified as resolved without a resolution event', () => {
    const status = callable('src/hooks/business/useQueueAnalytics.ts', 'processStatusData');
    const contacts = Array.from({ length: 10 }, (_, i) => ({ id: `fixture-${i}`, assigned_to: 'fixture-agent', conversation_status: 'open' }));
    const got = status(contacts);
    assert.equal(got.find(s => s.name === 'Resolvidos').value, 70);
    return { actually_resolved: 0, reported_resolved_percentage: 70, input_assigned: 10 };
  });
  await probe('ROOT-P02', 'Thirty-day buckets overlap and count the final day twice', () => {
    const daily = callable('src/hooks/business/useQueueAnalytics.ts', 'processDailyData', dateFns);
    const got = daily([{ id: 'fixture-m', contact_id: 'fixture-c', created_at: '2026-09-30T12:00:00Z', sender: 'contact' }], [], { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-30T23:59:59Z') });
    const buckets = got.filter(r => r.mensagens > 0);
    assert.equal(buckets.length, 2);
    assert.equal(got.reduce((s, r) => s + r.mensagens, 0), 2);
    return { input_messages: 1, summed_messages: 2, overlapping_bucket_dates: buckets.map(x => x.date) };
  });
  await probe('ROOT-P03', 'Queue goal save resolves after a rejected update', async () => {
    const notices = [];
    let fetches = 0;
    const save = callable('src/hooks/business/useQueueGoals.ts', 'saveGoal', {
      goals: { 'fixture-queue': { id: 'fixture-goal' } },
      supabase: { from: () => chain({ data: null, error: { code: '42501', message: 'synthetic denial' } }) },
      toast: x => notices.push(x.title),
      log: { error() {} },
      fetchGoals: async () => { fetches++; },
    });
    let closed = false;
    await save('fixture-queue', { max_waiting_contacts: 1 });
    closed = true; // The exact consumer awaits saveGoal, then closes unconditionally.
    assert.deepEqual(notices, ['Erro ao salvar metas']);
    assert.equal(fetches, 0);
    assert(closed);
    return { rejected_update: true, promise_rejected: false, consumer_can_close: closed, toast_titles: notices };
  });
  await probe('ROOT-P04', 'SLA dashboard and history produce different rates for the same pending records', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `fixture-sla-${i}`, first_message_at: '2026-10-03T11:50:00Z', first_response_at: i === 0 ? fixedNow.toISOString() : null, first_response_breached: i === 0, created_at: '2026-10-03T11:50:00Z', contacts: { assigned_to: null } }));
    const metric = callable('src/hooks/sla/useSLAMetrics.ts', 'buildMetric');
    const fetchMetrics = callable('src/hooks/sla/useSLAMetrics.ts', 'fetchSLAMetrics', {
      getStartDate: () => new Date('2026-10-01T00:00:00Z'), buildMetric: metric,
      supabase: { from: name => chain({ data: name === 'conversation_sla' ? rows : [], error: null }) },
    });
    class FixtureDate extends Date { constructor(...args) { super(...(args.length ? args : [fixedNow])); } }
    const trend = callable('src/hooks/sla/useSLAHistory.ts', 'calcTrend');
    const history = callable('src/hooks/sla/useSLAHistory.ts', 'fetchSLAHistory', {
      ...dateFns, Date: FixtureDate, PERIOD_DAYS: { '7d': 7 }, calcTrend: trend,
      supabase: { from: () => chain({ data: rows, error: null }) },
    });
    const a = await fetchMetrics('all');
    const b = await history('7d');
    assert.equal(a.overall.overallRate, 0);
    assert.equal(b.totals.overallSLARate, 90);
    return { same_rows: 10, pending_without_breach: 9, breached_with_late_response: 1, metrics_rate: 0, history_rate: 90, history_days_for_7d: b.dailyData.length, precondition: 'Nine open or historical pending rows and one response after ten minutes; live presence of these rows was not asserted.' };
  });
  await probe('ROOT-P05', 'All SLA periods impose a 365-day lower bound', () => {
    class FixtureDate extends Date { constructor(...args) { super(...(args.length ? args : [fixedNow])); } }
    const start = callable('src/hooks/sla/useSLAMetrics.ts', 'getStartDate', { Date: FixtureDate, ...dateFns });
    const got = start('all');
    assert.equal((fixedNow - got) / 86400000, 365);
    return { label: 'Todos', actual_days: 365, lower_bound: got.toISOString() };
  });
  await probe('ROOT-P06', 'QueueDetails generates a fixed time and a percentage proxy', () => {
    const { sf, node } = getNode('src/pages/QueueDetails.tsx', 'fetchQueueData');
    let call;
    const visit = n => { if (ts.isCallExpression(n) && n.expression.getText(sf) === 'setMetrics') call = n; ts.forEachChild(n, visit); };
    visit(node);
    assert(call);
    let result;
    const js = ts.transpileModule(call.getText(sf), { compilerOptions: { target: ts.ScriptTarget.ES2022 }}).outputText;
    new Function('totalContacts', 'assignedContacts', 'setMetrics', js)(50, 10, x => { result = x; });
    assert.equal(result.avgResponseTime, '~3 min'); assert.equal(result.resolvedToday, 7);
    return { input_contacts: 50, assigned: 10, computed_without_response_or_resolution_events: result };
  });
  const result = { schema_version: 1, baseline_sha: integrity.head_sha, parser_version: ts.version,
    scope: 'Exact source nodes transpiled with synthetic dependencies; no DB, provider, browser, network, deployment or product mutation.',
    limitations: ['UTC date helpers are fixtures; these probes do not validate date-fns locale/DST behavior.', 'Queue-goal consumer closure is proven by direct source inspection; the rejection behavior runs the exact saveGoal node.'],
    probes: reports, source_files: [...evidence.values()] };
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ probes: reports.length, passed: reports.filter(x => x.status === 'PASS').length, output }));
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
