import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runLogin, runSuite, discoverFunctionEntries } from '../e2e-isolated/run.mjs';
import { gitBlob } from '../e2e-isolated/migrations.mjs';
import { serviceConfiguration } from '../e2e-isolated/stack.mjs';
import { browserEnvironment, syntheticCredentials, ORIGIN, PROVIDER_ORIGIN, CATALOG_SKU, GROUPS } from '../e2e-isolated/runtime-contract.mjs';

const RUN = 'zapp-e2e-suite-contract-0001';
const SHA = 'a'.repeat(40);
const names = ['auth-login', 'message-delivery', 'promogifts-catalog'];
const source = '// public graph source only\n';

for (const [name, options] of [
  ['missing group', { scope: 'suite' }],
  ['free project selection', { scope: 'suite', group: 'chromium' }],
  ['whitespace group', { scope: 'suite', group: ' authenticated' }],
  ['prototype name', { scope: 'suite', group: '__proto__' }],
  ['constructor name', { scope: 'suite', group: 'constructor' }],
  ['shell suffix', { scope: 'suite', group: 'authenticated; echo bad' }],
  ['option suffix', { scope: 'suite', group: 'authenticated --grep smoke' }],
  ['unrecognized scope', { scope: 'smoke', group: 'authenticated' }],
  ['login with group', { scope: 'login', group: 'authenticated' }],
]) test('suite scope rejects ' + name + ' before commands or output creation', async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'isolated-scope-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, 'not-created');
  await assert.rejects(runLogin({ ...options, outputDirectory: output, command() { assert.fail('no command allowed'); } }), /invalid-isolated-scope/);
  assert.equal(existsSync(output), false);
});
test('runSuite does not fall back to login when its group is absent', async () => {
  await assert.rejects(runSuite({ command() { assert.fail('no command allowed'); } }), /invalid-isolated-scope/);
});
test('suite groups preserve the exact 9+3+3 existing project union', () => {
  assert.deepEqual(Object.keys(GROUPS), ['authenticated', 'deslogado-principal', 'deslogado-secundario']);
  const all = Object.values(GROUPS).flat();
  assert.deepEqual(Object.values(GROUPS).map(items => items.length), [9, 3, 3]);
  assert.equal(new Set(all).size, 15);
  assert.equal(all.filter(name => name === 'setup').length, 1);
});

function functions(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'isolated-functions-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of [...names, '_shared', 'empty-directory']) {
    mkdirSync(path.join(root, 'supabase/functions', name), { recursive: true });
    if (name !== 'empty-directory') writeFileSync(path.join(root, 'supabase/functions', name, 'index.ts'), source);
  }
  const manifest = names.map(name => '100644 ' + gitBlob(source) + ' 0\tsupabase/functions/' + name + '/index.ts\n').join('');
  return { root, manifest };
}
for (const mode of ['100644', '100755']) test('Edge discovery accepts tracked regular mode ' + mode + ' and excludes shared/non-entrypoint directories', t => {
  const f = functions(t);
  assert.deepEqual(discoverFunctionEntries(f.root, f.manifest.replaceAll('100644', mode)).map(item => item.name), names);
});
for (const [label, change] of [
  ['unresolved stage', text => text.replaceAll(' 0\t', ' 1\t')],
  ['symlink record', text => text.replaceAll('100644', '120000')],
  ['submodule record', text => text.replaceAll('100644', '160000')],
  ['wrong content hash', text => text.replaceAll(gitBlob(source), 'f'.repeat(40))],
  ['missing entrypoint', text => text.split('\n').filter(line => !line.includes('message-delivery')).join('\n')],
]) test('Edge discovery refuses ' + label, t => {
  const f = functions(t);
  assert.throws(() => discoverFunctionEntries(f.root, change(f.manifest)), /function-source-changed/);
});

test('bootstrap and non-authenticated groups do not receive provider/catalog/database fixture credentials', () => {
  const c = syntheticCredentials();
  const services = serviceConfiguration({ credentials: c, runId: RUN, sourceSha: SHA });
  assert.equal(services.provider, undefined);
  for (const key of ['DB_URL', 'EVOLUTION_DEFAULT_INSTANCE_TOKEN', 'E2E_CATALOG_PRODUCT_SKU']) assert.equal(services.driver.env[key], undefined);
  assert.equal(services.edge.env.PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY, undefined);
});
test('authenticated suite restricts external-provider keys to Edge/provider and strips all secrets from browser processes', () => {
  const c = syntheticCredentials();
  const services = serviceConfiguration({ credentials: c, runId: RUN, sourceSha: SHA, fullSuite: true });
  assert.equal(services.edge.env.PROMOGIFTS_SUPABASE_URL, PROVIDER_ORIGIN);
  assert.equal(services.edge.env.PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY, c.catalogKey);
  assert.equal(services.provider.env.PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY, c.catalogKey);
  assert.equal(services.driver.env.PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(services.driver.env.E2E_CATALOG_PRODUCT_SKU, CATALOG_SKU);
  assert.equal(services.driver.env.E2E_CATALOG_PRODUCT_SKU_VERIFIED, undefined, 'verification is enabled only after real readiness');
  assert.equal(services.driver.env.EVOLUTION_DEFAULT_INSTANCE_TOKEN, c.instanceToken);
  const database = new URL(services.driver.env.DB_URL);
  assert.equal(database.hostname, '127.0.0.1');
  assert.equal(database.username, 'supabase_admin');
  assert.equal(database.password, c.databasePassword);
  assert.equal(services.vite.env.VITE_ZAPP_LOCAL_SUPABASE_URL, ORIGIN);
  for (const field of ['SERVICE_ROLE_KEY', 'DB_URL', 'PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY', 'EVOLUTION_DEFAULT_INSTANCE_TOKEN']) assert.equal(services.vite.env[field], undefined);
  const browser = browserEnvironment(services.driver.env);
  for (const key of Object.keys(services.driver.env).filter(key => !['TZ', 'HOME'].includes(key))) assert.equal(browser[key], undefined);
  for (const value of Object.values(c)) assert.ok(!Object.values(browser).includes(value));
});

test('browser environment keeps only the fixed Firefox TLS policy path and still removes secrets', () => {
  const browser = browserEnvironment({ HOME: '/fixture/home', PLAYWRIGHT_FIREFOX_POLICIES_JSON: '/run/zapp-e2e-tls/firefox-policies.json',
    SERVICE_ROLE_KEY: 'synthetic-secret', NODE_TLS_REJECT_UNAUTHORIZED: '0', NODE_OPTIONS: '--use-env-proxy' });
  assert.deepEqual(browser, { HOME: '/fixture/home', PLAYWRIGHT_FIREFOX_POLICIES_JSON: '/run/zapp-e2e-tls/firefox-policies.json' });
});
for (const value of ['', '/tmp/firefox-policies.json', '/run/zapp-e2e-tls/../other.json', 'https://example.invalid/policy.json'])
  test('browser environment refuses a foreign Firefox TLS policy: ' + JSON.stringify(value), () => {
    assert.throws(() => browserEnvironment({ PLAYWRIGHT_FIREFOX_POLICIES_JSON: value }), /invalid-browser-tls-policy/);
  });
