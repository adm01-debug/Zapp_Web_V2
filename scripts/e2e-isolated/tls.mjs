import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, X509Certificate } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { assertContainerIsolation, assertLoopbackOnly, assertNoProxy, assertRunId, assertSourceSha } from './runtime-contract.mjs';

export const TLS_ORIGIN = 'https://127.0.0.1:5173';
export const TLS_PUBLIC = '/run/zapp-e2e-tls';
export const TLS_PRIVATE = '/run/zapp-e2e-tls-private';
export const TLS_CONTROLS = Object.freeze({ untrusted: 5175, wrong_san: 5176 });
export const TLS_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=', 'base64');

const fail = code => { throw new Error('[e2e-isolated/tls-' + code + ']'); };
const digest = value => createHash('sha256').update(value).digest('hex');
const required = (result, code) => {
  if (result?.status !== 0 || result.error || result.signal) fail(code);
  return String(result.stdout || '').trim();
};
const tool = (command, program, args, cwd) => required(command(program, args, {
  cwd, env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 60_000,
  maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
}), 'tool-' + program + '-failed');

function newDirectory(directory) {
  if (typeof directory !== 'string' || path.resolve(directory) !== directory || /[,\r\n\0]/.test(directory)) fail('unsafe-directory');
  const parent = path.dirname(directory);
  if (realpathSync(parent) !== parent || existsSync(directory)) fail('directory-not-new');
  const stat = lstatSync(parent);
  if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) fail('parent-not-private');
  mkdirSync(directory, { mode: 0o700 });
}

/** Prove the runner tools before issuing any certificate or app credential. */
export function preflightTlsTools({ directory, command = spawnSync }) {
  newDirectory(directory);
  try {
    const version = tool(command, 'openssl', ['version'], directory);
    if (!/^OpenSSL 3\./.test(version)) fail('openssl-version');
    tool(command, 'certutil', ['-N', '--empty-password', '-d', 'sql:' + directory], directory);
    tool(command, 'certutil', ['-L', '-d', 'sql:' + directory], directory);
    return { openssl: version.split(/\s+/).slice(0, 2).join(' '), nss: true };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

function layout(material) {
  const directory = material?.directory;
  if (typeof directory !== 'string' || path.resolve(directory) !== directory || /[,\r\n\0]/.test(directory)) fail('material-layout');
  for (const [name, suffix] of [['publicDirectory', 'public'], ['privateDirectory', 'private'], ['homeDirectory', 'home']]) {
    if (material[name] !== path.join(directory, suffix)) fail('material-layout');
  }
  assertRunId(material.runId); assertSourceSha(material.sourceSha);
  if (!/^[a-f0-9]{64}$/.test(material.caSha256 || '')) fail('material-fingerprint');
  return material;
}

/** Only temporary paths and public fingerprints leave this function. */
export function createTlsMaterial({ directory, runId, sourceSha, command = spawnSync }) {
  assertRunId(runId); assertSourceSha(sourceSha);
  newDirectory(directory);
  let complete = false;
  const publicDirectory = path.join(directory, 'public');
  const privateDirectory = path.join(directory, 'private');
  const homeDirectory = path.join(directory, 'home');
  const caKey = path.join(privateDirectory, 'ca.key');
  const controlCaKey = path.join(privateDirectory, 'untrusted-ca.key');
  try {
    for (const sub of [publicDirectory, privateDirectory, homeDirectory]) mkdirSync(sub, { mode: sub === publicDirectory ? 0o755 : 0o700 });
    const caFile = path.join(publicDirectory, 'ca.crt');
    tool(command, 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1',
      '-keyout', caKey, '-out', caFile, '-subj', '/CN=' + runId,
      '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
      '-addext', 'keyUsage=critical,keyCertSign,cRLSign'], privateDirectory);
    chmodSync(caKey, 0o600); chmodSync(caFile, 0o444);
    // The negative leaf is valid, but its independent issuer is never trusted.
    const controlCaFile = path.join(privateDirectory, 'untrusted-ca.crt');
    tool(command, 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1',
      '-keyout', controlCaKey, '-out', controlCaFile, '-subj', '/CN=' + runId + '-untrusted-ca',
      '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
      '-addext', 'keyUsage=critical,keyCertSign,cRLSign'], privateDirectory);
    chmodSync(controlCaKey, 0o600); chmodSync(controlCaFile, 0o444);
    for (const [name, ip, issuer, issuerKey] of [
      ['server', '127.0.0.1', caFile, caKey], ['wrong_san', '127.0.0.2', caFile, caKey],
      ['untrusted', '127.0.0.1', controlCaFile, controlCaKey],
    ]) {
      const key = path.join(privateDirectory, name + '.key');
      const csr = path.join(privateDirectory, name + '.csr');
      const ext = path.join(privateDirectory, name + '.ext');
      writeFileSync(ext, 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:' + ip + '\n', { mode: 0o600 });
      tool(command, 'openssl', ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256',
        '-keyout', key, '-out', csr, '-subj', '/CN=' + runId + '-' + name], privateDirectory);
      chmodSync(key, 0o600);
      tool(command, 'openssl', ['x509', '-req', '-in', csr, '-CA', issuer, '-CAkey', issuerKey,
        '-set_serial', '0x' + randomBytes(16).toString('hex'), '-days', '1', '-sha256',
        '-extfile', ext, '-out', path.join(privateDirectory, name + '.crt')], privateDirectory);
      rmSync(csr); rmSync(ext);
    }
    rmSync(caKey); rmSync(controlCaKey);
    const ca = new X509Certificate(readFileSync(caFile));
    const controlCa = new X509Certificate(readFileSync(controlCaFile));
    const server = new X509Certificate(readFileSync(path.join(privateDirectory, 'server.crt')));
    const wrong = new X509Certificate(readFileSync(path.join(privateDirectory, 'wrong_san.crt')));
    const untrusted = new X509Certificate(readFileSync(path.join(privateDirectory, 'untrusted.crt')));
    if (!ca.ca || !controlCa.ca || !controlCa.verify(controlCa.publicKey) || controlCa.verify(ca.publicKey) ||
        server.ca || wrong.ca || untrusted.ca || !server.verify(ca.publicKey) ||
        !wrong.verify(ca.publicKey) || untrusted.verify(ca.publicKey) ||
        !untrusted.verify(controlCa.publicKey) || untrusted.verify(untrusted.publicKey) ||
        server.checkIP('127.0.0.1') !== '127.0.0.1' || wrong.checkIP('127.0.0.1') ||
        untrusted.checkIP('127.0.0.1') !== '127.0.0.1') fail('issued-certificate-contract');
    const manifest = {
      schema: 1, run_id: runId, source_sha: sourceSha, origin: TLS_ORIGIN,
      ca_sha256: digest(ca.raw), server_sha256: digest(server.raw),
      expires_at: new Date(server.validTo).toISOString(),
    };
    writeFileSync(path.join(publicDirectory, 'manifest.json'), JSON.stringify(manifest) + '\n', { mode: 0o444 });
    writeFileSync(path.join(publicDirectory, 'firefox-policies.json'), JSON.stringify({ policies: {
      Certificates: { Install: [TLS_PUBLIC + '/ca.crt'] },
    } }) + '\n', { mode: 0o444 });
    // Legacy NSS path is supported by both older Chromium and M146+. The HOME
    // is mounted at this SAME absolute path, preserving NSS's generated configdir.
    const nss = path.join(homeDirectory, '.pki', 'nssdb');
    mkdirSync(nss, { recursive: true, mode: 0o700 });
    tool(command, 'certutil', ['-N', '--empty-password', '-d', 'sql:' + nss], homeDirectory);
    tool(command, 'certutil', ['-A', '-d', 'sql:' + nss, '-n', runId, '-t', 'C,,', '-i', caFile], homeDirectory);
    tool(command, 'certutil', ['-L', '-d', 'sql:' + nss, '-n', runId], homeDirectory);
    complete = true;
    return { directory, publicDirectory, privateDirectory, homeDirectory, runId, sourceSha, caSha256: manifest.ca_sha256 };
  } finally {
    rmSync(caKey, { force: true });
    rmSync(controlCaKey, { force: true });
    if (!complete) rmSync(directory, { recursive: true, force: true });
  }
}

export function tlsMounts(material, role) {
  layout(material);
  if (!['driver', 'edge', 'gateway'].includes(role)) fail('invalid-role');
  const mounts = [{ type: 'bind', source: material.publicDirectory, target: TLS_PUBLIC, readOnly: true }];
  if (role === 'gateway') mounts.push({ type: 'bind', source: material.privateDirectory, target: TLS_PRIVATE, readOnly: true });
  if (role === 'driver') mounts.push({ type: 'bind', source: material.homeDirectory, target: material.homeDirectory, readOnly: false });
  return mounts;
}

export function tlsEnvironment(material, role) {
  layout(material);
  if (role === 'gateway') return {};
  if (role === 'edge') return { DENO_TLS_CA_STORE: 'system', SSL_CERT_FILE: TLS_PUBLIC + '/ca.crt' };
  if (role === 'driver') return {
    HOME: material.homeDirectory, NODE_EXTRA_CA_CERTS: TLS_PUBLIC + '/ca.crt',
    SSL_CERT_FILE: TLS_PUBLIC + '/ca.crt', PLAYWRIGHT_FIREFOX_POLICIES_JSON: TLS_PUBLIC + '/firefox-policies.json',
  };
  fail('invalid-role');
}

/** Root is used only for these two commands inside the owned disposable driver. */
export function installDriverTlsTrust({ inspect, docker, driverName, runId, anchorId, runnerUser, material, allowedWritableSources }) {
  layout(material);
  if (material.runId !== runId || driverName !== runId + '-driver' || !/^\d+:\d+$/.test(runnerUser)) fail('driver-identity');
  const verify = () => {
    const metadata = inspect(driverName);
    assertContainerIsolation(metadata, runId, anchorId, allowedWritableSources);
    if (metadata?.Config?.User !== runnerUser || metadata?.State?.Running !== true) fail('driver-user-or-state');
    const mounts = metadata.Mounts || [];
    for (const expected of tlsMounts(material, 'driver')) {
      const actual = mounts.filter(mount => mount.Destination === expected.target);
      if (actual.length !== 1 || actual[0].Source !== expected.source || actual[0].RW !== !expected.readOnly) fail('driver-mount');
    }
    if (mounts.some(mount => mount.Destination === TLS_PRIVATE || mount.Source === material.privateDirectory)) fail('private-key-in-driver');
    const ca = new X509Certificate(readFileSync(path.join(material.publicDirectory, 'ca.crt')));
    if (digest(ca.raw) !== material.caSha256) fail('ca-changed');
  };
  verify();
  required(docker(['exec', '--user', '0:0', driverName, 'install', '-m', '0644', TLS_PUBLIC + '/ca.crt',
    '/usr/local/share/ca-certificates/zapp-e2e-local.crt']), 'driver-ca-install');
  verify();
  required(docker(['exec', '--user', '0:0', driverName, 'update-ca-certificates']), 'driver-ca-update');
  verify();
  return { installed: true, ca_sha256: material.caSha256, user: runnerUser };
}

export function readGatewayTls({ env = process.env, publicDirectory = TLS_PUBLIC, privateDirectory = TLS_PRIVATE,
  interfaces, now = Date.now() } = {}) {
  assertLoopbackOnly(interfaces); assertNoProxy(env);
  const runId = assertRunId(env.ZAPP_E2E_RUN_ID), sourceSha = assertSourceSha(env.GITHUB_SHA);
  const manifest = JSON.parse(readFileSync(path.join(publicDirectory, 'manifest.json'), 'utf8'));
  const ca = new X509Certificate(readFileSync(path.join(publicDirectory, 'ca.crt')));
  if (manifest.schema !== 1 || manifest.run_id !== runId || manifest.source_sha !== sourceSha ||
      manifest.origin !== TLS_ORIGIN || digest(ca.raw) !== manifest.ca_sha256 ||
      !Number.isFinite(Date.parse(manifest.expires_at)) || Date.parse(manifest.expires_at) <= now) fail('gateway-manifest');
  const read = name => ({ cert: readFileSync(path.join(privateDirectory, name + '.crt')), key: readFileSync(path.join(privateDirectory, name + '.key')), minVersion: 'TLSv1.2' });
  const server = read('server');
  if (digest(new X509Certificate(server.cert).raw) !== manifest.server_sha256) fail('gateway-certificate-changed');
  return { server, controls: { untrusted: read('untrusted'), wrong_san: read('wrong_san') } };
}

export function serveTlsProbe(req, res, identity) {
  if (!['/__e2e/tls-probe', '/__e2e/tls-probe.png'].includes(req.url)) return false;
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return true; }
  if (identity.origin !== TLS_ORIGIN) fail('probe-origin');
  res.writeHead(200, { 'content-type': req.url.endsWith('.png') ? 'image/png' : 'text/html', 'cache-control': 'no-store' });
  res.end(req.url.endsWith('.png') ? TLS_PNG : '<!doctype html><meta charset="utf-8"><title>TLS local</title><img id="tls-probe-image" src="/__e2e/tls-probe.png" alt="TLS probe">');
  return true;
}

export async function startTlsControlServers(identity, tls) {
  if (identity.origin !== TLS_ORIGIN) fail('probe-origin');
  assertRunId(identity.run_id); assertSourceSha(identity.source_sha);
  const servers = [];
  const close = async () => {
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  };
  try {
    for (const [name, port] of Object.entries(TLS_CONTROLS)) {
      const server = https.createServer(tls.controls[name], (req, res) => {
        const accepted = req.headers.host === '127.0.0.1:' + port && req.method === 'GET' && req.url === '/__e2e/tls-control';
        res.writeHead(accepted ? 200 : 404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(accepted ? { ...identity, control: name } : { error: 'not-found' }));
      });
      servers.push(server);
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    }
    return close;
  } catch (error) { await close(); throw error; }
}
