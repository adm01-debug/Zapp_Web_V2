import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import vm from 'node:vm';
import { createHash, createHmac, webcrypto } from 'node:crypto';
import { resolveLocalSupabase, PRODUCTION_SUPABASE_URL } from '../../src/config/supabase.ts';
import {
  IsolatedAuthError, assertIsolatedAuthEnvironment,
  validateIsolatedAuthEvidence, validateBrowserEvidence,
} from '../e2e-isolated/admission.mjs';

const ORIGIN = 'http://127.0.0.1:5173';
const ORIGINS = [ORIGIN, 'https://127.0.0.1:5173'];
const NOW = Date.parse('2026-11-04T12:00:00.000Z');
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
function token(now, role = 'anon', alg = 'HS256', exp = Math.floor(now / 1000) + 14_400) {
  const body = `${b64({ alg, typ: 'JWT' })}.${b64({ role, exp })}`;
  return `${body}.${createHmac('sha256', 'offline-admission-fixture-only').update(body).digest('base64url')}`;
}
function evidence(now = NOW, origin = ORIGIN) {
  const key = token(now);
  return {
    baseURL: origin, now,
    env: {
      ZAPP_E2E_PROOF: '/run/zapp-e2e/proof.json', ZAPP_E2E_RUN_ID: 'local-run-1', GITHUB_SHA: 'a'.repeat(40),
      VITE_ZAPP_LOCAL_SUPABASE_URL: origin, VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY: key,
      E2E_SUPABASE_URL_OVERRIDE: origin, E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE: key,
    },
    proof: { schema: 1, run_id: 'local-run-1', source_sha: 'a'.repeat(40), origin,
      network_namespace: 'net:[12345]', anon_key_sha256: hash(key),
      created_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 3_599_000).toISOString(),
      checks: { network_isolated: true, cron_disabled: true, bootstrap_complete: true, seed_ready: true } },
    networkNamespace: 'net:[12345]',
    interfaces: { lo: [{ address: '127.0.0.1', internal: true }, { address: '::1', internal: true }] },
  };
}
function replaceKey(value, key) {
  value.env.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY = key;
  value.env.E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE = key;
  value.proof.anon_key_sha256 = hash(key);
}
const hasCode = code => error => error instanceof IsolatedAuthError && error.code === code &&
  error.cause === undefined && !/credential-canary|password-canary/.test(error.message);

for (const protocol of ['http:', 'https:']) for (const host of ['127.0.0.1', 'localhost']) {
  for (const port of ['', ':5173', ':23794', ':54321', ':65535']) {
    const origin = `${protocol}//${host}${port}`;
    test(`resolver e admissão conservam a origem local ${origin}`, () => {
      const value = evidence(NOW, origin);
      const local = resolveLocalSupabase(value.env);
      assert.deepEqual(local, { url: origin, anonKey: value.env.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY });
      assert.equal(resolveLocalSupabase({ ...value.env, PROD: true }), null);
      const target = validateIsolatedAuthEvidence(value);
      assert.equal(target.origin, origin);
      validateBrowserEvidence(target, browserObservation(target));
    });
  }
}

const scenarios = [];
const add = (name, mutate, code) => scenarios.push({ name, mutate, code });
add('preparo completo', () => {});
add('barras finais convergem para a mesma origem', value => {
  value.baseURL += '/'; value.env.VITE_ZAPP_LOCAL_SUPABASE_URL += '/'; value.env.E2E_SUPABASE_URL_OVERRIDE += '/';
});
add('NO_PROXY sem proxy não cria saída', value => { value.env.NO_PROXY = '*'; });
for (const key of ['VITE_ZAPP_LOCAL_SUPABASE_URL', 'VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY',
  'E2E_SUPABASE_URL_OVERRIDE', 'E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE']) {
  add(`${key} ausente`, value => { delete value.env[key]; }, 'ISOLATION_CONFIGURATION');
  add(`${key} vazio`, value => { value.env[key] = ' '; }, 'ISOLATION_CONFIGURATION');
}
for (const field of ['baseURL', 'VITE_ZAPP_LOCAL_SUPABASE_URL', 'E2E_SUPABASE_URL_OVERRIDE']) {
  for (const [label, url] of [
    ['remoto', 'https://example.invalid'], ['protocolo divergente', 'https://127.0.0.1:5173'],
    ['IPv6 fora do resolver', 'http://[::1]:5173'], ['caminho', `${ORIGIN}/rest/v1`],
    ['query', `${ORIGIN}/?credential-canary=1`], ['fragmento', `${ORIGIN}/#credential-canary`],
    ['credenciais', 'http://credential-canary:password-canary@127.0.0.1:5173'],
    ['URL inválida', 'http://credential-canary@'],
  ]) add(`${field}: ${label}`, value => {
    const target = label === 'protocolo divergente' && value.baseURL.startsWith('https:') ? ORIGIN
      : value.baseURL.startsWith('https:') ? url.replace(/^http:/, 'https:') : url;
    if (field === 'baseURL') value.baseURL = target; else value.env[field] = target;
  }, 'ISOLATION_CONFIGURATION');
}
for (const field of ['VITE_ZAPP_LOCAL_SUPABASE_URL', 'E2E_SUPABASE_URL_OVERRIDE']) {
  add(`${field} aponta para outro serviço local`, value => { value.env[field] = value.baseURL.replace(':5173', ':54321'); }, 'ISOLATION_CONFIGURATION');
}
add('pares anon diferentes', value => { value.env.E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE = token(NOW, 'authenticated'); }, 'ISOLATION_CONFIGURATION');
add('chave não JWT', value => replaceKey(value, 'credential-canary'), 'ISOLATION_CONFIGURATION');
for (const role of ['service_role', 'authenticated', 'unknown']) {
  add(`role ${role} recusada no par anon`, value => replaceKey(value, token(NOW, role)), 'ISOLATION_CONFIGURATION');
}
add('algoritmo fora do controlador', value => replaceKey(value, token(NOW, 'anon', 'none')), 'ISOLATION_CONFIGURATION');
add('anon expirado', value => replaceKey(value, token(NOW, 'anon', 'HS256', NOW / 1000)), 'ISOLATION_CONFIGURATION');
for (const [name, entry, replacement] of [
  ['prova ausente', 'ZAPP_E2E_PROOF', undefined], ['prova em outro caminho', 'ZAPP_E2E_PROOF', '/tmp/proof.json'],
  ['run ausente', 'ZAPP_E2E_RUN_ID', undefined], ['run inválido', 'ZAPP_E2E_RUN_ID', '../outro'],
  ['run alheio', 'ZAPP_E2E_RUN_ID', 'other-run'], ['SHA ausente', 'GITHUB_SHA', undefined],
  ['SHA curto', 'GITHUB_SHA', 'a96bbd4'], ['SHA divergente', 'GITHUB_SHA', 'b'.repeat(40)],
]) add(name, value => { value.env[entry] = replacement; }, 'ISOLATION_PROOF');
for (const key of ['HTTP_PROXY', 'https_proxy', 'ALL_PROXY', 'global_agent_http_proxy']) {
  add(`${key} não pode encaminhar rede`, value => { value.env[key] = 'http://credential-canary@127.0.0.1:8899'; }, 'ISOLATION_NETWORK');
}
add('proxy nativo por variável', value => { value.env.NODE_USE_ENV_PROXY = '1'; }, 'ISOLATION_NETWORK');
add('proxy nativo por opção', value => { value.env.NODE_OPTIONS = '--use-env-proxy'; }, 'ISOLATION_NETWORK');
add('interfaces ausentes', value => { value.interfaces = {}; }, 'ISOLATION_NETWORK');
add('loopback sem endereço', value => { value.interfaces.lo = []; }, 'ISOLATION_NETWORK');
add('segunda interface com endereço', value => { value.interfaces.eth0 = [{ address: '172.18.0.2', internal: false }]; }, 'ISOLATION_NETWORK');
add('segunda interface sem endereço', value => { value.interfaces.eth0 = []; }, 'ISOLATION_NETWORK');
add('endereço externo chamado lo', value => { value.interfaces.lo[0] = { address: '172.18.0.2', internal: false }; }, 'ISOLATION_NETWORK');
add('namespace divergente', value => { value.networkNamespace = 'net:[12346]'; }, 'ISOLATION_NETWORK');
add('namespace inválido', value => { value.networkNamespace = 'not-a-namespace'; }, 'ISOLATION_NETWORK');
add('manifest ausente', value => { value.proof = null; }, 'ISOLATION_NETWORK');
for (const [name, field, replacement] of [
  ['versão desconhecida', 'schema', 2], ['hash anon diferente', 'anon_key_sha256', '0'.repeat(64)],
  ['origem da prova diferente', 'origin', 'http://localhost:5173'],
  ['SHA da prova diferente', 'source_sha', 'b'.repeat(40)], ['run da prova diferente', 'run_id', 'other-run'],
  ['data sem fuso', 'created_at', '2026-11-04T11:59:59'], ['data ilegível', 'created_at', 'invalid'],
  ['data futura', 'created_at', new Date(NOW + 1000).toISOString()],
  ['prova expirada', 'expires_at', new Date(NOW).toISOString()],
  ['prova maior que 60 minutos', 'expires_at', new Date(NOW + 3_600_001).toISOString()],
]) add(name, value => { value.proof[field] = replacement; }, 'ISOLATION_PROOF');
add('protocolo da prova divergente', value => { value.proof.origin = value.baseURL.replace(/^https?:/, value.baseURL.startsWith('https:') ? 'http:' : 'https:'); }, 'ISOLATION_PROOF');
add('porta da prova divergente', value => { value.proof.origin = value.baseURL.replace(':5173', ':54321'); }, 'ISOLATION_PROOF');
for (const check of ['network_isolated', 'cron_disabled', 'bootstrap_complete', 'seed_ready']) {
  add(`${check} falso`, value => { value.proof.checks[check] = false; }, 'ISOLATION_PROOF');
  add(`${check} ausente`, value => { delete value.proof.checks[check]; }, 'ISOLATION_PROOF');
  add(`${check} string não é confirmação`, value => { value.proof.checks[check] = 'true'; }, 'ISOLATION_PROOF');
}
const unique = new Set();
for (const origin of ORIGINS) for (const { name, mutate, code } of scenarios) {
  const value = evidence(NOW, origin); mutate(value);
  assert(!unique.has(JSON.stringify(value)), `cenário duplicado: ${name}`); unique.add(JSON.stringify(value));
  test(`admissão isolada ${origin}: ${name}`, () => {
    if (code) assert.throws(() => validateIsolatedAuthEvidence(value), hasCode(code));
    else {
      const result = validateIsolatedAuthEvidence(value);
      assert.equal(result.origin, origin);
      assert(!JSON.stringify(result).includes(value.env.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY));
    }
  });
}

for (const origin of ORIGINS) test(`a validação pura ${origin} não lê email, senha ou service_role`, () => {
  const value = evidence(NOW, origin);
  for (const key of ['E2E_TEST_EMAIL', 'E2E_TEST_PASSWORD', 'SUPABASE_SERVICE_ROLE_KEY']) {
    Object.defineProperty(value.env, key, { enumerable: true, get() { throw new Error(`leitura proibida: ${key}`); } });
  }
  assert.equal(validateIsolatedAuthEvidence(value).origin, origin);
});

function browserObservation(target) {
  return { identity: { run_id: target.run_id, source_sha: target.source_sha, origin: target.origin },
    is_local: true, effective_url: target.origin, local_url: target.origin, anon_key_sha256: target.anon_key_sha256 };
}
for (const origin of ORIGINS) for (const [name, change] of [
  ['modo produção', value => { value.is_local = false; }],
  ['backend efetivo oficial', value => { value.effective_url = PRODUCTION_SUPABASE_URL; }],
  ['backend local ausente', value => { value.local_url = null; }],
  ['anon diferente no Vite', value => { value.anon_key_sha256 = '0'.repeat(64); }],
  ['identidade de outra execução', value => { value.identity.run_id = 'other-run'; }],
  ['checkout diferente servido', value => { value.identity.source_sha = 'b'.repeat(40); }],
  ['gateway diferente', value => { value.identity.origin = 'http://127.0.0.1:54321'; }],
  ['protocolo diferente no frontend', value => { value.effective_url = origin.replace(/^https?:/, origin.startsWith('https:') ? 'http:' : 'https:'); }],
  ['porta diferente no frontend', value => { value.effective_url = origin.replace(':5173', ':54321'); }],
  ['protocolo diferente na configuração', value => { value.local_url = origin.replace(/^https?:/, origin.startsWith('https:') ? 'http:' : 'https:'); }],
  ['protocolo diferente na identidade', value => { value.identity.origin = origin.replace(/^https?:/, origin.startsWith('https:') ? 'http:' : 'https:'); }],
]) test(`prova do browser ${origin} recusa ${name}`, () => {
  const target = validateIsolatedAuthEvidence(evidence(NOW, origin));
  const observation = browserObservation(target); change(observation);
  assert.throws(() => validateBrowserEvidence(target, observation), hasCode('ISOLATION_BROWSER'));
});

for (const origin of ORIGINS) test(`admission real ${origin} usa observações do processo e callback do Vite, sem rede`, async t => {
  const cases = [
    ['normal', {}], ['prova ilegível', { readError: true }, 'ISOLATION_PROOF'],
    ['JSON inválido', { badJSON: true }, 'ISOLATION_PROOF'],
    ['config ausente antes de I/O', { missingConfig: true }, 'ISOLATION_CONFIGURATION'],
    ['namespace alheio antes de navegador', { wrongNamespace: true }, 'ISOLATION_NETWORK'],
    ['interface externa antes de navegador', { externalInterface: true }, 'ISOLATION_NETWORK'],
    ['seed incompleto antes de navegador', { missingSeed: true }, 'ISOLATION_PROOF'],
    ['Vite em produção', { prod: true }, 'ISOLATION_BROWSER'],
    ['chave diferente no Vite', { wrongKey: true }, 'ISOLATION_BROWSER'],
    ['identidade HTTP divergente', { wrongIdentity: true }, 'ISOLATION_BROWSER'],
    ['redirecionamento da página', { redirected: true }, 'ISOLATION_BROWSER'],
    ['página retorna 503', { badPage: true }, 'ISOLATION_BROWSER'],
    ['identity retorna 503', { badIdentity: true }, 'ISOLATION_BROWSER'],
    ['erro do navegador redigido', { browserError: true }, 'ISOLATION_BROWSER'],
  ];
  for (const phase of ['goto', 'evaluate']) {
    for (const advance of [999, 1000, 1001, 15_000, 25_000]) {
      cases.push([`prova vence durante ${phase}: ${advance} ms`, { phase, advance, shortProof: true },
        advance < 1000 ? undefined : 'ISOLATION_PROOF']);
    }
    for (const advance of [999, 1000, 1001]) {
      cases.push([`anon vence durante ${phase}: ${advance} ms`, { phase, advance, shortKey: true },
        advance < 1000 ? undefined : 'ISOLATION_CONFIGURATION']);
    }
    for (const [lateChange, code] of [
      ['namespace', 'ISOLATION_NETWORK'], ['interface', 'ISOLATION_NETWORK'], ['proxy', 'ISOLATION_NETWORK'],
      ['sha', 'ISOLATION_PROOF'], ['key', 'ISOLATION_CONFIGURATION'],
    ]) cases.push([`${lateChange} muda durante ${phase}`, { phase, lateChange }, code]);
  }
  for (const [name, scenario, code] of cases) await t.test(name, async child => {
    const value = evidence(NOW, origin);
    let clock = NOW, namespaceMoved = false, interfaceAdded = false;
    child.mock.method(Date, 'now', () => clock);
    if (scenario.shortProof) value.proof.expires_at = new Date(NOW + 1000).toISOString();
    if (scenario.shortKey) replaceKey(value, token(NOW, 'anon', 'HS256', NOW / 1000 + 1));
    const previousEnv = process.env;
    const testEnv = { ...previousEnv, ...value.env };
    for (const key of Object.keys(testEnv)) if (/proxy/i.test(key)) delete testEnv[key];
    delete testEnv.NODE_OPTIONS;
    if (scenario.missingConfig) delete testEnv.E2E_SUPABASE_URL_OVERRIDE;
    if (scenario.missingSeed) value.proof.checks.seed_ready = false;
    let credentialReads = 0, fileReads = 0, navigations = 0, evaluations = 0;
    process.env = new Proxy(testEnv, { get(target, key) {
      if (['E2E_TEST_EMAIL', 'E2E_TEST_PASSWORD', 'SUPABASE_SERVICE_ROLE_KEY'].includes(key)) credentialReads++;
      return Reflect.get(target, key);
    } });
    const advanceAt = phase => {
      if (scenario.phase !== phase) return;
      clock += scenario.advance ?? 0;
      if (scenario.lateChange === 'namespace') namespaceMoved = true;
      if (scenario.lateChange === 'interface') interfaceAdded = true;
      if (scenario.lateChange === 'proxy') testEnv.HTTP_PROXY = 'http://127.0.0.1:8899';
      if (scenario.lateChange === 'sha') testEnv.GITHUB_SHA = 'b'.repeat(40);
      if (scenario.lateChange === 'key') testEnv.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY = 'credential-canary';
    };
    child.mock.method(fs, 'readFile', async (path, encoding) => {
      fileReads++; assert.equal(path, '/run/zapp-e2e/proof.json'); assert.equal(encoding, 'utf8');
      if (scenario.readError) throw new Error('password-canary');
      return scenario.badJSON ? '{credential-canary' : JSON.stringify(value.proof);
    });
    child.mock.method(fs, 'readlink', async path => {
      assert.equal(path, '/proc/self/ns/net'); return scenario.wrongNamespace || namespaceMoved ? 'net:[99999]' : value.networkNamespace;
    });
    child.mock.method(os, 'networkInterfaces', () => scenario.externalInterface || interfaceAdded ? { ...value.interfaces, eth0: [] } : value.interfaces);
    const target = { origin, run_id: value.proof.run_id, source_sha: value.proof.source_sha,
      anon_key_sha256: value.proof.anon_key_sha256 };
    const local = resolveLocalSupabase({ ...value.env, PROD: Boolean(scenario.prod) });
    if (scenario.wrongKey && local) local.anonKey = token(value.now, 'authenticated');
    const fixtureConfig = { IS_LOCAL_SUPABASE: local !== null, LOCAL_SUPABASE: local,
      SUPABASE_URL: local?.url ?? PRODUCTION_SUPABASE_URL };
    const identity = { ...browserObservation(target).identity };
    if (scenario.wrongIdentity) identity.run_id = 'other-run';
    const page = {
      goto: async (url, options) => {
        navigations++; assert.equal(url, `${origin}/__e2e/preflight`); assert.equal(options.timeout, 15_000);
        advanceAt('goto');
        return { ok: () => !scenario.badPage };
      },
      url: () => `${origin}/${scenario.redirected ? 'auth' : '__e2e/preflight'}`,
      evaluate: async callback => {
        evaluations++;
        advanceAt('evaluate');
        if (scenario.browserError) throw new Error('credential-canary password-canary');
        const source = callback.toString();
        assert.equal(source.split("import('/src/config/supabase.ts')").length, 2);
        return await vm.runInNewContext(`(${source.replace("import('/src/config/supabase.ts')", 'Promise.resolve(fixtureConfig)')})()`, {
          fixtureConfig, crypto: webcrypto, TextEncoder, Uint8Array,
          fetch: async (url, options) => {
            assert.equal(url, '/__e2e/identity'); assert.equal(options.redirect, 'error');
            return { ok: !scenario.badIdentity, json: async () => identity };
          },
        });
      },
    };
    try {
      if (code) await assert.rejects(assertIsolatedAuthEnvironment({ page, baseURL: origin }), hasCode(code));
      else await assertIsolatedAuthEnvironment({ page, baseURL: origin });
      assert.equal(credentialReads, 0);
      if (scenario.missingConfig) assert.equal(fileReads, 0);
      if (code && code !== 'ISOLATION_BROWSER' && !scenario.phase) assert.equal(navigations, 0);
      if (scenario.redirected || scenario.badPage) assert.equal(evaluations, 0);
    } finally {
      process.env = previousEnv;
    }
  });
});
