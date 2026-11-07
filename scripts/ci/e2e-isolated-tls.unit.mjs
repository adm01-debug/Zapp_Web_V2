import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import https from 'node:https';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { crc32, inflateSync } from 'node:zlib';
import { createTlsMaterial, preflightTlsTools, tlsMounts, tlsEnvironment, installDriverTlsTrust, readGatewayTls,
  serveTlsProbe, TLS_ORIGIN, TLS_PUBLIC, TLS_PRIVATE, TLS_PNG } from '../e2e-isolated/tls.mjs';
import { certificateFailure, assertTlsClientContext, probeClient, probeBrowsers, probeEdge } from '../e2e-isolated/tls-probe.mjs';

const runId = 'zapp-e2e-tls-contract-12345678', sourceSha = 'a'.repeat(40);
const identity = { schema: 1, run_id: runId, source_sha: sourceSha, origin: TLS_ORIGIN };
const loopback = { lo: [{ internal: true, address: '127.0.0.1' }] };
const parent = mkdtempSync(path.join(tmpdir(), 'zapp-tls-unit-'));
after(() => rmSync(parent, { recursive: true, force: true }));
const commands = [];
// OpenSSL issuance is native. NSS commands are recorded doubles because the
// ordinary Node job does not install certutil; the browser gate proves NSS.
const command = (program, args, options) => {
  commands.push({ program, args, options });
  if (program === 'certutil') return { status: 0, stdout: '' };
  return spawnSync(program, args, options);
};
const material = createTlsMaterial({ directory: path.join(parent, 'material'), runId, sourceSha, command });
const env = { ZAPP_E2E_RUN_ID: runId, GITHUB_SHA: sourceSha, PATH: '/usr/bin', ...tlsEnvironment(material, 'driver') };
const bytes = file => readFileSync(path.join(material.privateDirectory, file));
const fp = value => createHash('sha256').update(value).digest('hex');
const goodResponse = (body, status = 200, headers) => new Response(JSON.stringify(body), { status, headers });
const certificateError = kind => Object.assign(new Error('TLS certificate rejected'), {
  code: kind === 'untrusted' ? 'DEPTH_ZERO_SELF_SIGNED_CERT' : 'ERR_TLS_CERT_ALTNAME_INVALID',
});
const checks = { identity: true, image: true, untrusted_rejected: true, wrong_san_rejected: true };

test('PNG do gate possui chunks válidos e um pixel RGBA decodificável', () => {
  assert.equal(TLS_PNG.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let pixels;
  for (let offset = 8; offset < TLS_PNG.length;) {
    const size = TLS_PNG.readUInt32BE(offset), type = TLS_PNG.subarray(offset + 4, offset + 8).toString('ascii');
    const data = TLS_PNG.subarray(offset + 8, offset + 8 + size);
    assert.equal(crc32(TLS_PNG.subarray(offset + 4, offset + 8 + size)), TLS_PNG.readUInt32BE(offset + 8 + size));
    if (type === 'IHDR') { assert.equal(data.readUInt32BE(0), 1); assert.equal(data.readUInt32BE(4), 1); assert.equal(data[9], 6); }
    if (type === 'IDAT') pixels = inflateSync(data);
    offset += 12 + size;
  }
  assert.deepEqual([...pixels], [0, 255, 255, 255, 255]);
});

test('emissão real: CAs separadas, leaf/SAN/EKU, chaves das CAs removidas e mounts separados', () => {
  const ca = new X509Certificate(readFileSync(path.join(material.publicDirectory, 'ca.crt')));
  const controlCa = new X509Certificate(bytes('untrusted-ca.crt'));
  const server = new X509Certificate(bytes('server.crt'));
  const wrong = new X509Certificate(bytes('wrong_san.crt'));
  const foreign = new X509Certificate(bytes('untrusted.crt'));
  assert.equal(ca.ca, true); assert.equal(server.ca, false);
  assert.equal(server.verify(ca.publicKey), true); assert.equal(wrong.verify(ca.publicKey), true);
  assert.equal(foreign.verify(ca.publicKey), false);
  assert.equal(controlCa.ca, true); assert.equal(controlCa.verify(controlCa.publicKey), true);
  assert.equal(controlCa.verify(ca.publicKey), false); assert.notEqual(fp(controlCa.raw), fp(ca.raw));
  assert.equal(foreign.verify(controlCa.publicKey), true); assert.equal(foreign.verify(foreign.publicKey), false);
  assert.equal(foreign.issuer, controlCa.subject); assert.notEqual(foreign.issuer, foreign.subject);
  assert.equal(foreign.checkIP('127.0.0.1'), '127.0.0.1');
  for (const leaf of [server, wrong, foreign]) {
    assert.equal(leaf.publicKey.asymmetricKeyType, 'rsa');
    assert.equal(leaf.publicKey.asymmetricKeyDetails.modulusLength, 2048);
    assert.ok(leaf.keyUsage.includes('1.3.6.1.5.5.7.3.1'));
    assert.ok(Date.parse(leaf.validTo) - Date.parse(leaf.validFrom) <= 86_400_000);
  }
  assert.equal(server.checkIP('127.0.0.1'), '127.0.0.1'); assert.equal(wrong.checkIP('127.0.0.1'), undefined);
  assert.ok(server.keyUsage.includes('1.3.6.1.5.5.7.3.1'));
  assert.ok(Date.parse(server.validTo) - Date.parse(server.validFrom) <= 86_400_000);
  assert.equal(existsSync(path.join(material.privateDirectory, 'ca.key')), false);
  assert.equal(existsSync(path.join(material.privateDirectory, 'untrusted-ca.key')), false);
  for (const file of ['server.key', 'wrong_san.key', 'untrusted.key']) assert.equal(statSync(path.join(material.privateDirectory, file)).mode & 0o777, 0o600);
  assert.equal(statSync(material.homeDirectory).uid, process.getuid());
  assert.equal(statSync(material.homeDirectory).mode & 0o777, 0o700);
  assert.deepEqual(readdirSync(material.publicDirectory).sort(), ['ca.crt', 'firefox-policies.json', 'manifest.json']);
  assert.equal(fp(ca.raw), material.caSha256);
  for (const role of ['edge', 'driver']) assert.equal(tlsMounts(material, role).some(mount => mount.target === TLS_PRIVATE), false);
  assert.equal(tlsMounts(material, 'gateway').filter(mount => mount.target === TLS_PRIVATE).length, 1);
  const home = tlsMounts(material, 'driver').find(mount => !mount.readOnly);
  assert.equal(home.source, home.target); assert.equal(home.target, material.homeDirectory);
  assert.deepEqual(JSON.parse(readFileSync(path.join(material.publicDirectory, 'firefox-policies.json'))), {
    policies: { Certificates: { Install: [TLS_PUBLIC + '/ca.crt'] } },
  });
  assert.ok(commands.filter(call => call.program === 'certutil').every(call => call.args.includes('sql:' + path.join(material.homeDirectory, '.pki/nssdb'))));
  assert.deepEqual(commands.filter(call => call.program === 'certutil' && call.args[0] === '-A').map(call => call.args[call.args.indexOf('-i') + 1]),
    [path.join(material.publicDirectory, 'ca.crt')], 'only the primary CA enters NSS');
  assert.ok(commands.every(call => Object.keys(call.options.env).join() === 'PATH'));
});

test('duas emissões reais não reutilizam a CA nem autorizam o leaf da outra execução', () => {
  const other = createTlsMaterial({ directory: path.join(parent, 'other'), runId: runId + '-other', sourceSha, command });
  assert.notEqual(other.caSha256, material.caSha256);
  const otherCa = new X509Certificate(readFileSync(path.join(other.publicDirectory, 'ca.crt')));
  assert.equal(new X509Certificate(bytes('server.crt')).verify(otherCa.publicKey), false);
  assert.equal(existsSync(path.join(other.privateDirectory, 'ca.key')), false);
  assert.equal(existsSync(path.join(other.privateDirectory, 'untrusted-ca.key')), false);
});

// Actual handshakes: no fetch/browser doubles, proxy, custom name verifier or
// ignoreHTTPSErrors. The two loopback addresses exercise the real SAN check.
for (const [name, issuer, ip] of [['server', 'primary', '127.0.0.1'], ['untrusted', 'secondary', '127.0.0.1'], ['wrong_san', 'primary', '127.0.0.2']]) {
  for (const trust of ['primary', 'secondary', 'empty']) for (const hostname of ['127.0.0.1', '127.0.0.2']) for (const version of ['TLSv1.2', 'TLSv1.3']) {
    test('TLS nativo: ' + [name, trust, hostname, version].join('/'), async t => {
      const ca = trust === 'primary' ? [readFileSync(path.join(material.publicDirectory, 'ca.crt'))]
        : trust === 'secondary' ? [bytes('untrusted-ca.crt')] : [];
      const certificate = bytes(name + '.crt');
      const leaf = new X509Certificate(certificate);
      assert.equal(leaf.verify(leaf.publicKey), false, 'each control is a signed leaf, not a self-signed substitute');
      const server = https.createServer({ key: bytes(name + '.key'), cert: certificate, minVersion: 'TLSv1.2' }, (_req, res) => res.end('local-only'));
      server.on('tlsClientError', () => {});
      t.after(async () => { server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve)); });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, hostname, resolve); });
      const observed = await new Promise(resolve => {
        const request = https.get({ hostname, port: server.address().port, path: '/', ca, agent: false, rejectUnauthorized: true,
          minVersion: version, maxVersion: version, timeout: 5_000 }, response => {
          const protocol = response.socket.getProtocol(); response.resume();
          response.once('end', () => resolve({ accepted: true, status: response.statusCode, protocol }));
        });
        request.on('timeout', () => request.destroy(new Error('unexpected-local-timeout')));
        request.on('error', error => resolve({ accepted: false, error }));
      });
      const expected = trust === issuer && hostname === ip;
      assert.equal(observed.accepted, expected);
      if (expected) { assert.equal(observed.status, 200); assert.equal(observed.protocol, version); }
      else assert.equal(certificateFailure(observed.error, trust === issuer ? 'wrong_san' : 'untrusted'), true);
    });
  }
}

for (const fault of ['secondary-ca-command', 'negative-leaf-command', 'primary-signed-negative', 'self-signed-negative']) {
  test('CA de controle: ' + fault + ' bloqueia e remove todo material parcial', () => {
    const directory = path.join(parent, fault);
    let injected = false;
    const command = (program, args, options) => {
      if (program === 'certutil') return { status: 0, stdout: '' };
      const output = args.includes('-out') ? path.basename(args[args.indexOf('-out') + 1]) : '';
      if (fault === 'secondary-ca-command' && output === 'untrusted-ca.crt') {
        injected = true;
        writeFileSync(path.join(options.cwd, 'untrusted-ca.key'), 'partial-synthetic-key', { mode: 0o600 });
        assert.equal(existsSync(path.join(options.cwd, 'ca.key')), true);
        return { status: 1, stderr: 'controlled issuance failure' };
      }
      if (args[0] === 'x509' && output === 'untrusted.crt') {
        assert.equal(existsSync(path.join(options.cwd, 'ca.key')), true);
        assert.equal(existsSync(path.join(options.cwd, 'untrusted-ca.key')), true);
        if (fault === 'negative-leaf-command') { injected = true; return { status: 1 }; }
        if (fault === 'primary-signed-negative') {
          injected = true; args = [...args];
          args[args.indexOf('-CA') + 1] = path.join(directory, 'public', 'ca.crt');
          args[args.indexOf('-CAkey') + 1] = path.join(options.cwd, 'ca.key');
        }
        if (fault === 'self-signed-negative') {
          injected = true;
          args = ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1',
            '-keyout', path.join(options.cwd, 'untrusted.key'), '-out', path.join(options.cwd, 'untrusted.crt'),
            '-subj', '/CN=' + runId + '-untrusted', '-addext', 'basicConstraints=critical,CA:FALSE',
            '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment', '-addext', 'extendedKeyUsage=serverAuth',
            '-addext', 'subjectAltName=IP:127.0.0.1'];
        }
      }
      return spawnSync(program, args, options);
    };
    assert.throws(() => createTlsMaterial({ directory, runId, sourceSha, command }), /tls-(?:tool-openssl-failed|issued-certificate-contract)/);
    assert.equal(injected, true); assert.equal(existsSync(directory), false);
    assert.equal(existsSync(material.directory), true, 'other run material remains untouched');
  });
}

for (const stage of ['openssl', 'nss-create', 'nss-list']) test('preflight: falha de ' + stage + ' remove somente seu diretório novo', () => {
  const directory = path.join(parent, 'preflight-' + stage);
  const calls = [];
  assert.throws(() => preflightTlsTools({ directory, command: (program, args) => {
    calls.push(program);
    const failed = stage === 'openssl' ? program === 'openssl' : program === 'certutil' && args[0] === (stage === 'nss-create' ? '-N' : '-L');
    return { status: failed ? 1 : 0, stdout: program === 'openssl' ? 'OpenSSL 3.0.13' : '' };
  } }));
  assert.equal(existsSync(directory), false); assert.equal(existsSync(material.directory), true);
  assert.equal(calls[0], 'openssl');
});

test('falha de emissão não conserva chave ou certificado parcial', () => {
  const directory = path.join(parent, 'failed-material');
  assert.throws(() => createTlsMaterial({ directory, runId, sourceSha, command: () => ({ status: 1 }) }));
  assert.equal(existsSync(directory), false);
});
test('um destino existente é recusado sem remover conteúdo alheio', () => {
  const file = path.join(parent, 'sentinel'); writeFileSync(file, 'preserve');
  assert.throws(() => preflightTlsTools({ directory: parent, command }));
  assert.throws(() => createTlsMaterial({ directory: parent, runId, sourceSha, command }));
  assert.equal(readFileSync(file, 'utf8'), 'preserve');
});

const metadata = () => ({
  Config: { User: '1001:1001', Labels: { 'zapp.e2e.owner': runId, 'zapp.e2e.purpose': 'isolated-auth' } },
  State: { Running: true }, HostConfig: { NetworkMode: 'container:anchor', CapAdd: [] }, NetworkSettings: { Networks: {} },
  Mounts: tlsMounts(material, 'driver').map(mount => ({ Source: mount.source, Destination: mount.target, RW: !mount.readOnly })),
});
function trustOptions(patch = () => {}) {
  const calls = [];
  let reads = 0;
  return { calls, options: { material, runId, anchorId: 'anchor', driverName: runId + '-driver', runnerUser: '1001:1001',
    allowedWritableSources: new Set([material.homeDirectory]),
    inspect: () => { const value = metadata(); patch(value, reads++); return value; },
    docker: args => { calls.push(args); return { status: 0 }; },
  } };
}
test('trust é instalado só no driver possuído e revalidado entre comandos root', () => {
  const { calls, options } = trustOptions();
  assert.equal(installDriverTlsTrust(options).installed, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(args => args.slice(0, 5)), [
    ['exec', '--user', '0:0', runId + '-driver', 'install'],
    ['exec', '--user', '0:0', runId + '-driver', 'update-ca-certificates'],
  ]);
});
const badMetadata = [
  ['owner', value => { value.Config.Labels['zapp.e2e.owner'] = runId + '-foreign'; }],
  ['purpose', value => { value.Config.Labels['zapp.e2e.purpose'] = 'other'; }],
  ['user', value => { value.Config.User = '0:0'; }],
  ['stopped', value => { value.State.Running = false; }],
  ['host-network', value => { value.HostConfig.NetworkMode = 'host'; }],
  ['privileged', value => { value.HostConfig.Privileged = true; }],
  ['capability', value => { value.HostConfig.CapAdd.push('NET_ADMIN'); }],
  ['ca-writable', value => { value.Mounts[0].RW = true; }],
  ['home-source', value => { value.Mounts[1].Source = '/foreign'; }],
  ['private-key', value => { value.Mounts.push({ Source: material.privateDirectory, Destination: TLS_PRIVATE, RW: false }); }],
];
for (const [name, mutate] of badMetadata) for (const when of [0, 1]) test('trust interrompe ' + name + ' no checkpoint ' + when, () => {
  const { calls, options } = trustOptions((value, read) => { if (read >= when) mutate(value); });
  assert.throws(() => installDriverTlsTrust(options));
  assert.equal(calls.length, when);
});
test('falha de update-ca-certificates é bloqueante', () => {
  const { options } = trustOptions();
  options.docker = args => ({ status: args.includes('update-ca-certificates') ? 1 : 0 });
  assert.throws(() => installDriverTlsTrust(options), /driver-ca-update/);
});

test('contexto TLS exige CA explícita e loopback, sem env herdada de bypass', () => {
  assert.deepEqual(assertTlsClientContext(env, loopback), { runId, sourceSha });
  assert.deepEqual(tlsEnvironment(material, 'edge'), { DENO_TLS_CA_STORE: 'system', SSL_CERT_FILE: TLS_PUBLIC + '/ca.crt' });
});
for (const [name, patch] of Object.entries({
  'bypass-zero': { NODE_TLS_REJECT_UNAUTHORIZED: '0' }, 'node-options': { NODE_OPTIONS: '--require=/tmp/other.mjs' },
  'bun-options': { BUN_OPTIONS: 'other' }, proxy: { HTTPS_PROXY: 'http://127.0.0.1:8080' },
  'ca-missing': { NODE_EXTRA_CA_CERTS: undefined }, 'ca-foreign': { NODE_EXTRA_CA_CERTS: '/foreign' },
  'ssl-ca-foreign': { SSL_CERT_FILE: '/foreign' }, 'wrong-run': { ZAPP_E2E_RUN_ID: 'foreign' },
  'wrong-sha': { GITHUB_SHA: 'unknown' },
})) test('contexto recusa ' + name, () => assert.throws(() => assertTlsClientContext({ ...env, ...patch }, loopback)));
test('contexto recusa interface de saída mesmo com CA correta', () => assert.throws(() => assertTlsClientContext(env, {
  ...loopback, eth0: [{ internal: false, address: '10.0.0.2' }],
})));

const errorCases = [
  ['node', 'untrusted', 'DEPTH_ZERO_SELF_SIGNED_CERT', true], ['node', 'wrong_san', 'ERR_TLS_CERT_ALTNAME_INVALID', true],
  ['chromium', 'untrusted', 'net::ERR_CERT_AUTHORITY_INVALID', true], ['chromium', 'wrong_san', 'net::ERR_CERT_COMMON_NAME_INVALID', true],
  ['firefox', 'untrusted', 'SEC_ERROR_UNKNOWN_ISSUER', true], ['firefox', 'wrong_san', 'SSL_ERROR_BAD_CERT_DOMAIN', true],
  ['webkit', 'untrusted', 'Unacceptable TLS certificate', true], ['webkit', 'wrong_san', 'An SSL error has occurred and a secure connection to the server cannot be made.', true],
  ['node', 'wrong_san', 'DEPTH_ZERO_SELF_SIGNED_CERT', false], ['node', 'untrusted', 'ERR_TLS_CERT_ALTNAME_INVALID', false],
  ...['node', 'chromium', 'firefox', 'webkit'].flatMap(engine => ['ECONNREFUSED', 'Timeout 15000ms exceeded', 'Error: unrelated'].map(message => [engine, 'untrusted', message, false])),
];
for (const [engine, kind, message, expected] of errorCases) test('erro TLS ' + engine + ' ' + kind + ' ' + message, () => {
  assert.equal(certificateFailure(new Error(message), kind, engine), expected);
});

function clientFetch(patch = () => undefined) {
  return async (url, options) => {
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    const alternate = await patch(url);
    if (alternate !== undefined) return alternate;
    if (url.endsWith('/identity')) return goodResponse(identity);
    if (url.endsWith('.png')) return new Response(TLS_PNG, { headers: { 'content-type': 'image/png' } });
    throw certificateError(url.includes(':5175/') ? 'untrusted' : 'wrong_san');
  };
}
test('probe Node/Bun executa identidade, bytes de imagem e os dois negativos', async () => {
  assert.deepEqual(await probeClient({ runId, sourceSha, fetcher: clientFetch() }), checks);
});
for (const [name, patch] of [
  ['run', url => url.endsWith('/identity') ? goodResponse({ ...identity, run_id: runId + '-foreign' }) : undefined],
  ['source', url => url.endsWith('/identity') ? goodResponse({ ...identity, source_sha: 'b'.repeat(40) }) : undefined],
  ['origin', url => url.endsWith('/identity') ? goodResponse({ ...identity, origin: 'http://127.0.0.1:5173' }) : undefined],
  ['status', url => url.endsWith('/identity') ? goodResponse(identity, 503) : undefined],
  ['image-bytes', url => url.endsWith('.png') ? new Response('bad', { headers: { 'content-type': 'image/png' } }) : undefined],
  ['image-type', url => url.endsWith('.png') ? new Response(TLS_PNG) : undefined],
  ['untrusted-accepted', url => url.includes(':5175/') ? goodResponse(identity) : undefined],
  ['wrong-san-accepted', url => url.includes(':5176/') ? goodResponse(identity) : undefined],
  ['untrusted-network', url => { if (url.includes(':5175/')) throw new Error('ECONNREFUSED'); }],
  ['wrong-san-timeout', url => { if (url.includes(':5176/')) throw new Error('Timeout 10000ms exceeded'); }],
]) test('probe Node/Bun bloqueia ' + name, async () => {
  await assert.rejects(probeClient({ runId, sourceSha, fetcher: clientFetch(patch) }));
});

function browserFixture(fault, affected = 'chromium', negativeOverride) {
  const closed = [], launched = [];
  const engines = Object.fromEntries(['chromium', 'firefox', 'webkit'].map(engine => [engine, { launch: async options => {
    assert.deepEqual(Object.keys(options).sort(), ['env', 'headless']);
    assert.equal(options.headless, true); assert.equal(options.env.SERVICE_ROLE_KEY, undefined);
    launched.push(engine);
    return { close: async () => closed.push(engine), newContext: async options => {
      assert.deepEqual(options, { ignoreHTTPSErrors: false });
      if (fault === 'context' && engine === affected) throw new Error('context failed');
      return { close: async () => closed.push(engine + '-context'), newPage: async () => {
        const page = new EventEmitter(), frame = {};
        let currentUrl = 'about:blank';
        return Object.assign(page, {
        mainFrame: () => frame,
        url: () => currentUrl,
        close: async () => {},
        evaluate: async () => ({ identity: fault === 'identity' && engine === affected ? { ...identity, source_sha: 'b'.repeat(40) } : identity,
          image: !(fault === 'image' && engine === affected) }),
        goto: async url => {
          if (url.startsWith(TLS_ORIGIN)) {
            currentUrl = url;
            return { status: () => fault === 'positive-status' && engine === affected ? 503 : 200, json: async () => identity };
          }
          const reject = failure => {
            const request = { url: () => url, method: () => 'GET', resourceType: () => 'document',
              isNavigationRequest: () => true, frame: () => frame, failure: () => ({ errorText: failure.message }) };
            page.emit('request', request); page.emit('requestfailed', request);
            throw failure;
          };
          if (engine === affected && negativeOverride) { const failure = negativeOverride(url); if (failure) reject(failure); }
          if (engine === affected && fault === 'accepted') return { status: () => 200 };
          if (engine === affected && fault === 'timeout') reject(new Error('Timeout 15000ms exceeded'));
          if (engine === 'webkit') reject(new Error('Unacceptable TLS certificate'));
          reject(certificateError(url.includes(':5175/') ? 'untrusted' : 'wrong_san'));
        },
      }); } };
    } };
  } }]));
  const environment = input => ({ HOME: input.HOME, PLAYWRIGHT_FIREFOX_POLICIES_JSON: input.PLAYWRIGHT_FIREFOX_POLICIES_JSON });
  return { engines, environment, closed, launched, diagnostic: () => {} };
}
test('gate navegador exige as três engines e preserva TLS estrito/ambiente filtrado', async () => {
  const fixture = browserFixture();
  assert.deepEqual(await probeBrowsers({ runId, sourceSha, env: { ...env, SERVICE_ROLE_KEY: 'never-pass-to-browser' }, ...fixture }), {
    chromium: checks, firefox: checks, webkit: checks,
  });
  assert.deepEqual(fixture.launched, ['chromium', 'firefox', 'webkit']);
  assert.equal(fixture.closed.length, 6);
});
for (const engine of ['chromium', 'firefox', 'webkit']) for (const fault of ['context', 'identity', 'image', 'positive-status', 'accepted', 'timeout']) {
  test('gate navegador fecha recursos e bloqueia ' + engine + '/' + fault, async () => {
    const fixture = browserFixture(fault, engine);
    await assert.rejects(probeBrowsers({ runId, sourceSha, env, ...fixture }));
    assert.ok(fixture.closed.includes(engine));
    assert.equal(fixture.launched.at(-1), engine);
  });
}
test('gate recusa um filtro de browser que descarta a política Firefox', async () => {
  await assert.rejects(probeBrowsers({ runId, sourceSha, env, ...browserFixture(), environment: () => ({ HOME: env.HOME }) }), /browser-trust-environment/);
});
test('gate navegador integra o filtro real compartilhado com a suíte Playwright', async () => {
  const fixture = browserFixture();
  delete fixture.environment;
  assert.deepEqual(await probeBrowsers({ runId, sourceSha, env: { ...env, SERVICE_ROLE_KEY: 'never-in-browser' }, ...fixture }), {
    chromium: checks, firefox: checks, webkit: checks,
  });
});

test('cliente confere resultado Edge de mesma origem/run/SHA e todos os checks', async () => {
  assert.deepEqual(await probeEdge({ runId, sourceSha, fetcher: async url => {
    assert.equal(url, 'http://127.0.0.1:9000/__e2e/tls'); return goodResponse({ ...identity, runtime: 'edge', checks });
  } }), checks);
});
for (const field of Object.keys(checks)) test('cliente bloqueia prova Edge incompleta: ' + field, async () => {
  await assert.rejects(probeEdge({ runId, sourceSha, fetcher: async () => goodResponse({ ...identity, runtime: 'edge', checks: { ...checks, [field]: false } }) }));
});

const edgeSource = stripTypeScriptTypes(readFileSync(new URL('../e2e-isolated/tls-edge-probe.ts', import.meta.url), 'utf8'));
function edgeHandler(patch = () => undefined, envPatch = {}) {
  let handler;
  const values = { ZAPP_E2E_RUN_ID: runId, GITHUB_SHA: sourceSha, DENO_TLS_CA_STORE: 'system', SSL_CERT_FILE: TLS_PUBLIC + '/ca.crt', ...envPatch };
  vm.runInNewContext(edgeSource, { Deno: { env: { get: key => values[key] }, serve: (options, fn) => { assert.equal(options.hostname, '127.0.0.1'); handler = fn; } },
    URL, Request, Response, Error, Uint8Array, atob, AbortSignal,
    fetch: clientFetch(async url => {
      const value = await patch(url); if (value !== undefined) return value;
      if (url.includes(':5175/') || url.includes(':5176/')) throw new Error('invalid peer certificate: ' + (url.includes(':5175/') ? 'UnknownIssuer' : 'NotValidForName'));
    }),
  });
  return handler;
}
test('callback real Edge executa fetch válido/imagem/CA/SAN com doubles de transporte', async () => {
  const response = await edgeHandler()(new Request('http://127.0.0.1:9000/__e2e/tls'));
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).checks, checks);
});
test('readiness do Edge aguarda somente boot e não executa o gate TLS antecipadamente', async () => {
  let fetches = 0;
  const response = await edgeHandler(() => { fetches++; throw new Error('must-not-fetch'); })(new Request('http://127.0.0.1:9000/__e2e/ready'));
  assert.equal(response.status, 200); assert.equal((await response.json()).ready, true); assert.equal(fetches, 0);
});
for (const [name, patch] of [
  ['accepted-CA', url => url.includes(':5175/') ? goodResponse(identity) : undefined],
  ['accepted-SAN', url => url.includes(':5176/') ? goodResponse(identity) : undefined],
  ['connection-refused', url => { if (url.includes(':5175/')) throw new Error('connection refused'); }],
  ['timeout', url => { if (url.includes(':5176/')) throw new Error('operation timed out'); }],
  ['wrong-run', url => url.endsWith('/identity') ? goodResponse({ ...identity, run_id: 'foreign' }) : undefined],
  ['image-bytes', url => url.endsWith('.png') ? new Response('bad', { headers: { 'content-type': 'image/png' } }) : undefined],
]) test('callback real Edge bloqueia ' + name, async () => {
  const response = await edgeHandler(patch)(new Request('http://127.0.0.1:9000/__e2e/tls'));
  assert.equal(response.status, 503);
});
for (const patch of [{ DENO_TLS_CA_STORE: 'mozilla' }, { SSL_CERT_FILE: '/foreign' }, { SUPABASE_SERVICE_ROLE_KEY: 'synthetic-but-not-needed' }, { JWT_SECRET: 'unneeded' }]) {
  test('Edge probe recusa ambiente ' + Object.keys(patch).join(), () => assert.throws(() => edgeHandler(undefined, patch)));
}

test('gateway lê chaves somente com manifesto válido, namespace fechado e origem TLS', () => {
  const tls = readGatewayTls({ env, publicDirectory: material.publicDirectory, privateDirectory: material.privateDirectory, interfaces: loopback });
  assert.equal(fp(tls.server.cert), fp(bytes('server.crt'))); assert.equal(tls.server.minVersion, 'TLSv1.2');
  assert.throws(() => readGatewayTls({ env: { ...env, GITHUB_SHA: 'b'.repeat(40) }, publicDirectory: material.publicDirectory,
    privateDirectory: '/must-not-be-read', interfaces: loopback }), /gateway-manifest/);
  assert.throws(() => readGatewayTls({ env, publicDirectory: material.publicDirectory, privateDirectory: material.privateDirectory,
    interfaces: loopback, now: Date.now() + 2 * 86_400_000 }), /gateway-manifest/);
});
test('rota de probe serve mídia local real e não captura rotas de aplicação', () => {
  const calls = [];
  const res = { writeHead: (...args) => calls.push(args), end: body => calls.push(body) };
  assert.equal(serveTlsProbe({ url: '/__e2e/tls-probe.png', method: 'GET' }, res, identity), true);
  assert.deepEqual(calls[1], TLS_PNG);
  assert.equal(serveTlsProbe({ url: '/storage/v1/object', method: 'GET' }, res, identity), false);
});

// Preserve an unclassified negative navigation error as the cause; do not
// accept unknown errors or turn transport failures into certificate proof.
for (const engine of ['chromium', 'firefox', 'webkit']) for (const kind of ['untrusted', 'wrong_san']) {
  for (const message of ['ECONNREFUSED', 'ETIMEDOUT', 'NS_BINDING_ABORTED',
    'MOZILLA_PKIX_ERROR_SELF_SIGNED_CERT', 'SEC_ERROR_UNTRUSTED_ISSUER', 'unrecognized synthetic navigation failure']) {
    test('TLS negative diagnostic: ' + engine + '/' + kind + '/' + message, async () => {
      const original = new Error(message);
      const fixture = browserFixture(undefined, engine, url => url.includes(kind === 'untrusted' ? ':5175/' : ':5176/') ? original : null);
      let failure;
      try { await probeBrowsers({ runId, sourceSha, env, ...fixture }); } catch (error) { failure = error; }
      assert.match(failure?.message ?? '', new RegExp('tls-browser-' + engine + '-' + kind + '-not-certificate-error'));
      assert.equal(failure.cause, original, 'retain exact native cause without approving it');
      assert.ok(fixture.closed.includes(engine));
    });
  }
}

// Events are controlled; the production probe and its acceptance decisions run unchanged.
const tlsDiagnosticCases = [
  { name: 'failure-before-rejection' },
  { name: 'failure-microtask', delivery: 'microtask' },
  { name: 'failure-after-1ms', delay: 1 },
  { name: 'failure-after-999ms', delay: 999 },
  { name: 'failure-after-deadline', delay: 1001, failures: 0 },
  { name: 'request-without-terminal', delivery: 'none', failures: 0 },
  { name: 'no-network-event', delivery: 'none', noRequest: true, requests: 0, failures: 0 },
  { name: 'failure-from-teardown-only', delivery: 'close', failures: 0 },
  ...[
    ['other-origin', { url: 'https://localhost:5175/__e2e/tls-control' }],
    ['query', { suffix: '?synthetic=1' }],
    ['other-port', { url: 'https://127.0.0.1:5176/__e2e/tls-control' }],
    ['other-path', { suffix: '/other' }],
    ['child-frame', { otherFrame: true }],
    ['not-navigation', { navigation: false }],
    ['post', { method: 'POST' }],
    ['options', { method: 'OPTIONS' }],
    ['image', { resource: 'image' }],
    ['unavailable-frame', { frameThrows: true }],
    ['same-url-fetch', { navigation: false, resource: 'fetch' }],
    ['fragment', { suffix: '#other' }],
  ].map(([name, request]) => ({ name: 'reject-unrelated-' + name, request, requests: 0, failures: 0, ignored: 2 })),
  { name: 'response-200-then-failure', status: 200 },
  { name: 'response-503-then-failure', status: 503 },
  { name: 'response-without-terminal', status: 200, delivery: 'none', failures: 0 },
  { name: 'response-then-finished', status: 503, delivery: 'finished', failures: 0, finished: 1 },
  { name: 'two-exact-requests', duplicateRequest: true, requests: 2, failures: 2 },
  { name: 'duplicate-failure-event', duplicateFailure: true, failures: 2 },
  { name: 'failure-null', failureValue: null, errorText: null },
  { name: 'failure-object-without-text', failureValue: {}, errorText: null },
  ...['chromium', 'firefox', 'webkit'].flatMap(engine => ['untrusted', 'wrong_san'].map(kind => ({
    name: 'preserve-recognized-' + engine + '-' + kind, engine, kind, recognized: true,
  }))),
  { name: 'generic-cancel-remains-failure', gotoMessage: 'Operation was cancelled; maybe frame was detached?' },
  { name: 'unknown-SSL-remains-failure', gotoMessage: 'SSL_ERROR_UNKNOWN' },
  { name: 'redact-https-query', text: 'Certificate rejected https://127.0.0.1:5175/path?token=private', errorText: 'Certificate rejected [url]' },
  { name: 'redact-http-url', text: 'Certificate rejected http://local.invalid/path', errorText: 'Certificate rejected [url]' },
  { name: 'redact-wss-url', text: 'Certificate rejected wss://local.invalid/path', errorText: 'Certificate rejected [url]' },
  { name: 'redact-bare-query', text: 'Certificate rejected ?token=private', errorText: 'Certificate rejected [query]' },
  { name: 'redact-source-sha', text: 'Certificate rejected ' + sourceSha, errorText: 'Certificate rejected [source]' },
  { name: 'redact-run-id', text: 'Certificate rejected ' + runId, errorText: 'Certificate rejected [run]' },
  { name: 'redact-uuid', text: 'Certificate rejected 12ab1234-1234-1234-1234-123412341234', errorText: 'Certificate rejected [id]' },
  { name: 'redact-jwt', text: 'Certificate rejected eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c3ludGhldGlj', errorText: 'Certificate rejected [JWT REDACTED]' },
  { name: 'bounded-error-text', text: 's'.repeat(513), errorText: '[error-text-too-long]' },
  { name: 'no-log-line-injection', text: 'Certificate\nrejected\r\n', errorText: 'Certificate rejected' },
  { name: 'no-control-byte-injection', text: 'Certificate\u0000rejected', errorText: 'Certificate rejected' },
  { name: 'unrelated-error-not-recorded', request: { otherFrame: true }, text: 'unrelated-private-value', requests: 0, failures: 0, ignored: 2 },
];
assert.equal(tlsDiagnosticCases.length, 48);

function tlsDiagnosticFixture(spec) {
  const records = [], order = [], pages = [];
  const engineName = spec.engine ?? 'webkit', kind = spec.kind ?? 'untrusted';
  const nativeMessage = engine => engine === 'webkit' ? 'Unacceptable TLS certificate' : 'ERR_CERT_AUTHORITY_INVALID';
  const original = new Error(spec.recognized
    ? (engineName === 'webkit' ? nativeMessage(engineName) : kind === 'untrusted' ? 'ERR_CERT_AUTHORITY_INVALID' : 'ERR_CERT_COMMON_NAME_INVALID')
    : spec.gotoMessage ?? 'Operation was cancelled; maybe frame was detached?');
  const engines = Object.fromEntries(['chromium', 'firefox', 'webkit'].map(engine => [engine, { launch: async () => ({
    close: async () => order.push('browser-close-' + engine),
    newContext: async options => {
      assert.deepEqual(options, { ignoreHTTPSErrors: false });
      return {
        close: async () => order.push('context-close-' + engine),
        newPage: async () => {
          const page = new EventEmitter(), frame = {}, otherFrame = {};
          pages.push(page); page.mainFrame = () => frame;
          let currentUrl = 'about:blank';
          page.url = () => currentUrl;
          page.evaluate = async () => ({ identity, image: true });
          let request, target = false;
          page.close = async () => { order.push(target ? 'target-close' : 'page-close'); if (target && spec.delivery === 'close') page.emit('requestfailed', request); };
          page.goto = async (url, options) => {
            assert.deepEqual(options, { waitUntil: 'load', timeout: 15_000 });
            if ([TLS_ORIGIN + '/__e2e/tls-probe', TLS_ORIGIN + '/__e2e/identity'].includes(url)) {
              currentUrl = url;
              return { status: () => 200, json: async () => identity };
            }
            target = engine === engineName && url.includes(kind === 'untrusted' ? ':5175/' : ':5176/');
            const change = target ? spec.request ?? {} : {};
            const errorText = target ? spec.text ?? 'TLS certificate is not trusted' : nativeMessage(engine);
            const makeRequest = () => ({
              url: () => change.url ?? url + (change.suffix ?? ''),
              method: () => change.method ?? 'GET', resourceType: () => change.resource ?? 'document',
              isNavigationRequest: () => change.navigation ?? true,
              frame: () => { if (change.frameThrows) throw new Error('frame unavailable'); return change.otherFrame ? otherFrame : frame; },
              failure: () => target && Object.hasOwn(spec, 'failureValue') ? spec.failureValue : { errorText },
            });
            request = makeRequest();
            if (!(target && spec.noRequest)) page.emit('request', request);
            if (target && spec.status) page.emit('response', { request: () => request, status: () => spec.status });
            const emit = () => {
              if (target && spec.delivery === 'finished') { page.emit('requestfinished', request); return; }
              page.emit('requestfailed', request);
              if (target && spec.duplicateFailure) page.emit('requestfailed', request);
              if (target && spec.duplicateRequest) { const second = makeRequest(); page.emit('request', second); page.emit('requestfailed', second); }
            };
            if (!target) emit();
            else if (spec.delay !== undefined) setTimeout(emit, spec.delay);
            else if (spec.delivery === 'microtask') queueMicrotask(emit);
            else if (!['none', 'close'].includes(spec.delivery)) emit();
            if (target) { order.push('target-reject'); throw original; }
            throw new Error(engine === 'webkit' ? nativeMessage(engine) : url.includes(':5175/') ? 'ERR_CERT_AUTHORITY_INVALID' : 'ERR_CERT_COMMON_NAME_INVALID');
          };
          return page;
        },
      };
    },
  }) }]));
  return { engines, original, records, order, pages, engineName, kind,
    diagnostic: record => { order.push('diagnostic-' + record.engine + '-' + record.kind); records.push(structuredClone(record)); },
  };
}

for (const spec of tlsDiagnosticCases) test('TLS request diagnostic: ' + spec.name, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixture = tlsDiagnosticFixture(spec);
  let completed = false;
  const execution = probeBrowsers({ runId, sourceSha, env, engines: fixture.engines, environment: value => value, diagnostic: fixture.diagnostic })
    .then(value => ({ value }), error => ({ error })).then(value => { completed = true; return value; });
  // Flush promises, then advance the actual bounded timer. No browser I/O occurs.
  for (let i = 0; i < 80; i++) await Promise.resolve();
  if (spec.delay !== undefined && spec.delay <= 999) { t.mock.timers.tick(spec.delay); for (let i = 0; i < 80; i++) await Promise.resolve(); }
  t.mock.timers.tick(1000);
  for (let i = 0; i < 80; i++) await Promise.resolve();
  assert.equal(completed, true, 'diagnostics never waits beyond its one-second bound');
  const outcome = await execution;
  if (spec.recognized) assert.ok(outcome.value);
  else { assert.match(outcome.error?.message ?? '', /not-certificate-error/); assert.equal(outcome.error.cause, fixture.original); }
  const record = fixture.records.find(record => record.engine === fixture.engineName && record.kind === fixture.kind);
  assert.ok(record, 'the native probe emits a separate request diagnostic');
  assert.deepEqual(Object.keys(record).sort(), ['engine', 'kind', 'request_count', 'request_failed_count', 'request_finished_count', 'response_count', 'ignored_event_count', 'response_statuses', 'failure_error_texts'].sort());
  assert.equal(record.request_count, spec.requests ?? 1);
  assert.equal(record.request_failed_count, spec.failures ?? 1);
  assert.equal(record.request_finished_count, spec.finished ?? 0);
  assert.equal(record.response_count, spec.status ? 1 : 0);
  assert.deepEqual(record.response_statuses, spec.status ? [spec.status] : []);
  assert.equal(record.ignored_event_count, spec.ignored ?? 0);
  assert.deepEqual(record.failure_error_texts, Array.from({ length: spec.failures ?? 1 }, () => Object.hasOwn(spec, 'errorText') ? spec.errorText : spec.text ?? 'TLS certificate is not trusted'));
  assert.ok(fixture.order.indexOf('diagnostic-' + fixture.engineName + '-' + fixture.kind) < fixture.order.indexOf('target-close'));
  const snapshot = JSON.stringify(fixture.records);
  t.mock.timers.tick(2000); for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(JSON.stringify(fixture.records), snapshot, 'late/teardown events cannot change the captured evidence');
  assert.ok(fixture.pages.every(page => ['request', 'requestfailed', 'response', 'requestfinished'].every(event => page.listenerCount(event) === 0)));
});

test('TLS request diagnostic: both existing redactors preserve evidence and remove synthetic secrets', async () => {
  const firstSecret = 'synthetic-controller-password', secondSecret = 'synthetic-publication-password';
  const fixture = tlsDiagnosticFixture({ text: 'TLS certificate is not trusted ' + firstSecret + ' ' + secondSecret });
  await assert.rejects(probeBrowsers({ runId, sourceSha, env, engines: fixture.engines,
    environment: value => value, diagnostic: fixture.diagnostic }), /not-certificate-error/);
  const source = readFileSync(new URL('../e2e-isolated/run.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('  const redacted = value => {'), end = source.indexOf('\n  const waitFor =', start);
  assert.ok(start > 0 && end > start);
  const firstRedactor = vm.runInNewContext(source.slice(start, end) + '\nredacted;', { credentials: { password: firstSecret } });
  const intermediate = firstRedactor(fixture.records.map(record => JSON.stringify(record)).join('\n'));
  assert.ok(!intermediate.includes(firstSecret)); assert.ok(intermediate.includes(secondSecret));
  const directory = path.join(parent, 'request-diagnostic-public'); mkdirSync(directory);
  const log = path.join(directory, 'tls-browsers-gate.log'); writeFileSync(log, intermediate);
  const result = spawnSync(process.execPath, [new URL('./redigir-relatorio.mjs', import.meta.url).pathname,
    directory, '--segredo-env=TLS_TEST_SECRET'], { encoding: 'utf8', env: { PATH: process.env.PATH, TLS_TEST_SECRET: secondSecret } });
  assert.equal(result.status, 0, result.stderr);
  const published = readFileSync(log, 'utf8');
  assert.ok(!published.includes(firstSecret)); assert.ok(!published.includes(secondSecret));
  assert.match(published, /TLS certificate is not trusted/); assert.match(published, /request_failed_count/);
});

// These controlled lifecycles test the contract, not a native WebKit race.
const tlsWarmupTargets = ['chromium', 'firefox', 'webkit'].flatMap(engine => ['untrusted', 'wrong_san'].map(kind => ({ engine, kind })));
const tlsWarmupCases = [
  ...tlsWarmupTargets.map(target => ({ ...target, name: 'valid/' + target.engine + '/' + target.kind })),
  ...tlsWarmupTargets.map(target => ({ ...target, name: 'generic-stays-rejected/' + target.engine + '/' + target.kind, negative: 'cancelled' })),
  ...tlsWarmupTargets.map(target => ({ ...target, name: 'invalid-certificate-accepted/' + target.engine + '/' + target.kind, negative: 'accepted' })),
  ...['Timeout 15000ms exceeded', 'ECONNREFUSED', 'Unacceptable TLS certificate', 'Frame was detached', 'Operation was cancelled', 'Target page has been closed']
    .map((message, index) => ({ ...tlsWarmupTargets[index], name: 'warmup-goto-error/' + index, warmupError: message })),
  ...[null, 204, 302, 401, 404, 500].map((status, index) => ({ ...tlsWarmupTargets[index], name: 'warmup-status/' + status, status })),
  ...[
    ['schema', { ...identity, schema: 2 }], ['run', { ...identity, run_id: runId + '-foreign' }],
    ['source', { ...identity, source_sha: 'b'.repeat(40) }], ['origin', { ...identity, origin: 'http://127.0.0.1:5173' }],
    ['missing', {}], ['invalid-json', null],
  ].map(([name, body], index) => ({ ...tlsWarmupTargets[index], name: 'warmup-identity/' + name, body })),
  ...[
    ['no-document-commit', 'about:blank'], ['http', 'http://127.0.0.1:5173/__e2e/identity'],
    ['other-host', 'https://localhost:5173/__e2e/identity'], ['other-port', 'https://127.0.0.1:5175/__e2e/identity'],
    ['other-path', TLS_ORIGIN + '/__e2e/other'], ['query', TLS_ORIGIN + '/__e2e/identity?other=1'],
  ].map(([name, url], index) => ({ ...tlsWarmupTargets[index], name: 'warmup-lifecycle/' + name, finalUrl: url })),
];
assert.equal(tlsWarmupCases.length, 42);

function tlsWarmupFixture(spec) {
  const pages = [], diagnostics = [], closed = [];
  const original = new Error('Operation was cancelled; maybe frame was detached?');
  const warmupError = spec.warmupError ? new Error(spec.warmupError) : null;
  const engines = Object.fromEntries(['chromium', 'firefox', 'webkit'].map(engine => [engine, { launch: async () => ({
    close: async () => closed.push(engine),
    newContext: async options => {
      assert.deepEqual(options, { ignoreHTTPSErrors: false });
      let number = 0;
      return { close: async () => closed.push(engine + '-context'), newPage: async () => {
        const role = ['positive', 'untrusted', 'wrong_san'][number++], page = new EventEmitter(), frame = {};
        const record = { engine, role, warmups: 0, jsonReads: 0, negativeAttempts: 0, beforeIdentity: false,
          listenersAtWarmup: [], closed: false, url: 'about:blank', committed: false, identityCompleted: false, warmupEvents: 0 };
        pages.push(record);
        const target = engine === spec.engine && role === spec.kind;
        page.mainFrame = () => frame; page.url = () => record.url;
        page.close = async () => { record.closed = true; };
        page.evaluate = async () => ({ identity, image: true });
        page.goto = async (url, options) => {
          assert.deepEqual(options, { waitUntil: 'load', timeout: 15_000 });
          if (role === 'positive') { assert.equal(url, TLS_ORIGIN + '/__e2e/tls-probe'); record.url = url; return { status: () => 200 }; }
          const request = { url: () => url, method: () => 'GET', resourceType: () => 'document',
            isNavigationRequest: () => true, frame: () => frame, failure: () => ({ errorText: target && spec.negative === 'cancelled'
              ? 'Operation was cancelled' : engine === 'webkit' ? 'Unacceptable TLS certificate' : role === 'untrusted' ? 'ERR_CERT_AUTHORITY_INVALID' : 'ERR_CERT_COMMON_NAME_INVALID' }) };
          if (url === TLS_ORIGIN + '/__e2e/identity') {
            record.warmups++;
            record.listenersAtWarmup.push(['request', 'requestfailed', 'response', 'requestfinished'].reduce((n, event) => n + page.listenerCount(event), 0));
            if (target && warmupError) throw warmupError;
            record.url = target && spec.finalUrl ? spec.finalUrl : url;
            record.committed = record.url !== 'about:blank';
            const status = target && Object.hasOwn(spec, 'status') ? spec.status : 200;
            if (status === null) return null;
            const response = { request: () => request, status: () => status, json: async () => {
              record.jsonReads++;
              // Deliberately asynchronous so advancing without reading identity is observable.
              await Promise.resolve();
              record.identityCompleted = true;
              if (target && Object.hasOwn(spec, 'body')) {
                if (spec.body === null) throw new SyntaxError('controlled invalid JSON');
                return spec.body;
              }
              return identity;
            } };
            page.emit('request', request); page.emit('response', response); page.emit('requestfinished', request);
            record.warmupEvents += 3;
            return response;
          }
          assert.equal(url, 'https://127.0.0.1:' + (role === 'untrusted' ? '5175' : '5176') + '/__e2e/tls-control');
          record.negativeAttempts++;
          record.beforeIdentity ||= record.warmups !== 1 || record.jsonReads !== 1 || !record.identityCompleted || !record.committed;
          page.emit('request', request);
          if (target && spec.negative === 'accepted') {
            const response = { request: () => request, status: () => 200 };
            page.emit('response', response); page.emit('requestfinished', request); return response;
          }
          page.emit('requestfailed', request);
          if (target && spec.negative === 'cancelled') throw original;
          throw new Error(request.failure().errorText);
        };
        return page;
      } };
    },
  }) }]));
  return { engines, pages, diagnostics, closed, original, warmupError,
    diagnostic: record => diagnostics.push(structuredClone(record)) };
}

for (const spec of tlsWarmupCases) test('TLS same-page warmup: ' + spec.name, async () => {
  const fixture = tlsWarmupFixture(spec);
  let failure, checks;
  try { checks = await probeBrowsers({ runId, sourceSha, env, engines: fixture.engines,
    environment: value => value, diagnostic: fixture.diagnostic }); } catch (error) { failure = error; }
  const target = fixture.pages.find(page => page.engine === spec.engine && page.role === spec.kind);
  assert.ok(target);
  assert.equal(target.warmups, 1, 'each negative page must load its own valid HTTPS document first');
  const badWarmup = spec.warmupError || Object.hasOwn(spec, 'status') || Object.hasOwn(spec, 'body') || spec.finalUrl;
  if (badWarmup) {
    assert.ok(failure); assert.equal(target.negativeAttempts, 0, 'failed warmup cannot reach the negative control');
    assert.equal(fixture.diagnostics.some(record => record.engine === spec.engine && record.kind === spec.kind), false);
    if (spec.warmupError) assert.equal(failure, fixture.warmupError);
  } else if (spec.negative) {
    assert.match(failure?.message ?? '', new RegExp(spec.negative === 'accepted' ? '-accepted' : '-not-certificate-error'));
    assert.equal(target.negativeAttempts, 1, 'no negative retry');
    if (spec.negative === 'cancelled') assert.equal(failure.cause, fixture.original);
  } else {
    assert.equal(failure, undefined); assert.equal(Object.keys(checks).length, 3);
    assert.equal(fixture.pages.filter(page => page.role !== 'positive').length, 6);
    for (const record of fixture.diagnostics) {
      assert.equal(record.request_count, 1); assert.equal(record.request_failed_count, 1);
      assert.equal(record.response_count, 0); assert.equal(record.request_finished_count, 0);
      assert.equal(record.ignored_event_count, 0, 'warmup events precede diagnostic observation');
    }
  }
  for (const page of fixture.pages.filter(page => page.role !== 'positive')) {
    assert.equal(page.warmups, 1); assert.deepEqual(page.listenersAtWarmup, [0]);
    assert.equal(page.beforeIdentity, false); assert.ok(page.negativeAttempts <= 1); assert.equal(page.closed, true);
  }
  assert.ok(fixture.pages.every(page => page.closed), 'all pages close, including failed warmups');
  assert.ok(fixture.closed.includes(spec.engine)); assert.ok(fixture.closed.includes(spec.engine + '-context'));
});
