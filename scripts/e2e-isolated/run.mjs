import { spawnSync } from 'node:child_process';
import {
  appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync,
  lstatSync, readFileSync, readdirSync, realpathSync, rmdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import {
  OWNER_LABEL, PURPOSE_LABEL, PURPOSE, ORIGIN, assertOwnedContainer,
  assertContainerIsolation, assertSourceSha, assertOfficialHostIsLocal, makeProof, syntheticCredentials, sha256,
} from './runtime-contract.mjs';
import { containerArguments, serviceConfiguration } from './stack.mjs';
import { prepareMigration, migrationFailure } from './migrations.mjs';
import { readPlaywrightInventory, summarizePlaywrightResult } from './results.mjs';
import { createTlsMaterial, preflightTlsTools, tlsEnvironment, tlsMounts, installDriverTlsTrust, TLS_ORIGIN, TLS_PUBLIC } from './tls.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const HERE = fileURLToPath(new URL('./', import.meta.url));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function assertPinnedImages(lock) {
  const required = ['postgres', 'auth', 'rest', 'storage', 'realtime', 'edge', 'driver'];
  if (!lock?.images || required.some(name => !/^[a-z0-9./_-]+:[A-Za-z0-9_.-]+@sha256:[a-f0-9]{64}$/.test(lock.images[name] ?? ''))) {
    throw new Error('image-lock-review-required');
  }
  return Object.fromEntries(required.map(name => [name, lock.images[name]]));
}

export function functionPolicy(source, name) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('invalid-function-name');
  const sections = source.split(/^\s*\[functions\.([a-z0-9-]+)\]\s*$/m);
  for (let i = 1; i < sections.length; i += 2) {
    if (sections[i] !== name) continue;
    const declarations = [...sections[i + 1].matchAll(/^\s*verify_jwt\s*=\s*(true|false)\s*(?:#.*)?$/gm)];
    if (declarations.length > 1) throw new Error('ambiguous-function-policy');
    return declarations.length === 0 || declarations[0][1] === 'true';
  }
  return true;
}

/** Accept only the complete proof from each fixed client; raw output is private. */
export function assertTlsClientProof(value, runtime, runId, sourceSha) {
  const fields = ['identity', 'image', 'untrusted_rejected', 'wrong_san_rejected'];
  const checks = object => object && Object.keys(object).length === fields.length && fields.every(key => object[key] === true);
  const browserNames = ['chromium', 'firefox', 'webkit'];
  if (!['node', 'bun', 'browsers', 'edge'].includes(runtime) || value?.schema !== 1 ||
      value.run_id !== runId || value.source_sha !== sourceSha || value.origin !== TLS_ORIGIN ||
      value.runtime !== runtime || value.probe_runner !== (runtime === 'bun' ? 'bun' : 'node') ||
      typeof value.probe_runner_version !== 'string' || !/^v?\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(value.probe_runner_version) ||
      !(runtime === 'browsers' ? value.checks && Object.keys(value.checks).length === browserNames.length &&
        browserNames.every(name => checks(value.checks[name])) : checks(value.checks))) throw new Error('tls-' + runtime + '-proof-invalid');
  return { runtime, probe_runner: value.probe_runner, probe_runner_version: value.probe_runner_version,
    checks: runtime === 'browsers' ? Object.fromEntries(browserNames.map(name => [name, Object.fromEntries(fields.map(key => [key, true]))])) : Object.fromEntries(fields.map(key => [key, true])) };
}

/** Empty bind targets are prepared on the runner; all runtime writes use their
 * separate mounts. Existing files/directories are never replaced or removed. */
export function prepareMountTargets(root, targets) {
  const created = [];
  const base = realpathSync(root);
  for (const target of targets) {
    if (!target.startsWith('/work/') || target.split('/').includes('..')) throw new Error('invalid-work-mount-target');
    let current = base;
    for (const part of target.slice('/work/'.length).split('/')) {
      if (!part || part === '.') throw new Error('invalid-work-mount-target');
      current = path.join(current, part);
      if (existsSync(current)) {
        if (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink()) throw new Error('unsafe-work-mount-target');
      } else {
        mkdirSync(current); created.push(current);
      }
    }
  }
  return created;
}

function writeJson(file, value, mode = 0o600) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode });
}

function environmentFile(file, env) {
  const lines = Object.entries(env).map(([key, value]) => {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || typeof value !== 'string' || /[\r\n\0]/.test(value)) throw new Error('invalid-container-environment');
    return key + '=' + value;
  });
  writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
}

function safeCode(error) {
  const text = String(error?.message || '');
  const scoped = text.match(/^\[e2e-isolated\/([a-z][a-z0-9-]{0,100})\]/);
  if (scoped) return scoped[1];
  return /^[a-z][a-z0-9-]{0,100}$/.test(text) ? text : 'isolated-runtime-failed';
}

export async function runLogin({ outputDirectory, command = spawnSync } = {}) {
  let output = path.resolve(outputDirectory || '');
  if (!outputDirectory || output === ROOT || output.startsWith(ROOT + path.sep)) throw new Error('output-must-be-outside-checkout');
  mkdirSync(output, { recursive: true });
  output = realpathSync(output);
  if (output === realpathSync(ROOT) || output.startsWith(realpathSync(ROOT) + path.sep)) throw new Error('output-must-be-outside-checkout');
  if (readdirSync(output).length) throw new Error('output-must-be-empty');
  const published = path.join(output, 'public');
  mkdirSync(published, { recursive: true });
  const runRoot = mkdtempSync(path.join(tmpdir(), 'zapp-e2e-runtime-'));
  const runId = 'zapp-e2e-' + Date.now().toString(36) + '-' + randomBytes(8).toString('hex');
  const dockerConfig = path.join(runRoot, 'docker-client');
  const privateDir = path.join(runRoot, 'private');
  const controlDir = path.join(runRoot, 'control');
  const bundles = path.join(runRoot, 'bundles');
  const bundleCache = path.join(runRoot, 'bundle-cache');
  for (const directory of [dockerConfig, privateDir, controlDir, bundles, bundleCache]) mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const directory of [controlDir, bundles, bundleCache, output]) chmodSync(directory, 0o755);
  // Compilers run as this runner's UID:GID, so nested cache files remain owned
  // and removable without giving a container access to the Docker socket.
  chmodSync(bundles, 0o755); chmodSync(bundleCache, 0o755);
  const state = { schema: 1, scope: 'bootstrap-and-login', run_id: runId, phase: 'preflight', success: false, native_e2e: false };
  const containers = [];
  const removedContainers = new Set();
  const volumes = [];
  const mountTargets = [];
  const writable = new Set([output, bundles, bundleCache]);
  let credentials;
  let reportReady = false;
  let failure;
  let cancelled = false;
  let cleaning = false;
  const onCancel = () => { cancelled = true; };
  process.on('SIGTERM', onCancel); process.on('SIGINT', onCancel);
  const execute = (program, args, options = {}) => {
    if (cancelled && !cleaning) throw new Error('run-cancelled');
    return command(program, args, {
    cwd: ROOT, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'], ...options,
    });
  };
  const docker = (args, options) => execute('docker', ['--host', 'unix:///var/run/docker.sock', ...args], {
    env: { PATH: process.env.PATH, DOCKER_CONFIG: dockerConfig }, ...options,
  });
  const required = (result, code) => {
    if (result.status !== 0 || result.error || result.signal) throw new Error(code);
    return String(result.stdout || '').trim();
  };
  const inspect = name => JSON.parse(required(docker(['inspect', name]), 'container-inspect-failed'))[0];
  const phase = name => {
    state.phase = name;
    process.stdout.write('[e2e-isolated] ' + name + '\n');
    writeJson(path.join(output, 'status.json'), state);
  };
  const redacted = value => {
    let text = String(value ?? '');
    for (const secret of Object.values(credentials ?? {})) {
      if (typeof secret === 'string' && secret.length > 6) text = text.replaceAll(secret, '[REDACTED]');
    }
    return text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT REDACTED]');
  };
  const waitFor = async (label, probe, milliseconds = 180_000) => {
    const deadline = Date.now() + milliseconds;
    do {
      if (probe()) return;
      await pause(2_000);
    } while (Date.now() < deadline);
    throw new Error(label + '-not-ready');
  };
  let anchorId;
  let runnerUser;
  let services;
  const envFiles = {};
  const baseMounts = () => [
    { type: 'bind', source: ROOT, target: '/work', readOnly: true },
    { type: 'bind', source: controlDir, target: '/run/zapp-e2e', readOnly: true },
  ];
  const createVolume = name => {
    const volumeName = runId + '-' + name;
    required(docker(['volume', 'create', '--label', OWNER_LABEL + '=' + runId, '--label', PURPOSE_LABEL + '=' + PURPOSE, volumeName]), 'volume-create-failed');
    volumes.push(volumeName);
    const data = JSON.parse(required(docker(['volume', 'inspect', volumeName]), 'volume-inspect-failed'))[0];
    if (data.Labels?.[OWNER_LABEL] !== runId || data.Labels?.[PURPOSE_LABEL] !== PURPOSE) throw new Error('foreign-volume');
    writable.add(data.Mountpoint);
    return { type: 'volume', source: volumeName, target: '', readOnly: false };
  };
  const start = (name, image, mounts = [], options = {}) => {
    const config = services[name];
    const containerName = runId + '-' + name;
    containers.push(containerName);
    const args = containerArguments({
      runId, name, image, anchorId, envFile: envFiles[name],
      mounts: [...(options.withCheckout === false ? [] : baseMounts()), ...mounts], args: config.args, memory: options.memory ?? '2g',
      user: ['driver', 'vite', 'gateway'].includes(name) ? runnerUser : undefined,
    });
    const id = required(docker(args), 'start-' + name + '-failed');
    assertContainerIsolation(inspect(containerName), runId, anchorId, writable);
    return { name: containerName, id };
  };
  let database;
  const psql = (sql, extra = []) => docker(['exec', '-i', database.name, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-q', '-A', '-t', ...extra], { input: sql });
  const sqlBoolean = sql => required(psql(sql), 'database-readiness-query-failed') === 't';
  let driver;
  const driverRun = (args, code, timeout = 240_000, { recordLog = true } = {}) => {
    const result = docker(['exec', '-w', '/work', driver.name, ...args], { timeout });
    if (recordLog) writeFileSync(path.join(output, code + '.log'), redacted(String(result.stdout || '') + String(result.stderr || '')), { mode: 0o600 });
    return required(result, code);
  };
  try {
    // No image execution, credential generation or SQL occurs before this gate.
    const images = assertPinnedImages(JSON.parse(readFileSync(path.join(HERE, 'images.lock.json'), 'utf8')));
    if (typeof process.getuid !== 'function' || typeof process.getgid !== 'function') throw new Error('linux-user-required');
    runnerUser = process.getuid() + ':' + process.getgid();
    const sourceSha = assertSourceSha(required(execute('git', ['rev-parse', 'HEAD']), 'checkout-sha-unavailable'));
    required(execute('git', ['diff', '--quiet', 'HEAD', '--']), 'checkout-not-clean');
    state.source_sha = sourceSha;
    const bunPath = realpathSync(required(execute('which', ['bun']), 'bun-unavailable'));
    if (!statSync(bunPath).isFile() || !existsSync(path.join(ROOT, 'node_modules/@playwright/test/package.json'))) throw new Error('dependencies-not-installed');
    const playwrightVersion = JSON.parse(readFileSync(path.join(ROOT, 'node_modules/@playwright/test/package.json'), 'utf8')).version;
    if (playwrightVersion !== '1.64.1') throw new Error('playwright-image-version-mismatch');
    if (ORIGIN !== TLS_ORIGIN) throw new Error('tls-origin-mismatch');
    const tlsTools = preflightTlsTools({ directory: path.join(runRoot, 'tls-tools'), command: execute });
    mountTargets.push(...prepareMountTargets(ROOT, [
      '/work/e2e/.auth', '/work/e2e/__screenshots__', '/work/e2e/talkx-visual',
      '/work/e2e/email-navy-visual', '/work/.tmp/sidebar-topo',
      '/work/node_modules/.vite', '/work/node_modules/.vite-temp',
    ]));
    const context = JSON.parse(required(docker(['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}']), 'docker-context-failed'));
    if (context !== 'unix:///var/run/docker.sock') throw new Error('nonlocal-docker-context');
    phase('pull-immutable-images');
    const imageEvidence = {};
    for (const [name, image] of Object.entries(images)) {
      required(docker(['pull', image], { timeout: 15 * 60_000 }), 'pull-' + name + '-failed');
      const digests = JSON.parse(required(docker(['image', 'inspect', image, '--format', '{{json .RepoDigests}}']), 'image-inspect-failed'));
      const expected = image.slice(image.indexOf('@sha256:'));
      if (!Array.isArray(digests) || !digests.some(value => value.endsWith(expected))) throw new Error('image-digest-mismatch');
      imageEvidence[name] = { image, observed_digest: expected.slice(1) };
    }
    writeJson(path.join(output, 'images.json'), imageEvidence);
    const toolsName = runId + '-tls-tools';
    containers.push(toolsName);
    required(docker(['run', '--rm', '--name', toolsName,
      '--label', OWNER_LABEL + '=' + runId, '--label', PURPOSE_LABEL + '=' + PURPOSE,
      '--network', 'none', '--user', runnerUser, '--cap-drop', 'NET_RAW', '--security-opt', 'no-new-privileges:true',
      '--entrypoint', '/bin/sh', images.driver, '-ec',
      'command -v install >/dev/null; command -v update-ca-certificates >/dev/null']), 'tls-driver-tools-unavailable');
    removedContainers.add(toolsName);
    phase('compile-without-credentials');
    const names = ['auth-login'];
    const registry = { functions: {} };
    const functionConfig = readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8');
    for (const name of ['main', ...names, 'tls-edge-probe']) {
      const entry = name === 'main' ? '/work/scripts/e2e-isolated/main/index.ts' : name === 'tls-edge-probe' ?
        '/work/scripts/e2e-isolated/tls-edge-probe.ts' : '/work/supabase/functions/' + name + '/index.ts';
      const containerName = runId + '-bundle-' + name;
      containers.push(containerName);
      const result = docker([
        'run', '--rm', '--name', containerName,
        '--user', runnerUser,
        '--label', OWNER_LABEL + '=' + runId, '--label', PURPOSE_LABEL + '=' + PURPOSE,
        '--workdir', '/work', '--env', 'DENO_DIR=/cache',
        '--mount', 'type=bind,src=' + ROOT + ',dst=/work,readonly',
        '--mount', 'type=bind,src=' + bundles + ',dst=/bundles',
        '--mount', 'type=bind,src=' + bundleCache + ',dst=/cache',
        images.edge, 'bundle', '--entrypoint', entry, '--output', '/bundles/' + name + '.eszip', '--timeout', '180',
      ], { timeout: 210_000 });
      // Compiler diagnostics can include source. Do not copy raw output.
      required(result, 'bundle-' + name + '-failed');
      const bytes = readFileSync(path.join(bundles, name + '.eszip'));
      if (!bytes.length) throw new Error('empty-edge-bundle');
      if (!['main', 'tls-edge-probe'].includes(name)) registry.functions[name] = { verify_jwt: functionPolicy(functionConfig, name), bundle_sha256: sha256(bytes) };
    }
    if (registry.functions['auth-login'].verify_jwt !== false) throw new Error('auth-login-gateway-policy-mismatch');
    writeJson(path.join(controlDir, 'functions.json'), registry, 0o444);
    writeJson(path.join(output, 'bundles.json'), { main_sha256: sha256(readFileSync(path.join(bundles, 'main.eszip'))),
      tls_probe_sha256: sha256(readFileSync(path.join(bundles, 'tls-edge-probe.eszip'))), ...registry });
    const migrationDirectory = path.join(ROOT, 'supabase/migrations');
    const migrations = readdirSync(migrationDirectory, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.sql')).map(entry => entry.name).sort()
      .map(name => prepareMigration(name, readFileSync(path.join(migrationDirectory, name), 'utf8')));
    if (!migrations.length) throw new Error('active-migrations-missing');
    const tracked = required(execute('git', ['ls-files', '-s', '--', 'supabase/migrations']), 'migration-source-manifest-failed');
    const trackedBlobs = new Map(tracked.split('\n').map(line => {
      const match = line.match(/^100(?:644|755) ([a-f0-9]{40}) 0\tsupabase\/migrations\/([^/]+\.sql)$/);
      return match ? [match[2], match[1]] : [null, null];
    }));
    if (migrations.some(item => trackedBlobs.get(item.evidence.name) !== item.evidence.original_git_blob)) throw new Error('migration-source-changed');
    writeJson(path.join(output, 'migration-sources.json'), migrations.map(item => item.evidence));

    phase('issue-local-tls');
    const material = createTlsMaterial({ directory: path.join(runRoot, 'tls-material'), runId, sourceSha, command: execute });
    writable.add(material.homeDirectory);
    // The only credentials introduced below are generated for this empty stack.
    credentials = syntheticCredentials();
    services = serviceConfiguration({ credentials, runId, sourceSha });
    Object.assign(services.driver.env, tlsEnvironment(material, 'driver'));
    Object.assign(services.edge.env, tlsEnvironment(material, 'edge'));
    services['tls-edge'] = { env: { ZAPP_E2E_RUN_ID: runId, GITHUB_SHA: sourceSha, ...tlsEnvironment(material, 'edge') },
      args: ['start', '--main-service', '/bundles/tls-edge-probe.eszip'] };
    for (const [name, config] of Object.entries(services)) {
      envFiles[name] = path.join(privateDir, name + '.env');
      environmentFile(envFiles[name], config.env);
    }
    phase('create-closed-network');
    const anchorName = runId + '-anchor';
    containers.push(anchorName);
    anchorId = required(docker(containerArguments({
      runId, name: 'anchor', image: images.driver,
      args: ['node', '-e', 'setInterval(() => {}, 1000)'], memory: '128m', user: runnerUser,
    })), 'network-anchor-failed');
    assertContainerIsolation(inspect(anchorName), runId, anchorId, writable);
    const runtimeMount = { type: 'bind', source: bunPath, target: '/usr/local/bin/bun', readOnly: true };
    const ephemeral = (name, target, copySource) => {
      const directory = path.join(runRoot, name);
      mkdirSync(directory, { recursive: true });
      if (copySource && existsSync(copySource)) cpSync(copySource, directory, { recursive: true });
      chmodSync(directory, 0o777); writable.add(directory);
      return { type: 'bind', source: directory, target, readOnly: false };
    };
    const authMount = ephemeral('auth-state', '/work/e2e/.auth');
    const outputMount = { type: 'bind', source: output, target: '/output', readOnly: false };
    const captures = [
      ephemeral('screenshots', '/work/e2e/__screenshots__', path.join(ROOT, 'e2e/__screenshots__')),
      ephemeral('talkx-visual', '/work/e2e/talkx-visual'),
      ephemeral('email-visual', '/work/e2e/email-navy-visual'),
      ephemeral('sidebar-captures', '/work/.tmp/sidebar-topo'),
    ];
    driver = start('driver', images.driver, [runtimeMount, outputMount, authMount, ...captures, ...tlsMounts(material, 'driver')], { memory: '4g' });
    const network = JSON.parse(driverRun(['node', 'scripts/e2e-isolated/runtime-probe.mjs', 'network'], 'network-proof'));
    if (network.loopback_only !== true || network.official_host_local !== true || !/^net:\[\d+\]$/.test(network.network_namespace)) throw new Error('network-proof-invalid');

    phase('prove-tls-clients');
    installDriverTlsTrust({ inspect, docker, driverName: driver.name, runId, anchorId, runnerUser, material, allowedWritableSources: writable });
    start('gateway', images.driver, tlsMounts(material, 'gateway'));
    const temporaryEdge = start('tls-edge', images.edge, [
      { type: 'bind', source: bundles, target: '/bundles', readOnly: true }, ...tlsMounts(material, 'edge'),
    ], { withCheckout: false });
    const boot = JSON.parse(driverRun(['node', 'scripts/e2e-isolated/runtime-probe.mjs', 'tls'], 'tls-boot-proof'));
    if (boot.schema !== 1 || boot.run_id !== runId || boot.source_sha !== sourceSha || boot.origin !== TLS_ORIGIN || boot.ready !== true) throw new Error('tls-boot-proof-invalid');
    const tlsProof = { schema: 1, run_id: runId, source_sha: sourceSha, origin: TLS_ORIGIN,
      ca_sha256: material.caSha256, tools: tlsTools, clients: [] };
    for (const runtime of ['node', 'bun', 'browsers', 'edge']) {
      // These probes precede SQL/login; preserve their diagnostics through both
      // existing redactors so a native TLS failure identifies its actual cause.
      const raw = driverRun([runtime === 'bun' ? 'bun' : 'node', 'scripts/e2e-isolated/tls-probe.mjs', runtime], 'tls-' + runtime + '-gate', 240_000);
      let value;
      try { value = JSON.parse(raw); } catch { throw new Error('tls-' + runtime + '-invalid-json'); }
      tlsProof.clients.push(assertTlsClientProof(value, runtime, runId, sourceSha));
      writeJson(path.join(output, 'tls-proof.json'), tlsProof);
    }
    assertContainerIsolation(inspect(temporaryEdge.name), runId, anchorId, writable);
    required(docker(['rm', '-f', '-v', temporaryEdge.name]), 'tls-probe-cleanup-failed');
    removedContainers.add(temporaryEdge.name);
    state.tls = { proved: true, clients: tlsProof.clients.length };

    phase('start-platform');
    const databaseVolume = createVolume('postgres');
    databaseVolume.target = '/var/lib/postgresql/data';
    const platform = name => path.join(HERE, 'platform', name);
    database = start('postgres', images.postgres, [
      databaseVolume,
      { type: 'bind', source: platform('webhooks.sql'), target: '/docker-entrypoint-initdb.d/init-scripts/98-webhooks.sql', readOnly: true },
      { type: 'bind', source: platform('roles.sql'), target: '/docker-entrypoint-initdb.d/init-scripts/99-roles.sql', readOnly: true },
      { type: 'bind', source: platform('jwt.sql'), target: '/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql', readOnly: true },
      { type: 'bind', source: platform('realtime.sql'), target: '/docker-entrypoint-initdb.d/migrations/99-realtime.sql', readOnly: true },
    ]);
    await waitFor('postgres', () => docker(['exec', database.name, 'pg_isready', '-h', '127.0.0.1', '-U', 'supabase_admin']).status === 0);
    assertOfficialHostIsLocal(required(docker(['exec', database.name, 'cat', '/etc/hosts']), 'postgres-hosts-unavailable'));
    if (!sqlBoolean("select current_setting('cron.launch_active_jobs') = 'off';")) throw new Error('cron-not-disabled');
    start('auth', images.auth);
    start('rest', images.rest);
    const storageVolume = createVolume('storage'); storageVolume.target = '/var/lib/storage';
    start('storage', images.storage, [storageVolume]);
    start('realtime', images.realtime);
    driverRun(['node', 'scripts/e2e-isolated/runtime-probe.mjs', 'platform'], 'platform-proof');
    if (!sqlBoolean("select to_regclass('auth.sessions') is not null and to_regclass('auth.identities') is not null and to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null and to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null;")) throw new Error('real-platform-schema-missing');
    required(psql("create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text); alter database postgres set app.settings.trusted_domains = 'localhost,127.0.0.1'; alter database postgres set app.settings.e2e_anon_key = '" + credentials.anonKey + "';"), 'local-platform-settings-failed');
    if (!sqlBoolean("select current_setting('app.settings.e2e_anon_key', true) = '" + credentials.anonKey + "';")) throw new Error('local-anon-setting-mismatch');

    phase('apply-active-migrations');
    const expected = JSON.parse(readFileSync(path.join(ROOT, 'scripts/db-audit/replay-known-failures.json'), 'utf8')).esperadas;
    const migrationResults = [];
    for (const item of migrations) {
      const result = migrationFailure(item.evidence.name, psql(item.sql), expected);
      migrationResults.push(result);
    }
    writeJson(path.join(output, 'migration-results.json'), migrationResults);
    state.migrations = { total: migrationResults.length, passed: migrationResults.filter(item => item.success).length, known_failures: migrationResults.filter(item => !item.success && item.expected).length, unexpected_failures: migrationResults.filter(item => !item.success && !item.expected).length };
    if (state.migrations.unexpected_failures) throw new Error('unexpected-migration-failure');
    if (!sqlBoolean("select current_setting('cron.launch_active_jobs') = 'off';")) throw new Error('cron-reenabled-by-migration');
    required(psql("notify pgrst, 'reload schema';"), 'schema-cache-reload-failed');
    await pause(2_000);
    start('edge', images.edge, [{ type: 'bind', source: bundles, target: '/bundles', readOnly: true }, ...tlsMounts(material, 'edge')]);
    start('vite', images.driver, [
      runtimeMount,
      ephemeral('vite-cache', '/work/node_modules/.vite'),
      ephemeral('vite-config-cache', '/work/node_modules/.vite-temp'),
    ]);
    driverRun(['node', 'scripts/e2e-isolated/runtime-probe.mjs', 'frontend'], 'frontend-proof');
    phase('seed-and-real-login-api');
    driverRun(['node', 'scripts/e2e-isolated/seed-login.mjs'], 'seed-login', 240_000);
    const seed = JSON.parse(driverRun(['node', 'scripts/e2e-isolated/runtime-probe.mjs', 'seed'], 'seed-proof'));
    if (seed.network_namespace !== network.network_namespace) throw new Error('namespace-changed');
    for (const container of containers.filter(name => !name.includes('-bundle-') && !removedContainers.has(name))) {
      assertContainerIsolation(inspect(container), runId, anchorId, writable);
    }
    const proof = makeProof({ runId, sourceSha, anonKey: credentials.anonKey, networkNamespace: network.network_namespace,
      checks: { network_isolated: true, cron_disabled: true, bootstrap_complete: true, seed_ready: true } });
    writeJson(path.join(controlDir, 'proof.json'), proof, 0o444);
    writeJson(path.join(output, 'readiness.json'), proof);
    phase('collect-real-login-test');
    const cli = ['node', 'node_modules/@playwright/test/cli.js', 'test', '--config', 'scripts/e2e-isolated/playwright.config.ts', '--project', 'setup', '--workers', '1'];
    const inventoryJson = JSON.parse(driverRun([...cli, '--list', '--reporter=json'], 'collect-login', 120_000, { recordLog: false }));
    const inventory = readPlaywrightInventory(inventoryJson, { projects: ['setup'] });
    if (inventory.total !== 1) throw new Error('login-inventory-not-exact');
    writeJson(path.join(output, 'inventory.json'), inventoryJson);
    phase('real-browser-login');
    state.native_e2e = true;
    const browserResult = docker(['exec', '-w', '/work', driver.name, ...cli], { timeout: 600_000 });
    writeFileSync(path.join(output, 'browser-login.log'), redacted(String(browserResult.stdout || '') + String(browserResult.stderr || '')), { mode: 0o600 });
    let report;
    try { report = JSON.parse(readFileSync(path.join(output, 'results.json'), 'utf8')); } catch { /* Summary records invalid/missing collection explicitly. */ }
    const summary = summarizePlaywrightResult(report, { scope: 'bootstrap-and-login', expectedProjects: ['setup'], inventory });
    writeJson(path.join(output, 'results-summary.json'), summary);
    state.login = summary.counts;
    required(browserResult, 'browser-login-failed');
    if (!summary.inventoryVerified || !summary.allPassed || summary.counts.total !== 1 || summary.counts.passed !== 1) throw new Error('login-result-not-clean');
    state.success = true;
  } catch (error) {
    failure = error;
    state.error = safeCode(error);
    state.failed_phase = state.phase;
    const source = String(error?.message || '').match(/^\[e2e-isolated\/[a-z0-9-]+\] (\d+_[a-zA-Z0-9_.-]+\.sql)$/);
    if (source) state.error_source = source[1];
  } finally {
    cleaning = true;
    phase('cleanup');
    for (const name of [...containers].reverse().filter(name => !removedContainers.has(name))) {
      const result = docker(['inspect', name]);
      if (result.status !== 0) {
        if (!result.error && !result.signal && /No such (?:object|container)/i.test(String(result.stderr || ''))) continue;
        failure ||= new Error('owned-container-inspection-failed'); state.success = false; state.cleanup_error = true; continue;
      }
      try {
        const metadata = JSON.parse(result.stdout)[0];
        assertOwnedContainer(metadata, runId);
        if (!name.includes('-bundle-')) {
          const logs = docker(['logs', '--tail', '180', name]);
          const text = String(logs.stdout || '') + String(logs.stderr || '');
          if (name.endsWith('-postgres')) {
            // Init errors can quote SQL. Expose only controlled metadata.
            writeJson(path.join(output, 'postgres-log-summary.json'), {
              collected: logs.status === 0, exit_code: metadata.State?.ExitCode ?? null,
              error_count: (text.match(/\bERROR:/g) ?? []).length, fatal_count: (text.match(/\bFATAL:/g) ?? []).length,
              initialization_files: [...new Set([...text.matchAll(/(?:init-scripts|migrations)\/([a-zA-Z0-9_.-]+\.sql)/g)].map(match => match[1]))],
            });
          } else writeFileSync(path.join(output, name.split(runId + '-')[1] + '.log'), redacted(text), { mode: 0o600 });
        }
        required(docker(['rm', '-f', '-v', name]), 'owned-container-cleanup-failed');
      } catch { failure ||= new Error('owned-container-cleanup-failed'); state.success = false; state.cleanup_error = true; }
    }
    for (const name of [...volumes].reverse()) {
      const result = docker(['volume', 'inspect', name]);
      if (result.status !== 0) {
        if (!result.error && !result.signal && /No such volume/i.test(String(result.stderr || ''))) continue;
        failure ||= new Error('owned-volume-inspection-failed'); state.success = false; state.cleanup_error = true; continue;
      }
      try {
        const metadata = JSON.parse(result.stdout)[0];
        if (metadata.Labels?.[OWNER_LABEL] !== runId || metadata.Labels?.[PURPOSE_LABEL] !== PURPOSE) throw new Error('foreign-volume');
        required(docker(['volume', 'rm', name]), 'owned-volume-cleanup-failed');
      } catch { failure ||= new Error('owned-volume-cleanup-failed'); state.success = false; state.cleanup_error = true; }
    }
    for (const directory of [...mountTargets].reverse()) {
      try { rmdirSync(directory); }
      catch { failure ||= new Error('mount-target-cleanup-failed'); state.success = false; state.cleanup_error = true; }
    }
    if (cancelled) { failure ||= new Error('run-cancelled'); state.success = false; }
    state.phase = 'complete';
    // Raw Playwright JSON, HTML, screenshots and traces stay on the ephemeral
    // runner. They may contain newly-issued session tokens not known to seed.
    // Only these controlled metadata files and already-redacted logs publish.
    const metadata = ['images.json', 'bundles.json', 'tls-proof.json', 'migration-sources.json', 'migration-results.json', 'readiness.json', 'seed-ready.json', 'results-summary.json', 'postgres-log-summary.json'];
    for (const name of metadata) if (existsSync(path.join(output, name))) cpSync(path.join(output, name), path.join(published, name));
    for (const entry of readdirSync(output, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.log')) cpSync(path.join(output, entry.name), path.join(published, entry.name));
    }
    writeJson(path.join(published, 'status.json'), state);
    const redactEnv = { PATH: process.env.PATH, E2E_LOCAL_REDACTION_SENTINEL: 'synthetic-redaction-control-not-a-credential' };
    for (const [name, value] of Object.entries(credentials ?? {})) redactEnv['E2E_LOCAL_' + name.toUpperCase()] = value;
    const redactArgs = Object.keys(redactEnv).filter(name => name.startsWith('E2E_LOCAL_')).map(name => '--segredo-env=' + name);
    const redact = execute('node', ['scripts/ci/redigir-relatorio.mjs', published, ...redactArgs], { env: redactEnv });
    reportReady = redact.status === 0 && !redact.error && !redact.signal;
    if (!reportReady) { failure ||= new Error('report-redaction-failed'); state.success = false; }
    // No source or shared cache is removed. Only this freshly-created temp root.
    try { rmSync(runRoot, { recursive: true, force: true }); }
    catch { failure ||= new Error('private-runtime-cleanup-failed'); state.success = false; state.cleanup_error = true; }
    if (failure && !state.error) state.error = safeCode(failure);
    writeJson(path.join(output, 'status.json'), state);
    writeJson(path.join(published, 'status.json'), state);
    process.off('SIGTERM', onCancel); process.off('SIGINT', onCancel);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'report_ready=' + String(reportReady) + '\n');
  }
  process.stdout.write(JSON.stringify({ scope: state.scope, success: state.success, code: state.error ?? (failure ? safeCode(failure) : null), native_e2e: state.native_e2e, report_ready: reportReady }) + '\n');
  return failure ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== 'login' || process.argv.length !== 4) throw new Error('usage: run.mjs login <output-directory>');
  process.exitCode = await runLogin({ outputDirectory: process.argv[3] });
}
