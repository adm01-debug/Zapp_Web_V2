import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import {
  assertContainerIsolation, assertLocalOrigin, assertLoopbackOnly, assertNoProxy,
  assertOwnedContainer, browserEnvironment, makeProof, ORIGIN, OWNER_LABEL,
  PURPOSE, PURPOSE_LABEL, sha256, syntheticCredentials, assertOfficialHostIsLocal, OFFICIAL_HOST,
} from '../e2e-isolated/runtime-contract.mjs';
import { routeRequest } from '../e2e-isolated/gateway.mjs';

const RUN = 'zapp-e2e-test-0123456789';
const SHA = 'a'.repeat(40);
const lo = () => ({ lo: [
  { address: '127.0.0.1', internal: true },
  { address: '::1', internal: true },
] });
const container = () => ({
  Config: { Labels: { [OWNER_LABEL]: RUN, [PURPOSE_LABEL]: PURPOSE } },
  HostConfig: { NetworkMode: 'container:anchor-id', Privileged: false, CapAdd: [] },
  NetworkSettings: { Networks: {} },
  Mounts: [{ Source: '/tmp/owned/results', Destination: '/work/test-results', RW: true }],
});
const writable = new Set(['/tmp/owned/results']);

test('hosts: hostname oficial só resolve para loopback na cópia descartável', () => {
  assert.equal(assertOfficialHostIsLocal('127.0.0.1 localhost ' + OFFICIAL_HOST + '\n::1 localhost\n'), true);
});
for (const [name, source] of [
  ['ausente', '127.0.0.1 localhost\n'],
  ['comentado', '# 127.0.0.1 ' + OFFICIAL_HOST],
  ['IP externo', '203.0.113.1 ' + OFFICIAL_HOST],
  ['IPv6 diferente do contrato', '::1 ' + OFFICIAL_HOST],
  ['alias parecido', '127.0.0.1 ' + OFFICIAL_HOST + '.invalid'],
  ['segunda resolução externa', '127.0.0.1 ' + OFFICIAL_HOST + '\n203.0.113.1 ' + OFFICIAL_HOST],
]) {
  test('hosts: recusa ' + name, () => assert.throws(() => assertOfficialHostIsLocal(source)));
}

test('isolamento: loopback real do contrato aceita IPv4 e IPv6 locais', () => {
  assert.equal(assertLoopbackOnly(lo()), true);
});

for (const [name, value] of [
  ['interface Ethernet', { ...lo(), eth0: [{ address: '172.17.0.2', internal: false }] }],
  ['segunda interface sem endereço', { ...lo(), eth1: [] }],
  ['somente IPv6 sem API IPv4', { lo: [{ address: '::1', internal: true }] }],
  ['loopback vazio', { lo: [] }],
  ['campo internal falso', { lo: [{ address: '127.0.0.1', internal: false }] }],
  ['endereço externo em lo', { lo: [{ address: '10.1.0.2', internal: true }] }],
  ['interface ausente', {}],
  ['endereço não canônico', { lo: [{ address: '127.0.0.2', internal: true }] }],
]) {
  test('isolamento: recusa ' + name, () => assert.throws(() => assertLoopbackOnly(value)));
}

for (const name of ['HTTP_PROXY', 'https_proxy', 'ALL_PROXY', 'ftp_proxy']) {
  test('isolamento: recusa proxy ' + name, () => assert.throws(() => assertNoProxy({ [name]: 'http://proxy.invalid' })));
}
test('isolamento: env sem proxy é aceito', () => assert.doesNotThrow(() => assertNoProxy({ PATH: '/bin' })));

test('posse: contêiner criado neste run com fonte gravável própria', () => {
  assert.equal(assertContainerIsolation(container(), RUN, 'anchor-id', writable), true);
});
test('posse: âncora com rede none é aceita', () => {
  const value = container(); value.HostConfig.NetworkMode = 'none'; value.NetworkSettings.Networks = { none: {} };
  assert.equal(assertContainerIsolation(value, RUN, 'anchor-id', writable), true);
});
for (const [name, mutate] of [
  ['dono ausente', value => { delete value.Config.Labels[OWNER_LABEL]; }],
  ['outro run', value => { value.Config.Labels[OWNER_LABEL] = 'zapp-e2e-other-0123456789'; }],
  ['outra finalidade', value => { value.Config.Labels[PURPOSE_LABEL] = 'production'; }],
  ['host network', value => { value.HostConfig.NetworkMode = 'host'; }],
  ['outra namespace', value => { value.HostConfig.NetworkMode = 'container:foreign'; }],
  ['segunda rede', value => { value.NetworkSettings.Networks = { bridge: {} }; }],
  ['privileged', value => { value.HostConfig.Privileged = true; }],
  ['PID do host', value => { value.HostConfig.PidMode = 'host'; }],
  ['IPC do host', value => { value.HostConfig.IpcMode = 'host'; }],
  ['capacidade administrativa', value => { value.HostConfig.CapAdd = ['NET_ADMIN']; }],
  ['mount gravável alheio', value => { value.Mounts[0].Source = '/tmp/foreign/results'; }],
  ['Docker socket somente leitura', value => { value.Mounts.push({ Source: '/var/run/docker.sock', Destination: '/docker.sock', RW: false }); }],
]) {
  test('posse: recusa ' + name, () => {
    const value = container(); mutate(value);
    assert.throws(() => assertContainerIsolation(value, RUN, 'anchor-id', writable));
  });
}
test('cleanup: dono não pode ser trocado antes da remoção', () => {
  const value = container();
  value.Config.Labels[OWNER_LABEL] = 'zapp-e2e-other-0123456789';
  assert.throws(() => assertOwnedContainer(value, RUN));
});

for (const secretName of ['SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'E2E_TEST_PASSWORD', 'GITHUB_TOKEN', 'JWT_SECRET', 'HTTP_PROXY', 'VITE_SUPABASE_SERVICE_ROLE_KEY']) {
  test('processo do navegador não herda ' + secretName, () => {
    const input = { PATH: '/usr/bin', HOME: '/tmp/browser', TZ: 'UTC', [secretName]: 'sentinela-sintetica' };
    const output = browserEnvironment(input);
    assert.deepEqual(output, { PATH: '/usr/bin', HOME: '/tmp/browser', TZ: 'UTC' });
    assert.equal(JSON.stringify(output).includes('sentinela-sintetica'), false);
  });
}

test('alvo: aceita apenas a origem do gateway pertencente ao ambiente', () => assert.equal(assertLocalOrigin(ORIGIN), ORIGIN));
for (const value of [
  undefined, 'https://tnnnlkbymytvtqngbbqh.supabase.co', 'http://localhost:5173',
  'https://127.0.0.1:5173', 'http://127.0.0.1:5173/x', 'http://user:pass@127.0.0.1:5173',
  'http://127.0.0.1:5173?backend=remote', 'http://127.0.0.1:5174',
]) {
  test('alvo: rejeita entrada fora da origem exata ' + String(value), () => assert.throws(() => assertLocalOrigin(value)));
}

const ready = () => ({ network_isolated: true, cron_disabled: true, bootstrap_complete: true, seed_ready: true });
test('proof público tem TTL de 60 minutos e só hash da anon key', () => {
  const value = makeProof({ runId: RUN, sourceSha: SHA, anonKey: 'anon-sintetica'.repeat(12), networkNamespace: 'net:[123]', now: 100_000, checks: ready() });
  assert.equal(Date.parse(value.expires_at) - Date.parse(value.created_at), 3_600_000);
  assert.equal(value.anon_key_sha256, sha256('anon-sintetica'.repeat(12)));
  assert.equal(JSON.stringify(value).includes('anon-sintetica'), false);
});
for (const key of Object.keys(ready())) {
  test('proof não transforma etapa ausente em pronta: ' + key, () => {
    const checks = ready(); delete checks[key];
    assert.throws(() => makeProof({ runId: RUN, sourceSha: SHA, anonKey: 'x'.repeat(80), networkNamespace: 'net:[123]', checks }));
  });
}

test('chaves sintéticas separadas têm assinatura HS256 e papel correto', () => {
  const values = syntheticCredentials(1_000_000);
  for (const [name, role] of [['anonKey', 'anon'], ['serviceRoleKey', 'service_role']]) {
    const [head, body, signature] = values[name].split('.');
    assert.equal(signature, createHmac('sha256', values.jwtSecret).update(head + '.' + body).digest('base64url'));
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    assert.equal(claims.role, role);
    assert.equal(claims.exp - claims.iat, 4 * 60 * 60);
  }
  assert.notEqual(values.anonKey, values.serviceRoleKey);
  assert.notEqual(values.databasePassword, values.password);
  assert.equal(values.email.endsWith('@example.invalid'), true);
});

for (const [path, service, expected] of [
  ['/auth/v1/token?grant_type=password', 'auth', '/token?grant_type=password'],
  ['/auth/v1', 'auth', '/'],
  ['/rest/v1?select=id', 'rest', '/?select=id'],
  ['/rest/v1/rpc/consume_login_gate', 'rest', '/rpc/consume_login_gate'],
  ['/storage/v1/object/sign/whatsapp-media/x', 'storage', '/object/sign/whatsapp-media/x'],
  ['/realtime/v1/websocket?vsn=1.0.0', 'realtime', '/socket/websocket?vsn=1.0.0'],
  ['/realtime/v1/api/broadcast', 'realtime', '/api/broadcast'],
  ['/realtime/v1/api/tenants/e2e/health?check=1', 'realtime', '/api/tenants/e2e/health?check=1'],
  ['/realtime/v1/api', 'realtime', '/api'],
  ['/realtime/v1/apianother', 'realtime', '/socket/apianother'],
  ['/functions/v1/auth-login', 'functions', '/auth-login'],
  ['/functions/v1/message-delivery', 'functions', '/message-delivery'],
  ['/functions/v1/missing/path', 'functions', '/missing/path'],
  ['/auth/v10/fake', 'app', '/auth/v10/fake'],
  ['/src/config/supabase.ts', 'app', '/src/config/supabase.ts'],
  ['/', 'app', '/'],
]) {
  test('gateway preserva rota real ' + path, () => {
    assert.deepEqual(routeRequest(path), { service, port: { auth: 9999, rest: 3000, storage: 5000, realtime: 4000, functions: 9000, app: 5174 }[service], path: expected });
  });
}
for (const path of ['https://external.invalid/x', '//external.invalid/x', '/x\r\nhost: external.invalid', undefined]) {
  test('gateway recusa destino não local ' + String(path), () => assert.throws(() => routeRequest(path)));
}
