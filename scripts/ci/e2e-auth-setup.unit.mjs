import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const APP = 'https://zapp-web-v2.vercel.app';
const OFFICIAL = 'https://tnnnlkbymytvtqngbbqh.supabase.co';
const LOCAL = 'http://127.0.0.1:54321';
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

// Executa o setup e a configuração reais, retirando apenas tipos e substituindo
// o runner/navegador por doubles. Não inicia browser nem acessa endpoints reais.
test('integração offline do auth.setup e playwright.config reais', async t => {
  const helper = pathToFileURL(`${ROOT}/e2e/auth-diagnostics.ts`).href;
  const stub = dataModule(`
    const test = (name, callback) => { globalThis.__offlineAuthProbe.callback = callback; };
    test.setTimeout = () => {};
    const expect = () => ({ toBeVisible: async () => {
      if (globalThis.__offlineAuthProbe.timeout) throw new Error('prazo simulado');
    } });
    const defineConfig = value => value;
    const devices = new Proxy({}, { get: () => ({}) });
    export { test, expect, defineConfig, devices };
  `);
  globalThis.__offlineAuthProbe = {};
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => { fetchCalls++; throw new Error('I/O externo proibido nesta simulação'); };
  const originalEmail = process.env.E2E_TEST_EMAIL;
  const originalPassword = process.env.E2E_TEST_PASSWORD;
  const originalBase = process.env.PLAYWRIGHT_BASE_URL;
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = value => warnings.push(value);

  function transform(source, dirname) {
    return stripTypeScriptTypes(source, { mode: 'strip' })
      .replace("from '@playwright/test'", `from '${stub}'`)
      .replace("from './auth-diagnostics'", `from '${helper}'`)
      .replace("from './e2e/auth-diagnostics'", `from '${helper}'`)
      .replaceAll('import.meta.dirname', JSON.stringify(dirname));
  }

  function fakePage(scenario) {
    const handlers = new Map();
    const state = { clicks: 0, gotos: 0, fills: 0, saved: 0, waits: 0 };
    const requests = [];
    const emit = (event, value) => handlers.get(event)?.(value);
    const locator = visible => ({
      isVisible: async () => visible(), first() { return this; },
      or() { return this; }, fill: async () => { state.fills++; },
    });
    const preflight = () => {
      const request = { method: () => 'OPTIONS', url: () => `${scenario.backend ?? LOCAL}/functions/v1/auth-login` };
      emit('request', request);
      emit('response', { request: () => request, status: () => 200 });
    };
    const page = {
      on: (name, handler) => handlers.set(name, handler),
      goto: async () => { state.gotos++; },
      waitForTimeout: async () => { state.waits++; },
      locator: () => locator(() => !!scenario.success),
      getByText: pattern => locator(() => pattern.test('temporariamente indisponivel')
        ? !!scenario.unavailable : !!scenario.credential),
      getByRole: role => role === 'button' ? { click: async () => {
        state.clicks++;
        if (scenario.options === 'before') preflight();
        const request = { method: () => 'POST', url: () => `${scenario.backend ?? LOCAL}/functions/v1/auth-login` };
        requests.push(request);
        emit('request', request);
        const status = scenario.statuses?.[state.clicks - 1] ?? scenario.status;
        if (status) emit('response', { request: () => request, status: () => status });
        if (scenario.options === 'after') preflight();
        if (scenario.transport) emit('requestfailed', request);
        if (scenario.late && state.clicks === 2) {
          emit('response', { request: () => requests[0], status: () => 503 });
        }
      } } : locator(() => false),
      context: () => ({ storageState: async () => { state.saved++; } }),
    };
    return { page, state };
  }

  try {
    const source = transform(await readFile(`${ROOT}/e2e/auth.setup.ts`, 'utf8'), `${ROOT}/e2e`);
    await import(dataModule(source));
    const callback = globalThis.__offlineAuthProbe.callback;
    assert.equal(typeof callback, 'function');
    const cases = [
      ['remoto bloqueado antes de ler credenciais', { base: APP, guardSecrets: true }, 'REMOTE_FULL_SUITE_BLOCKED', 0],
      ['credenciais ausentes sem ação de login', { missing: true }, 'nao estao definidas', 0],
      ['CORS: falha de transporte no backend oficial', { backend: OFFICIAL, transport: true, unavailable: true }, 'CORS_ORIGIN_INCOMPATIBLE', 1],
      ['OPTIONS 200 anterior não conta como POST 200', { backend: OFFICIAL, transport: true, unavailable: true, options: 'before' }, 'CORS_ORIGIN_INCOMPATIBLE', 1],
      ['OPTIONS 200 tardio não conta como POST 200', { backend: OFFICIAL, transport: true, unavailable: true, options: 'after' }, 'CORS_ORIGIN_INCOMPATIBLE', 1],
      ['transporte local permite somente retries limitados', { transport: true, unavailable: true }, 'TRANSPORT_FAILED', 3],
      ['HTTP 401 não repete no laço interno', { status: 401, credential: true }, 'AUTH_REJECTED', 1],
      ['HTTP 429 tem limite de retries internos', { status: 429, unavailable: true }, 'RATE_LIMIT', 3],
      ['HTTP 503 tem limite de retries internos', { status: 503, unavailable: true }, 'UPSTREAM_HTTP', 3],
      ['2xx sem shell não é login confirmado', { status: 200, timeout: true }, 'LOGIN_RESULT_NOT_CONFIRMED', 1],
      ['sucesso simulado mantém storageState existente', { status: 200, success: true }, null, 1],
      ['resposta tardia não substitui status atual', { statuses: [503, 401], unavailable: true, late: true }, 'AUTH_REJECTED', 2],
    ];
    for (const [name, scenario, expected, clicks] of cases) {
      await t.test(`setup: ${name}`, async () => {
        process.env.E2E_TEST_EMAIL = 'offline@example.invalid';
        process.env.E2E_TEST_PASSWORD = 'offline-probe-never-auth';
        if (scenario.missing) { delete process.env.E2E_TEST_EMAIL; delete process.env.E2E_TEST_PASSWORD; }
        globalThis.__offlineAuthProbe.timeout = scenario.timeout;
        const { page, state } = fakePage(scenario);
        const originalEnv = process.env;
        const secretReads = [];
        if (scenario.guardSecrets) {
          process.env = new Proxy(originalEnv, { get(target, key) {
            if (key === 'E2E_TEST_EMAIL' || key === 'E2E_TEST_PASSWORD') secretReads.push(key);
            return Reflect.get(target, key);
          } });
        }
        try {
          const operation = callback({ page, baseURL: scenario.base ?? 'http://localhost:5173' });
          if (expected) await assert.rejects(operation, error => error.message.includes(expected));
          else await operation;
        } finally {
          process.env = originalEnv;
        }
        assert.equal(state.clicks, clicks);
        assert.equal(state.saved, scenario.success ? 1 : 0);
        if (scenario.base) {
          assert.equal(state.gotos, 0);
          assert.equal(state.fills, 0);
          assert.deepEqual(secretReads, []);
        }
      });
    }

    const configOriginal = await readFile(`${ROOT}/playwright.config.ts`, 'utf8');
    const configSource = transform(configOriginal, ROOT).replace(
      "import { quarentena } from './e2e/quarantine.js';", 'const quarentena = [];',
    );
    for (const [name, url, expectServer] of [
      ['local padrão', undefined, true],
      ['local explícito', 'http://localhost:5174', true],
      ['HTTPS canônico público', APP, false],
      ['HTTPS externo público', 'https://example.invalid/app/', false],
    ]) {
      await t.test(`config: ${name}`, async () => {
        if (url) process.env.PLAYWRIGHT_BASE_URL = url;
        else delete process.env.PLAYWRIGHT_BASE_URL;
        const { default: config } = await import(dataModule(`${configSource}\n// ${name}`));
        assert.equal(Boolean(config.webServer), expectServer);
        assert.equal(config.use.baseURL, url ?? 'http://localhost:5173');
        for (const publicProject of ['chromium', 'firefox-auth', 'webkit-auth']) {
          const project = config.projects.find(item => item.name === publicProject);
          assert(project, `Projeto público ausente: ${publicProject}`);
          assert.equal(project.dependencies?.length ?? 0, 0);
          assert.equal(project.use.storageState, undefined);
        }
      });
    }
    await t.test('config: URL malformada não imprime credencial', async () => {
      process.env.PLAYWRIGHT_BASE_URL = 'https://usuario:segredo-inventado@';
      await assert.rejects(import(dataModule(`${configSource}\n// invalid-url`)), error =>
        error.code === 'TARGET_INVALID' && error.input === undefined &&
        !/usuario|segredo-inventado/.test(error.message),
      );
    });
    assert.equal(fetchCalls, 0);
    assert(warnings.every(value => !value.includes('offline@example.invalid') && !value.includes('offline-probe-never-auth')));
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    for (const [name, value] of [['E2E_TEST_EMAIL', originalEmail], ['E2E_TEST_PASSWORD', originalPassword], ['PLAYWRIGHT_BASE_URL', originalBase]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    delete globalThis.__offlineAuthProbe;
  }
});
