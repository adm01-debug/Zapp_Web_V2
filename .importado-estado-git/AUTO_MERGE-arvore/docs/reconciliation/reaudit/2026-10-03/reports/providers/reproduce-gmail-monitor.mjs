// Offline source-pinned audit of the complete data-loading/state prefix.
// JSX, React rendering and Supabase networking are not executed.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { verifyProviderSource } from './verify-source.mjs';

const source = path.resolve(process.argv[2] || '/workspace/scratch/f8f9b9cbce53/reaudit/source');
const manifestPath = process.argv[3] || path.join(path.dirname(source), 'source-integrity.json');
const sourceVerification = verifyProviderSource(source, manifestPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const relativePath = 'src/components/admin/GmailWebhookMonitor.tsx';
const pin = manifest.files.find(entry => entry.path === relativePath);
assert(pin, 'Missing frontend pin');
const bytes = fs.readFileSync(path.join(source, relativePath));
const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
assert.equal(bytes.length, pin.bytes);
assert.equal(blob, pin.git_blob_sha);
// Pins precede all application evaluation. No dynamic application imports.
const text = bytes.toString('utf8');
const from = text.indexOf('export function GmailWebhookMonitor() {');
const to = text.indexOf('  const getStatusBadge =');
assert(from > 0 && to > from);
const prefix = text.slice(from, to).replace('export function', 'function');
const program = stripTypeScriptTypes(prefix + '\n return { accounts, stats, loading, loadData };\n}\n');
let cursor = 0;
const state = [];
const warnings = [];
const calls = [];
let mode = 'success';
const supabase = {
  async rpc(name) {
    assert.equal(name, 'get_own_gmail_accounts');
    calls.push({ kind: 'rpc', name, mode });
    return mode === 'success'
      ? { data: [{ id: 'fixture-account', email_address: 'fixture@example.invalid', is_active: true, sync_status: 'synced' }], error: null }
      : { data: null, error: { message: 'fixture RPC unavailable' } };
  },
  from(table) {
    assert.equal(table, 'email_threads');
    let unread = false;
    const q = {
      select(columns, options) { assert.equal(columns, '*'); assert.equal(options.count, 'exact'); assert.equal(options.head, true); return q; },
      eq(key, value) { assert.equal(key, 'is_unread'); assert.equal(value, true); unread = true; return q; },
      then(resolve, reject) {
        calls.push({ kind: 'count', unread, mode });
        return Promise.resolve(mode === 'success'
          ? { data: null, error: null, count: unread ? 4 : 12 }
          : { data: null, error: { message: 'fixture count unavailable' }, count: null }).then(resolve, reject);
      },
    };
    return q;
  },
};
const context = {
  supabase,
  useState(initial) {
    const index = cursor++;
    if (state.length <= index) state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
  },
  useCallback: fn => fn,
  useEffect() {},
  log: { warn(...args) { warnings.push(args); } },
};
runInNewContext(program, context, { filename: relativePath });
function renderPrefix() { cursor = 0; return context.GmailWebhookMonitor(); }

// P39: a refresh after real-looking success turns all data errors into empty data.
let monitor = renderPrefix();
await monitor.loadData();
monitor = renderPrefix();
assert.equal(monitor.accounts.length, 1);
assert.equal(monitor.stats.total, 12);
assert.equal(monitor.stats.unread, 4);
assert.equal(monitor.loading, false);
mode = 'error';
await monitor.loadData();
monitor = renderPrefix();
assert.equal(monitor.accounts.length, 0);
assert.equal(monitor.stats.total, 0);
assert.equal(monitor.stats.unread, 0);
assert.equal(monitor.loading, false);
assert.equal(warnings.length, 0);
const output = {
  head: sourceVerification.actual_head,
  source_verification: sourceVerification,
  additional_pins: [{ path: relativePath, git_blob_sha: blob, sha256: createHash('sha256').update(bytes).digest('hex') }],
  actual_network_requests: 0, actual_database_requests: 0, actual_environment_reads: 0, source_changes: 0,
  method: 'Exact complete component state/loading prefix (27–58) with controlled React state and Supabase result contracts. JSX and React runtime are not rendered; effect mounting is stubbed and loadData invoked explicitly.',
  results: [{ id: 'P39', successfulSnapshot: { accounts: 1, total: 12, unread: 4 },
    afterFailedQueries: { accounts: monitor.accounts.length, ...monitor.stats, loading: monitor.loading },
    warningCount: warnings.length, failedQueryCount: calls.filter(call => call.mode === 'error').length,
    outcome: 'All three PostgREST/RPC result errors erase prior data into zero/empty with no caught error; UI branches then display no connected account and zero thread counts.' }],
};
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'gmail-monitor-probe-results.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ passed: 1, ids: ['P39'], network: 0, database: 0, environment: 0 }));
