// Read-only audit: exact hooks/component callback prefixes, complete Evolution
// handler and quarantine monitor. All I/O and React lifecycle are simulated.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes, registerHooks } from 'node:module';
import { runInNewContext } from 'node:vm';
import { pathToFileURL } from 'node:url';
import { verifyProviderSource } from './verify-source.mjs';

const source = path.resolve(process.argv[2] || '/workspace/scratch/f8f9b9cbce53/reaudit/source');
const manifestPath = process.argv[3] || path.join(path.dirname(source), 'source-integrity.json');
const sourceVerification = verifyProviderSource(source, manifestPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const paths = [
  'src/components/groups/GroupsView.tsx', 'src/hooks/chat/useGroupsManager.ts', 'src/hooks/groups/actions.ts',
  'src/components/alerts/EvolutionDisconnectBanner.tsx',
  'src/components/omnichannel/OmnichannelManager.tsx', 'src/components/omnichannel/OmnichannelInbox.tsx',
  'src/providers/QuarantineMonitorProvider.tsx', 'src/lib/quarantineStore.ts',
  'supabase/migrations/20260318135320_ed229dcb-ef66-45b6-b2b1-58ebf60d2273.sql',
];
const pins = paths.map(rel => {
  const entry = manifest.files.find(x => x.path === rel);
  assert(entry, `Missing source pin ${rel}`);
  const bytes = fs.readFileSync(path.join(source, rel));
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(bytes.length, entry.bytes);
  assert.equal(blob, entry.git_blob_sha, `Refusing changed source ${rel}`);
  return { path: rel, git_blob_sha: blob, sha256: createHash('sha256').update(bytes).digest('hex') };
});
// Both source gates precede every application evaluation/import.
globalThis.fetch = () => { throw new Error('Real network forbidden'); };
const read = rel => fs.readFileSync(path.join(source, rel), 'utf8');
const quietLog = { debug() {}, info() {}, warn() {}, error() {} };
const results = [];
function evaluateTS(rel, scope, expectedImports) {
  let input = read(rel);
  const imports = /^import\s[\s\S]*?;\r?\n/gm;
  assert.equal(input.match(imports)?.length, expectedImports);
  input = input.replace(imports, '').replace(/^export(?: type)? \{.*?\} from .*?;\r?\n/gm, '');
  runInNewContext(stripTypeScriptTypes(input).replace(/^export (?=(?:async )?(?:function|class|const))/gm, ''), scope, { filename: rel });
  return scope;
}
function evaluatePrefix(rel, start, end, returns, scope) {
  const input = read(rel);
  const first = input.indexOf(start), last = input.indexOf(end, first);
  assert(first >= 0 && last > first, `Re-review prefix ${rel}`);
  const prefix = input.slice(first, last).replace('export function', 'function');
  runInNewContext(stripTypeScriptTypes(prefix + `\nreturn { ${returns} };\n}\n`), scope, { filename: rel });
  return scope;
}
function reactState() {
  const values = [];
  let cursor = 0;
  return {
    values, reset() { cursor = 0; },
    useState(initial) {
      const index = cursor++;
      if (values.length <= index) values[index] = typeof initial === 'function' ? initial() : initial;
      return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value; }];
    },
  };
}

// P40/P41: context-menu target selection followed by real broadcast callbacks.
const groupToasts = [];
const deliveries = [];
let failDelivery = false;
const actionsScope = evaluateTS(paths[2], {
  useCallback: fn => fn, log: quietLog,
  toast: Object.fromEntries(['success','warning','error'].map(kind => [kind, message => groupToasts.push({ kind, message })])),
  useActionFeedback: () => ({ withFeedback() { throw new Error('Not part of fixture'); } }),
  supabase: { functions: { invoke: async (name, options) => {
    assert.equal(name, 'evolution-api');
    deliveries.push(JSON.parse(JSON.stringify(options.body)));
    return failDelivery ? { data: null, error: new Error('fixture HTTP failure') } : { data: { success: true }, error: null };
  } }, from() { throw new Error('No DB expected in group fixture'); } },
  setTimeout() { throw new Error('Fixture has one final target'); },
}, 6);
const groupState = reactState();
const managerScope = evaluateTS(paths[1], {
  useState: groupState.useState, useEffect() {}, useCallback: fn => fn,
  useGroupActions: actionsScope.useGroupActions, log: quietLog,
  toast: { error() {} }, supabase: { from() { throw new Error('Group mounting disabled'); } },
}, 6);
let manager;
const renderManager = () => { groupState.reset(); manager = managerScope.useGroupsManager(); return manager; };
manager = renderManager();
const selectionIndex = groupState.values.indexOf(manager.selectedGroups);
assert(selectionIndex >= 0);
groupState.values[0] = [
  { id: 'group-a', group_id: 'fixture-a@g.us', name: 'Fixture A', whatsapp_connection_id: 'fixture-connection' },
  { id: 'group-b', group_id: 'fixture-b@g.us', name: 'Fixture B', whatsapp_connection_id: 'fixture-connection' },
];
groupState.values[1] = [{ id: 'fixture-connection', instance_id: 'fixture-instance', name: 'Fixture' }];
groupState.values[selectionIndex] = new Set(['group-a', 'group-b']);
manager = renderManager();
const menuMatch = read(paths[0]).match(/onClick=\{(\(e\) => \{ e\.stopPropagation\(\); toggleGroupSelection\(group\.id\); setIsBroadcastOpen\(true\); \})\}/);
assert(menuMatch, 'Exact context-menu callback must be reviewed after changes');
let dialogOpened = false;
runInNewContext(`(${menuMatch[1]})(event)`, {
  event: { stopPropagation() {} }, group: { id: 'group-a' },
  toggleGroupSelection: manager.toggleGroupSelection,
  setIsBroadcastOpen: value => { dialogOpened = value; },
});
manager = renderManager();
assert.deepEqual([...manager.selectedGroups], ['group-b']);
assert.equal(dialogOpened, true);
await manager.handleBroadcast('fixture text never transmitted');
assert.equal(deliveries.length, 1);
assert.equal(deliveries[0].number, 'fixture-b@g.us');
results.push({ id: 'P40', contextMenuGroup: 'group-a', selectionBefore: ['group-a','group-b'], selectionAfterMenu: ['group-b'],
  confirmedBroadcastTarget: deliveries[0].number,
  outcome: 'Exact per-group menu callback removes its already-selected group; after explicit simulated confirmation the real broadcast hook targets the remaining group. Dialog displays selection; no covert send or real delivery occurred.' });

groupState.values[selectionIndex] = new Set(['group-a']);
manager = renderManager();
failDelivery = true;
const viewState = reactState();
const viewScope = evaluatePrefix(paths[0], 'export function GroupsView() {', '  return (',
  'onBroadcast, broadcastMessage, isSending, isBroadcastOpen, setBroadcastMessage, setIsBroadcastOpen', {
    useGroupsManager: () => manager, useState: viewState.useState,
  });
const renderView = () => { viewState.reset(); return viewScope.GroupsView(); };
let view = renderView();
view.setBroadcastMessage('fixture draft to preserve after failure');
view.setIsBroadcastOpen(true);
view = renderView();
await view.onBroadcast();
view = renderView();
manager = renderManager();
assert.equal(view.broadcastMessage, '');
assert.equal(view.isBroadcastOpen, false);
assert.equal(manager.selectedGroups.size, 0);
assert.equal(groupToasts.at(-1).kind, 'warning');
assert.match(groupToasts.at(-1).message, /0 grupo\(s\), 1 falha/);
results.push({ id: 'P41', actualInvokedBoundaryError: true, remainingDraft: view.broadcastMessage,
  dialogOpen: view.isBroadcastOpen, remainingTargets: manager.selectedGroups.size, toast: groupToasts.at(-1),
  outcome: 'Complete view callback and real broadcast hook discard draft and recipients even though the only send failed; this is an actual error-result branch, distinct from HTTP200 soft-error handling.' });

// P42: maintenance gate really returns HTTP200/error=true, then banner claims retry.
const fixtureEnv = { SUPABASE_URL: 'https://db.invalid', SUPABASE_ANON_KEY: 'fixture-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', EVOLUTION_API_URL: 'https://provider.invalid',
  EVOLUTION_API_KEY: 'fixture-provider', EVOLUTION_INSTANCE_TOKEN: 'fixture-instance', EVOLUTION_API_FLAVOR: 'go' };
globalThis.Deno = { env: { get: key => fixtureEnv[key] } };
let networkCalls = 0;
globalThis.fetch = () => { networkCalls++; throw new Error('No provider call expected during maintenance'); };
globalThis.__channelAuditDb = {
  auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } }, error: null }) },
  from(table) {
    assert.equal(table, 'global_settings');
    const q = { select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: { value: '3042-01-01T00:00:00.000Z' }, error: null }) };
    return q;
  },
};
const stub = value => `data:text/javascript,${encodeURIComponent(value)}`;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'https://deno.land/std@0.168.0/http/server.ts') return {
    url: stub('export const serve = fn => { globalThis.__channelAuditHandler = fn; };'), shortCircuit: true };
  if (specifier === 'https://esm.sh/@supabase/supabase-js@2.87.1') return {
    url: stub('export const createClient = () => globalThis.__channelAuditDb;'), shortCircuit: true };
  return next(specifier, context);
} });
const originalConsole = { log: console.log, warn: console.warn, error: console.error };
const backendLogs = [];
for (const key of Object.keys(originalConsole)) console[key] = (...args) => backendLogs.push({ key, args });
await import(pathToFileURL(path.join(source, 'supabase/functions/evolution-api/index.ts')).href);
const evolutionHandler = globalThis.__channelAuditHandler;
assert.equal(typeof evolutionHandler, 'function');
const bannerToasts = [];
let returnedEnvelope;
const bannerState = reactState();
const bannerScope = evaluatePrefix(paths[3], 'export function EvolutionDisconnectBanner() {', '  if (disconnected.length === 0',
  'handleReconnect', { useState: bannerState.useState, useEffect() {},
    toast: { success: message => bannerToasts.push({ kind: 'success', message }), error: message => bannerToasts.push({ kind: 'error', message }) },
    supabase: { functions: { invoke: async (name, options) => {
      const response = await evolutionHandler(new Request(`https://edge.invalid/functions/v1/${name}`, {
        method: 'POST', headers: { Authorization: 'Bearer fixture-admitted-user', 'Content-Type': 'application/json' }, body: JSON.stringify(options.body),
      }));
      returnedEnvelope = { status: response.status, body: await response.json() };
      return { data: returnedEnvelope.body, error: response.ok ? null : new Error('fixture HTTP non-2xx') };
    } } },
  });
await bannerScope.EvolutionDisconnectBanner().handleReconnect({ id: 'fixture-connection', instance_id: 'fixture-instance', status: 'disconnected', phone_number: null });
for (const key of Object.keys(originalConsole)) console[key] = originalConsole[key];
assert.equal(returnedEnvelope.status, 200);
assert.equal(returnedEnvelope.body.error, true);
assert.equal(networkCalls, 0);
assert.equal(bannerToasts.at(-1).kind, 'success');
results.push({ id: 'P42', backendHttpStatus: returnedEnvelope.status, backendError: returnedEnvelope.body.error,
  providerCalls: networkCalls, frontendToast: bannerToasts.at(-1),
  outcome: 'Complete Evolution handler enforces maintenance before provider I/O, but exact banner callback ignores the error envelope and says reconnecting.' });

// P43: pending local channel is advertised as connected; contacts become inbox rows.
const sql = read(paths[8]);
assert(sql.includes('is_active boolean DEFAULT true'));
let storedChannels = [];
const contacts = [{ id: 'fixture-no-conversation', name: 'Fixture contact', phone: '19200000000',
  channel_type: 'whatsapp', updated_at: '2026-10-04T12:00:00Z', assigned_to: null }];
const tableQueries = [];
const omniDb = {
  auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } }, error: null }) },
  from(table) {
    const filters = []; let columns = '*', limit = null;
    const q = {
      select(value) { columns = value; return q; },
      eq(key, value) { filters.push({ key, value }); return q; },
      order() { return q; }, limit(value) { limit = value; return q; },
      maybeSingle: async () => { assert.equal(table, 'profiles'); return { data: { id: 'fixture-profile' }, error: null }; },
      insert: async values => {
        assert.equal(table, 'channel_connections');
        storedChannels = values.map(value => ({ id: 'fixture-channel', is_active: true, ...JSON.parse(JSON.stringify(value)) }));
        return { error: null };
      },
      then(resolve, reject) {
        tableQueries.push({ table, columns, filters, limit });
        let data;
        if (table === 'channel_connections_safe') data = storedChannels.filter(row => filters.every(f => row[f.key] === f.value));
        else if (table === 'contacts') data = contacts;
        else throw new Error(`Unspecified Omni query ${table}`);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return q;
  },
};
const noOpToast = { success() {}, error() {} };
const omniManagerState = reactState();
const omniManagerScope = evaluatePrefix(paths[4], 'export function OmnichannelManager() {', '  const getStatusBadge =', 'addChannel', {
  useState: omniManagerState.useState, useQuery: () => ({ data: [], isLoading: false }), useMutation: options => options,
  useQueryClient: () => ({ invalidateQueries() {} }), supabase: omniDb, toast: noOpToast,
});
await omniManagerScope.OmnichannelManager().addChannel.mutationFn({ name: 'Fixture pending channel', channel_type: 'instagram' });
assert.equal(storedChannels[0].status, 'pending_setup');
assert.equal(storedChannels[0].is_active, true);
const inboxState = reactState();
const inboxScope = evaluatePrefix(paths[5], 'export function OmnichannelInbox() {', '  const getChannelIcon =',
  'loadConnections, loadUnifiedInbox, messages, connections, channelStats', {
    useState: inboxState.useState, useEffect() {}, supabase: omniDb, toast: noOpToast,
  });
const renderInbox = () => { inboxState.reset(); return inboxScope.OmnichannelInbox(); };
let inbox = renderInbox();
await inbox.loadConnections();
await inbox.loadUnifiedInbox();
inbox = renderInbox();
assert.equal(inbox.connections.length, 1);
assert.equal(inbox.connections[0].status, 'pending_setup');
assert.equal(inbox.messages.length, 1);
assert.equal(inbox.messages[0].unread, false);
assert.equal(inbox.messages[0].status, 'open');
assert.equal(tableQueries.some(q => q.table === 'messages'), false);
assert.equal(tableQueries.find(q => q.table === 'contacts').limit, 200);
results.push({ id: 'P43', locallyCreatedStatus: storedChannels[0].status, displayedConnectedListLength: inbox.connections.length,
  contactWithoutMessageProducesInboxRow: inbox.messages.length, derivedUnread: inbox.messages[0].unread,
  derivedStatus: inbox.messages[0].status, queries: tableQueries,
  outcome: 'Exact create/query callbacks plus pinned SQL default make a pending channel enter the connected list. Inbox row is synthesized from a contact without consulting messages. React JSX, RLS and external channel providers were not executed.' });

// P44: the exact monitor never receives allowed decisions, then a transient error stops it.
const { quarantineStore } = await import(pathToFileURL(path.join(source, paths[7])).href);
quarantineStore.clear();
const ticks = new Map();
let nextTimer = 0, queryCount = 0, cleanup;
let quarantineMode = 'pending';
const record = { id: 'fixture-quarantine', message_id: 'fixture-message', decision: 'pending', threat_level: 'high' };
let input = read(paths[6]);
const importPattern = /^import\s[\s\S]*?;\r?\n/gm;
assert.equal(input.match(importPattern)?.length, 8);
assert(input.includes('  return <>{children}</>;'));
input = input.replace(importPattern, '').replace('export function', 'function').replace('  return <>{children}</>;', '  return null;');
const monitorScope = {
  useAuth: () => ({ user: { id: 'fixture-user' } }), useToast: () => ({ toast() {} }),
  useRef: value => ({ current: value }), useEffect: callback => { cleanup = callback(); },
  RoleService: { fetchUserRoles: async () => ['admin'] }, getLogger: () => quietLog, quarantineStore,
  queryExternalProxy: async params => {
    queryCount++;
    assert.equal(params.table, 'media_quarantine');
    assert.equal(JSON.stringify(params.filters[0].value), JSON.stringify(['pending','deleted']));
    if (quarantineMode === 'error') throw new Error('fixture transient server error');
    return { data: quarantineMode === 'pending' ? [record] : [] };
  },
  setTimeout: callback => { const id = ++nextTimer; ticks.set(id, callback); return id; },
  clearTimeout: id => ticks.delete(id),
};
runInNewContext(stripTypeScriptTypes(input), monitorScope, { filename: paths[6] });
monitorScope.QuarantineMonitorProvider({ children: null });
for (let i = 0; i < 20 && ticks.size === 0; i++) await Promise.resolve();
assert.equal(ticks.size, 1);
assert.equal(quarantineStore.get('fixture-message').decision, 'pending');
async function tickOnce() {
  const [id, callback] = ticks.entries().next().value;
  ticks.delete(id);
  await callback();
}
quarantineMode = 'allowed-but-excluded-by-filter';
await tickOnce();
assert.equal(quarantineStore.get('fixture-message').decision, 'pending');
const afterAllowed = quarantineStore.get('fixture-message').decision;
quarantineMode = 'error';
await tickOnce();
assert.equal(ticks.size, 0);
assert.equal(queryCount, 3);
cleanup();
results.push({ id: 'P44', authoritativeFixtureDecisionAfterReview: 'allowed', cachedDecisionAfterSuccessfulPoll: afterAllowed,
  totalQueries: queryCount, remainingPollTimersAfterOneThrownError: ticks.size,
  outcome: 'Complete monitor with real store preserves pending after filtered successful response omits an allowed record, then stops all future ticks after one transient exception. This concerns cached badge state, not authorization or actual file blocking.' });
quarantineStore.clear();

const output = { head: sourceVerification.actual_head, source_verification: sourceVerification,
  additional_pins: pins, actual_network_requests: 0, actual_database_requests: 0, actual_environment_reads: 0, source_changes: 0,
  method: 'P40/P41 execute complete hooks and exact source callback prefixes. P42 composes banner callback with full unchanged Evolution handler using authenticated DB and remote-import stubs. P43 runs create/inbox callbacks with SQL-default fixture. P44 runs full monitor after replacing only JSX passthrough return, with real store and controlled timers. No React DOM, live SQL, VPS or provider traffic.',
  results };
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'channel-consumers-probe-results.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ passed: results.length, ids: results.map(r => r.id), network: 0, database: 0, environment: 0 }));
