// Independent, deterministic audit probes. No database, network or React renderer.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const repo = resolve(process.argv[2] ?? (process.env.RECONCILIATION_REPO || process.cwd()));
const out = dirname(fileURLToPath(import.meta.url));
const baseline = '2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6';
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), baseline);
globalThis.fetch = async () => { throw new Error('Network is forbidden in these audit probes'); };
const hashes = {};
function source(path) {
  const data = readFileSync(resolve(repo, path), 'utf8');
  hashes[path] = createHash('sha256').update(data).digest('hex');
  return data;
}
function loadTs(path, names, dependencies) {
  let code = stripTypeScriptTypes(source(path), { mode: 'transform' });
  code = code.replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];\s*$/gm, '');
  code = code.replace(/\bexport\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/g, '');
  return Function(...Object.keys(dependencies), code + '\nreturn {' + names.join(',') + '};')(...Object.values(dependencies));
}
const { filterMediaItems } = await import(pathToFileURL(resolve(repo, 'src/components/inbox/tabs/filesSort.ts')));
source('src/components/inbox/tabs/filesSort.ts');
const tabSource = source('src/components/inbox/tabs/FilesTab.tsx');
const selectionMatch = tabSource.match(/const selectedItems = useMemo\(\s*\(\) => ([^\n]+),\s*\[filtered, selection.selectedIds\]/);
assert.ok(selectionMatch, 'Exact selectedItems expression must be found');
const selectedItems = Function('filtered', 'selection', 'return ' + selectionMatch[1]);
const fixtures = [{ id: 'image-1', type: 'image', filename: 'one.png' }, { id: 'pdf-1', type: 'document', filename: 'two.pdf' }];
const selectedIds = new Set(fixtures.map(x => x.id));
const selectionCases = ['all', 'image', 'video'].map(filter => {
  const visible = filterMediaItems(fixtures, filter, '');
  const forwarded = selectedItems(visible, { selectedIds });
  return { filter, labelCount: selectedIds.size, forwardedIds: forwarded.map(x => x.id), forwardedCount: forwarded.length, openForwardReturnsImmediately: forwarded.length === 0 };
});
assert.deepEqual(selectionCases.map(x => x.forwardedCount), [2, 1, 0]);
assert.match(tabSource, /if \(targets.length === 0\) return;/);
const actions = source('src/hooks/chat/useFilesActions.ts');
const invalidatedKeys = [...actions.matchAll(/invalidateQueries\(\{ queryKey: (\w+)\(contactId\)/g)].map(m => m[1]);
assert.deepEqual(invalidatedKeys, ['contactMediaKey', 'conversationTabCountsKey']);
const counts = source('src/hooks/chat/useContactMediaCounts.ts');
assert.match(counts, /\['media-gallery-counts', contactId\]/);
assert.ok(!invalidatedKeys.includes('contactMediaCountsKey'));

let capturedQuery;
const rpcCalls = [];
const { useMyCalls } = loadTs('src/hooks/calls/useMyCalls.ts', ['useMyCalls'], {
  keepPreviousData: x => x,
  useQuery: opts => { capturedQuery = opts; return { data: undefined, isLoading: false, isFetching: false, isError: false, refetch() {} }; },
  supabase: { rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: [], error: null }; } },
});
const periodCases = [];
for (const period of ['7d', '30d']) {
  useMyCalls({ page: 1, period, channel: 'all', direction: 'all', result: 'all', q: '', scope: 'mine' });
  await capturedQuery.queryFn();
  periodCases.push({ period, queryKey: capturedQuery.queryKey, rpc: rpcCalls.at(-1) });
}
assert.deepEqual(periodCases[0].rpc.args, periodCases[1].rpc.args);
assert.equal('p_from' in rpcCalls[0].args, false);
assert.equal('p_to' in rpcCalls[0].args, false);
assert.equal(rpcCalls[0].args.p_channel, 'all');
const callsSql = source('supabase/migrations/20260926800000_calls_telefonia_v2.sql');
assert.match(callsSql, /p_channel is null or c.channel = p_channel/);
assert.match(callsSql, /p_direction is null or c.direction = p_direction/);
const allowedSampleRow = { channel: 'voip', direction: 'inbound', started_at: '2026-10-02T12:00:00Z' };
const args = rpcCalls[0].args;
const literalSqlFilterModel = (args.p_channel == null || allowedSampleRow.channel === args.p_channel)
  && (args.p_direction == null || allowedSampleRow.direction === args.p_direction);
assert.equal(literalSqlFilterModel, false);

let recordingPayload;
const { useCallRecording } = loadTs('src/hooks/calls/useCallRecording.ts', ['useCallRecording'], {
  useQuery: opts => { capturedQuery = opts; return { data: undefined, isLoading: false }; },
  supabase: { functions: { invoke: async () => ({ data: recordingPayload, error: null }) } },
});
const recordingCases = [];
for (const [type, value] of [['audio_as_text', 'ID3 synthetic audio bytes'], ['audio_as_blob', new Blob(['synthetic'], { type: 'audio/mpeg' })], ['expected_json_contract', { url: 'blob:synthetic' }]]) {
  recordingPayload = value;
  useCallRecording('call-1', 'available');
  const result = await capturedQuery.queryFn();
  recordingCases.push({ inputKind: type, enabled: capturedQuery.enabled, result });
}
assert.deepEqual(recordingCases.map(x => x.result.disponivel), [false, false, true]);
const recordingEdge = source('supabase/functions/get-call-recording/index.ts');
assert.match(recordingEdge, /return new Response\(upstream.body, \{ status: upstream.status, headers \}\)/);

const errorHelpers = await import(pathToFileURL(resolve(repo, 'src/lib/emailErrorState.ts')));
source('src/lib/emailErrorState.ts');
const partialSync = { success: false, synced: 2, failed: 1, errors: ['synthetic partial failure'] };
const { callGmailFunction } = loadTs('src/hooks/gmail/gmailApi.ts', ['callGmailFunction'], {
  ...errorHelpers,
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'FAKE-OFFLINE' } } }) }, functions: { invoke: async () => ({ data: partialSync, error: null }) } },
});
const gmailReturned = await callGmailFunction('gmail-sync', {});
assert.equal(gmailReturned.success, false);
const gmailHook = source('src/hooks/integrations/useGmail.ts');
const successMatch = gmailHook.match(/const syncInbox = useMutation\([\s\S]*?onSuccess: \(data\) => \{([\s\S]*?)\},\s*onError/);
assert.ok(successMatch);
const toasts = [];
Function('data', 'invalidateThreadData', 'queryClient', 'toast', successMatch[1])(gmailReturned, () => {}, { invalidateQueries() {} }, { success: x => toasts.push(x) });
assert.deepEqual(toasts, ['2 emails sincronizados']);

// Exact official FunctionsClient source at v2.117.2, matching bun.lock.
// Only transport/helper/error dependencies are injected; invoke decoding is real.
const sdkPath = resolve(out, 'supabase-functions-client-2.117.2.ts');
const sdkRaw = readFileSync(sdkPath, 'utf8');
let sdkCode = stripTypeScriptTypes(sdkRaw, { mode: 'transform' })
  .replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];\s*$/gm, '')
  .replace(/export class FunctionsClient/, 'class FunctionsClient');
class FakeFunctionsError extends Error { constructor(context) { super('offline injected SDK error'); this.context = context; } }
const FunctionsClient = Function('resolveFetch', 'FunctionRegion', 'FunctionsFetchError', 'FunctionsHttpError', 'FunctionsRelayError', sdkCode + '\nreturn FunctionsClient;')(
  customFetch => customFetch, { Any: 'any' }, FakeFunctionsError, FakeFunctionsError, FakeFunctionsError,
);
const sdkCases = [];
for (const [contentType, status, body] of [['audio/mpeg', 200, 'ID3 synthetic'], ['application/json', 207, JSON.stringify(partialSync)]]) {
  const client = new FunctionsClient('https://offline.invalid', { customFetch: async () => new Response(body, { status, headers: { 'Content-Type': contentType } }) });
  const result = await client.invoke('synthetic', { body: {} });
  assert.equal(result.error, null);
  sdkCases.push({ contentType, httpStatus: status, error: result.error, decodedType: typeof result.data, decodedData: result.data });
}
assert.equal(sdkCases[0].decodedType, 'string');
assert.equal(sdkCases[1].decodedData.success, false);

// Relational counterexample model only. The SQL itself is not run here.
const dashboardLatest = source('supabase/migrations/20260930400000_dashboard_contact_counts_filter_deleted_at.sql');
const dashboardPrior = source('supabase/migrations/20260925221406_dashboard_fix_p_agent_uuid_perf_and_fanout.sql');
const slaIndex = source('supabase/migrations/20260903225000_sla_first_response_v2.sql');
assert.match(dashboardLatest, /LEFT JOIN sla_today st ON st.contact_id = f.id/);
assert.match(dashboardPrior, /SELECT DISTINCT ON \(s.contact_id\)/);
assert.match(slaIndex, /CREATE UNIQUE INDEX IF NOT EXISTS ux_conversation_sla_open_per_contact[\s\S]*?WHERE first_response_at IS NULL/);
const contacts = [{ id: 'c1', queue_id: 'q1', assigned_to: 'profile-p1' }];
const slaRows = [
  { contact_id: 'c1', first_message_at: '2026-10-03T12:00:00Z', first_response_at: '2026-10-03T12:01:00Z' },
  { contact_id: 'c1', first_message_at: '2026-10-03T13:00:00Z', first_response_at: '2026-10-03T13:02:00Z' },
];
const joined = contacts.flatMap(c => slaRows.filter(s => s.contact_id === c.id).map(s => ({ c, s })));
const latestInService = joined.filter(x => x.c.assigned_to != null).length;
const distinctPerContact = new Map(slaRows.map(s => [s.contact_id, s]));
const priorInService = contacts.flatMap(c => [distinctPerContact.get(c.id)]).length;
assert.equal(latestInService, 2);
assert.equal(priorInService, 1);
const myActiveWithAuthUuid = contacts.filter(c => c.assigned_to === 'auth-u1').length;
const myActiveWithProfileUuid = contacts.filter(c => c.assigned_to === 'profile-p1').length;
assert.deepEqual([myActiveWithAuthUuid, myActiveWithProfileUuid], [0, 1]);
const dashboardModel = {
  method: 'Relational/identity counterexample model, not PostgreSQL execution',
  fixturePermittedByPartialUniqueIndex: slaRows.every(s => s.first_response_at !== null),
  contacts: contacts.length, slaRows: slaRows.length,
  latestInService, priorDeduplicatedInService: priorInService,
  myActiveWithAuthUuid, myActiveWithProfileUuid,
  timezoneCondition: 'If the session TimeZone is UTC, on 2026-10-03 the latest boundary is 00:00Z and the prior explicit America/Sao_Paulo boundary is 03:00Z; this is not a claim about the live session setting.',
};
const output = {
  baseline, method: 'Actual TypeScript hooks/helpers and exact source expressions with injected dependencies; Dashboard SQL modeled only',
  limitations: ['No React renderer', 'No browser/E2E session', 'No SQL engine', 'No external network', 'No live database or provider action', 'Official SDK v2.117.2 invoke code runs with injected transport/helper/error dependencies'],
  filesSelection: { exactExpression: selectionMatch[1], cases: selectionCases },
  filesCounts: { invalidatedKeys, missingKey: 'contactMediaCountsKey' },
  telefonia: { periodCases, defaultAllPredicateModelPasses: literalSqlFilterModel, recordingCases },
  gmail: { returnedSuccessFalseWithoutThrow: gmailReturned.success === false, onSuccessToasts: toasts },
  sdk: { version: '2.117.2', sourceUrl: 'https://github.com/supabase/supabase-js/blob/v2.117.2/packages/core/functions-js/src/FunctionsClient.ts', sha256: createHash('sha256').update(sdkRaw).digest('hex'), cases: sdkCases },
  dashboard: dashboardModel,
  sourceSha256: hashes,
};
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'cross-module-probes.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ baseline, assertions: 'PASS', output: resolve(out, 'cross-module-probes.json'), sourceFiles: Object.keys(hashes).length }, null, 2));
