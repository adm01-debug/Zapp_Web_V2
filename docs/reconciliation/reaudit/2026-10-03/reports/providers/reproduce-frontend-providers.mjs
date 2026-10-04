// Read-only audit: complete TypeScript hooks, with React lifecycle/data/I/O
// replaced by explicit in-memory boundaries. No browser, provider or live DB.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { verifyProviderSource } from './verify-source.mjs';

const source = path.resolve(process.argv[2] || '/workspace/scratch/f8f9b9cbce53/reaudit/source');
const manifestPath = process.argv[3] || path.join(path.dirname(source), 'source-integrity.json');
const sourceVerification = verifyProviderSource(source, manifestPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const paths = ['src/hooks/inbox/useConnectionsManager.ts', 'src/hooks/groups/actions.ts'];
const frontendPins = [];
for (const rel of paths) {
  const pin = manifest.files.find(x => x.path === rel);
  assert(pin, 'Missing frontend pin');
  const bytes = fs.readFileSync(path.join(source, rel));
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(bytes.length, pin.bytes);
  assert.equal(blob, pin.git_blob_sha, `Refusing changed source ${rel}`);
  frontendPins.push({ path: rel, git_blob_sha: blob });
}
// Both source gates precede evaluation; there are no application imports.
globalThis.fetch = () => { throw new Error('Network forbidden in audit probe'); };
function evaluate(rel, scope, importCount) {
  const input = fs.readFileSync(path.join(source, rel), 'utf8');
  const imports = /^import\s[\s\S]*?;\r?\n/gm;
  assert.equal(input.match(imports)?.length, importCount, 'Review import boundary after source change');
  const script = stripTypeScriptTypes(input.replace(imports, ''))
    .replace(/^export (?=(?:async )?(?:function|class|const))/gm, '');
  runInNewContext(script, scope, { filename: rel });
  return scope;
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const quietLog = { debug() {}, info() {}, warn() {}, error() {} };
const results = [];

// P29: close A, open B, then A's QR/status finishes late.
const states = [];
const stateInitializers = [];
const refs = [];
const intervals = new Map();
let timerId = 0;
const qrA = deferred();
const qrB = deferred();
const statusA = deferred();
const toasts = [];
const managerScope = evaluate(paths[0], {
  useState(initial) {
    const index = states.length;
    states.push(typeof initial === 'function' ? initial() : initial);
    stateInitializers.push(states[index]);
    return [states[index], update => { states[index] = typeof update === 'function' ? update(states[index]) : update; }];
  },
  useRef(initial) { const ref = { current: initial }; refs.push(ref); return ref; },
  useEffect() {}, useLayoutEffect() {}, useCallback: fn => fn,
  log: quietLog, toast: value => toasts.push(JSON.parse(JSON.stringify(value))),
  supabase: new Proxy({}, { get() { throw new Error('Lifecycle DB effect intentionally not executed'); } }),
  useEvolutionApi: () => ({ isLoading: false,
    connectInstance: name => name === 'instance-a' ? qrA.promise : qrB.promise,
    getInstanceStatus: name => { assert.equal(name, 'instance-a'); return statusA.promise; },
    createConnection() { throw new Error('Not exercised'); },
    disconnectInstance() { throw new Error('Not exercised'); },
    deleteInstance() { throw new Error('Not exercised'); },
  }),
  setInterval: callback => { const id = ++timerId; intervals.set(id, callback); return id; },
  clearInterval: id => intervals.delete(id),
  setTimeout() { throw new Error('Effects/timers must not run in this fixture'); }, clearTimeout() {},
}, 5);
const manager = managerScope.useConnectionsManager();
const qrStateIndex = stateInitializers.findIndex(v => v && typeof v === 'object' && v.status === 'loading' && v.connectionId === '');
assert(qrStateIndex >= 0);
const connA = { id: 'conn-a', name: 'A', instance_id: 'instance-a', status: 'disconnected', qr_code: null };
const connB = { id: 'conn-b', name: 'B', instance_id: 'instance-b', status: 'disconnected', qr_code: null };
const openA = manager.handleShowQrCode(connA);
manager.closeQrDialog();
const openB = manager.handleShowQrCode(connB);
assert.equal(states[qrStateIndex].connectionId, 'conn-b');
qrA.resolve({ qrcode: { base64: 'fixture-QR-A' } });
await openA;
assert.equal(states[qrStateIndex].connectionId, 'conn-b');
assert.equal(states[qrStateIndex].qrCode, 'fixture-QR-A');
const afterWrongQr = JSON.parse(JSON.stringify(states[qrStateIndex]));
const pollingA = [...intervals.values()][0]();
qrB.resolve({ qrcode: { base64: 'fixture-QR-B' } });
await openB;
assert.equal(states[qrStateIndex].qrCode, 'fixture-QR-B');
assert.equal(intervals.size, 1);
statusA.resolve({ state: 'open' });
await pollingA;
assert.equal(states[qrStateIndex].connectionId, 'conn-b');
assert.equal(states[qrStateIndex].status, 'connected');
assert.equal(states[qrStateIndex].qrCode, null);
const afterWrongStatus = JSON.parse(JSON.stringify(states[qrStateIndex]));
manager.closeQrDialog();
assert.equal(intervals.size, 1, 'Old poll nulls the shared interval ref, so closing B does not clear its interval');
results.push({ id: 'P29', afterQrFromA: afterWrongQr, afterConnectedFromA: afterWrongStatus,
  outstandingIntervalsAfterClose: intervals.size,
  outcome: 'A late QR is displayed under B identity; a late A status marks B connected and loses the reference needed to clear B polling. Hooks/callbacks are real; React effects and API are explicit fixtures.' });
intervals.clear();

// P30: soft provider errors are HTTP200, so Functions.invoke has error=null.
const groupToasts = [];
let invokeCalls = 0;
let selectionCleared = false;
const groupsScope = evaluate(paths[1], {
  useCallback: fn => fn, log: quietLog,
  toast: {
    success: text => groupToasts.push({ kind: 'success', text }),
    warning: text => groupToasts.push({ kind: 'warning', text }),
    error: text => groupToasts.push({ kind: 'error', text }),
  },
  useActionFeedback: () => ({ withFeedback() { throw new Error('Not exercised'); } }),
  supabase: { functions: { invoke: async () => {
    invokeCalls++;
    return { data: { error: true, status: 500, message: 'fixture provider rejected' }, error: null };
  } }, from() { throw new Error('No write expected for failed sync'); } },
  setTimeout() { throw new Error('One recipient should not invoke delay'); },
}, 6);
const actions = groupsScope.useGroupActions({
  connections: [{ id: 'conn-a', instance_id: 'instance-a', name: 'A' }],
  groups: [{ id: 'group-a', group_id: 'fixture@g.us', whatsapp_connection_id: 'conn-a' }],
  selectedGroups: new Set(['group-a']), setGroups() {},
  setSelectedGroups: value => { selectionCleared = value.size === 0; }, fetchGroups: async () => {},
});
await actions.handleBroadcast('fixture message never sent');
assert.equal(groupToasts.at(-1).kind, 'success');
assert.equal(groupToasts.at(-1).text, 'Mensagem enviada para 1 grupo(s)!');
assert.equal(selectionCleared, true);
await actions.handleAutoSync(() => {});
assert.equal(groupToasts.at(-1).kind, 'success');
assert.equal(groupToasts.at(-1).text, '0 grupo(s) sincronizados!');
results.push({ id: 'P30', invokeCalls, toastResults: groupToasts, selectionCleared,
  outcome: 'Complete group actions turn provider error envelopes into broadcast success and sync success; the provider/database are never contacted.' });

const output = { head: sourceVerification.actual_head, source_verification: sourceVerification,
  additional_frontend_pins: frontendPins, actual_network_requests: 0, actual_database_requests: 0,
  actual_environment_reads: 0, source_changes: 0,
  method: 'Complete unchanged TS hook bodies after import wiring/type erasure; React hook state updates, lifecycle, timers and service calls are in-memory boundaries. No DOM rendering or browser session. All evaluated frontend source and all local backend sources were pinned before evaluation.',
  source_hashes: Object.fromEntries(paths.map(p => [p, createHash('sha256').update(fs.readFileSync(path.join(source, p))).digest('hex')])), results };
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'frontend-providers-probe-results.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ passed: results.length, ids: results.map(x => x.id), network: 0, database: 0, environment: 0 }));
