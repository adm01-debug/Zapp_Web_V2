import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { rootCertificates } from 'node:tls';
import { compilationProxyConfiguration, prepareCompilationNetwork } from '../e2e-isolated/compilation-network.mjs';

const PROXY = 'http://192.0.2.1:8080';
const PRIVATE_PROXY = 'https://fixture-user:synthetic-proxy-secret@192.0.2.1:8443';
const source = proxies => ({ proxies: { default: proxies } });

for (const [name, config, expected] of [
  ['sem proxy', {}, {}], ['somente auths', { auths: { fixture: { auth: 'synthetic-registry-secret' } } }, {}],
  ['default vazio', source({}), {}], ['somente bypass', source({ noProxy: 'localhost' }), {}],
  ['http', source({ httpProxy: PROXY }), { httpProxy: PROXY }],
  ['https autenticado', source({ httpsProxy: PRIVATE_PROXY }), { httpsProxy: PRIVATE_PROXY }],
  ['ambos e bypass', source({ httpProxy: PROXY, httpsProxy: PROXY, noProxy: 'localhost,127.0.0.1' }), { httpProxy: PROXY, httpsProxy: PROXY, noProxy: 'localhost,127.0.0.1' }],
  ['nao importa identidades ou outros protocolos', { ...source({ httpsProxy: PROXY, ftpProxy: PROXY, allProxy: PROXY }), auths: { fixture: { auth: 'synthetic-registry-secret' } }, credsStore: 'foreign', credHelpers: { fixture: 'foreign' }, currentContext: 'foreign' }, { httpsProxy: PROXY }],
]) test('compilador: projeção ' + name, () => assert.deepEqual(compilationProxyConfiguration(config), expected));

const invalid = [null, true, [], { proxies: [] }, { proxies: null }, { proxies: true }, { proxies: 'invalid' },
  { proxies: { default: [] } }, { proxies: { default: null } },
  ...[5, true, [], {}, PROXY + '\n', PROXY + '\r', PROXY + '\0', 'x'.repeat(16385),
    'invalid', 'ftp://192.0.2.1', 'socks5://192.0.2.1', PROXY + '?secret=synthetic-secret', PROXY + '#fragment',
    PROXY + '/unexpected-path', ' ' + PROXY].map(value => source({ httpsProxy: value })),
  source({ httpsProxy: PROXY, noProxy: [] }), source({ httpsProxy: PROXY, noProxy: 'localhost\nINJECT=secret' }),
];
for (let i = 0; i < invalid.length; i++) test('compilador: entrada inválida ' + i + ' falha sem ecoar valores', () => {
  assert.throws(() => compilationProxyConfiguration(invalid[i]), error => /^compiler-proxy-[a-z-]+$/.test(error.message));
});

function fixture(t, config) {
  const root = mkdtempSync(path.join(tmpdir(), 'compilation-network-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const original = path.join(root, '.docker');
  mkdirSync(original);
  if (config !== undefined) writeFileSync(path.join(original, 'config.json'), typeof config === 'string' ? config : JSON.stringify(config));
  const directory = path.join(root, 'compiler');
  return { root, original, directory };
}

test('compilador: ausência de config conserva transporte direto sem ler CA inválida', t => {
  const f = fixture(t);
  const result = prepareCompilationNetwork({ directory: f.directory, homeDirectory: f.root, environment: { SSL_CERT_FILE: '/missing', HTTP_PROXY: PROXY } });
  assert.deepEqual(result, { args: [], proxyConfigured: false, caMounted: false });
  assert.deepEqual(JSON.parse(readFileSync(path.join(f.directory, 'config.json'))), {});
});

test('compilador: autenticação de rede fica só no config privado e não importa credenciais de registro', t => {
  const config = { ...source({ httpsProxy: PRIVATE_PROXY }), auths: { fixture: { auth: 'synthetic-registry-secret' } }, credsStore: 'foreign' };
  const f = fixture(t, config);
  const before = readFileSync(path.join(f.original, 'config.json'), 'utf8');
  const result = prepareCompilationNetwork({ directory: f.directory, environment: { DOCKER_CONFIG: f.original } });
  const output = path.join(f.directory, 'config.json');
  assert.deepEqual(JSON.parse(readFileSync(output)), source({ httpsProxy: PRIVATE_PROXY }));
  assert.equal(statSync(output).mode & 0o777, 0o600);
  assert.equal(statSync(f.directory).mode & 0o777, 0o700);
  assert.equal(readFileSync(path.join(f.original, 'config.json'), 'utf8'), before);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-proxy-secret|fixture-user|synthetic-registry-secret|192\.0\.2/);
});

for (const input of ['{', 'null', '[]', '{"proxies":true}']) test('compilador: config existente malformado reprova ' + input, t => {
  const f = fixture(t, input);
  assert.throws(() => prepareCompilationNetwork({ directory: f.directory, environment: { DOCKER_CONFIG: f.original } }), /^Error: compiler-proxy-config-invalid$/);
});

const CA = rootCertificates[0];

for (const binding of ['SSL_CERT_FILE', 'CODEX_PROXY_CERT']) test('compilador: CA pública em snapshot RO por ' + binding, t => {
  const f = fixture(t, source({ httpsProxy: PROXY }));
  const originalCa = path.join(f.root, 'source-ca.crt');
  writeFileSync(originalCa, CA);
  const result = prepareCompilationNetwork({ directory: f.directory, environment: { DOCKER_CONFIG: f.original, [binding]: originalCa } });
  const snapshot = path.join(f.directory, 'proxy-ca.crt');
  assert.equal(readFileSync(snapshot, 'utf8'), CA);
  assert.deepEqual(result, { proxyConfigured: true, caMounted: true, args: [
    '--mount', 'type=bind,src=' + snapshot + ',dst=/run/zapp-e2e-compiler/ca.crt,readonly',
    '--env', 'DENO_TLS_CA_STORE=system', '--env', 'SSL_CERT_FILE=/run/zapp-e2e-compiler/ca.crt',
  ] });
  writeFileSync(originalCa, 'changed after preparation');
  assert.equal(readFileSync(snapshot, 'utf8'), CA, 'later source mutation does not replace validated public CA');
  assert.doesNotMatch(JSON.stringify(result), /NODE_TLS_REJECT_UNAUTHORIZED|insecure/);
});

test('compilador: bundle combinado de CA pública preserva seus certificados', t => {
  const f = fixture(t, source({ httpProxy: PROXY }));
  const ca = path.join(f.root, 'ca.crt');
  writeFileSync(ca, CA + '\n' + CA);
  prepareCompilationNetwork({ directory: f.directory, environment: { DOCKER_CONFIG: f.original, SSL_CERT_FILE: ca } });
  assert.equal(readFileSync(path.join(f.directory, 'proxy-ca.crt'), 'utf8'), CA + '\n' + CA);
});

for (const [name, content] of [['empty', ''], ['private key', '-----BEGIN PRIVATE KEY-----\nsynthetic\n-----END PRIVATE KEY-----'],
  ['mixed', CA + '\n-----BEGIN PRIVATE KEY-----\nsynthetic\n-----END PRIVATE KEY-----'], ['corrupt certificate', '-----BEGIN CERTIFICATE-----\nsynthetic\n-----END CERTIFICATE-----']]) {
  test('compilador: CA rejeita ' + name, t => {
    const f = fixture(t, source({ httpsProxy: PROXY }));
    const ca = path.join(f.root, 'ca.crt'); writeFileSync(ca, content);
    assert.throws(() => prepareCompilationNetwork({ directory: f.directory, environment: { DOCKER_CONFIG: f.original, SSL_CERT_FILE: ca } }), /^Error: compiler-ca-invalid$/);
  });
}
for (const kind of ['missing', 'directory', 'comma', 'newline', 'relative']) test('compilador: caminho CA inválido ' + kind, t => {
  const f = fixture(t, source({ httpsProxy: PROXY }));
  const ca = kind === 'relative' ? 'relative-ca.crt' : path.join(f.root, kind === 'comma' ? 'ca,foreign.crt' : kind === 'newline' ? 'ca\nforeign.crt' : 'ca.crt');
  if (kind === 'directory') mkdirSync(ca);
  else if (kind !== 'missing' && kind !== 'relative') writeFileSync(ca, CA);
  assert.throws(() => prepareCompilationNetwork({ directory: f.directory, environment: { DOCKER_CONFIG: f.original, SSL_CERT_FILE: ca } }), /^Error: compiler-ca-[a-z-]+$/);
});
