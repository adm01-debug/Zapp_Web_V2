// Independent, deterministic audit probes. No database, network or React renderer.
// Run only in a trusted Node 24 environment. CLI input selects a checkout, never code.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, realpathSync, lstatSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const baseline = '2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6';
// These digests are reviewed constants from git show BASELINE:path, not CLI input.
const expectedSourceSha256 = Object.freeze({
  "src/components/inbox/tabs/filesSort.ts": "cbd36a9af9a3c25a8f69b8c15e388d79c992d9823d849138570c3e3d597cf29a",
  "src/components/inbox/tabs/FilesTab.tsx": "45986a530fa77ac6fe62b75415e46853893354bee6dbdae6c275f052e8c4e4d5",
  "src/hooks/chat/useFilesActions.ts": "437179f65e969801f35cd3f5fed0430d5a0c8304a0d66894571763900ea90366",
  "src/hooks/chat/useContactMediaCounts.ts": "d00df6e01028db88a2c46aa7846a5456d4696a87ce256433c308d83389aafe4a",
  "src/hooks/calls/useMyCalls.ts": "b0562059d4b6da9b639545b4c55ca8afb7f94769e746647ddf85d7be9b7860cd",
  "supabase/migrations/20260926800000_calls_telefonia_v2.sql": "f7d1204cabcc9ed87b2a56048a68ca89be1ea1cef9dc719246175b0fb79e8dc0",
  "src/hooks/calls/useCallRecording.ts": "6ee90a5527bad6344f7d29832210b022e776fcd92cf2e1d9b0cc132bc3dcc162",
  "supabase/functions/get-call-recording/index.ts": "5ba90705954488851434e3e4787431d85a64ad907c8f8b63956fa18831aa156d",
  "src/lib/emailErrorState.ts": "4a5649dda9b1d7def401258ec346630049ad8a4f2f2b1eb83c8f9a947bd4829e",
  "src/hooks/gmail/gmailApi.ts": "d91b95afeeb59b84df2a63e6e2324fac5475387c6e7537a5a2034533ce8e7bad",
  "src/hooks/integrations/useGmail.ts": "b10234263d58ee6e657c0f873997a968bc5e9a56ced63bac65fe4273222ecdf2",
  "supabase/migrations/20260930400000_dashboard_contact_counts_filter_deleted_at.sql": "0cb8963e105f6e76971f3e406209b10519922456c42bfb08c06463848b896bea",
  "supabase/migrations/20260925221406_dashboard_fix_p_agent_uuid_perf_and_fanout.sql": "02d6435b586ba4098052a105540e40f8152c5ec85be56d0f0f4859cce252a7fa",
  "supabase/migrations/20260903225000_sla_first_response_v2.sql": "f433b18474ea7b4a2ff7a3743f7f06c9942ac8dd5502cfed799936a87b62cf18"
});
const sdkFilename = 'supabase-functions-client-2.117.2.ts.txt';
const expectedSdkSha256 = '383646bfc6327ff6274e7c15b3b3d73f50cbea5a2636ee95914197a759949246';
const out = realpathSync(dirname(fileURLToPath(import.meta.url)));
assert.ok(process.argv.length <= 3, 'Only one repository-root argument is accepted');
const repo = realpathSync(resolve(process.argv[2] ?? (process.env.RECONCILIATION_REPO || process.cwd())));
assert.ok(lstatSync(repo).isDirectory(), 'Repository root must be a directory');
// Absolute executable and a fixed child environment prevent PATH/GIT_* overrides.
const gitOptions = {
  cwd: repo,
  encoding: 'utf8',
  env: { PATH: '/usr/bin:/bin', LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
};
const git = (...args) => execFileSync('/usr/bin/git', ['--no-replace-objects', '-c', 'core.fsmonitor=false', ...args], gitOptions).trim();
assert.equal(realpathSync(git('rev-parse', '--show-toplevel')), repo, 'Input must be the Git checkout root');
assert.equal(git('rev-parse', '--verify', 'HEAD^{commit}'), baseline, 'Checkout HEAD must equal the audited baseline');

function readAttestedFile(root, path, expectedHash) {
  assert.ok(!isAbsolute(path) && !path.split('/').includes('..'), 'Only fixed relative source paths are accepted');
  const absolute = resolve(root, path);
  const local = relative(root, absolute);
  assert.ok(local && !isAbsolute(local) && !local.startsWith(`..${sep}`) && local !== '..', 'Source must remain inside its attested root');
  assert.equal(realpathSync(absolute), absolute, 'Symlinked source paths are not accepted');
  const stat = lstatSync(absolute);
  assert.ok(stat.isFile() && stat.size <= 1_000_000, 'Source must be a regular file within the reviewed size limit');
  const bytes = readFileSync(absolute);
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash, expectedHash, `Unattested source bytes: ${path}`);
  return { code: bytes.toString('utf8'), hash };
}

// Attest every input, including SQL evidence and the SDK, before executing any source.
// Later transformations use only these buffers: no filesystem import or re-read occurs.
const attestedSources = new Map();
const hashes = {};
for (const [path, expectedHash] of Object.entries(expectedSourceSha256)) {
  const attested = readAttestedFile(repo, path, expectedHash);
  attestedSources.set(path, attested.code);
  hashes[path] = attested.hash;
}
const sdkRaw = readAttestedFile(out, sdkFilename, expectedSdkSha256).code;
globalThis.fetch = async () => { throw new Error('Network is forbidden in these audit probes'); };

function source(path) {
  assert.ok(attestedSources.has(path), 'Source is not in the fixed attestation allowlist');
  return attestedSources.get(path);
}

// Node emits semicolon-terminated imports after transforming these pinned sources.
// Scan lines instead of using a regex spanning arbitrary source text.
function injectableJavaScript(raw) {
  const code = stripTypeScriptTypes(raw, { mode: 'transform' });
  const retained = [];
  let inImport = false;
  for (const line of code.split('\n')) {
    const trimmed = line.trim();
    if (inImport || trimmed.startsWith('import ')) {
      inImport = !trimmed.endsWith(';');
      continue;
    }
    if (trimmed === 'export {};') continue;
    retained.push(line.startsWith('export ') ? line.slice('export '.length) : line);
  }
  assert.equal(inImport, false, 'Pinned import declaration was not terminated');
  return retained.join('\n');
}

function loadTs(path, names, dependencies) {
  const code = injectableJavaScript(source(path));
  for (const name of [...names, ...Object.keys(dependencies)]) {
    assert.match(name, /^[A-Za-z_$][A-Za-z0-9_$]*$/, 'Injected names must be fixed identifiers');
  }
  // Deliberate execution of SHA256-attested baseline code with fixed dependency mocks.
  // This is a reproduction harness, not a sandbox for arbitrary or user-supplied code.
  return Function(...Object.keys(dependencies), '"use strict";\n' + code + '\nreturn {' + names.join(',') + '};')(...Object.values(dependencies));
}

const { filterMediaItems } = loadTs('src/components/inbox/tabs/filesSort.ts', ['filterMediaItems'], {});
const tabSource = source('src/components/inbox/tabs/FilesTab.tsx');
const tabLines = tabSource.split('\n').map(line => line.trim());
const selectionStart = tabLines.indexOf('const selectedItems = useMemo(');
assert.ok(selectionStart >= 0, 'Pinned selectedItems declaration must be found');
const selectionLine = tabLines[selectionStart + 1];
assert.ok(selectionLine.startsWith('() => ') && selectionLine.endsWith(','), 'Pinned selectedItems expression must occupy one line');
assert.equal(tabLines[selectionStart + 2], '[filtered, selection.selectedIds],');
const selectionExpression = selectionLine.slice('() => '.length, -1);
// The expression is extracted only after its entire source file passed attestation.
const selectedItems = Function('filtered', 'selection', '"use strict"; return (' + selectionExpression + ');');
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

const errorHelpers = loadTs('src/lib/emailErrorState.ts', ['classifyEmailError', 'isEmailOutcomeUnknown'], {});
const partialSync = { success: false, synced: 2, failed: 1, errors: ['synthetic partial failure'] };
const { callGmailFunction } = loadTs('src/hooks/gmail/gmailApi.ts', ['callGmailFunction'], {
  ...errorHelpers,
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'FAKE-OFFLINE' } } }) }, functions: { invoke: async () => ({ data: partialSync, error: null }) } },
});
const gmailReturned = await callGmailFunction('gmail-sync', {});
assert.equal(gmailReturned.success, false);
const gmailHook = source('src/hooks/integrations/useGmail.ts');
const gmailLines = gmailHook.split('\n').map(line => line.trim());
const syncStart = gmailLines.indexOf('const syncInbox = useMutation({');
assert.ok(syncStart >= 0, 'Pinned syncInbox declaration must be found');
const syncEnd = gmailLines.indexOf('});', syncStart + 1);
assert.ok(syncEnd > syncStart, 'Pinned syncInbox block must be terminated');
const successLines = gmailLines.slice(syncStart + 1, syncEnd).filter(line => line.startsWith('onSuccess: (data) => {'));
assert.equal(successLines.length, 1, 'Exactly one pinned syncInbox success handler is expected');
const successLine = successLines[0];
assert.ok(successLine.endsWith('},'), 'Pinned success handler must occupy one line');
const successBody = successLine.slice('onSuccess: (data) => {'.length, -2);
const toasts = [];
// Execute only this handler from the already-attested hook, with fixed inert dependencies.
Function('data', 'invalidateThreadData', 'queryClient', 'toast', '"use strict";\n' + successBody)(gmailReturned, () => {}, { invalidateQueries() {} }, { success: x => toasts.push(x) });
assert.deepEqual(toasts, ['2 emails sincronizados']);

// Exact official FunctionsClient source at v2.117.2, matching bun.lock.
// Only transport/helper/error dependencies are injected; invoke decoding is real.
const sdkCode = injectableJavaScript(sdkRaw);
class FakeFunctionsError extends Error { constructor(context) { super('offline injected SDK error'); this.context = context; } }
const FunctionsClient = Function('resolveFetch', 'FunctionRegion', 'FunctionsFetchError', 'FunctionsHttpError', 'FunctionsRelayError', '"use strict";\n' + sdkCode + '\nreturn FunctionsClient;')(
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
const slaIndexStatement = slaIndex.split(';').find(statement => statement.includes('CREATE UNIQUE INDEX IF NOT EXISTS ux_conversation_sla_open_per_contact'));
assert.ok(slaIndexStatement, 'Pinned partial-index statement must be found');
assert.ok(slaIndexStatement.includes('WHERE first_response_at IS NULL'));
const contacts = [{ id: 'c1', queue_id: 'q1', assigned_to: 'profile-p1' }];
const slaRows = [
  { contact_id: 'c1', first_message_at: '2026-10-03T12:00:00Z', first_response_at: '2026-10-03T12:01:00Z' },
  { contact_id: 'c1', first_message_at: '2026-10-03T13:00:00Z', first_response_at: '2026-10-03T13:02:00Z' },
];
// Model the actual partial-index predicate and uniqueness, with both open and closed rows.
function permittedByOpenSlaUniqueIndex(rows) {
  const indexedContactIds = rows.filter(row => row.first_response_at === null).map(row => row.contact_id);
  return new Set(indexedContactIds).size === indexedContactIds.length;
}
const openSlaRow = { contact_id: 'c1', first_response_at: null };
assert.equal(permittedByOpenSlaUniqueIndex([...slaRows, openSlaRow]), true);
assert.equal(permittedByOpenSlaUniqueIndex([...slaRows, openSlaRow, { ...openSlaRow }]), false);
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
  fixturePermittedByPartialUniqueIndex: permittedByOpenSlaUniqueIndex(slaRows),
  contacts: contacts.length, slaRows: slaRows.length,
  latestInService, priorDeduplicatedInService: priorInService,
  myActiveWithAuthUuid, myActiveWithProfileUuid,
  timezoneCondition: 'If the session TimeZone is UTC, on 2026-10-03 the latest boundary is 00:00Z and the prior explicit America/Sao_Paulo boundary is 03:00Z; this is not a claim about the live session setting.',
};
const output = {
  baseline, method: 'Actual TypeScript hooks/helpers and exact source expressions with injected dependencies; Dashboard SQL modeled only',
  limitations: ['No React renderer', 'No browser/E2E session', 'No SQL engine', 'No external network', 'No live database or provider action', 'Official SDK v2.117.2 invoke code runs with injected transport/helper/error dependencies'],
  filesSelection: { exactExpression: selectionExpression, cases: selectionCases },
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
