import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { collectPlaywrightInventory, MAX_COLLECTION_BYTES } from '../e2e-isolated/collection.mjs';
import { readPlaywrightInventory } from '../e2e-isolated/results.mjs';

// Actual collector/parser and filesystem. Only the child producer and exceptional
// I/O boundaries are controlled; these are not Playwright/browser executions.
const projects = ['setup', 'chromium-e2e-core', 'chromium-authenticated', 'firefox-talkx', 'webkit-talkx',
  'firefox-conversation', 'webkit-conversation', 'firefox-catalog', 'webkit-catalog'];
const clone = object => JSON.parse(JSON.stringify(object));
const marker = 'SYNTHETIC_PRIVATE_REPORT_MARKER';
const report = (names = projects) => ({
  config: { projects: [...names, 'unselected-project'].map(name => ({ name, repeatEach: 1 })), private: marker },
  suites: [{ title: 'actual-selected-suite', specs: names.map((name, index) => ({ title: 'case ' + name, file: 'selected.spec.ts', line: index + 1, column: 1,
    tests: [{ projectName: name, expectedStatus: 'passed', status: 'expected', results: [], annotations: [] }] })) }],
  errors: [],
});
const change = fn => { const value = report(); fn(value); return value; };
const cases = [];
const add = (id, expected, options = {}) => cases.push({ id, expected, ...options });

add('suite-nine-projects-and-unselected-config-preserved', 'accepted');
add('native-shard-allows-selected-projects-without-cases-in-this-partition', 'accepted', { shard: '1/3', json: change(j => {
  j.config.shard = { current: 1, total: 3 };
  j.suites[0].specs = j.suites[0].specs.filter(spec => ['setup', 'chromium-e2e-core', 'chromium-authenticated'].includes(spec.tests[0].projectName));
}) });
add('native-shard-rejects-report-from-another-partition', 'suite-inventory-invalid', { shard: '1/3', json: change(j => {
  j.config.shard = { current: 2, total: 3 };
}) });
add('native-shard-rejects-case-outside-the-closed-selection', 'suite-inventory-invalid', { shard: '1/3', json: change(j => {
  j.config.shard = { current: 1, total: 3 };
  j.suites[0].specs.push({ ...clone(j.suites[0].specs[0]), line: 100, tests: [{ ...clone(j.suites[0].specs[0].tests[0]), projectName: 'unselected-project' }] });
}) });
add('login-one-case-and-no-public-suite-file', 'accepted', { scope: 'login', json: report(['setup']) });
const nodeOutput = spawnSync(process.execPath, ['--input-type=module', '-e',
  'import test from "node:test"; test("collection imported Node guard", () => {}); console.log(' + JSON.stringify(JSON.stringify(report())) + ');'],
  { encoding: 'utf8', timeout: 10_000, env: { PATH: process.env.PATH } });
assert.equal(nodeOutput.status, 0);
assert.match(nodeOutput.stdout, /collection imported Node guard/);
assert.throws(() => JSON.parse(nodeOutput.stdout));
add('actual-node-test-stdout-cannot-contaminate-file', 'accepted', { stdout: nodeOutput.stdout });
add('tap-prefix-on-stdout', 'accepted', { stdout: 'TAP version 13\nok 1 guard\n' + JSON.stringify(report()) });
add('human-list-reporter-on-stdout', 'accepted', { stdout: 'Listing tests:\n  [setup] auth.setup.ts:1:1 › login\nTotal: 9 tests\n' });
add('stdout-json-looking-foreign-object', 'accepted', { stdout: '{"errors":[]}\n' });
add('private-stderr-noise-never-published', 'accepted', { stderr: marker + '\nraw diagnostic' });
const unicodeReport = change(j => { j.suites[0].specs[0].title = 'usuário — ação ✅'; });
add('report-with-unicode-and-whitespace', 'accepted', { json: unicodeReport, data: ' \n' + JSON.stringify(unicodeReport) + '\n' });
add('declarations-of-fixme-and-expected-failure-preserved', 'accepted', { json: change(j => {
  Object.assign(j.suites[0].specs[1].tests[0], { expectedStatus: 'skipped', status: 'skipped', annotations: [{ type: 'fixme', description: marker }] });
  Object.assign(j.suites[0].specs[2].tests[0], { expectedStatus: 'failed', annotations: [{ type: 'fail' }] });
}) });
add('fresh-report-ignores-old-private-report', 'accepted', { stale: true });
add('maximum-allowed-report-is-bounded-and-valid', 'accepted', { fileMode: 'maximum' });

add('nonzero-exit-with-valid-report', 'collect-suite', { result: { status: 1 } });
add('interrupted-exit-with-valid-report', 'collect-suite', { result: { status: 130 } });
add('status-zero-with-executor-error', 'collect-suite', { result: { status: 0, error: new Error(marker) } });
add('status-zero-with-signal', 'collect-suite', { result: { status: 0, signal: 'SIGTERM' } });
add('timeout-with-complete-report', 'collect-suite', { result: { status: null, error: Object.assign(new Error(marker), { code: 'ETIMEDOUT' }), signal: 'SIGKILL' } });
add('status-string-zero-is-not-success', 'collect-suite', { result: { status: '0' } });
add('executor-throws-before-return', 'collect-suite', { execThrow: true });
add('node-unit-failure-with-valid-playwright-inventory', 'collect-suite', { result: { status: 1 }, stderr: 'not ok 1 unit guard' });
add('reporter-writer-failure-is-process-failure', 'collect-suite', { result: { status: 1 }, fileMode: 'missing' });
add('login-process-gate-preserved', 'collect-login', { scope: 'login', json: report(['setup']), result: { status: 1 } });

add('missing-file-never-falls-back-to-valid-stdout', 'collection-report-missing', { fileMode: 'missing' });
add('old-report-cannot-admit-current-missing-file', 'collection-report-missing', { fileMode: 'missing', stale: true });
add('report-directory', 'collection-report-type', { fileMode: 'directory' });
add('report-symlink', 'collection-report-type', { fileMode: 'symlink' });
add('report-broken-symlink', 'collection-report-type', { fileMode: 'broken-symlink' });
add('report-hardlink', 'collection-report-type', { fileMode: 'hardlink' });
add('report-fifo-is-rejected-without-blocking', 'collection-report-type', { fileMode: 'fifo' });
add('empty-report', 'collection-report-size', { data: '' });
add('oversized-report-before-allocation', 'collection-report-size', { fileMode: 'oversized' });
add('prepare-directory-error', 'collection-report-prepare', { fsFault: 'prepare' });
add('open-access-error', 'collection-report-read', { fsFault: 'open' });
add('metadata-read-error', 'collection-report-read', { fsFault: 'stat' });
add('contents-read-error', 'collection-report-read', { fsFault: 'read' });
add('descriptor-close-error', 'collection-report-read', { fsFault: 'close' });
add('report-shrinks-during-read', 'collection-report-size', { fsFault: 'shrink' });
add('report-grows-during-read', 'collection-report-size', { fsFault: 'grow' });
add('report-changes-at-same-size', 'collection-report-size', { fsFault: 'changed' });

add('malformed-json', 'collection-report-json', { data: '{' });
add('two-json-documents', 'collection-report-json', { data: JSON.stringify(report()) + JSON.stringify(report()) });
add('node-output-inside-file-is-rejected', 'collection-report-json', { data: JSON.stringify(report()) + '\nok 1 guard\n' });
add('invalid-utf8-is-not-replacement-decoded', 'collection-report-json', { data: Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125]) });
add('json-array-fails-real-inventory-parser', 'suite-inventory-invalid', { json: [] });
add('empty-inventory', 'suite-inventory-invalid', { json: change(j => { j.suites = []; }) });
add('collection-errors-in-report', 'suite-inventory-invalid', { json: change(j => { j.errors = [{ message: marker }]; }) });
add('missing-selected-project', 'suite-inventory-invalid', { json: change(j => { j.suites[0].specs.pop(); }) });
add('unexpected-selected-project', 'suite-inventory-invalid', { json: change(j => {
  j.suites[0].specs.push({ ...clone(j.suites[0].specs[0]), line: 100, tests: [{ ...clone(j.suites[0].specs[0].tests[0]), projectName: 'unselected-project' }] });
}) });
add('duplicate-case-identity', 'suite-inventory-invalid', { json: change(j => { j.suites[0].specs.push(clone(j.suites[0].specs[0])); }) });
add('executions-in-list-report', 'suite-inventory-invalid', { json: change(j => { j.suites[0].specs[0].tests[0].results = [{ status: 'passed', workerIndex: 0, retry: 0, errors: [] }]; }) });
add('repeat-each-not-one', 'suite-inventory-invalid', { json: change(j => { j.config.projects[0].repeatEach = 2; }) });
add('login-two-tests-rejected', 'login-inventory-not-exact', { scope: 'login', json: (() => { const j = report(['setup']); j.suites[0].specs.push({ ...clone(j.suites[0].specs[0]), line: 2 }); return j; })() });
add('login-wrong-shape', 'login-inventory-invalid', { scope: 'login', json: {} });

add('raw-inventory-write-failure', 'collection-inventory-write', { fsFault: 'raw-write' });
add('public-inventory-write-failure', 'collection-public-inventory-write', { fsFault: 'public-write' });
add('login-does-not-write-suite-inventory', 'accepted', { scope: 'login', json: report(['setup']), fsFault: 'public-write' });

const original = Object.fromEntries(['mkdtempSync', 'openSync', 'fstatSync', 'readSync', 'closeSync', 'writeFileSync'].map(name => [name, fs[name]]));
function run(item) {
  const output = fs.mkdtempSync(path.join(tmpdir(), 'collection-proposal-'));
  const json = Object.hasOwn(item, 'json') ? item.json : report();
  const data = Object.hasOwn(item, 'data') ? item.data : JSON.stringify(json);
  const text = Buffer.isBuffer(data) ? data.toString('utf8') : data;
  const scope = item.scope ?? 'suite';
  const selected = scope === 'login' ? ['setup'] : projects;
  const browserSentinel = 'BROWSER_REPORT_UNCHANGED';
  fs.writeFileSync(path.join(output, 'results.json'), browserSentinel);
  if (item.stale) {
    fs.mkdirSync(path.join(output, 'collection-old'));
    fs.writeFileSync(path.join(output, 'collection-old/report.json'), JSON.stringify(report()));
    fs.writeFileSync(path.join(output, 'inventory.json'), JSON.stringify(report()));
  }
  let calls = 0, currentReport, descriptorClosed = false, altered = false, outcome, total = null;
  const throwIO = () => { throw Object.assign(new Error(marker), { code: 'EACCES' }); };
  function installFaults() {
    if (item.fsFault === 'prepare') fs.mkdtempSync = throwIO;
    if (['raw-write', 'public-write'].includes(item.fsFault)) fs.writeFileSync = (file, ...args) => {
      if (file === path.join(output, item.fsFault === 'raw-write' ? 'inventory.json' : 'test-inventory.json')) return throwIO();
      return original.writeFileSync(file, ...args);
    };
  }
  function installReadFaults() {
    if (item.fsFault === 'open') fs.openSync = throwIO;
    if (item.fsFault === 'stat') fs.fstatSync = throwIO;
    if (['read', 'grow', 'shrink', 'changed'].includes(item.fsFault)) fs.readSync = (...args) => {
      if (item.fsFault === 'read') return throwIO();
      if (!altered) {
        altered = true;
        if (item.fsFault === 'grow') fs.appendFileSync(currentReport, ' ');
        if (item.fsFault === 'shrink') fs.truncateSync(currentReport, 1);
        if (item.fsFault === 'changed') fs.utimesSync(currentReport, new Date(0), new Date(0));
      }
      return original.readSync(...args);
    };
    fs.closeSync = (...args) => {
      original.closeSync(...args); descriptorClosed = true;
      if (item.fsFault === 'close') return throwIO();
    };
  }
  function execute(containerReport) {
    calls++;
    {
      assert.match(containerReport, /^\/output\/collection-[A-Za-z0-9]+\/report\.json$/);
      currentReport = path.join(output, containerReport.slice('/output/'.length));
      assert.equal(fs.existsSync(currentReport), false);
      assert.equal(fs.statSync(path.dirname(currentReport)).mode & 0o777, 0o700);
      const auxiliary = path.join(output, 'auxiliary-private.json');
      switch (item.fileMode) {
        case 'missing': break;
        case 'directory': fs.mkdirSync(currentReport); break;
        case 'symlink': fs.writeFileSync(auxiliary, text); fs.symlinkSync(auxiliary, currentReport); break;
        case 'broken-symlink': fs.symlinkSync(auxiliary, currentReport); break;
        case 'hardlink': fs.writeFileSync(auxiliary, text); fs.linkSync(auxiliary, currentReport); break;
        case 'fifo': execFileSync('mkfifo', [currentReport]); break;
        case 'oversized': { const fd = original.openSync(currentReport, 'wx'); fs.ftruncateSync(fd, MAX_COLLECTION_BYTES + 1); original.closeSync(fd); break; }
        case 'maximum': fs.writeFileSync(currentReport, text + ' '.repeat(MAX_COLLECTION_BYTES - Buffer.byteLength(text))); break;
        default: fs.writeFileSync(currentReport, data, { flag: 'wx' });
      }
      installReadFaults();
    }
    if (item.execThrow) throw new Error(marker);
    return { status: 0, error: undefined, signal: null, stdout: item.stdout ?? text, stderr: item.stderr ?? '', ...item.result };
  }
  try {
    installFaults();
    const inventory = collectPlaywrightInventory({ output, scope, projects: selected, ...(item.shard ? { shard: item.shard } : {}), execute });
    total = inventory.total;
    outcome = 'accepted';
    assert.deepEqual(inventory, readPlaywrightInventory(json, { projects: selected, ...(item.shard ? { shard: item.shard } : {}) }));
    if (scope === 'suite') {
      const publicText = fs.readFileSync(path.join(output, 'test-inventory.json'), 'utf8');
      assert.equal(publicText.includes(marker), false);
      assert.deepEqual(JSON.parse(publicText), inventory);
    } else assert.equal(fs.existsSync(path.join(output, 'test-inventory.json')), false);
  } catch (error) {
    outcome = error instanceof SyntaxError ? 'unclassified-json-error' : /^[a-z-]+$/.test(error?.message ?? '') ? error.message : 'unclassified-error';
  } finally {
    Object.assign(fs, original);
    assert.equal(fs.readFileSync(path.join(output, 'results.json'), 'utf8'), browserSentinel);
    fs.rmSync(output, { recursive: true, force: true });
  }
  assert.ok(calls <= 1);
  return { outcome, total, process_calls: calls, descriptor_closed: descriptorClosed };
}
for (const item of cases) test('collection: ' + item.id, () => {
  const actual = run(item);
  assert.equal(actual.outcome, item.expected, JSON.stringify(actual));
});
