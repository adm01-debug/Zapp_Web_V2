import { createHash, createHmac, randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { readlinkSync } from 'node:fs';

export const ORIGIN = 'https://127.0.0.1:5173';
export const PROVIDER_ORIGIN = 'http://127.0.0.1:8081';
export const CATALOG_SKU = 'E2E-LOCAL-001';
export const OFFICIAL_HOST = 'tnnnlkbymytvtqngbbqh.supabase.co';

export function assertOfficialHostIsLocal(hosts) {
  const addresses = String(hosts).split(/\r?\n/).flatMap(line => {
    const fields = line.replace(/#.*/, '').trim().split(/\s+/);
    return fields.slice(1).some(name => name.toLowerCase() === OFFICIAL_HOST) ? [fields[0]] : [];
  });
  if (!addresses.length || addresses.some(address => address !== '127.0.0.1')) fail('official-host-not-neutralized');
  return true;
}
export const OWNER_LABEL = 'zapp.e2e.owner';
export const PURPOSE_LABEL = 'zapp.e2e.purpose';
export const PURPOSE = 'isolated-auth';
export const GROUPS = Object.freeze({
  authenticated: ['setup', 'chromium-e2e-core', 'chromium-authenticated', 'firefox-talkx', 'webkit-talkx', 'firefox-conversation', 'webkit-conversation', 'firefox-catalog', 'webkit-catalog'],
  'deslogado-principal': ['chromium-mapa', 'firefox-auth', 'webkit-auth'],
  'deslogado-secundario': ['chromium-telefonia', 'firefox-telefonia', 'webkit-telefonia'],
});

export function fail(code) {
  throw new Error('[e2e-isolated/' + code + ']');
}

export function assertRunId(value) {
  if (typeof value !== 'string' || !/^zapp-e2e-[a-z0-9-]{8,64}$/.test(value)) fail('invalid-run-id');
  return value;
}

export function assertSourceSha(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) fail('invalid-source-sha');
  return value;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function assertLocalOrigin(value) {
  if (value !== ORIGIN) fail('backend-origin-mismatch');
  return ORIGIN;
}

export function assertLoopbackOnly(interfaces = networkInterfaces()) {
  const names = Object.keys(interfaces);
  if (names.length !== 1 || names[0] !== 'lo') fail('external-network-interface');
  const addresses = interfaces.lo;
  if (!Array.isArray(addresses) || !addresses.length || addresses.some(row =>
    row.internal !== true || !['127.0.0.1', '::1'].includes(row.address))) fail('invalid-loopback-interface');
  if (!addresses.some(row => row.address === '127.0.0.1')) fail('ipv4-loopback-unavailable');
  return true;
}

export function currentNetworkNamespace() {
  const value = readlinkSync('/proc/self/ns/net');
  if (!/^net:\[\d+\]$/.test(value)) fail('invalid-network-namespace');
  return value;
}

export function assertNoProxy(env) {
  for (const name of Object.keys(env)) {
    if (/^(http|https|all|ftp)_proxy$/i.test(name) && env[name]) fail('proxy-not-allowed');
  }
}

const BROWSER_ENV = new Set([
  'PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'TZ',
  'DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'LD_LIBRARY_PATH',
  'PLAYWRIGHT_FIREFOX_POLICIES_JSON',
]);

/** Playwright passes this complete map instead of inheriting driver credentials. */
export function browserEnvironment(env) {
  const result = {};
  if (env.PLAYWRIGHT_FIREFOX_POLICIES_JSON !== undefined &&
      env.PLAYWRIGHT_FIREFOX_POLICIES_JSON !== '/run/zapp-e2e-tls/firefox-policies.json') fail('invalid-browser-tls-policy');
  for (const name of BROWSER_ENV) {
    if (typeof env[name] === 'string') result[name] = env[name];
  }
  return result;
}

export function publicIdentity(runId, sourceSha) {
  return { schema: 1, run_id: assertRunId(runId), source_sha: assertSourceSha(sourceSha), origin: ORIGIN };
}

export function makeProof({ runId, sourceSha, anonKey, networkNamespace, now = Date.now(), checks }) {
  if (!/^net:\[\d+\]$/.test(networkNamespace)) fail('invalid-network-namespace');
  if (typeof anonKey !== 'string' || anonKey.length < 64) fail('invalid-local-anon-key');
  const required = ['network_isolated', 'cron_disabled', 'bootstrap_complete', 'seed_ready'];
  if (!checks || required.some(name => checks[name] !== true)) fail('incomplete-readiness');
  return {
    ...publicIdentity(runId, sourceSha),
    network_namespace: networkNamespace,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 60 * 60 * 1000).toISOString(),
    anon_key_sha256: sha256(anonKey),
    checks: Object.fromEntries(required.map(name => [name, true])),
  };
}

/** Generated only for the empty disposable stack; never read a hosted credential. */
export function syntheticCredentials(now = Date.now()) {
  const jwtSecret = randomBytes(48).toString('hex');
  const token = role => {
    const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({
      role, iss: 'supabase', iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 4 * 60 * 60,
    })).toString('base64url');
    const message = head + '.' + body;
    return message + '.' + createHmac('sha256', jwtSecret).update(message).digest('base64url');
  };
  return {
    jwtSecret,
    anonKey: token('anon'),
    serviceRoleKey: token('service_role'),
    databasePassword: randomBytes(32).toString('hex'),
    email: 'supervisor.e2e@example.invalid',
    password: randomBytes(24).toString('base64url') + '!Aa1',
    evolutionKey: 'e2e-local-' + randomBytes(24).toString('hex'),
    instanceToken: 'e2e-instance-' + randomBytes(24).toString('hex'),
    catalogKey: 'e2e-catalog-' + randomBytes(24).toString('hex'),
  };
}

export function assertOwnedContainer(metadata, runId) {
  const labels = metadata?.Config?.Labels;
  if (labels?.[OWNER_LABEL] !== assertRunId(runId) || labels?.[PURPOSE_LABEL] !== PURPOSE) fail('foreign-container');
  return true;
}

/** Never silently accept a second interface, host networking or a Docker socket. */
export function assertContainerIsolation(metadata, runId, anchorId, allowedWritableSources) {
  assertOwnedContainer(metadata, runId);
  const config = metadata.HostConfig;
  if (!config || config.Privileged === true || config.PidMode === 'host' || config.IpcMode === 'host') fail('privileged-container');
  if ((config.CapAdd || []).length) fail('unexpected-capability');
  if (!['none', 'container:' + anchorId].includes(config.NetworkMode)) fail('unexpected-network-mode');
  const endpoints = Object.keys(metadata.NetworkSettings?.Networks || {});
  if (endpoints.some(name => name !== 'none')) fail('unexpected-network-endpoint');
  for (const mount of metadata.Mounts || []) {
    if (mount.Source?.includes('docker.sock') || mount.Destination?.includes('docker.sock')) fail('docker-socket-mounted');
    if (mount.RW && !allowedWritableSources.has(mount.Source)) fail('foreign-writable-mount');
  }
  return true;
}
