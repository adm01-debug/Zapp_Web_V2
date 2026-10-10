// Read-only source-pinned probes. React/SQL/storage/network are explicit memory
// boundaries; no source is changed and no external side effect is permitted.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { verifyProviderSource } from './verify-source.mjs';

const source = path.resolve(process.argv[2] || '/workspace/scratch/f8f9b9cbce53/reaudit/source');
const manifestPath = process.argv[3] || path.join(path.dirname(source), 'source-integrity.json');
const verification = verifyProviderSource(source, manifestPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const paths = [
  'src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx',
  'src/hooks/integrations/useTalkXInsights.ts',
  'src/hooks/integrations/useKnowledgeBaseSearch.ts',
  'supabase/migrations/20260929420000_fix_talkx_transition_overload_and_status_check.sql',
];
const pins = paths.map(rel => {
  const entry = manifest.files.find(f => f.path === rel);
  assert(entry, `Missing pin for ${rel}`);
  const bytes = fs.readFileSync(path.join(source, rel));
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(bytes.length, entry.bytes);
  assert.equal(blob, entry.git_blob_sha, `Refusing changed source ${rel}`);
  return { path: rel, git_blob_sha: blob, sha256: createHash('sha256').update(bytes).digest('hex') };
});
// Every application byte evaluated below was validated above, before evaluation.
const read = rel => fs.readFileSync(path.join(source, rel), 'utf8');
globalThis.fetch = () => { throw new Error('Network forbidden in audit'); };
const clone = value => JSON.parse(JSON.stringify(value));
const results = [];

function evaluateHook(rel, scope, expectedImports) {
  const input = read(rel);
  const imports = /^import\s[\s\S]*?;\r?\n/gm;
  assert.equal(input.match(imports)?.length, expectedImports, 'Import boundary changed');
  const code = stripTypeScriptTypes(input.replace(imports, ''))
    .replace(/^export (?=(?:async )?(?:function|class|const))/gm, '');
  runInNewContext(code, scope, { filename: rel });
  return scope;
}

// P31: save screen 2 -> back -> reopen stale card -> edit screen 1.
// The complete component's data/callback prefix (before the first JSX return)
// is evaluated unchanged. The two navigation statements are extracted from JSX.
const flowSource = read(paths[0]);
const start = flowSource.indexOf('export function WhatsAppFlowsBuilder() {');
const end = flowSource.indexOf('\n  if (!selectedFlow) {\n    return (', start);
assert(start >= 0 && end > start);
const openMatch = flowSource.match(/onClick=\{\(\) => \{ (setSelectedFlow\(flow\); setEditingScreen\(0\);) \}\}/);
const backMatch = flowSource.match(/onClick=\{\(\) => (setSelectedFlow\(null\))\}/);
assert(openMatch && backMatch, 'Navigation source changed');
const flowScript = stripTypeScriptTypes(flowSource.slice(start, end) + `
  return { flows, selectedFlow, fetchFlows, updateFlowScreens, addScreen, addComponent,
    openFromList: flow => { ${openMatch[1]} }, backToList: () => ${backMatch[1]} };
}` ).replace(/^export /m, '');
const flowState = [];
let cursor = 0;
let nextId = 0;
let savedFlow = { id: 'flow-a', name: 'Fixture', screens: [{ id: 'screen-1', title: 'Tela 1', layout: [
  { id: 'heading', type: 'TextHeading', text: 'Fixture' },
  { id: 'footer', type: 'Footer', label: 'Continuar' },
] }], status: 'draft' };
const writes = [];
const flowScope = {
  useState(initial) {
    const slot = cursor++;
    if (!(slot in flowState)) flowState[slot] = typeof initial === 'function' ? initial() : initial;
    return [flowState[slot], value => { flowState[slot] = typeof value === 'function' ? value(flowState[slot]) : value; }];
  }, useEffect() {}, useCallback: fn => fn,
  crypto: { randomUUID: () => `fixture-${++nextId}` },
  toast() { throw new Error('No toast should run in this path'); },
  supabase: { from(table) {
    assert.equal(table, 'whatsapp_flows');
    return {
      select: () => ({ order: async () => ({ data: [clone(savedFlow)], error: null }) }),
      update(payload) { return { eq: async (key, id) => {
        assert.equal(key, 'id'); assert.equal(id, 'flow-a');
        writes.push(clone(payload)); savedFlow = { ...savedFlow, ...clone(payload) };
        return { error: null };
      } }; },
    };
  } },
};
runInNewContext(flowScript, flowScope, { filename: paths[0] + ':data-prefix' });
const renderFlow = () => { cursor = 0; return flowScope.WhatsAppFlowsBuilder(); };
let flow = renderFlow();
await flow.fetchFlows(); flow = renderFlow();
flow.openFromList(flow.flows[0]); flow = renderFlow();
flow.addScreen(); await Promise.resolve(); flow = renderFlow();
assert.equal(savedFlow.screens.length, 2);
assert.equal(flow.selectedFlow.screens.length, 2);
assert.equal(flow.flows[0].screens.length, 1);
flow.backToList(); flow = renderFlow();
flow.openFromList(flow.flows[0]); flow = renderFlow();
assert.equal(flow.selectedFlow.screens.length, 1);
flow.addComponent('TextInput'); await Promise.resolve(); flow = renderFlow();
assert.equal(savedFlow.screens.length, 1, 'An ordinary subsequent edit overwrites accepted screen 2');
results.push({ id: 'P31', acceptedScreenCounts: writes.map(w => w.screens.length),
  reopenedScreenCount: flow.selectedFlow.screens.length,
  outcome: 'Second screen accepted by simulated DB is absent from the stale list item; reopen and edit replaces screens with the one-screen snapshot. No failed request or response reordering is required.',
  evaluated_range: { from: flowSource.slice(0, start).split('\n').length, through: flowSource.slice(0, end).split('\n').length },
  method: 'Exact complete data/callback prefix plus extracted navigation statements; JSX rendering omitted; React and persistence boundaries in memory.' });

// P32: a higher count of replies is not the highest rate. The finished filter
// cannot match a row satisfying the pinned CHECK, but is a text comparison.
const statusMigration = read(paths[3]);
const statusMatch = statusMigration.match(/CHECK \(status = ANY \(ARRAY\[(.*?)\]\)\)/s);
assert(statusMatch);
const allowedStatus = [...statusMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
assert(!allowedStatus.includes('finished'));
const queryLog = [];
const insightsScope = evaluateHook(paths[1], {
  useQuery: value => value,
  supabase: { from(table) {
    const record = { table, filters: [], select: null, count: false, order: null, limit: null };
    const query = {
      select(columns, options) { record.select = columns; record.count = !!options?.count; return this; },
      not(...args) { record.filters.push(['not', ...args]); return this; },
      gte(...args) { record.filters.push(['gte', ...args]); return this; },
      lt(...args) { record.filters.push(['lt', ...args]); return this; },
      eq(...args) { record.filters.push(['eq', ...args]); return this; },
      limit(n) { record.limit = n; return this; },
      order(field, options) { record.order = [field, options]; return this; },
      then(resolve, reject) {
        queryLog.push(clone(record));
        let value;
        if (table === 'talkx_campaign_metrics') {
          assert.equal(record.order[0], 'replied_count');
          value = { data: [
            { id: 'campaign-volume', campaign_name: 'Volume', replied_count: 5, sent_count: 100 },
            { id: 'campaign-rate', campaign_name: 'Taxa', replied_count: 4, sent_count: 10 },
          ], error: null };
        } else if (table === 'talkx_recipients') {
          value = record.count ? { count: 110, error: null } : { data: [], error: null };
        } else if (table === 'contacts') {
          value = { count: record.filters.some(f => f[0] === 'lt') ? 0 : 100, error: null };
        } else if (table === 'talkx_link_clicks') {
          value = { count: 0, error: null };
        } else if (table === 'talkx_campaigns') {
          const status = record.filters.find(f => f[0] === 'eq' && f[1] === 'status')?.[2];
          value = { count: status === 'completed' ? 3 : 0, error: null };
        } else throw new Error(`Unexpected table ${table}`);
        return Promise.resolve(value).then(resolve, reject);
      },
    };
    return query;
  } },
}, 2);
const insights = await insightsScope.useTalkXInsights().queryFn();
const winner = insights.find(i => i.id === 'best-template');
assert.equal(winner.meta.campaignId, 'campaign-volume');
assert(winner.description.includes('5.0%'));
assert.equal(insights.some(i => i.id === 'low-clicks'), false);
results.push({ id: 'P32', advertisedWinner: clone(winner), candidateRates: { Volume: 0.05, Taxa: 0.4 },
  lowClickInsightPresent: false, lowClickCampaignQuery: queryLog.find(q => q.table === 'talkx_campaigns'), allowedCampaignStatus: allowedStatus,
  outcome: 'Exact hook recommends a 5% campaign as highest engagement despite a 40% eligible campaign. Three completed no-click campaigns are excluded by status=finished; no enum error is assumed.',
  method: 'Complete unchanged hook with a query builder enforcing source projections/count boundaries; no live SQL or RLS.' });

// P33: clear does not cancel the pending debounce callback.
const kbState = [];
const kbRefs = [];
let stateCursor = 0;
let refCursor = 0;
let timeoutId = 0;
const pendingTimers = new Map();
let lastQuery;
const kbScope = evaluateHook(paths[2], {
  useState(initial) {
    const slot = stateCursor++;
    if (!(slot in kbState)) kbState[slot] = initial;
    return [kbState[slot], value => { kbState[slot] = typeof value === 'function' ? value(kbState[slot]) : value; }];
  },
  useRef(initial) { const slot = refCursor++; if (!kbRefs[slot]) kbRefs[slot] = { current: initial }; return kbRefs[slot]; },
  useEffect() {}, useCallback: fn => fn,
  useQuery(options) { lastQuery = options; return { data: options.enabled ? [{ id: 'article-a', title: 'Consulta antiga' }] : [], isLoading: false }; },
  setTimeout(fn) { const id = ++timeoutId; pendingTimers.set(id, fn); return id; },
  clearTimeout(id) { pendingTimers.delete(id); },
  supabase: { rpc: async (name, args) => { assert.equal(name, 'search_knowledge_base'); return { data: [{ id: 'article-a', query: args.search_query }], error: null }; } },
}, 3);
const renderKb = () => { stateCursor = 0; refCursor = 0; return kbScope.useKnowledgeBaseSearch(); };
let kb = renderKb();
kb.handleSearch('contrato anterior'); kb = renderKb();
kb.clear(); kb = renderKb();
assert.equal(kb.query, ''); assert.equal(lastQuery.enabled, false);
assert.equal(pendingTimers.size, 1);
for (const [id, fn] of pendingTimers) { pendingTimers.delete(id); fn(); }
kb = renderKb();
assert.equal(kb.query, ''); assert.equal(lastQuery.enabled, true);
assert.equal(lastQuery.queryKey[1], 'contrato anterior');
assert.equal(kb.hasResults, true);
results.push({ id: 'P33', visibleQuery: kb.query, effectiveQuery: lastQuery.queryKey[1], enabledAfterClear: lastQuery.enabled, hasResultsAfterClear: kb.hasResults,
  outcome: 'Clear empties the input but the retained timer restores the old effective query; the exact hook enables that search and exposes results while the visible input remains empty.',
  method: 'Complete unchanged hook, controlled state/ref/time callbacks and query boundary; no DOM or real query.' });

const output = { head: verification.actual_head, source_verification: verification, additional_source_pins: pins,
  actual_network_requests: 0, actual_database_requests: 0, actual_environment_reads: 0, source_changes: 0,
  evaluated_application_imports: 'None; verified source text evaluated only after all pins passed, using explicit memory dependencies.',
  results };
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'frontend-persistence-probe-results.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ passed: results.length, ids: results.map(r => r.id), network: 0, database: 0, environment: 0 }));
