import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertPinnedImages, functionPolicy, prepareMountTargets } from '../e2e-isolated/run.mjs';
import { gitBlob } from '../e2e-isolated/migrations.mjs';
import { OWNER_LABEL, PURPOSE_LABEL, PURPOSE, OFFICIAL_HOST } from '../e2e-isolated/runtime-contract.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MODULES = path.join(ROOT, 'scripts/e2e-isolated');
const SOURCE_SHA = 'a'.repeat(40);
const MIGRATION = '20260101000000_fixture.sql';
const SQL = 'select 1;\n';
const lock = () => JSON.parse(readFileSync(path.join(MODULES, 'images.lock.json'), 'utf8'));
const ok = stdout => ({ status: 0, stdout: stdout ?? '', stderr: '' });
const error = stderr => ({ status: 1, stdout: '', stderr: stderr ?? 'simulated command failure' });
function playwrightJson({ listed = false, failed = false } = {}) {
  return {
    config: { projects: [{ name: 'setup', repeatEach: 1 }], metadata: { sentinel: 'must-never-publish-private-config' } },
    suites: [{ title: 'auth.setup.ts', file: 'auth.setup.ts', specs: [{
      title: 'authenticate', file: 'auth.setup.ts', line: 8, column: 1,
      tests: [{
        projectName: 'setup', projectId: 'setup', expectedStatus: 'passed',
        status: listed ? 'skipped' : failed ? 'unexpected' : 'expected', annotations: [],
        results: listed ? [] : [{ status: failed ? 'failed' : 'passed', workerIndex: 0, retry: 0, errors: failed ? [{}] : [] }],
      }],
    }] }],
    errors: [], stats: { expected: listed || failed ? 0 : 1, unexpected: failed ? 1 : 0, flaky: 0, skipped: listed ? 1 : 0 },
  };
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

async function controllerFixture(t, fault, manifest = value => value) {
  const temporary = mkdtempSync(path.join(tmpdir(), 'isolated-controller-test-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'repo');
  const output = path.join(temporary, 'output');
  for (const folder of ['scripts/e2e-isolated', 'scripts/ci', 'scripts/db-audit', 'supabase/migrations', 'node_modules/@playwright/test']) mkdirSync(path.join(root, folder), { recursive: true });
  for (const name of ['run.mjs', 'runtime-contract.mjs', 'stack.mjs', 'migrations.mjs', 'results.mjs', 'images.lock.json']) cpSync(path.join(MODULES, name), path.join(root, 'scripts/e2e-isolated', name));
  cpSync(path.join(ROOT, 'scripts/ci/redigir-relatorio.mjs'), path.join(root, 'scripts/ci/redigir-relatorio.mjs'));
  writeFileSync(path.join(root, 'node_modules/@playwright/test/package.json'), JSON.stringify({ version: fault === 'wrong-playwright' ? '1.0.0' : '1.64.1' }));
  writeFileSync(path.join(temporary, 'bun'), 'unused simulated binary');
  writeFileSync(path.join(root, 'supabase/config.toml'), '[functions.auth-login]\nverify_jwt = ' + (fault === 'jwt-policy' ? 'true' : 'false') + '\n');
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
  let localKeyConfigured = false;
  let driverLocalAnonKey;
  const valueAfter = (args, flag) => args[args.indexOf(flag) + 1];
  const allAfter = (args, flag) => args.flatMap((value, i) => value === flag ? [args[i + 1]] : []);
  const fakeCommand = (program, args, options) => {
    calls.push({ program, args: [...args] });
    if (program === 'git') {
      if (args[0] === 'rev-parse') return ok(SOURCE_SHA + '\n');
      if (args[0] === 'diff') return fault === 'dirty-checkout' ? error() : ok();
      if (args[0] === 'ls-files') return ok(manifest('100644 ' + gitBlob(sql) + ' 0\tsupabase/migrations/' + MIGRATION + '\n'));
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
      return fault === 'pull-auth' && argv[1] === lock().images.auth ? error() : ok();
    }
    if (argv[0] === 'image') return ok(JSON.stringify([fault === 'wrong-image-digest' ? 'registry.invalid/image@sha256:' + '0'.repeat(64) : argv[2]]));
    if (argv[0] === 'run') {
      const name = valueAfter(argv, '--name');
      const mounts = allAfter(argv, '--mount').map(value => {
        const pieces = Object.fromEntries(value.split(',').map(part => part.includes('=') ? part.split('=') : [part, true]));
        return { Type: pieces.type, Source: pieces.type === 'volume' ? volumes.get(pieces.src)?.Mountpoint : pieces.src, Destination: pieces.dst, RW: !pieces.readonly };
      });
      const labels = Object.fromEntries(allAfter(argv, '--label').map(value => value.split('=')));
      const metadata = { Id: name + '-id', Config: { Labels: labels }, HostConfig: { NetworkMode: argv.includes('--network') ? valueAfter(argv, '--network') : 'default', Privileged: false, CapAdd: [] }, NetworkSettings: { Networks: {} }, Mounts: mounts };
      if (name.includes('-bundle-')) {
        assert.equal(valueAfter(argv, '--user'), process.getuid() + ':' + process.getgid(), 'compiler cache must belong to the runner');
        const privateDir = path.join(path.dirname(options.env.DOCKER_CONFIG), 'private');
        assert.equal(readdirSync(privateDir).length, 0, 'compile must precede credential generation');
        assert.equal(argv.includes('--env-file'), false);
        if (fault === 'bundle-failure') return error();
        const bundleMount = mounts.find(mount => mount.Destination === '/bundles');
        const filename = path.basename(valueAfter(argv, '--output'));
        writeFileSync(path.join(bundleMount.Source, filename), fault === 'empty-bundle' ? '' : 'simulated-eszip-' + filename);
        return ok();
      }
      if (['-anchor', '-driver', '-vite', '-gateway'].some(suffix => name.endsWith(suffix))) {
        assert.equal(valueAfter(argv, '--user'), process.getuid() + ':' + process.getgid(), 'Node/Bun bind writes must belong to the runner');
      }
      if (name.endsWith('-anchor')) assert.equal(valueAfter(argv, '--add-host'), OFFICIAL_HOST + ':127.0.0.1');
      else assert.equal(argv.includes('--add-host'), false, 'container network must inherit the anchor hosts file');
      if (name.endsWith('-postgres') && fault === 'postgres-start') return error();
      if (name.endsWith('-anchor') && fault === 'anchor-network') metadata.HostConfig.NetworkMode = 'bridge';
      if (name.endsWith('-driver') && fault === 'driver-network') metadata.HostConfig.NetworkMode = 'host';
      if (argv.includes('--env-file')) {
        const envText = readFileSync(valueAfter(argv, '--env-file'), 'utf8');
        credentialFilesSeen ||= envText.includes('E2E_TEST_PASSWORD=');
        if (name.endsWith('-driver')) driverLocalAnonKey = envText.match(/^ANON_KEY=(.+)$/m)?.[1];
        assert.equal(args.some(value => value.includes('E2E_TEST_PASSWORD=')), false, 'credentials never enter argv');
      }
      controlDir ||= mounts.find(mount => mount.Destination === '/run/zapp-e2e')?.Source;
      containers.set(name, metadata);
      if (name.endsWith('-postgres') && fault === 'cancel-after-postgres') process.emit('SIGTERM');
      return ok(metadata.Id);
    }
    if (argv[0] === 'inspect') {
      const metadata = containers.get(argv[1]);
      if (!metadata) return error('Error: No such object: ' + argv[1]);
      const copy = structuredClone(metadata);
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
        if (browserCalls && fault === 'foreign-volume-cleanup') value.Labels[OWNER_LABEL] = 'foreign';
        return value ? ok(JSON.stringify([value])) : error('No such volume');
      }
      if (argv[1] === 'rm') { volumes.delete(argv[2]); return ok(); }
      assert.fail('unexpected volume command');
    }
    if (argv[0] === 'exec') {
      if (argv.includes('cat') && argv.at(-1) === '/etc/hosts') return ok((fault === 'postgres-hosts' ? '203.0.113.1' : '127.0.0.1') + ' ' + OFFICIAL_HOST + '\n');
      if (argv.includes('pg_isready')) { pgReadyChecks++; return ok(); }
      if (argv.includes('psql')) {
        const input = String(options.input);
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
      if (argv.includes('node_modules/@playwright/test/cli.js')) {
        if (argv.includes('--list')) {
          listCalls++;
          assert.equal(argv.includes('--reporter=json'), true);
          assert.equal(existsSync(path.join(controlDir, 'proof.json')), true, 'collection also runs after environment proof');
          if (fault === 'collection-failure') return error();
          const inventory = playwrightJson({ listed: true });
          if (fault === 'collection-extra') {
            const extra = structuredClone(inventory.suites[0].specs[0]); extra.line = 90;
            inventory.suites[0].specs.push(extra); inventory.stats.skipped = 2;
          }
          return ok(JSON.stringify(inventory));
        }
        browserCalls++;
        assert.equal(listCalls, 1, 'execution requires exactly one separate inventory');
        assert.equal(existsSync(path.join(controlDir, 'proof.json')), true, 'browser starts only after proof');
        const report = playwrightJson({ failed: fault === 'browser-failure' });
        if (fault === 'wrong-result') report.stats.expected = 0;
        writeFileSync(path.join(output, 'results.json'), JSON.stringify(report));
        if (fault === 'browser-failure') return error('controlled browser failure');
        mkdirSync(path.join(output, 'playwright-report'), { recursive: true });
        writeFileSync(path.join(output, 'playwright-report/raw.html'), 'must-never-publish-session-token');
        return ok('1 passed');
      }
      assert.fail('unexpected docker exec: ' + argv.join(' '));
    }
    if (argv[0] === 'logs') { cleanupSeen = true; return ok('controlled local service log'); }
    if (argv[0] === 'rm') { cleanupSeen = true; containers.delete(argv.at(-1)); return ok(); }
    assert.fail('unexpected docker command: ' + argv.join(' '));
  };
  const { runLogin } = await import(pathToFileURL(path.join(root, 'scripts/e2e-isolated/run.mjs')).href);
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, _delay, ...args) => realTimeout(callback, 0, ...args);
  let exit;
  try { exit = await runLogin({ outputDirectory: output, command: fakeCommand }); }
  finally { globalThis.setTimeout = realTimeout; }
  const state = JSON.parse(readFileSync(path.join(output, 'status.json'), 'utf8'));
  const publicFiles = readdirSync(path.join(output, 'public'), { recursive: true });
  assert.equal(publicFiles.some(name => ['results.json', 'inventory.json'].includes(name) || /raw\.html|playwright-report/.test(name)), false, 'raw browser artifacts never publish');
  assert.equal(JSON.stringify(publicFiles).includes('auth-state'), false);
  for (const name of publicFiles) {
    const content = readFileSync(path.join(output, 'public', name), 'utf8');
    assert.equal(/must-never-publish|private-sentinel|raw SQL must never publish/.test(content), false, 'private report/config and SQL must not publish');
  }
  const result = { exit, state, calls, migrationCalls, seedCalls, browserCalls, listCalls, credentialFilesSeen, containers, volumes, publicFiles, pgReadyChecks };
  return result;
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
