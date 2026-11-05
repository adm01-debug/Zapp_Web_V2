import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertPinnedImages, functionPolicy, prepareMountTargets, readBrowserReportOnce, browserResultDiagnostic } from '../e2e-isolated/run.mjs';
import { gitBlob } from '../e2e-isolated/migrations.mjs';
import { OWNER_LABEL, PURPOSE_LABEL, PURPOSE, OFFICIAL_HOST, GROUPS, sha256 } from '../e2e-isolated/runtime-contract.mjs';
import { containerArguments, serviceConfiguration } from '../e2e-isolated/stack.mjs';
import { createTlsMaterial } from '../e2e-isolated/tls.mjs';
import { SIGNATURES, PROVIDER_CATALOG_SQL, CATALOG_EXECUTOR_OPTIONS } from '../e2e-isolated/provider-diagnostics.mjs';
import { OWNERSHIP_ROUTINES, OWNERSHIP_EXECUTOR_OPTIONS, ownershipSql } from '../e2e-isolated/routine-ownership.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MODULES = path.join(ROOT, 'scripts/e2e-isolated');
const SOURCE_SHA = 'a'.repeat(40);
const MIGRATION = '20260101000000_fixture.sql';
const SQL = 'select 1;\n';
const lock = () => JSON.parse(readFileSync(path.join(MODULES, 'images.lock.json'), 'utf8'));
const ok = stdout => ({ status: 0, stdout: stdout ?? '', stderr: '' });
const error = stderr => ({ status: 1, stdout: '', stderr: stderr ?? 'simulated command failure' });
const FUNCTIONS = ['auth-login', 'message-delivery', 'promogifts-catalog'];
const FUNCTION_SOURCE = '// graph fixture, never executed\n';
const SEED_FLAGS = ['main_contact_rls', 'files_owner_preserved', 'pagination_rls', 'talkx_connection_rls', 'talkx_segment_rls', 'instance_tokens_stored', 'inbox_fixture_rls', 'onboarding_persisted'];
const PROVIDER_FLAGS = ['delivery_real', 'provider_observed', 'delivery_user_rls', 'catalog_real',
  'catalog_media_https', 'storage_upload_real', 'storage_media_https', 'http_media_rejected'];
const TLS_CHECKS = { identity: true, image: true, untrusted_rejected: true, wrong_san_rejected: true };
let certificateFixture;
let certificateRoot;
after(() => { if (certificateRoot) rmSync(certificateRoot, { recursive: true, force: true }); });
function certificates() {
  if (!certificateFixture) {
    certificateRoot = mkdtempSync(path.join(tmpdir(), 'isolated-controller-certificates-'));
    certificateFixture = createTlsMaterial({ directory: path.join(certificateRoot, 'material'),
      runId: 'zapp-e2e-controller-certificates', sourceSha: SOURCE_SHA,
      command: (program, args, options) => program === 'certutil' ? ok() : spawnSync(program, args, options) });
  }
  return certificateFixture;
}

// Only subprocess I/O is simulated. The real TLS helper still reads and checks
// real X509 certificates, issues run-bound manifests, and removes both CA keys.
function simulatedTlsTool(program, args, options, fault) {
  if (program === 'certutil') return fault === 'tls-host-nss' || (fault === 'tls-nss-import' && args.includes('-A')) ? error() : ok();
  if (args[0] === 'version') return fault === 'tls-host-openssl' ? error() : ok(fault === 'tls-host-version' ? 'OpenSSL 1.1.1' : 'OpenSSL 3.0.0 fixture');
  if (fault === 'tls-certificate-command') return error();
  const material = certificates();
  const value = flag => args[args.indexOf(flag) + 1];
  const destination = value('-out');
  const name = path.basename(destination);
  if (args.includes('-keyout')) {
    const key = value('-keyout');
    if (['ca.key', 'untrusted-ca.key'].includes(path.basename(key))) writeFileSync(key, 'synthetic-unused-CA-key');
    else cpSync(path.join(material.privateDirectory, path.basename(key)), key);
  }
  if (name.endsWith('.csr')) writeFileSync(destination, 'synthetic-CSR-not-parsed');
  else cpSync(path.join(name === 'ca.crt' ? material.publicDirectory : material.privateDirectory, name), destination);
  return ok();
}
function playwrightJson({ listed = false, failed = false } = {}) {
  return {
    config: { projects: [{ name: 'setup', repeatEach: 1 }], metadata: { sentinel: 'must-never-publish-private-config' } },
    suites: [{ title: 'auth.setup.ts', file: 'auth.setup.ts', specs: [{
      title: 'authenticate', file: 'auth.setup.ts', line: 8, column: 1,
      tests: [{
        projectName: 'setup', projectId: 'setup', expectedStatus: 'passed',
        status: listed ? 'skipped' : failed ? 'unexpected' : 'expected', annotations: [],
        results: listed ? [] : [{ status: failed ? 'failed' : 'passed', workerIndex: 0, retry: 0, errors: failed ? [{}] : [], annotations: [] }],
      }],
    }] }],
    errors: [], stats: { expected: listed || failed ? 0 : 1, unexpected: failed ? 1 : 0, flaky: 0, skipped: listed ? 1 : 0 },
  };
}

function suiteJson({ listed = false, fault, group = 'authenticated' } = {}) {
  const projects = GROUPS[group].filter(name => fault !== 'missing-project-' + name);
  const report = playwrightJson({ listed });
  report.config.projects = projects.map(name => ({ name, repeatEach: 1 }));
  report.suites = projects.map(name => {
    const suite = structuredClone(report.suites[0]);
    suite.title = name + '.spec.ts';
    suite.file = suite.title;
    const spec = suite.specs[0];
    spec.file = suite.file;
    spec.tests[0].projectName = spec.tests[0].projectId = name;
    const item = spec.tests[0];
    if (name === 'chromium-authenticated' && fault === 'explicit-skip') {
      item.expectedStatus = 'skipped'; item.status = 'skipped'; item.annotations = [{ type: 'fixme', description: 'historical explicit contract' }];
      if (!listed) item.results = [{ status: 'skipped', workerIndex: -1, retry: 0, errors: [] }];
    }
    if (!listed && name === 'chromium-authenticated' && ['runtime-skip', 'suite-browser-failure'].includes(fault)) {
      item.status = fault === 'runtime-skip' ? 'skipped' : 'unexpected';
      item.expectedStatus = fault === 'runtime-skip' ? 'skipped' : 'passed';
      item.results = [{ status: fault === 'runtime-skip' ? 'skipped' : 'failed', workerIndex: 0, retry: 0, errors: [] }];
    }
    if (['chromium-e2e-core', 'firefox-conversation', 'webkit-conversation'].includes(name)) {
      suite.title = suite.file = spec.file = 'conversation.spec.ts';
      spec.title = 'resolving conversation via CloseConversationDialog succeeds';
      spec.line = 59; spec.column = 3;
      suite.specs = [];
      suite.suites = [{ title: 'Conversation state transitions', specs: [spec] }];
      if (!listed && name !== 'chromium-e2e-core' && fault === 'known-platform-skips') {
        item.expectedStatus = 'skipped'; item.status = 'skipped';
        item.annotations = [{ type: 'skip', description: "CloseConversationDialog coberto em Chromium; Radix Select portal nao responde a getByRole('option') de forma confiavel em Firefox/WebKit no CI" }];
        item.results = [{ status: 'skipped', workerIndex: 0, retry: 0, errors: [], annotations: structuredClone(item.annotations) }];
      }
    }
    return suite;
  });
  report.stats = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
  for (const suite of report.suites) report.stats[(suite.specs[0] ?? suite.suites[0].specs[0]).tests[0].status]++;
  if (!listed && fault === 'suite-stats-mismatch') report.stats.expected--;
  return report;
}

for (const name of ['postgres', 'auth', 'rest', 'storage', 'realtime', 'edge', 'driver']) {
  test('bootstrap pin: a ausência do digest de ' + name + ' bloqueia o conjunto', () => {
    const data = lock(); data.images[name] = data.images[name].split('@')[0];
    assert.throws(() => assertPinnedImages(data), /image-lock-review-required/);
  });
}
test('bootstrap pin: os sete digests nativos permanecem referências imutáveis', () => {
  assert.equal(Object.keys(assertPinnedImages(lock())).length, 7);
});
for (const [source, expected] of [
  ['[functions.auth-login]\nverify_jwt = false\n', false],
  ['[functions.auth-login]\nverify_jwt = true\n', true],
  ['[functions.other]\nverify_jwt = false\n', true],
  ['[functions.auth-login]\n# verify_jwt = false\n', true],
]) {
  test('política Edge: parser lê declaração executável ' + JSON.stringify(source), () => {
    assert.equal(functionPolicy(source, 'auth-login'), expected);
  });
}
test('política Edge: declaração duplicada não vira falso sem-JWT', () => {
  assert.throws(() => functionPolicy('[functions.auth-login]\nverify_jwt = false\nverify_jwt = true\n', 'auth-login'));
});

test('mounts RO: só cria alvos vazios; preserva conteúdo existente', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'isolated-mount-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'e2e'));
  writeFileSync(path.join(root, 'e2e/kept.txt'), 'original');
  const created = prepareMountTargets(root, ['/work/e2e/.auth', '/work/node_modules/.vite']);
  assert.deepEqual(created.map(value => path.relative(root, value)), ['e2e/.auth', 'node_modules', 'node_modules/.vite']);
  assert.equal(readFileSync(path.join(root, 'e2e/kept.txt'), 'utf8'), 'original');
  assert.deepEqual(prepareMountTargets(root, ['/work/e2e/.auth']), []);
});
for (const target of ['/tmp/foreign', '/work/../foreign', '/work/e2e/./auth', '/work/e2e//auth']) {
  test('mounts RO: recusa alvo ambíguo ' + target, t => {
    const root = mkdtempSync(path.join(tmpdir(), 'isolated-mount-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.throws(() => prepareMountTargets(root, [target]));
  });
}
test('mounts RO: não segue symlink para diretório alheio', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'isolated-mount-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  symlinkSync(tmpdir(), path.join(root, 'e2e'));
  assert.throws(() => prepareMountTargets(root, ['/work/e2e/.auth']), /unsafe-work-mount-target/);
});

// Exercise the real builder across the current services, preserving image paths
// and the remaining arguments while checkout tools alone use /work as cwd.
const checkoutServices = ['anchor', 'driver', 'vite', 'gateway'];
const officialServices = ['postgres', 'auth', 'rest', 'storage', 'realtime', 'edge'];
const argumentCases = [
  { label: 'padrão', mounts: [] },
  { label: 'checkout readonly', mounts: [{ type: 'bind', source: '/fixture/repo', target: '/work', readOnly: true }], user: '1001:1001' },
  { label: 'volume gravável', mounts: [{ type: 'volume', source: 'fixture-volume', target: '/var/lib/data', readOnly: false }], memory: '768m', user: '42:43' },
  { label: 'env e argumento literais', mounts: [{ type: 'bind', source: '/fixture/path with spaces', target: '/fixture data', readOnly: true }], envFile: '/fixture/local env', extra: ['--fixture-argument=literal value'] },
];
for (const name of [...checkoutServices, ...officialServices]) for (const variant of argumentCases) {
  test('workdir: ' + name + ' / ' + variant.label, () => {
    const runId = 'zapp-e2e-workdir-fixture';
    const services = serviceConfiguration({ runId, sourceSha: SOURCE_SHA, credentials: {
      databasePassword: 'synthetic-database-password', jwtSecret: 'synthetic-jwt-secret',
      anonKey: 'synthetic-anon', serviceRoleKey: 'synthetic-service', evolutionKey: 'synthetic-evolution',
      instanceToken: 'synthetic-instance', email: 'fixture@example.invalid', password: 'synthetic-password',
    } });
    const images = assertPinnedImages(lock());
    const image = officialServices.includes(name) ? images[name] : images.driver;
    const args = [...(services[name]?.args ?? ['node', '-e', 'setInterval(() => {}, 1000)']), ...(variant.extra ?? [])];
    const input = { runId, name, image, anchorId: name === 'anchor' ? undefined : 'fixture-anchor-id', mounts: variant.mounts, envFile: variant.envFile, args, memory: variant.memory, user: variant.user };
    const original = structuredClone(input);
    const actual = containerArguments(input);
    const values = flag => actual.flatMap((value, i) => value === flag ? [actual[i + 1]] : []);
    assert.deepEqual(values('--workdir'), checkoutServices.includes(name) ? ['/work'] : [], 'official images must keep their image WORKDIR');
    assert.deepEqual(actual.slice(actual.indexOf(image)), [image, ...args], 'image digest and process arguments stay intact');
    assert.deepEqual(values('--network'), [name === 'anchor' ? 'none' : 'container:fixture-anchor-id']);
    assert.deepEqual(values('--name'), [runId + '-' + name]);
    assert.deepEqual(values('--label'), [OWNER_LABEL + '=' + runId, PURPOSE_LABEL + '=' + PURPOSE]);
    assert.deepEqual(values('--memory'), [variant.memory ?? '2g']);
    assert.deepEqual(values('--user'), variant.user ? [variant.user] : []);
    assert.deepEqual(values('--env-file'), variant.envFile ? [variant.envFile] : []);
    assert.deepEqual(values('--mount'), variant.mounts.map(m => `type=${m.type},src=${m.source},dst=${m.target}${m.readOnly ? ',readonly' : ''}`));
    assert.deepEqual(values('--add-host'), name === 'anchor' ? [OFFICIAL_HOST + ':127.0.0.1'] : []);
    assert.deepEqual(values('--cap-drop'), ['NET_RAW']);
    assert.deepEqual(values('--security-opt'), ['no-new-privileges:true']);
    assert.equal(actual.some(value => ['--privileged', '--publish', '-p', '--network=host'].includes(value)), false);
    assert.deepEqual(input, original, 'builder must not mutate mounts, commands or options');
  });
}

async function controllerFixture(t, fault, options = {}, tlsDiagnostic) {
  const { scope = 'login', group = 'authenticated', manifest = value => value, pullDiagnostic, seedDiagnostic,
    catalogResult, providerObservation, ownershipResult, ownershipFault, collectionFile, collectionResult, browserObservation } = typeof options === 'function' ? { manifest: options } : options;
  const fullSeed = scope === 'suite' && group === 'authenticated';
  const temporary = mkdtempSync(path.join(tmpdir(), 'isolated-controller-test-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'repo');
  const output = path.join(temporary, 'output');
  for (const folder of ['scripts/e2e-isolated', 'scripts/ci', 'scripts/db-audit', 'supabase/migrations', 'node_modules/@playwright/test']) mkdirSync(path.join(root, folder), { recursive: true });
  for (const name of ['run.mjs', 'runtime-contract.mjs', 'stack.mjs', 'migrations.mjs', 'results.mjs', 'collection.mjs', 'images.lock.json', 'tls.mjs', 'tls-probe.mjs', 'tls-edge-probe.ts', 'provider-diagnostics.mjs', 'routine-ownership.mjs']) cpSync(path.join(MODULES, name), path.join(root, 'scripts/e2e-isolated', name));
  cpSync(path.join(ROOT, 'scripts/ci/redigir-relatorio.mjs'), path.join(root, 'scripts/ci/redigir-relatorio.mjs'));
  writeFileSync(path.join(root, 'node_modules/@playwright/test/package.json'), JSON.stringify({ version: fault === 'wrong-playwright' ? '1.0.0' : '1.64.1' }));
  writeFileSync(path.join(temporary, 'bun'), 'unused simulated binary');
  writeFileSync(path.join(root, 'supabase/config.toml'), '[functions.auth-login]\nverify_jwt = ' + (fault === 'jwt-policy' ? 'true' : 'false') + '\n');
  if (scope === 'suite') {
    for (const name of [...FUNCTIONS, '_shared']) {
      if (fault === 'missing-delivery-handler' && name === 'message-delivery') continue;
      mkdirSync(path.join(root, 'supabase/functions', name), { recursive: true });
      writeFileSync(path.join(root, 'supabase/functions', name, 'index.ts'), FUNCTION_SOURCE);
    }
    mkdirSync(path.join(root, 'e2e'), { recursive: true });
    cpSync(path.join(ROOT, 'e2e/conversation.spec.ts'), path.join(root, 'e2e/conversation.spec.ts'));
  }
  let sql = SQL;
  if (fault === 'unreviewed-vault') sql += "select vault.create_secret('synthetic-fixture-only');\n";
  if (fault === 'historical-jwt') sql += "select 'eyJaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaa';\n";
  writeFileSync(path.join(root, 'supabase/migrations', MIGRATION), sql);
  writeFileSync(path.join(root, 'scripts/db-audit/replay-known-failures.json'), JSON.stringify({ esperadas: fault === 'known-migration-failure' || fault === 'known-migration-process-failure' ? { [MIGRATION]: {} } : {} }));
  if (fault === 'pending-pin') {
    const data = lock(); data.images.auth = data.images.auth.split('@')[0];
    writeFileSync(path.join(root, 'scripts/e2e-isolated/images.lock.json'), JSON.stringify(data));
  }
  const calls = [];
  let browserReadCalls = 0, restoreBrowserFilesystem;
  const containers = new Map();
  const volumes = new Map();
  let migrationCalls = 0;
  let seedCalls = 0;
  let browserCalls = 0;
  let listCalls = 0;
  let credentialFilesSeen = false;
  let cleanupSeen = false;
  let controlDir;
  let pgReadyChecks = 0;
  const suiteStages = [];
  const catalogCalls = [];
  const ownershipCalls = [];
  let ownershipInspection = false;
  const bundled = [];
  let localKeyConfigured = false;
  let driverLocalAnonKey;
  let diagnosticCredentials = {};
  const tlsStages = [];
  let tlsInstalled = false;
  let tlsUpdated = false;
  let tlsBoot = false;
  let tlsProbeRemoved = false;
  const valueAfter = (args, flag) => args[args.indexOf(flag) + 1];
  const allAfter = (args, flag) => args.flatMap((value, i) => value === flag ? [args[i + 1]] : []);
  const fakeCommand = (program, args, options) => {
    calls.push({ program, args: [...args] });
    if (['openssl', 'certutil'].includes(program)) return simulatedTlsTool(program, args, options, fault);
    if (program === 'git') {
      if (args[0] === 'rev-parse') return ok((ownershipFault === 'source' && migrationCalls ? 'b'.repeat(40) : SOURCE_SHA) + '\n');
      if (args[0] === 'diff') return fault === 'dirty-checkout' ? error() : ok();
      if (args[0] === 'ls-files') {
        if (args.at(-1) === 'supabase/functions') return ok(FUNCTIONS.filter(name => fault !== 'untracked-handler' || name !== 'message-delivery').map(name => '100644 ' + (fault === 'changed-handler' && name === 'message-delivery' ? 'b'.repeat(40) : gitBlob(FUNCTION_SOURCE)) + ' 0\tsupabase/functions/' + name + '/index.ts').join('\n'));
        return ok(manifest('100644 ' + gitBlob(sql) + ' 0\tsupabase/migrations/' + MIGRATION + '\n'));
      }
      assert.fail('unexpected git command');
    }
    if (program === 'which') return ok(path.join(temporary, 'bun'));
    if (program === 'node') {
      assert.equal(args[0], 'scripts/ci/redigir-relatorio.mjs');
      assert.equal(args[1], path.join(output, 'public'));
      return fault === 'redactor-failure' ? error() : spawnSync(process.execPath, args, options);
    }
    assert.equal(program, 'docker', 'no other process may run in a simulated controller');
    assert.deepEqual(args.slice(0, 2), ['--host', 'unix:///var/run/docker.sock']);
    assert.deepEqual(Object.keys(options.env).sort(), ['DOCKER_CONFIG', 'PATH']);
    const argv = args.slice(2);
    if (argv[0] === 'context') return ok(JSON.stringify(fault === 'external-docker' ? 'tcp://external.invalid:2376' : 'unix:///var/run/docker.sock'));
    if (argv[0] === 'pull') {
      const privateDir = path.join(path.dirname(options.env.DOCKER_CONFIG), 'private');
      assert.equal(readdirSync(privateDir).length, 0, 'pull must precede credential generation');
      assert.equal(options.timeout, 15 * 60_000, 'the existing pull timeout remains bounded');
      if (pullDiagnostic && argv[1] === lock().images[pullDiagnostic.role]) {
        const message = 'OCI_PULL_DIAGNOSTIC role=' + pullDiagnostic.role + ' synthetic-redaction-control-not-a-credential ' +
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c3ludGhldGlj\n';
        const stdout = 'stdout ' + message, stderr = 'stderr ' + message;
        switch (pullDiagnostic.kind) {
          case 'success': return { status: 0, stdout, stderr };
          case 'stderr': return { status: 1, stdout: '', stderr };
          case 'stdout': return { status: 2, stdout, stderr: '' };
          case 'both': return { status: 1, stdout, stderr };
          case 'timeout': return { status: null, error: Object.assign(new Error('controlled timeout'), { code: 'ETIMEDOUT' }), signal: 'SIGTERM', stdout, stderr };
          case 'empty-signal': return { status: null, signal: 'SIGKILL', stdout: '', stderr: '' };
          default: assert.fail('unknown pull diagnostic case');
        }
      }
      return fault === 'pull-auth' && argv[1] === lock().images.auth ? error() : ok();
    }
    if (argv[0] === 'image') return ok(JSON.stringify([fault === 'wrong-image-digest' ? 'registry.invalid/image@sha256:' + '0'.repeat(64) : argv[2]]));
    if (argv[0] === 'run') {
      const name = valueAfter(argv, '--name');
      const mounts = allAfter(argv, '--mount').map(value => {
        const pieces = Object.fromEntries(value.split(',').map(part => part.includes('=') ? part.split('=') : [part, true]));
        return { Type: pieces.type, ...(pieces.type === 'volume' ? { Name: pieces.src } : {}), Source: pieces.type === 'volume' ? volumes.get(pieces.src)?.Mountpoint : pieces.src, Destination: pieces.dst, RW: !pieces.readonly };
      });
      const labels = Object.fromEntries(allAfter(argv, '--label').map(value => value.split('=')));
      const metadata = { Id: sha256(name), Name: '/' + name, Config: { Image: argv.find(value => Object.values(lock().images).includes(value)), Env: ['PATH=/usr/lib/postgresql/bin:/usr/bin:/bin', 'PGHOSTADDR=198.51.100.1', 'PGSERVICE=foreign'], Labels: labels, User: argv.includes('--user') ? valueAfter(argv, '--user') : '' }, State: { Running: true }, HostConfig: { NetworkMode: argv.includes('--network') ? valueAfter(argv, '--network') : 'default', Privileged: false, CapAdd: [] }, NetworkSettings: { Networks: {} }, Mounts: mounts };
      if (name.endsWith('-tls-tools')) {
        assert.equal(argv.includes('--env-file'), false);
        assert.equal(valueAfter(argv, '--network'), 'none');
        assert.equal(mounts.length, 0);
        assert.equal(valueAfter(argv, '--entrypoint'), '/bin/sh');
        return fault === 'tls-image-tools' ? error() : ok();
      }
      if (name.includes('-bundle-')) {
        assert.equal(valueAfter(argv, '--user'), process.getuid() + ':' + process.getgid(), 'compiler cache must belong to the runner');
        assert.deepEqual(allAfter(argv, '--workdir'), ['/work'], 'the checkout compiler keeps its explicit working directory');
        const privateDir = path.join(path.dirname(options.env.DOCKER_CONFIG), 'private');
        assert.equal(readdirSync(privateDir).length, 0, 'compile must precede credential generation');
        assert.equal(argv.includes('--env-file'), false);
        if (fault === 'bundle-failure' || (fault === 'tls-probe-bundle' && name.endsWith('-tls-edge-probe'))) return error();
        const bundleMount = mounts.find(mount => mount.Destination === '/bundles');
        const filename = path.basename(valueAfter(argv, '--output'));
        bundled.push(filename);
        writeFileSync(path.join(bundleMount.Source, filename), fault === 'empty-bundle' || (fault === 'tls-probe-empty-bundle' && filename === 'tls-edge-probe.eszip') ? '' : 'simulated-eszip-' + filename);
        return ok();
      }
      const checkoutProcess = ['-anchor', '-driver', '-vite', '-gateway'].some(suffix => name.endsWith(suffix));
      assert.deepEqual(allAfter(argv, '--workdir'), checkoutProcess ? ['/work'] : [], 'the real controller must preserve official image working directories');
      if (checkoutProcess || name.endsWith('-provider')) {
        assert.equal(valueAfter(argv, '--user'), process.getuid() + ':' + process.getgid(), 'Node/Bun bind writes must belong to the runner');
      }
      if (name.endsWith('-anchor')) assert.equal(valueAfter(argv, '--add-host'), OFFICIAL_HOST + ':127.0.0.1');
      else assert.equal(argv.includes('--add-host'), false, 'container network must inherit the anchor hosts file');
      if (name.endsWith('-gateway') && fault === 'tls-gateway-start') return error();
      if (name.endsWith('-tls-edge') && fault === 'tls-edge-start') return error();
      if (name.endsWith('-postgres') && fault === 'postgres-start') return error();
      if (name.endsWith('-provider') && fault === 'provider-start') return error();
      if (name.endsWith('-anchor') && fault === 'anchor-network') metadata.HostConfig.NetworkMode = 'bridge';
      if (name.endsWith('-driver') && fault === 'driver-network') metadata.HostConfig.NetworkMode = 'host';
      if (name.endsWith('-driver') && fault === 'tls-driver-user') metadata.Config.User = '99999:99999';
      if (name.endsWith('-driver') && fault === 'tls-driver-stopped') metadata.State.Running = false;
      if (name.endsWith('-driver') && fault === 'tls-driver-public-writable') metadata.Mounts.find(mount => mount.Destination === '/run/zapp-e2e-tls').RW = true;
      if (name.endsWith('-driver') && fault === 'tls-driver-home-missing') metadata.Mounts = metadata.Mounts.filter(mount => !mount.Destination.includes('/tls-material/home'));
      if (name.endsWith('-driver') && fault === 'tls-driver-private') metadata.Mounts.push({ Source: '/foreign/private', Destination: '/run/zapp-e2e-tls-private', RW: false });
      if (argv.includes('--env-file')) {
        const envText = readFileSync(valueAfter(argv, '--env-file'), 'utf8');
        credentialFilesSeen ||= envText.includes('E2E_TEST_PASSWORD=');
        if (name.endsWith('-driver')) {
          driverLocalAnonKey = envText.match(/^ANON_KEY=(.+)$/m)?.[1];
          diagnosticCredentials = Object.fromEntries(envText.trim().split('\n').map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
        }
        if (name.endsWith('-tls-edge')) {
          assert.equal(/SERVICE_ROLE|JWT_SECRET|ANON_KEY|PASSWORD/.test(envText), false, 'temporary Edge never receives application credentials');
          assert.equal(metadata.Mounts.some(mount => mount.Destination === '/run/zapp-e2e-tls-private' || mount.Destination === '/run/zapp-e2e'), false);
        }
        assert.equal(args.some(value => value.includes('E2E_TEST_PASSWORD=')), false, 'credentials never enter argv');
      }
      controlDir ||= mounts.find(mount => mount.Destination === '/run/zapp-e2e')?.Source;
      containers.set(name, metadata);
      if (name.endsWith('-postgres') && fault === 'cancel-after-postgres') process.emit('SIGTERM');
      return ok(metadata.Id);
    }
    if (argv[0] === 'inspect') {
      const metadata = containers.get(argv[1]) ?? [...containers.values()].find(value => value.Id === argv[1]);
      if (!metadata) return error('Error: No such object: ' + argv[1]);
      const copy = structuredClone(metadata);
      if (/^[a-f0-9]{64}$/.test(argv[1])) {
        ownershipInspection = true;
        if (ownershipFault === 'cid' && copy.Name.endsWith('-postgres')) copy.Id = 'f'.repeat(64);
      }
      if (cleanupSeen && fault === 'cleanup-inspect-failure') return error('simulated daemon unavailable');
      if (browserCalls && fault === 'foreign-container-cleanup') copy.Config.Labels[OWNER_LABEL] = 'foreign';
      return ok(JSON.stringify([copy]));
    }
    if (argv[0] === 'volume') {
      if (argv[1] === 'create') {
        const name = argv.at(-1);
        const labels = Object.fromEntries(allAfter(argv, '--label').map(value => value.split('=')));
        volumes.set(name, { Name: name, Mountpoint: path.join(temporary, name), Labels: labels });
        return ok(name);
      }
      if (argv[1] === 'inspect') {
        const value = structuredClone(volumes.get(argv[2]));
        if (ownershipInspection && !cleanupSeen && ownershipFault === 'volume') value.Labels[OWNER_LABEL] = 'foreign';
        if (browserCalls && fault === 'foreign-volume-cleanup') value.Labels[OWNER_LABEL] = 'foreign';
        return value ? ok(JSON.stringify([value])) : error('No such volume');
      }
      if (argv[1] === 'rm') { volumes.delete(argv[2]); return ok(); }
      assert.fail('unexpected volume command');
    }
    if (argv[0] === 'exec') {
      if (argv.includes('install') || argv.includes('update-ca-certificates')) {
        assert.equal(valueAfter(argv, '--user'), '0:0');
        assert.ok(argv.some(value => value.endsWith('-driver')));
        assert.equal(migrationCalls, 0);
        if (argv.includes('install')) { tlsInstalled = true; return fault === 'tls-ca-install' ? error() : ok(); }
        assert.equal(tlsInstalled, true); tlsUpdated = true;
        return fault === 'tls-ca-update' ? error() : ok();
      }
      if (argv.includes('scripts/e2e-isolated/tls-probe.mjs')) {
        const runtime = argv.at(-1);
        assert.equal(tlsUpdated, true); assert.equal(tlsBoot, true); assert.equal(migrationCalls, 0);
        assert.equal([...containers.keys()].some(name => name.endsWith('-postgres')), false, 'TLS gates precede even database creation');
        tlsStages.push(runtime);
        if (tlsDiagnostic?.runtime === runtime) {
          const keys = { anon: 'ANON_KEY', service: 'SERVICE_ROLE_KEY', email: 'E2E_TEST_EMAIL', password: 'E2E_TEST_PASSWORD' };
          const secrets = Object.values(keys).map(key => diagnosticCredentials[key]);
          assert.ok(secrets.every(value => typeof value === 'string' && value.length > 6));
          const genericJwt = 'eyJkaWFnbm9zdGljIn0.eyJzeW50aGV0aWMiOnRydWV9.c2lnbmF0dXJlLWZpeHR1cmU';
          const secret = keys[tlsDiagnostic.kind] ? diagnosticCredentials[keys[tlsDiagnostic.kind]] :
            tlsDiagnostic.kind === 'jwt-shape' ? genericJwt : secrets.join(' ');
          const diagnostic = 'TLS_DIAGNOSTIC phase=positive engine=chromium ERR_CERT_AUTHORITY_INVALID ' + secret;
          return { status: ['signal', 'timeout'].includes(tlsDiagnostic.kind) ? null : 1,
            stdout: tlsDiagnostic.kind === 'stdout' ? diagnostic : '',
            stderr: tlsDiagnostic.kind === 'stdout' ? '' : diagnostic,
            ...(tlsDiagnostic.kind === 'signal' ? { signal: 'SIGTERM' } : {}),
            ...(tlsDiagnostic.kind === 'timeout' ? { error: new Error('ETIMEDOUT') } : {}),
          };
        }

        if (fault === 'tls-' + runtime + '-exit') return error();
        if (fault === 'tls-' + runtime + '-json') return ok('not-json');
        const runId = containers.values().next().value.Config.Labels[OWNER_LABEL];
        const checks = runtime === 'browsers' ? Object.fromEntries(['chromium', 'firefox', 'webkit'].map(name => [name, { ...TLS_CHECKS }])) : { ...TLS_CHECKS };
        const proof = { schema: 1, run_id: runId, source_sha: SOURCE_SHA, origin: 'https://127.0.0.1:5173', runtime, probe_runner: runtime === 'bun' ? 'bun' : 'node', probe_runner_version: 'v24.0.0', checks };
        for (const field of ['run_id', 'source_sha', 'origin', 'runtime', 'schema', 'probe_runner', 'probe_runner_version']) if (fault === 'tls-' + runtime + '-' + field) proof[field] = 'foreign';
        if (fault === 'tls-' + runtime + '-checks') delete (runtime === 'browsers' ? proof.checks.webkit : proof.checks).wrong_san_rejected;
        if (runtime === 'browsers' && fault === 'tls-browser-extra') proof.checks.other = { ...TLS_CHECKS };
        if (runtime === 'browsers' && fault === 'tls-browser-missing') delete proof.checks.firefox;
        if (runtime === 'browsers' && fault === 'tls-browser-false') proof.checks.webkit.untrusted_rejected = false;
        return ok(JSON.stringify(proof));
      }
      if (argv.includes('cat') && argv.at(-1) === '/etc/hosts') return ok((fault === 'postgres-hosts' ? '203.0.113.1' : '127.0.0.1') + ' ' + OFFICIAL_HOST + '\n');
      if (argv.includes('/usr/bin/readlink')) {
        assert.equal(ownershipInspection, true); assert.equal(migrationCalls, 1); assert.equal(seedCalls, 0);
        assert.deepEqual(argv, ['exec', [...containers.values()].find(value => value.Name.endsWith('-postgres')).Id, '/usr/bin/readlink', '/proc/self/ns/net']);
        return ok(ownershipFault === 'namespace' ? 'net:[9999]' : 'net:[1234]');
      }
      if (argv.includes('pg_isready')) { pgReadyChecks++; return ok(); }
      if (argv.includes('psql')) {
        const input = String(options.input);
        if (input.includes('CREATE TEMP TABLE e2e_owner_before')) {
          const runId = containers.values().next().value.Config.Labels[OWNER_LABEL];
          const database = [...containers.values()].find(value => value.Name.endsWith('-postgres'));
          assert.equal(migrationCalls, 1); assert.equal(seedCalls, 0); assert.deepEqual(suiteStages, []);
          assert.deepEqual(argv, ['exec', '-i', database.Id, '/usr/bin/env', '-i', 'PATH=/usr/lib/postgresql/bin:/usr/bin:/bin',
            'LANG=C', 'LC_ALL=C', 'PGCLIENTENCODING=UTF8', 'PGPASSFILE=/dev/null', 'psql', '-X', '-w', '-h', '/var/run/postgresql',
            '-p', '5432', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-q', '-A', '-t']);
          for (const [key, expected] of Object.entries(OWNERSHIP_EXECUTOR_OPTIONS)) assert.equal(options[key], expected);
          assert.equal(input, ownershipSql(runId, SOURCE_SHA));
          ownershipCalls.push({ afterMigrations: migrationCalls, beforeSeeds: seedCalls, target: database.Id });
          const rows = ownershipRecords(runId);
          return ownershipResult ? ownershipResult(rows) : ok(rows.map(row => JSON.stringify(row)).join('\n') + '\n');
        }
        if (input.includes('pg_catalog.pg_proc')) {
          catalogCalls.push({ input, timeout: options.timeout, killSignal: options.killSignal,
            maxBuffer: options.maxBuffer, afterStages: [...suiteStages] });
          if (catalogResult && Object.hasOwn(catalogResult, 'throws')) throw catalogResult.throws;
          return catalogResult ?? ok(JSON.stringify({ schema: 1,
            routines: SIGNATURES.map(signature => ({ signature, owner: 'postgres', security_definer: true })) }));
        }
        if (input.includes('alter database postgres set app.settings.e2e_anon_key')) {
          if (fault === 'local-key-setting-write') return error('controlled setting failure');
          const configured = input.match(/set app\.settings\.e2e_anon_key = '([^']+)'/i)?.[1];
          assert.equal(Boolean(driverLocalAnonKey && configured === driverLocalAnonKey), true, 'setting must equal this driver synthetic anon key');
          localKeyConfigured = true;
          assert.equal(args.some(value => value.includes('eyJ')), false, 'local JWT must remain outside argv');
        }
        if (input.includes("current_setting('app.settings.e2e_anon_key', true)")) {
          assert.equal(input.includes("= '" + driverLocalAnonKey + "'"), true, 'read-back compares the same local key');
          return ok(localKeyConfigured && fault !== 'local-key-setting-mismatch' ? 't' : 'f');
        }
        if (input === sql) {
          migrationCalls++;
          if (fault === 'known-migration-process-failure') return { status: null, error: new Error('timeout'), stdout: '', stderr: 'sentinel-not-to-publish' };
          return ['unexpected-migration-failure', 'known-migration-failure'].includes(fault) ? error('ERROR:  42P01\nraw SQL must never publish') : ok();
        }
        if (input.includes("current_setting('cron.launch_active_jobs')")) return ok((fault === 'cron-enabled' || (fault === 'cron-reenabled' && migrationCalls)) ? 'f' : 't');
        if (input.includes("to_regclass('auth.sessions')")) return ok(fault === 'missing-platform-schema' ? 'f' : 't');
        return ok();
      }
      if (argv.includes('scripts/e2e-isolated/runtime-probe.mjs')) {
        const mode = argv.at(-1);
        if (mode === 'network') return ok(JSON.stringify({ network_namespace: 'net:[1234]', loopback_only: fault !== 'network-proof', official_host_local: fault !== 'driver-hosts' }));
        if (mode === 'tls') {
          tlsBoot = true;
          if (fault === 'tls-boot-exit') return error();
          return ok(JSON.stringify({ schema: 1, run_id: fault === 'tls-boot-identity' ? 'foreign' : containers.values().next().value.Config.Labels[OWNER_LABEL], source_sha: SOURCE_SHA, origin: 'https://127.0.0.1:5173', ready: true }));
        }
        if (mode === 'platform') return fault === 'platform-health' ? error() : ok('{"services":{"auth":{"ready":true}}}');
        if (mode === 'frontend') return fault === 'frontend-readiness' ? error() : ok('{"ready":true}');
        if (mode === 'seed') return ok(JSON.stringify({ ready: true, network_namespace: fault === 'namespace-change' ? 'net:[9999]' : 'net:[1234]' }));
      }
      if (argv.includes('scripts/e2e-isolated/seed-login.mjs')) {
        seedCalls++;
        if (fault === 'seed-login-failure') return error('seed login rejected');
        writeFileSync(path.join(output, 'seed-ready.json'), JSON.stringify({ run_id: containers.values().next().value.Config.Labels[OWNER_LABEL], source_sha: SOURCE_SHA, auth_login_real: true, supervisor_rls_read: true }));
        return ok('{"seed_ready":true}');
      }
      const suiteCommands = {
        'e2e/fixtures/arquivos-local/seed.ts': 'files-volume',
        'e2e/fixtures/seed-files-tab.mjs': 'files-canonical',
        'scripts/e2e-isolated/seed-suite.mjs': 'suite-seed',
        'scripts/e2e-isolated/verify-providers.mjs': 'provider-verification',
      };
      for (const [file, name] of Object.entries(suiteCommands)) {
        if (!argv.includes(file)) continue;
        assert.equal(scope, 'suite');
        assert.equal(seedCalls, 1);
        assert.ok(containers.has([...containers.keys()].find(key => key.endsWith('-provider'))));
        suiteStages.push(name);
        if (name === 'provider-verification' && providerObservation) {
          if (Object.hasOwn(providerObservation, 'raw')) writeFileSync(path.join(output, 'provider-diagnostic.json'), providerObservation.raw);
          const result = providerObservation.result;
          if (result.status !== 0 || result.error || result.signal) return result;
        }
        if (name === 'files-volume' && seedDiagnostic) return seedDiagnostic;
        if (fault === name + '-failure') return error('private-sentinel-from-seed');
        const runId = containers.values().next().value.Config.Labels[OWNER_LABEL];
        if (name === 'suite-seed' && fault !== 'suite-proof-missing') {
          const data = { schema: 1, run_id: runId, source_sha: SOURCE_SHA, ...Object.fromEntries(SEED_FLAGS.map(key => [key, true])), pagination_seed_count: 51 };
          if (fault.startsWith('suite-proof-')) data[fault.slice('suite-proof-'.length)] = false;
          writeFileSync(path.join(output, 'suite-seed-ready.json'), JSON.stringify(data));
        }
        if (name === 'provider-verification' && fault !== 'provider-proof-missing') {
          const data = { schema: 1, run_id: runId, source_sha: SOURCE_SHA, ...Object.fromEntries(PROVIDER_FLAGS.map(key => [key, true])), catalog_sku: 'E2E-LOCAL-001', delivery_proofs: { text: true, catalog_image: true, storage_image: true } };
          if (fault.startsWith('provider-proof-')) data[fault.slice('provider-proof-'.length)] = false;
          if (fault.startsWith('provider-proof-delivery_proofs.')) data.delivery_proofs[fault.split('.')[1]] = false;
          if (fault === 'provider-proof-delivery_proofs-extra') data.delivery_proofs.extra = true;
          writeFileSync(path.join(output, 'provider-ready.json'), JSON.stringify(data));
        }
        return ok('private-sentinel-from-seed');
      }
      if (argv.includes('node_modules/@playwright/test/cli.js')) {
        if (scope === 'suite') {
          assert.deepEqual(allAfter(argv, '--project'), GROUPS[group]);
          assert.equal(argv.includes('E2E_CATALOG_PRODUCT_SKU_VERIFIED=true'), fullSeed);
          assert.deepEqual(suiteStages, fullSeed ? ['files-volume', 'files-canonical', 'suite-seed', 'provider-verification'] : []);
        }
        if (argv.includes('--list')) {
          listCalls++;
          assert.equal(argv.includes('--reporter=json'), true);
          assert.equal(options.timeout, 120_000);
          const reportVariables = allAfter(argv, '-e').filter(value => value.startsWith('PLAYWRIGHT_JSON_OUTPUT_FILE='));
          assert.equal(reportVariables.length, 1);
          const containerReport = reportVariables[0].slice('PLAYWRIGHT_JSON_OUTPUT_FILE='.length);
          assert.match(containerReport, /^\/output\/collection-[A-Za-z0-9]+\/report\.json$/);
          const reportFile = path.join(output, containerReport.slice('/output/'.length));
          assert.equal(existsSync(reportFile), false, 'each collection owns a fresh report');
          assert.equal(statSync(path.dirname(reportFile)).mode & 0o777, 0o700);
          assert.equal(existsSync(path.join(controlDir, 'proof.json')), true, 'collection also runs after environment proof');
          if (fault === 'collection-failure') return error();
          const inventory = scope === 'suite' ? suiteJson({ listed: true, fault, group }) : playwrightJson({ listed: true });
          if (fault === 'collection-extra') {
            const extra = structuredClone(inventory.suites[0].specs[0]); extra.line = 90;
            inventory.suites[0].specs.push(extra); inventory.stats.skipped = 2;
          }
          if (collectionFile === 'parser') inventory.errors = [{ message: 'private-sentinel collection error' }];
          if (collectionFile === 'directory') mkdirSync(reportFile);
          else if (collectionFile !== 'missing') writeFileSync(reportFile, collectionFile === 'json' ? '{private-sentinel' : JSON.stringify(inventory));
          if (['raw-write', 'public-write'].includes(collectionFile)) {
            const originalWrite = fs.writeFileSync;
            const blocked = path.join(output, collectionFile === 'raw-write' ? 'inventory.json' : 'test-inventory.json');
            fs.writeFileSync = (file, ...args) => {
              if (file === blocked) { fs.writeFileSync = originalWrite; throw new Error('private-sentinel write failure'); }
              return originalWrite(file, ...args);
            };
            t.after(() => { fs.writeFileSync = originalWrite; });
          }
          return { ...ok('Listing tests:\nprivate-sentinel Node helper output\n'), ...collectionResult };
        }
        browserCalls++;
        assert.equal(argv.some(value => value.startsWith('PLAYWRIGHT_JSON_OUTPUT_')), false, 'collection destination never reaches browser run');
        assert.equal(listCalls, 1, 'execution requires exactly one separate inventory');
        assert.equal(existsSync(path.join(controlDir, 'proof.json')), true, 'browser starts only after proof');
        const report = scope === 'suite' ? suiteJson({ fault, group }) : playwrightJson({ failed: fault === 'browser-failure' });
        if (fault === 'wrong-result') report.stats.expected = 0;
        if (!browserObservation || !Object.hasOwn(browserObservation, 'report')) writeFileSync(path.join(output, 'results.json'), JSON.stringify(report));
        else if (browserObservation.report !== undefined) writeFileSync(path.join(output, 'results.json'), browserObservation.report);
        if (browserObservation) {
          const originalRead = fs.readFileSync, originalWrite = fs.writeFileSync;
          fs.readFileSync = (file, ...args) => {
            if (file === path.join(output, 'results.json')) {
              browserReadCalls++;
              if (Object.hasOwn(browserObservation, 'readError')) throw browserObservation.readError;
            }
            return originalRead(file, ...args);
          };
          if (browserObservation.writeFailure) fs.writeFileSync = (file, ...args) => {
            if (file === path.join(output, 'public', 'browser-result-diagnostic.json')) throw new Error('private-sentinel diagnostic write failure');
            return originalWrite(file, ...args);
          };
          syncBuiltinESMExports();
          restoreBrowserFilesystem = () => { fs.readFileSync = originalRead; fs.writeFileSync = originalWrite; syncBuiltinESMExports(); };
        }
        if (browserObservation && Object.hasOwn(browserObservation, 'result')) return browserObservation.result;
        if (fault === 'browser-failure' || fault === 'suite-browser-failure') return error('controlled browser failure');
        mkdirSync(path.join(output, 'playwright-report'), { recursive: true });
        writeFileSync(path.join(output, 'playwright-report/raw.html'), 'must-never-publish-session-token');
        return ok('1 passed');
      }
      assert.fail('unexpected docker exec: ' + argv.join(' '));
    }
    if (argv[0] === 'logs') { cleanupSeen = true; return ok('controlled local service log'); }
    if (argv[0] === 'rm') {
      const name = argv.at(-1);
      if (name.endsWith('-tls-edge')) {
        if (fault === 'tls-edge-remove' && !cleanupSeen) { cleanupSeen = true; return error(); }
        tlsProbeRemoved = true;
      } else cleanupSeen = true;
      containers.delete(name); return ok();
    }
    assert.fail('unexpected docker command: ' + argv.join(' '));
  };
  const { runLogin } = await import(pathToFileURL(path.join(root, 'scripts/e2e-isolated/run.mjs')).href);
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, _delay, ...args) => realTimeout(callback, 0, ...args);
  const originalOutput = process.env.GITHUB_OUTPUT;
  const diagnosticOutput = path.join(temporary, 'github-output');
  if (seedDiagnostic || browserObservation) process.env.GITHUB_OUTPUT = diagnosticOutput;
  let exit;
  try { exit = await runLogin({ outputDirectory: output, command: fakeCommand, scope, ...(scope === 'suite' ? { group } : {}) }); }
  finally {
    restoreBrowserFilesystem?.();
    globalThis.setTimeout = realTimeout;
    if (seedDiagnostic || browserObservation) {
      if (originalOutput === undefined) delete process.env.GITHUB_OUTPUT;
      else process.env.GITHUB_OUTPUT = originalOutput;
    }
  }
  const state = JSON.parse(readFileSync(path.join(output, 'status.json'), 'utf8'));
  const publicFiles = readdirSync(path.join(output, 'public'), { recursive: true });
  assert.equal(publicFiles.some(name => ['results.json', 'inventory.json'].includes(name) || /raw\.html|playwright-report/.test(name)), false, 'raw browser artifacts never publish');
  assert.equal(publicFiles.some(name => name.startsWith('collection-')), false, 'private collection directory never publishes');
  assert.equal(JSON.stringify(publicFiles).includes('auth-state'), false);
  for (const name of publicFiles) {
    const content = readFileSync(path.join(output, 'public', name), 'utf8');
    assert.equal(/must-never-publish|private-sentinel|raw SQL must never publish/.test(content), false, 'private report/config and SQL must not publish');
  }
  const tlsDiagnosticLog = tlsDiagnostic && existsSync(path.join(output, 'public', 'tls-' + tlsDiagnostic.runtime + '-gate.log'))
    ? readFileSync(path.join(output, 'public', 'tls-' + tlsDiagnostic.runtime + '-gate.log'), 'utf8') : null;
  const pullLogs = pullDiagnostic ? Object.fromEntries(Object.keys(assertPinnedImages(lock())).flatMap(role => {
    const file = 'pull-' + role + '.log', privateFile = path.join(output, file), publicFile = path.join(output, 'public', file);
    return existsSync(privateFile) && existsSync(publicFile) ? [[role, { private: readFileSync(privateFile, 'utf8'),
      published: readFileSync(publicFile, 'utf8'), privateMode: statSync(privateFile).mode & 0o777, publicMode: statSync(publicFile).mode & 0o777 }]] : [];
  })) : null;
  const seedDiagnosticFile = path.join(output, 'seed-files-volume-diagnostic.json');
  const seedDiagnosticPublic = path.join(output, 'public', 'seed-files-volume-diagnostic.json');
  const filesDiagnostic = seedDiagnostic && existsSync(seedDiagnosticFile) ? {
    private: JSON.parse(readFileSync(seedDiagnosticFile, 'utf8')),
    published: JSON.parse(readFileSync(seedDiagnosticPublic, 'utf8')),
    privateMode: statSync(seedDiagnosticFile).mode & 0o777,
    publicMode: statSync(seedDiagnosticPublic).mode & 0o777,
  } : null;
  const reportOutput = seedDiagnostic || browserObservation ? readFileSync(diagnosticOutput, 'utf8') : null;
  const providerMetadata = Object.fromEntries(['provider-catalog.json', 'provider-diagnostic.json'].flatMap(name => {
    const file = path.join(output, 'public', name);
    return existsSync(file) ? [[name, { value: JSON.parse(readFileSync(file, 'utf8')), mode: statSync(file).mode & 0o777 }]] : [];
  }));
  const ownershipFile = path.join(output, 'public', 'routine-ownership.json');
  const ownershipMetadata = existsSync(ownershipFile) ? { value: JSON.parse(readFileSync(ownershipFile, 'utf8')), mode: statSync(ownershipFile).mode & 0o777 } : null;
  const browserFile = path.join(output, 'public', 'browser-result-diagnostic.json');
  const browserMetadata = existsSync(browserFile) ? { value: JSON.parse(readFileSync(browserFile, 'utf8')), mode: statSync(browserFile).mode & 0o777 } : null;
  const browserSummaryFile = path.join(output, 'results-summary.json');
  const browserSummary = browserObservation && existsSync(browserSummaryFile) ? JSON.parse(readFileSync(browserSummaryFile, 'utf8')) : null;
  const result = { browserMetadata, browserSummary, browserReadCalls, ownershipCalls, ownershipMetadata, providerMetadata, catalogCalls, filesDiagnostic, reportOutput, pullLogs, tlsDiagnosticLog, diagnosticCredentials, exit, state, calls, migrationCalls, seedCalls, browserCalls, listCalls, credentialFilesSeen, containers, volumes, publicFiles, pgReadyChecks, suiteStages, bundled, tlsStages, tlsInstalled, tlsUpdated, tlsProbeRemoved };
  return result;
}

// Actual controller, metadata whitelist, cleanup and report redactor. The raw
// subprocess channels contain canaries and must never become a seed .log.
const filesDiagnosticPrefix = '[e2e-isolated/seed-files-volume-diagnostic] ';
const filesDiagnosticRecord = { schema: 1, failure: { stage: 'sql-profile-update', error_name: 'PostgresError', code: 'ERR_POSTGRES_SERVER_ERROR', sqlstate: '42501' } };
const filesDiagnosticLine = value => filesDiagnosticPrefix + JSON.stringify(value) + '\n';
const filesDiagnosticNoise = 'private-sentinel raw SQL must never publish ' +
  'https://synthetic:must-never-publish@127.0.0.1:5173/path?token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjYW5hcnkifQ.c2VjcmV0\n';
const filesDiagnosticCases = [
  ['SQL failure', { status: 1, stderr: filesDiagnosticLine(filesDiagnosticRecord) }, true],
  ['HTTP failure', { status: 1, stderr: filesDiagnosticLine({ schema: 1, failure: { stage: 'storage-upload-image', error_name: 'Error', http_status: 403 } }) }, true],
  ['unknown thrown value', { status: 1, stderr: filesDiagnosticLine({ schema: 1, failure: { stage: 'sql-commit', error_name: 'UnknownError' } }) }, true],
  ['primary and cleanup', { status: 1, stderr: filesDiagnosticLine({ ...filesDiagnosticRecord, cleanup: { stage: 'db-close', error_name: 'PostgresError', code: 'ERR_POSTGRES_CONNECTION_CLOSED' } }) }, true],
  ['missing record', { status: 1, stderr: '' }, false, 'missing'],
  ['untrusted field', { status: 1, stderr: filesDiagnosticLine({ ...filesDiagnosticRecord, query: filesDiagnosticNoise }) }, false, 'invalid'],
  ['ambiguous records', { status: 1, stderr: filesDiagnosticLine(filesDiagnosticRecord).repeat(2) }, false, 'ambiguous'],
  ['signal with zero status', { status: 0, signal: 'SIGTERM', stderr: filesDiagnosticLine(filesDiagnosticRecord) }, true],
  ['spawn error with zero status', { status: 0, error: new Error('private-sentinel'), stderr: filesDiagnosticLine(filesDiagnosticRecord) }, true],
];
for (const [label, subprocess, available, reason] of filesDiagnosticCases) test('seed diagnostic controller/' + label, async t => {
  const value = await controllerFixture(t, 'none', { scope: 'suite', seedDiagnostic: { ...subprocess, stdout: filesDiagnosticNoise, stderr: filesDiagnosticNoise + subprocess.stderr + filesDiagnosticNoise } });
  assert.equal(value.exit, 1); assert.equal(value.state.error, 'seed-files-volume');
  assert.equal(value.state.success, false); assert.equal(value.state.native_e2e, false);
  assert.equal(value.state.failed_phase, 'seed-suite-and-verify-providers');
  assert.equal(value.state.phase, 'complete'); assert.equal(value.state.cleanup_error, undefined);
  assert.deepEqual(value.suiteStages, ['files-volume']); assert.equal(value.listCalls, 0); assert.equal(value.browserCalls, 0);
  assert.equal(value.containers.size, 0); assert.equal(value.volumes.size, 0);
  assert.equal(value.filesDiagnostic.private.available, available);
  if (!available) assert.equal(value.filesDiagnostic.private.reason, reason);
  assert.deepEqual(value.filesDiagnostic.published, value.filesDiagnostic.private);
  assert.equal(value.filesDiagnostic.privateMode, 0o600); assert.equal(value.filesDiagnostic.publicMode, 0o600);
  assert.equal(value.reportOutput, 'report_ready=true\n');
  assert.ok(value.publicFiles.includes('seed-files-volume-diagnostic.json'));
  assert.ok(!value.publicFiles.some(name => /seed-files-volume\.log|seed-files-canonical\.log|seed-suite\.log|verify-providers\.log/.test(name)));
});
test('seed diagnostic controller/success does not publish an error even when a line is forged', async t => {
  const value = await controllerFixture(t, 'none', { scope: 'suite', seedDiagnostic: { status: 0, stdout: filesDiagnosticNoise, stderr: filesDiagnosticLine(filesDiagnosticRecord) } });
  assert.equal(value.exit, 0); assert.equal(value.state.success, true); assert.equal(value.filesDiagnostic, null);
  assert.equal(value.reportOutput, 'report_ready=true\n');
  assert.ok(!value.publicFiles.includes('seed-files-volume-diagnostic.json'));
  assert.equal(value.browserCalls, 1); assert.equal(value.containers.size, 0); assert.equal(value.volumes.size, 0);
});
test('seed diagnostic controller/report redaction failure preserves the seed failure and closes upload gate', async t => {
  const value = await controllerFixture(t, 'redactor-failure', { scope: 'suite', seedDiagnostic: { status: 1, stdout: filesDiagnosticNoise, stderr: filesDiagnosticLine(filesDiagnosticRecord) } });
  assert.equal(value.exit, 1); assert.equal(value.state.error, 'seed-files-volume'); assert.equal(value.state.success, false);
  assert.equal(value.filesDiagnostic.published.available, true); assert.equal(value.reportOutput, 'report_ready=false\n');
  assert.equal(value.browserCalls, 0); assert.equal(value.containers.size, 0); assert.equal(value.volumes.size, 0);
});

// Capture both subprocess channels before required() throws. No registry/network
// runs here; controller, cleanup and both publication redactors remain real.
for (const role of ['postgres', 'auth', 'rest', 'storage', 'realtime', 'edge', 'driver']) {
  for (const kind of ['success', 'stderr', 'stdout', 'both', 'timeout', 'empty-signal']) {
    test('OCI pull diagnostic: ' + role + '/' + kind, async t => {
      const value = await controllerFixture(t, 'none', { pullDiagnostic: { role, kind } });
      const success = kind === 'success';
      assert.equal(value.exit, success ? 0 : 1);
      assert.equal(value.state.success, success);
      if (!success) {
        assert.equal(value.state.error, 'pull-' + role + '-failed');
        assert.equal(value.state.failed_phase, 'pull-immutable-images');
        assert.equal(value.credentialFilesSeen, false);
        assert.equal(value.migrationCalls, 0); assert.equal(value.seedCalls, 0);
        assert.equal(value.listCalls, 0); assert.equal(value.browserCalls, 0);
        assert.deepEqual(value.bundled, []);
      }
      const roles = Object.keys(assertPinnedImages(lock()));
      const reached = success ? roles : roles.slice(0, roles.indexOf(role) + 1);
      const pulls = value.calls.filter(call => call.program === 'docker' && call.args[2] === 'pull');
      assert.deepEqual(pulls.map(call => call.args[3]), reached.map(name => lock().images[name]), 'each fixed digest is pulled exactly once, in the original order');
      const inspections = value.calls.filter(call => call.program === 'docker' && call.args[2] === 'image');
      assert.equal(inspections.length, reached.length - (success ? 0 : 1), 'a failed pull never reaches its digest inspection');
      assert.deepEqual(Object.keys(value.pullLogs), reached, 'a failed pull still leaves its own log and later images are not attempted');
      const log = value.pullLogs[role];
      assert.equal(log.privateMode, 0o600); assert.equal(log.publicMode, 0o600);
      if (kind === 'empty-signal') { assert.equal(log.private, ''); assert.equal(log.published, ''); }
      else {
        assert.match(log.private, /OCI_PULL_DIAGNOSTIC/); assert.match(log.published, /OCI_PULL_DIAGNOSTIC/);
        assert.equal(log.published.includes('stdout '), kind !== 'stderr');
        assert.equal(log.published.includes('stderr '), kind !== 'stdout');
        assert.match(log.private, /\[JWT REDACTED\]/, 'the first redactor strips tokens before writing');
        assert.match(log.private, /synthetic-redaction-control-not-a-credential/);
        assert.doesNotMatch(log.published, /synthetic-redaction-control-not-a-credential/, 'the final redactor removes its configured sentinel');
        assert.doesNotMatch(log.published, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
      }
      assert.equal(value.state.phase, 'complete'); assert.equal(value.state.cleanup_error, undefined);
      assert.equal(value.containers.size, 0); assert.equal(value.volumes.size, 0);
    });
  }
}

test('controller real: percurso completo com interfaces falsas preserva a ordem e limpa os recursos próprios', async t => {
  const value = await controllerFixture(t, 'none');
  assert.equal(value.exit, 0);
  assert.equal(value.state.success, true);
  assert.equal(value.migrationCalls, 1);
  assert.equal(value.seedCalls, 1);
  assert.equal(value.browserCalls, 1);
  assert.equal(value.listCalls, 1);
  assert.equal(value.containers.size, 0);
  assert.equal(value.volumes.size, 0);
  assert.equal(value.state.native_e2e, true, 'records invocation, not a unit-test claim of native browser coverage');
});

const faultCodes = {
  'pending-pin': 'image-lock-review-required', 'dirty-checkout': 'checkout-not-clean',
  'wrong-playwright': 'playwright-image-version-mismatch', 'external-docker': 'nonlocal-docker-context',
  'pull-auth': 'pull-auth-failed', 'wrong-image-digest': 'image-digest-mismatch',
  'bundle-failure': 'bundle-main-failed', 'empty-bundle': 'empty-edge-bundle',
  'jwt-policy': 'auth-login-gateway-policy-mismatch', 'unreviewed-vault': 'unreviewed-vault-configuration',
  'historical-jwt': 'historical-jwt-needs-local-transform',
  'anchor-network': 'unexpected-network-mode', 'driver-network': 'unexpected-network-mode',
  'network-proof': 'network-proof-invalid', 'driver-hosts': 'network-proof-invalid',
  'postgres-hosts': 'official-host-not-neutralized', 'postgres-start': 'start-postgres-failed',
  'cron-enabled': 'cron-not-disabled', 'platform-health': 'platform-proof',
  'missing-platform-schema': 'real-platform-schema-missing', 'cancel-after-postgres': 'run-cancelled',
  'local-key-setting-write': 'local-platform-settings-failed', 'local-key-setting-mismatch': 'local-anon-setting-mismatch',
  'unexpected-migration-failure': 'unexpected-migration-failure', 'known-migration-process-failure': 'unexpected-migration-failure',
  'cron-reenabled': 'cron-reenabled-by-migration', 'frontend-readiness': 'frontend-proof',
  'seed-login-failure': 'seed-login', 'namespace-change': 'namespace-changed',
  'collection-failure': 'collect-login', 'collection-extra': 'login-inventory-not-exact',
  'browser-failure': 'browser-login-failed', 'wrong-result': 'login-result-not-clean',
  'redactor-failure': 'report-redaction-failed', 'cleanup-inspect-failure': 'owned-container-inspection-failed',
  'foreign-container-cleanup': 'owned-container-cleanup-failed', 'foreign-volume-cleanup': 'owned-volume-cleanup-failed',
};

for (const fault of [
  'pending-pin', 'dirty-checkout', 'wrong-playwright', 'external-docker', 'pull-auth',
  'wrong-image-digest', 'bundle-failure', 'empty-bundle', 'jwt-policy',
  'unreviewed-vault', 'historical-jwt',
]) {
  test('controller real: ' + fault + ' interrompe antes de criar credenciais locais/banco', async t => {
    const value = await controllerFixture(t, fault);
    assert.equal(value.exit, 1);
    assert.equal(value.state.error, faultCodes[fault]);
    assert.equal(value.state.success, false);
    assert.equal(value.credentialFilesSeen, false);
    assert.equal(value.migrationCalls, 0);
    assert.equal(value.seedCalls, 0);
    assert.equal(value.browserCalls, 0);
  });
}
for (const fault of [
  'anchor-network', 'driver-network', 'network-proof', 'driver-hosts', 'postgres-hosts', 'postgres-start', 'cron-enabled',
  'platform-health', 'missing-platform-schema', 'cancel-after-postgres',
  'local-key-setting-write', 'local-key-setting-mismatch',
]) {
  test('controller real: ' + fault + ' interrompe antes da cadeia SQL de aplicação', async t => {
    const value = await controllerFixture(t, fault);
    assert.equal(value.exit, 1);
    assert.equal(value.state.error, faultCodes[fault]);
    assert.equal(value.state.success, false);
    assert.equal(value.migrationCalls, 0);
    assert.equal(value.seedCalls, 0);
    assert.equal(value.browserCalls, 0);
    assert.equal(value.containers.size, 0);
  });
}
for (const fault of ['unexpected-migration-failure', 'known-migration-process-failure', 'cron-reenabled', 'frontend-readiness']) {
  test('controller real: ' + fault + ' não emite prova de seed/login', async t => {
    const value = await controllerFixture(t, fault);
    assert.equal(value.exit, 1);
    assert.equal(value.state.error, faultCodes[fault]);
    assert.equal(value.seedCalls, 0);
    assert.equal(value.browserCalls, 0);
    assert.equal(value.containers.size, 0);
  });
}
test('controller real: falha já documentada no replay continua explícita no resultado', async t => {
  const value = await controllerFixture(t, 'known-migration-failure');
  assert.equal(value.exit, 0);
  assert.deepEqual(value.state.migrations, { total: 1, passed: 0, known_failures: 1, unexpected_failures: 0 });
});
for (const fault of ['seed-login-failure', 'namespace-change', 'collection-failure', 'collection-extra']) {
  test('controller real: ' + fault + ' impede o navegador apesar de plataforma pronta', async t => {
    const value = await controllerFixture(t, fault);
    assert.equal(value.exit, 1);
    assert.equal(value.state.error, faultCodes[fault]);
    assert.equal(value.seedCalls, 1);
    assert.equal(value.browserCalls, 0);
    assert.equal(value.containers.size, 0);
  });
}
for (const fault of ['browser-failure', 'wrong-result', 'redactor-failure', 'cleanup-inspect-failure', 'foreign-container-cleanup', 'foreign-volume-cleanup']) {
  test('controller real: ' + fault + ' conserva falha ao fechar a execução', async t => {
    const value = await controllerFixture(t, fault);
    assert.equal(value.exit, 1);
    assert.equal(value.state.error, faultCodes[fault]);
    assert.equal(value.state.success, false);
    assert.equal(value.browserCalls, 1);
    if (fault === 'browser-failure') assert.equal(value.state.login.failed, 1, 'failed Playwright exit still yields real report counts');
    if (fault === 'foreign-container-cleanup') assert.ok(value.containers.size > 0, 'foreign-labelled containers must not be removed');
    if (fault === 'foreign-volume-cleanup') assert.ok(value.volumes.size > 0, 'foreign-labelled volumes must not be removed');
  });
}

test('suite controller: authenticated collects exactly its nine existing projects after every seed/provider check', async t => {
  const value = await controllerFixture(t, 'none', { scope: 'suite' });
  assert.equal(value.exit, 0);
  assert.equal(value.state.scope, 'authenticated-suite');
  assert.equal(value.state.suite.passed, GROUPS.authenticated.length);
  assert.equal(value.state.suite.total, GROUPS.authenticated.length);
  assert.equal(value.browserCalls, 1);
  assert.equal(value.listCalls, 1);
  assert.deepEqual(value.bundled, ['main.eszip', ...FUNCTIONS.map(name => name + '.eszip'), 'tls-edge-probe.eszip']);
  assert.deepEqual(value.suiteStages, ['files-volume', 'files-canonical', 'suite-seed', 'provider-verification']);
  assert.equal(value.containers.size, 0);
  assert.equal(value.volumes.size, 0);
  for (const name of ['suite-seed-ready.json', 'provider-ready.json', 'test-inventory.json']) assert.ok(value.publicFiles.includes(name));
  assert.ok(!value.publicFiles.some(name => /files-volume|files-canonical|suite-seed\.log|verify-providers\.log/.test(name)), 'raw seed/provider output stays private');
});
for (const [name, options, code] of [
  ['missing report', { collectionFile: 'missing' }, 'collection-report-missing'],
  ['report directory', { collectionFile: 'directory' }, 'collection-report-type'],
  ['malformed report', { collectionFile: 'json' }, 'collection-report-json'],
  ['collection errors', { collectionFile: 'parser' }, 'suite-inventory-invalid'],
  ['raw inventory write', { collectionFile: 'raw-write' }, 'collection-inventory-write'],
  ['public inventory write', { collectionFile: 'public-write' }, 'collection-public-inventory-write'],
  ['executor error with valid report', { collectionResult: { status: 0, error: new Error('private-sentinel executor error') } }, 'collect-suite'],
  ['signal with valid report', { collectionResult: { status: 0, signal: 'SIGTERM' } }, 'collect-suite'],
]) test('suite collection: ' + name + ' blocks browser and preserves cleanup', async t => {
  const value = await controllerFixture(t, 'none', { scope: 'suite', ...options });
  assert.equal(value.exit, 1);
  assert.equal(value.state.success, false);
  assert.equal(value.state.failed_phase, 'collect-real-suite');
  assert.equal(value.state.error, code);
  assert.equal(value.state.native_e2e, false);
  assert.equal(value.listCalls, 1);
  assert.equal(value.browserCalls, 0);
  assert.equal(value.containers.size, 0);
  assert.equal(value.volumes.size, 0);
});
for (const group of ['deslogado-principal', 'deslogado-secundario']) test('suite controller: ' + group + ' preserves its three projects without messaging seed or provider', async t => {
  const value = await controllerFixture(t, 'none', { scope: 'suite', group });
  assert.equal(value.exit, 0);
  assert.equal(value.state.scope, group);
  assert.equal(value.state.suite.passed, 3);
  assert.equal(value.state.suite.total, 3);
  assert.deepEqual(value.suiteStages, []);
  assert.deepEqual(value.bundled, ['main.eszip', 'auth-login.eszip', 'tls-edge-probe.eszip']);
  assert.ok(!value.calls.some(call => call.args.some(value => /-provider$/.test(value))));
});
test('suite controller: strict fullsuite reports predeclared fixme separately and keeps the gate red', async t => {
  const value = await controllerFixture(t, 'explicit-skip', { scope: 'suite' });
  assert.equal(value.exit, 1);
  assert.equal(value.state.error, 'suite-result-not-clean');
  assert.equal(value.state.suite.passed, 8);
  assert.equal(value.state.suite.skipped_explicit, 1);
});
test('suite controller: only the two source-bound platform skips are distinct from seven passes', async t => {
  const value = await controllerFixture(t, 'known-platform-skips', { scope: 'suite' });
  assert.equal(value.exit, 0);
  assert.equal(value.state.suite.passed, 7);
  assert.equal(value.state.suite.known_runtime_skip, 2);
  assert.equal(value.state.suite.skipped_runtime, 0);
});
const suiteFaults = {
  'untracked-handler': 'function-source-changed',
  'changed-handler': 'function-source-changed',
  'missing-delivery-handler': 'suite-handler-missing',
  'provider-start': 'start-provider-failed',
  'files-volume-failure': 'seed-files-volume',
  'files-canonical-failure': 'seed-files-canonical',
  'suite-seed-failure': 'seed-suite',
  'provider-verification-failure': 'verify-providers',
  'suite-proof-missing': 'suite-proof-unreadable',
  'provider-proof-missing': 'suite-proof-unreadable',
  ...Object.fromEntries([...SEED_FLAGS, 'schema', 'run_id', 'source_sha', 'pagination_seed_count'].map(key => ['suite-proof-' + key, 'suite-seed-proof-mismatch'])),
  ...Object.fromEntries([...PROVIDER_FLAGS, 'schema', 'run_id', 'source_sha', 'catalog_sku', 'delivery_proofs', 'delivery_proofs.text', 'delivery_proofs.catalog_image', 'delivery_proofs.storage_image', 'delivery_proofs-extra'].map(key => ['provider-proof-' + key, 'provider-proof-mismatch'])),
  ...Object.fromEntries(GROUPS.authenticated.map(name => ['missing-project-' + name, 'suite-inventory-invalid'])),
};
for (const [fault, expectedCode] of Object.entries(suiteFaults)) test('suite controller: ' + fault + ' blocks browser without concealing cleanup', async t => {
  const value = await controllerFixture(t, fault, { scope: 'suite' });
  assert.equal(value.exit, 1);
  assert.equal(value.state.success, false);
  assert.equal(value.state.error, expectedCode);
  assert.equal(value.browserCalls, 0);
  assert.equal(value.containers.size, 0);
  assert.equal(value.volumes.size, 0);
});
for (const fault of ['runtime-skip', 'suite-stats-mismatch', 'suite-browser-failure']) test('suite controller: ' + fault + ' keeps native report counts and fails the suite', async t => {
  const value = await controllerFixture(t, fault, { scope: 'suite' });
  assert.equal(value.exit, 1);
  assert.equal(value.state.success, false);
  assert.equal(value.browserCalls, 1);
  assert.equal(value.state.error, fault === 'suite-browser-failure' ? 'browser-suite-failed' : 'suite-result-not-clean');
  if (fault === 'runtime-skip') assert.equal(value.state.suite.skipped_runtime, 1);
  if (fault === 'suite-browser-failure') assert.equal(value.state.suite.failed, 1);
});


// Native Git contains both regular modes. These scenarios exercise the real
// controller with different git-index observations, before credential creation.
const sourceIndexScenarios = [];
for (const mode of ['100644', '100755']) {
  const regular = value => value.replace(/^100644 /, mode + ' ');
  for (const [label, wrap] of [
    ['single active file', value => value],
    ['archived SQL before', value => '100644 ' + 'b'.repeat(40) + ' 0\tsupabase/migrations/_superseded/old.sql\n' + value],
    ['directory README after', value => value + '100644 ' + 'c'.repeat(40) + ' 0\tsupabase/migrations/README.md\n'],
    ['no final linefeed', value => value.trimEnd()],
  ]) sourceIndexScenarios.push({ label: mode + ' / ' + label, allow: true, manifest: value => wrap(regular(value)) });
  sourceIndexScenarios.push({ label: mode + ' wrong blob', allow: false, manifest: value => regular(value).replace(gitBlob(SQL), 'f'.repeat(40)) });
  for (const stage of ['1', '2', '3']) sourceIndexScenarios.push({ label: mode + ' unresolved stage ' + stage, allow: false, manifest: value => regular(value).replace(' 0\t', ' ' + stage + '\t') });
}
for (const mode of ['100600', '100664', '100666', '040000', '120000', '160000']) {
  sourceIndexScenarios.push({ label: 'non-regular mode ' + mode, allow: false, manifest: value => value.replace(/^100644 /, mode + ' ') });
}
for (const [label, manifest] of [
  ['missing record', () => ''],
  ['missing mode', value => value.replace(/^100644 /, '')],
  ['missing hash', value => value.replace(gitBlob(SQL), '')],
  ['truncated hash', value => value.replace(gitBlob(SQL), 'a'.repeat(39))],
  ['SHA256-like hash in SHA1 checkout', value => value.replace(gitBlob(SQL), 'a'.repeat(64))],
  ['nonhex hash', value => value.replace(gitBlob(SQL), 'g'.repeat(40))],
  ['missing stage', value => value.replace(' 0\t', '\t')],
  ['missing field separator', value => value.replace('\t', ' ')],
  ['different active filename', value => value.replace(MIGRATION, '20260101000001_other.sql')],
  ['different directory', value => value.replace('supabase/migrations/', 'other/migrations/')],
  ['archived instead of active', value => value.replace('supabase/migrations/', 'supabase/migrations/_superseded/')],
  ['quoted instead of literal path', value => value.replace('\tsupabase/', '\t"supabase/').trimEnd() + '"\n'],
  ['absolute instead of repository path', value => value.replace('\tsupabase/', '\t/work/supabase/')],
  ['line suffix', value => value.trimEnd() + ' unexpected\n'],
]) sourceIndexScenarios.push({ label, allow: false, manifest });

for (const scenario of sourceIndexScenarios) {
  test('índice Git real: ' + scenario.label, async t => {
    const value = await controllerFixture(t, 'none', scenario.manifest);
    assert.equal(value.exit, scenario.allow ? 0 : 1);
    assert.equal(value.state.success, scenario.allow);
    if (scenario.allow) {
      assert.equal(value.migrationCalls, 1);
      assert.equal(value.browserCalls, 1);
    } else {
      assert.equal(value.state.error, 'migration-source-changed');
      assert.equal(value.credentialFilesSeen, false);
      assert.equal(value.migrationCalls, 0);
      assert.equal(value.seedCalls, 0);
      assert.equal(value.browserCalls, 0);
    }
    assert.equal(value.containers.size, 0);
    assert.equal(value.volumes.size, 0);
  });
}

const tlsPreflightFaults = {
  'tls-host-openssl': 'tls-tool-openssl-failed',
  'tls-host-version': 'tls-openssl-version',
  'tls-host-nss': 'tls-tool-certutil-failed',
  'tls-image-tools': 'tls-driver-tools-unavailable',
  'tls-probe-bundle': 'bundle-tls-edge-probe-failed',
  'tls-probe-empty-bundle': 'empty-edge-bundle',
  'tls-certificate-command': 'tls-tool-openssl-failed',
  'tls-nss-import': 'tls-tool-certutil-failed',
};
const tlsBeforeSqlFaults = {
  'tls-driver-user': 'tls-driver-user-or-state',
  'tls-driver-stopped': 'tls-driver-user-or-state',
  'tls-driver-public-writable': 'foreign-writable-mount',
  'tls-driver-home-missing': 'tls-driver-mount',
  'tls-driver-private': 'tls-private-key-in-driver',
  'tls-ca-install': 'tls-driver-ca-install',
  'tls-ca-update': 'tls-driver-ca-update',
  'tls-gateway-start': 'start-gateway-failed',
  'tls-edge-start': 'start-tls-edge-failed',
  'tls-boot-exit': 'tls-boot-proof',
  'tls-boot-identity': 'tls-boot-proof-invalid',
  'tls-edge-remove': 'tls-probe-cleanup-failed',
  'tls-browser-extra': 'tls-browsers-proof-invalid',
  'tls-browser-missing': 'tls-browsers-proof-invalid',
  'tls-browser-false': 'tls-browsers-proof-invalid',
};
for (const runtime of ['node', 'bun', 'browsers', 'edge']) {
  tlsBeforeSqlFaults['tls-' + runtime + '-exit'] = 'tls-' + runtime + '-gate';
  tlsBeforeSqlFaults['tls-' + runtime + '-json'] = 'tls-' + runtime + '-invalid-json';
  for (const field of ['run_id', 'source_sha', 'origin', 'runtime', 'checks', 'schema', 'probe_runner', 'probe_runner_version'])
    tlsBeforeSqlFaults['tls-' + runtime + '-' + field] = 'tls-' + runtime + '-proof-invalid';
}
test('TLS integration: all four real command boundaries precede SQL and preserve cleanup', async t => {
  const value = await controllerFixture(t, 'none');
  assert.equal(value.exit, 0);
  assert.deepEqual(value.tlsStages, ['node', 'bun', 'browsers', 'edge']);
  assert.equal(value.tlsInstalled, true); assert.equal(value.tlsUpdated, true);
  assert.equal(value.tlsProbeRemoved, true); assert.equal(value.containers.size, 0);
  assert.ok(value.publicFiles.includes('tls-proof.json'));
  const tlsLast = value.calls.findLastIndex(call => call.args.includes('scripts/e2e-isolated/tls-probe.mjs'));
  const pgFirst = value.calls.findIndex(call => call.args[2] === 'run' && call.args.some(arg => arg.endsWith('-postgres')));
  assert.ok(tlsLast >= 0 && pgFirst > tlsLast);
});
for (const [fault, expected] of Object.entries({ ...tlsPreflightFaults, ...tlsBeforeSqlFaults })) {
  test('TLS integration: ' + fault + ' fails closed before SQL', async t => {
    const value = await controllerFixture(t, fault);
    assert.equal(value.exit, 1);
    assert.equal(value.state.error, expected);
    assert.equal(value.state.success, false);
    assert.equal(value.migrationCalls, 0); assert.equal(value.seedCalls, 0); assert.equal(value.browserCalls, 0);
    assert.equal(value.containers.size, 0);
    assert.equal(value.calls.some(call => call.args[2] === 'run' && call.args.some(arg => arg.endsWith('-postgres'))), false);
    if (Object.hasOwn(tlsPreflightFaults, fault)) assert.equal(value.credentialFilesSeen, false);
  });
}

// A failed pre-database TLS probe must leave a useful redacted diagnostic.
// Subprocess transport is controlled; controller and both redaction passes are real.
for (const runtime of ['node', 'bun', 'browsers', 'edge']) {
  for (const kind of ['anon', 'service', 'email', 'password', 'jwt-shape', 'all', 'signal', 'timeout', 'stdout']) {
    test('TLS diagnostic: ' + runtime + '/' + kind + ' preserves cause and removes credentials', async t => {
      const value = await controllerFixture(t, 'none', value => value, { runtime, kind });
      assert.equal(value.exit, 1); assert.equal(value.state.success, false);
      assert.equal(value.state.error, 'tls-' + runtime + '-gate');
      assert.equal(value.migrationCalls, 0); assert.equal(value.seedCalls, 0); assert.equal(value.browserCalls, 0);
      assert.equal(value.containers.size, 0); assert.equal(value.volumes.size, 0);
      assert.equal(typeof value.tlsDiagnosticLog, 'string', 'failed TLS diagnostic must survive for the real runner');
      assert.match(value.tlsDiagnosticLog, /TLS_DIAGNOSTIC phase=positive engine=chromium ERR_CERT_AUTHORITY_INVALID/);
      for (const key of ['ANON_KEY', 'SERVICE_ROLE_KEY', 'E2E_TEST_EMAIL', 'E2E_TEST_PASSWORD']) {
        assert.ok(!value.tlsDiagnosticLog.includes(value.diagnosticCredentials[key]), key + ' must be redacted');
      }
      assert.doesNotMatch(value.tlsDiagnosticLog, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    });
  }
}

// Exercise the actual controller and the final redactor. Only subprocess I/O
// and the verifier's private file are controlled; metadata never approves SQL.
const providerCatalogRows = owner => ({ schema: 1, routines: SIGNATURES.map(signature => ({
  signature, owner, security_definer: owner === 'missing' ? null : true,
})) });
const providerCatalogResult = rows => ({ status: 0, stdout: JSON.stringify(rows), stderr: 'private-sentinel-catalog-stderr' });
const providerCatalogCases = [
  ['postgres', providerCatalogResult(providerCatalogRows('postgres')), true],
  ['supabase_admin divergence', providerCatalogResult(providerCatalogRows('supabase_admin')), true],
  ['unknown owner normalized', providerCatalogResult(providerCatalogRows('other')), true],
  ['missing routines', providerCatalogResult(providerCatalogRows('missing')), true],
  ['invoker instead of definer', providerCatalogResult({ schema: 1, routines: providerCatalogRows('postgres').routines.map(row => ({ ...row, security_definer: false })) }), true],
  ['nonzero status', { ...providerCatalogResult(providerCatalogRows('postgres')), status: 1 }, false],
  ['status zero with error', { ...providerCatalogResult(providerCatalogRows('postgres')), error: new Error('private-sentinel') }, false],
  ['status zero with signal', { ...providerCatalogResult(providerCatalogRows('postgres')), signal: 'SIGTERM' }, false],
  ['timeout and signal', { status: null, error: Object.assign(new Error('private-sentinel'), { code: 'ETIMEDOUT' }), signal: 'SIGKILL', stderr: 'private-sentinel' }, false],
  ['executor throws falsy', { throws: false }, false],
  ['invalid JSON', { status: 0, stdout: 'private-sentinel-not-json', stderr: 'private-sentinel' }, false],
  ['unapproved raw field', providerCatalogResult({ ...providerCatalogRows('postgres'), definition: 'private-sentinel' }), false],
];
for (const [name, catalogResult, available] of providerCatalogCases) {
  test('provider catalog controller: ' + name + ' does not change verifier success', async t => {
    const value = await controllerFixture(t, 'none', { scope: 'suite', catalogResult });
    assert.equal(value.exit, 0); assert.equal(value.state.success, true);
    assert.equal(value.listCalls, 1); assert.equal(value.browserCalls, 1);
    assert.equal(value.containers.size, 0); assert.equal(value.volumes.size, 0);
    assert.equal(value.catalogCalls.length, 1);
    assert.deepEqual(value.catalogCalls[0], { input: PROVIDER_CATALOG_SQL,
      ...CATALOG_EXECUTOR_OPTIONS, afterStages: ['files-volume', 'files-canonical', 'suite-seed'] });
    const published = value.providerMetadata['provider-catalog.json'];
    assert.equal(published.mode, 0o600); assert.equal(published.value.available, available);
    assert.equal(value.providerMetadata['provider-diagnostic.json'], undefined);
    assert.ok(!value.publicFiles.includes('verify-providers.log'));
    if (available) assert.deepEqual(published.value.routines, JSON.parse(catalogResult.stdout).routines);
  });
}

const providerFailureMetadata = { schema: 1, phase: 'text-enqueue', http_status: 403, sqlstate: '42501' };
const providerRawCases = [
  ['valid record', JSON.stringify(providerFailureMetadata), true],
  ['raw body field', JSON.stringify({ ...providerFailureMetadata, body: 'private-sentinel' }), false],
  ['unknown phase', JSON.stringify({ ...providerFailureMetadata, phase: 'private-sentinel' }), false],
  ['status as string', JSON.stringify({ ...providerFailureMetadata, http_status: '403' }), false],
  ['malformed JSON', 'private-sentinel', false],
  ['oversized JSON', ' '.repeat(1025) + JSON.stringify(providerFailureMetadata), false],
  ['missing file', undefined, false],
];
for (const [name, raw, available] of providerRawCases) {
  test('provider diagnostic controller: ' + name + ' preserves failure and publishes only closed metadata', async t => {
    const value = await controllerFixture(t, 'none', { scope: 'suite', providerObservation: {
      result: { status: 1, stdout: 'private-sentinel-provider-stdout', stderr: 'private-sentinel-provider-stderr' },
      ...(raw !== undefined ? { raw } : {}),
    } });
    assert.equal(value.exit, 1); assert.equal(value.state.success, false);
    assert.equal(value.state.error, 'verify-providers');
    assert.equal(value.state.failed_phase, 'seed-suite-and-verify-providers');
    assert.equal(value.listCalls, 0); assert.equal(value.browserCalls, 0);
    assert.equal(value.containers.size, 0); assert.equal(value.volumes.size, 0);
    assert.equal(value.catalogCalls.length, 1);
    assert.deepEqual(value.suiteStages, ['files-volume', 'files-canonical', 'suite-seed', 'provider-verification']);
    const published = value.providerMetadata['provider-diagnostic.json'];
    assert.equal(published.mode, 0o600); assert.equal(published.value.available, available);
    if (available) assert.deepEqual(published.value, { available: true, ...providerFailureMetadata });
    else assert.deepEqual(published.value, { available: false, reason: raw === undefined ? 'diagnostic-unavailable' : 'invalid-diagnostic' });
    assert.equal(value.providerMetadata['provider-catalog.json'].value.available, true);
    assert.ok(!value.publicFiles.includes('verify-providers.log'));
    assert.ok(!value.publicFiles.includes('provider-ready.json'));
  });
}

for (const [name, fields] of [['error', { error: new Error('private-sentinel') }], ['signal', { signal: 'SIGTERM' }]]) {
  test('provider diagnostic controller: status zero with ' + name + ' keeps the real executor failure', async t => {
    const value = await controllerFixture(t, 'none', { scope: 'suite', providerObservation: {
      result: { status: 0, stdout: 'private-sentinel', stderr: 'private-sentinel', ...fields },
      raw: JSON.stringify(providerFailureMetadata),
    } });
    assert.equal(value.exit, 1); assert.equal(value.state.error, 'verify-providers');
    assert.equal(value.browserCalls, 0); assert.equal(value.containers.size, 0); assert.equal(value.volumes.size, 0);
    assert.deepEqual(value.providerMetadata['provider-diagnostic.json'].value, { available: true, ...providerFailureMetadata });
  });
}

test('provider diagnostic controller: forged private error file does not turn a successful verifier into failure metadata', async t => {
  const value = await controllerFixture(t, 'none', { scope: 'suite', providerObservation: {
    result: ok(), raw: JSON.stringify({ ...providerFailureMetadata, message: 'private-sentinel' }),
  } });
  assert.equal(value.exit, 0); assert.equal(value.browserCalls, 1);
  assert.equal(value.providerMetadata['provider-diagnostic.json'], undefined);
  assert.ok(value.publicFiles.includes('provider-ready.json'));
  assert.ok(!value.publicFiles.includes('verify-providers.log'));
});

test('provider diagnostic controller: unavailable catalog never substitutes the verifier failure', async t => {
  const value = await controllerFixture(t, 'none', { scope: 'suite',
    catalogResult: { throws: new Error('private-sentinel-catalog') },
    providerObservation: { result: error('private-sentinel-provider'), raw: JSON.stringify(providerFailureMetadata) },
  });
  assert.equal(value.exit, 1); assert.equal(value.state.error, 'verify-providers');
  assert.deepEqual(value.providerMetadata['provider-catalog.json'].value, { available: false, reason: 'query-failed' });
  assert.deepEqual(value.providerMetadata['provider-diagnostic.json'].value, { available: true, ...providerFailureMetadata });
  assert.equal(value.listCalls, 0); assert.equal(value.browserCalls, 0);
  assert.equal(value.containers.size, 0); assert.equal(value.volumes.size, 0);
});

test('provider catalog executor: the actual Node timeout kills a child that ignores SIGTERM', { timeout: 12000 }, () => {
  assert.deepEqual(CATALOG_EXECUTOR_OPTIONS, { timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 8192 });
  const result = spawnSync(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);'], CATALOG_EXECUTOR_OPTIONS);
  assert.equal(result.status, null); assert.equal(result.signal, 'SIGKILL'); assert.equal(result.error?.code, 'ETIMEDOUT');
  assert.match(PROVIDER_CATALOG_SQL, /^BEGIN READ ONLY;\nSET LOCAL statement_timeout = '3s';/);
  assert.match(PROVIDER_CATALOG_SQL, /ROLLBACK;\s*$/);
});

function ownershipRecords(runId) {
  return [
    { schema: 1, stage: 'before', run_id: runId, source_sha: SOURCE_SHA, routines: OWNERSHIP_ROUTINES.map(entry =>
      ({ ...entry, owner: 'supabase_admin', security_definer: true })) },
    { schema: 1, stage: 'verified', run_id: runId, source_sha: SOURCE_SHA, routines: OWNERSHIP_ROUTINES.map(entry =>
      ({ ...entry, owner: 'postgres', definition_preserved: true, attributes_preserved: true, acl_preserved: true, changed: true })) },
  ];
}
const ownershipOutput = rows => rows.map(row => JSON.stringify(row)).join('\n') + '\n';

test('ownership controller confirms only the authenticated step, before seeds and the unchanged verifier', async t => {
  const value = await controllerFixture(t, 'none', { scope: 'suite' });
  assert.equal(value.exit, 0); assert.equal(value.browserCalls, 1);
  assert.equal(value.ownershipCalls.length, 1);
  assert.equal(value.ownershipCalls[0].afterMigrations, 1); assert.equal(value.ownershipCalls[0].beforeSeeds, 0);
  assert.equal(value.ownershipMetadata.mode, 0o600); assert.equal(value.ownershipMetadata.value.confirmed, true);
  assert.equal(value.ownershipMetadata.value.verified.length, 6);
  assert.deepEqual(value.suiteStages, ['files-volume', 'files-canonical', 'suite-seed', 'provider-verification']);
  assert.equal(value.catalogCalls.length, 1, 'the independent catalog is still observed after seeds');
  assert.equal(value.containers.size, 0); assert.equal(value.volumes.size, 0);
  assert.equal(value.publicFiles.some(name => /ownership.*\.log$/.test(name)), false);
});

for (const [name, options] of [
  ['login', {}], ['logged-out principal', { scope: 'suite', group: 'deslogado-principal' }],
  ['logged-out secondary', { scope: 'suite', group: 'deslogado-secundario' }],
]) test('ownership controller never executes restoration for ' + name, async t => {
  const value = await controllerFixture(t, 'none', options);
  assert.equal(value.exit, 0); assert.equal(value.browserCalls, 1);
  assert.equal(value.ownershipCalls.length, 0); assert.equal(value.ownershipMetadata, null);
});

for (const ownershipFault of ['source', 'cid', 'volume', 'namespace']) test('ownership controller stops before seed and cleans up on ' + ownershipFault, async t => {
  const value = await controllerFixture(t, 'none', { scope: 'suite', ownershipFault });
  assert.equal(value.exit, 1); assert.equal(value.state.error, 'routine-ownership-failed');
  assert.equal(value.state.failed_phase, 'restore-versioned-routine-owners');
  assert.equal(value.ownershipCalls.length, 0); assert.equal(value.seedCalls, 0);
  assert.equal(value.listCalls, 0); assert.equal(value.browserCalls, 0);
  assert.equal(value.containers.size, 0); assert.equal(value.volumes.size, 0);
  assert.equal(value.ownershipMetadata.value.confirmed, false); assert.equal(value.ownershipMetadata.mode, 0o600);
});

for (const [name, ownershipResult] of [
  ['error before commit', rows => ({ status: 1, stdout: ownershipOutput([rows[0]]), stderr: 'private-sentinel raw SQL' })],
  ['lost reply after verified', rows => ({ status: null, signal: 'SIGKILL', error: new Error('private-sentinel'), stdout: ownershipOutput(rows), stderr: 'private-sentinel' })],
  ['error with status zero', rows => ({ ...ok(ownershipOutput(rows)), error: new Error('private-sentinel') })],
  ['signal with status zero', rows => ({ ...ok(ownershipOutput(rows)), signal: 'SIGTERM' })],
  ['unconfirmed before only', rows => ok(ownershipOutput([rows[0]]))],
  ['verified without before', rows => ok(ownershipOutput([rows[1]]))],
  ['duplicate confirmation', rows => ok(ownershipOutput([...rows, rows[1]]))],
  ['wrong full definition hash', rows => { rows[0].routines[5].definition_sha256 = '0'.repeat(64); return ok(ownershipOutput(rows)); }],
  ['ACL changed', rows => { rows[1].routines[0].acl_preserved = false; return ok(ownershipOutput(rows)); }],
  ['unexpected output field', rows => { rows[1].body = 'private-sentinel'; return ok(ownershipOutput(rows)); }],
]) test('ownership controller cannot start seed/browser after ' + name, async t => {
  const value = await controllerFixture(t, 'none', { scope: 'suite', ownershipResult });
  assert.equal(value.exit, 1); assert.equal(value.state.error, 'routine-ownership-failed');
  assert.equal(value.state.failed_phase, 'restore-versioned-routine-owners');
  assert.equal(value.ownershipCalls.length, 1, 'never retry an ambiguous COMMIT');
  assert.equal(value.seedCalls, 0); assert.deepEqual(value.suiteStages, []);
  assert.equal(value.listCalls, 0); assert.equal(value.browserCalls, 0);
  assert.equal(value.containers.size, 0); assert.equal(value.volumes.size, 0);
  assert.equal(value.ownershipMetadata.value.confirmed, false); assert.equal(value.ownershipMetadata.mode, 0o600);
  assert.equal(Object.hasOwn(value.ownershipMetadata.value, 'verified'), false);
  assert.equal(value.providerMetadata['provider-catalog.json'], undefined);
  assert.equal(value.publicFiles.some(name => /ownership.*\.log$/.test(name)), false);
});

test('ownership success cannot override a later failure of the real verifier path', async t => {
  const value = await controllerFixture(t, 'none', { scope: 'suite', providerObservation: {
    result: error('private-sentinel-provider'), raw: JSON.stringify(providerFailureMetadata),
  } });
  assert.equal(value.ownershipMetadata.value.confirmed, true);
  assert.equal(value.exit, 1); assert.equal(value.state.error, 'verify-providers');
  assert.equal(value.browserCalls, 0);
  assert.deepEqual(value.providerMetadata['provider-diagnostic.json'].value, { available: true, ...providerFailureMetadata });
});

// Browser observations exercise the real reader/classifier; subprocesses remain
// controlled in controllerFixture, while publication and the redactor stay real.
const browserPlain = value => JSON.parse(JSON.stringify(value));
const browserDecoded = { read: 'ok', read_error_code: null, parse: 'decoded' };
const browserUnknown = { read: 'unknown', read_error_code: 'unknown', parse: 'unknown' };
const browserPrivate = 'private-sentinel://must-never-publish@example.test/path?token=secret';
for (const [name, raw, expected, parse] of [
  ['object', '{"value":"private-sentinel"}', { value: 'private-sentinel' }, 'decoded'],
  ['null', 'null', null, 'decoded'], ['array', '[]', [], 'decoded'],
  ['boolean', 'false', false, 'decoded'], ['number', '0', 0, 'decoded'],
  ['string', '"private-sentinel"', 'private-sentinel', 'decoded'],
  ['truncated', '{"value":', undefined, 'invalid'], ['empty', '', undefined, 'invalid'],
  ['undefined', undefined, undefined, 'invalid'],
]) test('browser diagnostic reader: ' + name, () => {
  let reads = 0;
  const result = readBrowserReportOnce(() => { reads++; return raw; });
  assert.equal(reads, 1); assert.deepEqual(result.report, expected);
  assert.deepEqual(browserPlain(result.observation), { read: 'ok', read_error_code: null, parse });
});
for (const code of ['ENOENT', 'EACCES', 'EPERM', 'EISDIR', 'EIO', 'EMFILE', 'ENFILE', browserPrivate]) {
  test('browser diagnostic reader: closed read code ' + (code === browserPrivate ? 'unknown' : code), () => {
    let reads = 0;
    const result = readBrowserReportOnce(() => { reads++; throw { code, message: browserPrivate, path: browserPrivate }; });
    assert.equal(reads, 1); assert.equal(result.report, undefined);
    assert.deepEqual(browserPlain(result.observation), { read: code === 'ENOENT' ? 'missing' : 'failed',
      read_error_code: code === browserPrivate ? 'unknown' : code, parse: 'not-attempted' });
  });
}
for (const [name, thrown] of [['null', null], ['undefined', undefined], ['false', false], ['zero', 0], ['empty', ''], ['symbol', Symbol('x')], ['bigint', 0n]]) {
  test('browser diagnostic reader: primitive throw ' + name, () => {
    const result = readBrowserReportOnce(() => { throw thrown; });
    assert.equal(result.report, undefined);
    assert.deepEqual(browserPlain(result.observation), { read: 'failed', read_error_code: 'unknown', parse: 'not-attempted' });
  });
}
test('browser diagnostic reader decodes once and does not retry a later file', () => {
  for (const raw of ['{}', '{"truncated":']) {
    const original = JSON.parse;
    let parses = 0;
    JSON.parse = (...args) => { parses++; return original(...args); };
    try { readBrowserReportOnce(() => raw); } finally { JSON.parse = original; }
    assert.equal(parses, 1);
  }
  let reads = 0;
  const result = readBrowserReportOnce(() => { if (++reads === 1) throw { code: 'ENOENT' }; return '{}'; });
  assert.equal(reads, 1); assert.equal(result.report, undefined);
});

for (const [name, status, expected] of [
  ['zero', 0, 0], ['exit-one', 1, 1], ['last-exit', 255, 255], ['null', null, null],
  ['negative', -1, 'unknown'], ['fraction', 0.5, 'unknown'], ['large', 256, 'unknown'],
  ['nan', NaN, 'unknown'], ['infinity', Infinity, 'unknown'], ['string', browserPrivate, 'unknown'],
  ['bigint', 0n, 'unknown'], ['symbol', Symbol('x'), 'unknown'], ['absent', undefined, 'unknown'],
]) test('browser diagnostic process status: ' + name, () => {
  assert.equal(browserResultDiagnostic({ status }, browserDecoded).process.status, expected);
});
for (const signal of ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'SIGABRT', 'SIGSEGV', 'SIGBUS', 'SIGILL', 'SIGFPE', 'SIGQUIT', 'SIGPIPE', 'SIGTRAP']) {
  test('browser diagnostic process signal: ' + signal, () => {
    assert.equal(browserResultDiagnostic({ status: null, signal }, browserDecoded).process.signal, signal);
  });
}
for (const code of ['ETIMEDOUT', 'ENOBUFS', 'ENOENT', 'EACCES', browserPrivate]) {
  test('browser diagnostic process error code: ' + (code === browserPrivate ? 'unknown' : code), () => {
    const result = browserResultDiagnostic({ status: 0, error: { code, message: browserPrivate, stack: browserPrivate, cause: browserPrivate } }, browserDecoded);
    assert.equal(result.process.error, 'present');
    assert.equal(result.process.error_code, code === browserPrivate ? 'unknown' : code);
    assert.equal(JSON.stringify(result).includes(browserPrivate), false);
  });
}
for (const [name, value] of [['private-string', browserPrivate], ['object', { toString() { throw Error('must not coerce'); } }], ['integer', 15]]) {
  test('browser diagnostic does not coerce signal or error code: ' + name, () => {
    const result = browserResultDiagnostic({ status: 0, signal: value, error: { code: value } }, browserDecoded);
    assert.equal(result.process.signal, 'unknown'); assert.equal(result.process.error_code, 'unknown');
  });
}
for (const key of ['status', 'signal', 'error']) {
  test('browser diagnostic does not execute process getter: ' + key, () => {
    let accesses = 0;
    const value = { status: 0, signal: null };
    Object.defineProperty(value, key, { get() { accesses++; throw Error(browserPrivate); } });
    assert.equal(browserResultDiagnostic(value, browserDecoded).process[key], 'unknown');
    assert.equal(accesses, 0);
  });
}
for (const [name, consume] of [
  ['process', value => browserResultDiagnostic(value, browserDecoded)],
  ['process-error', value => browserResultDiagnostic({ status: 0, error: value }, browserDecoded)],
  ['read-error', value => readBrowserReportOnce(() => { throw value; })],
  ['observation', value => browserResultDiagnostic({ status: 0 }, value)],
]) {
  test('browser diagnostic never invokes Proxy traps: ' + name, () => {
    let traps = 0;
    const value = new Proxy({}, { get() { traps++; throw Error(browserPrivate); },
      getOwnPropertyDescriptor() { traps++; throw Error(browserPrivate); }, getPrototypeOf() { traps++; throw Error(browserPrivate); } });
    assert.doesNotThrow(() => consume(value)); assert.equal(traps, 0);
  });
  test('browser diagnostic handles revoked Proxy: ' + name, () => {
    const { proxy, revoke } = Proxy.revocable({}, {}); revoke();
    assert.doesNotThrow(() => consume(proxy));
  });
}
test('browser diagnostic never executes inherited getters or toJSON and bounds traversal', () => {
  let accesses = 0;
  const accessor = { get status() { accesses++; return 0; }, toJSON() { throw Error(browserPrivate); } };
  assert.equal(browserResultDiagnostic(Object.create(accessor), browserDecoded).process.status, 'unknown');
  const error = { get code() { accesses++; return 'ETIMEDOUT'; } };
  assert.equal(browserResultDiagnostic({ status: null, error }, browserDecoded).process.error_code, 'unknown');
  assert.equal(readBrowserReportOnce(() => { throw error; }).observation.read_error_code, 'unknown');
  for (const field of ['read', 'read_error_code', 'parse']) {
    const value = { ...browserDecoded };
    Object.defineProperty(value, field, { get() { accesses++; return browserDecoded[field]; } });
    assert.deepEqual(browserPlain(browserResultDiagnostic({ status: 0 }, value).report), browserUnknown);
  }
  assert.equal(accesses, 0);
  let deep = { status: 0 };
  for (let depth = 0; depth < 8; depth++) deep = Object.create(deep);
  assert.equal(browserResultDiagnostic(deep, browserDecoded).process.status, 'unknown');
  assert.equal(browserResultDiagnostic(Object.create({ status: 0 }), browserDecoded).process.status, 0);
});
for (const [name, observation] of [
  ['absent', undefined], ['null', null], ['empty', {}],
  ['private-read', { ...browserDecoded, read: browserPrivate }],
  ['private-code', { read: 'failed', read_error_code: browserPrivate, parse: 'not-attempted' }],
  ['missing-with-denied', { read: 'missing', read_error_code: 'EACCES', parse: 'not-attempted' }],
  ['failed-with-missing', { read: 'failed', read_error_code: 'ENOENT', parse: 'not-attempted' }],
  ['parsed-after-failed-read', { read: 'failed', read_error_code: 'EIO', parse: 'decoded' }],
  ['read-ok-with-error', { ...browserDecoded, read_error_code: 'EIO' }],
  ['unknown-parse', { ...browserDecoded, parse: browserPrivate }],
]) test('browser diagnostic rejects contradictory observation: ' + name, () => {
  assert.deepEqual(browserPlain(browserResultDiagnostic({ status: 0 }, observation).report), browserUnknown);
});
test('browser diagnostic serializes only frozen closed records', () => {
  const result = browserResultDiagnostic({ status: 0, stdout: browserPrivate, stderr: browserPrivate, duration: browserPrivate, toJSON() { throw Error(browserPrivate); } }, { ...browserDecoded, private: browserPrivate });
  assert.deepEqual(browserPlain(result), { schema: 1, process: { status: 0, signal: null, error: 'none', error_code: null }, report: browserDecoded });
  for (const record of [result, result.process, result.report]) {
    assert.equal(Object.getPrototypeOf(record), null); assert.equal(Object.isFrozen(record), true);
    assert.throws(() => { record.private = browserPrivate; }, TypeError);
  }
});

const browserTimeout = { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT', message: browserPrivate }, stdout: '', stderr: '' };
const browserControllerCases = [
  { name: 'login passes', scope: 'login' },
  { name: 'authenticated passes' },
  { name: 'logged-out passes', group: 'deslogado-principal' },
  { name: 'missing JSON', observation: { report: undefined }, failure: 'suite-result-not-clean', read: 'missing', parse: 'not-attempted' },
  { name: 'read denied', observation: { readError: { code: 'EACCES', message: browserPrivate } }, failure: 'suite-result-not-clean', read: 'failed', parse: 'not-attempted' },
  { name: 'truncated JSON', observation: { report: '{"config":' }, failure: 'suite-result-not-clean', parse: 'invalid' },
  { name: 'decoded invalid shape', observation: { report: '{}' }, failure: 'suite-result-not-clean', invalidShape: true },
  { name: 'decoded null', observation: { report: 'null' }, failure: 'suite-result-not-clean', invalidShape: true },
  { name: 'timeout and missing JSON', observation: { result: browserTimeout, report: undefined }, failure: 'browser-suite-failed', read: 'missing', parse: 'not-attempted', code: 'ETIMEDOUT' },
  { name: 'ENOBUFS and valid JSON', observation: { result: { ...browserTimeout, error: { code: 'ENOBUFS', message: browserPrivate } } }, failure: 'browser-suite-failed', code: 'ENOBUFS' },
  { name: 'zero status with error', observation: { result: { ...ok(), error: { code: browserPrivate } } }, failure: 'browser-suite-failed', code: 'unknown' },
  { name: 'zero status with signal', observation: { result: { ...ok(), signal: 'SIGKILL' } }, failure: 'browser-suite-failed' },
  { name: 'process failure and valid JSON', observation: { result: error() }, failure: 'browser-suite-failed' },
  { name: 'test failure and clean process', observation: { report: JSON.stringify(suiteJson({ fault: 'suite-browser-failure' })) }, failure: 'suite-result-not-clean' },
  { name: 'explicit FIXME remains failure', fault: 'explicit-skip', failure: 'suite-result-not-clean' },
  { name: 'known platform skips remain classified', fault: 'known-platform-skips', knownSkips: true },
  { name: 'diagnostic write failure preserves success', observation: { writeFailure: true }, unpublished: true },
  { name: 'diagnostic write failure preserves process error', observation: { writeFailure: true, result: browserTimeout }, failure: 'browser-suite-failed', unpublished: true },
  { name: 'redactor preserves process failure and blocks upload', fault: 'redactor-failure', observation: { result: browserTimeout }, failure: 'browser-suite-failed', redactorFailure: true },
  { name: 'redactor failure blocks upload after browser success', fault: 'redactor-failure', failure: 'report-redaction-failed', redactorFailure: true },
];
for (const scenario of browserControllerCases) {
  test('browser diagnostic controller: ' + scenario.name, async t => {
    const value = await controllerFixture(t, scenario.fault ?? 'none', {
      scope: scenario.scope ?? 'suite', group: scenario.group ?? 'authenticated', browserObservation: scenario.observation ?? {},
    });
    assert.equal(value.exit, scenario.failure ? 1 : 0);
    assert.equal(value.state.error, scenario.failure);
    assert.equal(value.state.success, !scenario.failure);
    assert.equal(value.browserCalls, 1); assert.equal(value.listCalls, 1); assert.equal(value.browserReadCalls, 1);
    assert.equal(value.containers.size, 0); assert.equal(value.volumes.size, 0);
    assert.match(value.reportOutput, new RegExp('report_ready=' + String(!scenario.redactorFailure) + '\\n'));
    if (scenario.unpublished) assert.equal(value.browserMetadata, null);
    else {
      assert.equal(value.browserMetadata.mode, 0o600);
      const diagnostic = value.browserMetadata.value;
      assert.deepEqual(Object.keys(diagnostic), ['schema', 'process', 'report']);
      assert.deepEqual(Object.keys(diagnostic.process), ['status', 'signal', 'error', 'error_code']);
      assert.deepEqual(Object.keys(diagnostic.report), ['read', 'read_error_code', 'parse']);
      assert.equal(diagnostic.report.read, scenario.read ?? 'ok');
      assert.equal(diagnostic.report.parse, scenario.parse ?? 'decoded');
      if (scenario.code) assert.equal(diagnostic.process.error_code, scenario.code);
      assert.equal(JSON.stringify(diagnostic).includes(browserPrivate), false);
    }
    if (scenario.invalidShape) {
      assert.equal(value.browserSummary.inventoryVerified, false);
      assert.ok(value.browserSummary.reasons.includes('PLAYWRIGHT_REPORT_INVALID_SHAPE'));
    }
    if (scenario.knownSkips) {
      assert.equal(value.browserSummary.counts.known_runtime_skip, 2);
      assert.equal(value.browserSummary.ok, true); assert.equal(value.browserSummary.allPassed, false);
    }
  });
}
test('browser diagnostic is absent when the browser never starts', async t => {
  const value = await controllerFixture(t, 'pending-pin', { browserObservation: {} });
  assert.equal(value.browserCalls, 0); assert.equal(value.browserReadCalls, 0);
  assert.equal(value.browserMetadata, null); assert.equal(value.exit, 1);
});
