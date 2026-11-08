import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { createHash, webcrypto } from 'node:crypto';

// Executa o main loader real. Runtime, JOSE e workers são doubles; nenhum
// handler, JWT real, módulo remoto, banco ou rede é executado por esta suíte.
const mainPath = path.resolve(import.meta.dirname, '../e2e-isolated/main/index.ts');
const source = fs.readFileSync(mainPath, 'utf8');
const executable = stripTypeScriptTypes(source
  .replace(/^import \* as jose from '[^']+'\r?\n/m, '')
  .replace(/^import \{ startMemoryPressureLoop \} from '[^']+'\r?\n/m, '')
  .replace(/^export (?=(?:enum|function) )/gm, ''), { mode: 'transform' });
const bytes = new TextEncoder().encode('offline-runtime-double-eszip-fixture');
const sha = value => createHash('sha256').update(value).digest('hex');
const registry = () => ({ functions: {
  'auth-login': { verify_jwt: false, bundle_sha256: sha(bytes) },
  'message-delivery': { verify_jwt: true, bundle_sha256: sha(bytes) },
} });

async function boot(scenario) {
  let handler, onError;
  const calls = { registry: [], stat: [], bundles: [], workers: [], fetch: [], tags: [], jwt: [] };
  const errors = Object.fromEntries([
    'NotFound', 'InvalidWorkerCreation', 'WorkerRequestCancelled', 'WorkerRequestIdleTimeout',
    'WorkerAlreadyRetired', 'InvalidWorkerResponse',
  ].map(name => [name, class extends Error {}]));
  const env = { JWT_SECRET: 'offline-jwt-double', VERIFY_JWT: 'true',
    SUPABASE_JWKS: '{"keys":[]}', SUPABASE_FUNCTION_SLUG: 'must-be-overridden' };
  if (scenario.noSecret) delete env.JWT_SECRET;
  if (scenario.noJwks) delete env.SUPABASE_JWKS;
  const config = registry();
  scenario.changeRegistry?.(config);
  const jose = {
    createLocalJWKSet: () => ({ local: true }),
    decodeProtectedHeader: token => {
      if (token === 'malformed') throw new Error('bad JWT');
      return { alg: token === 'valid-es' ? 'ES256' : token === 'unsupported' ? 'none' : 'HS256' };
    },
    jwtVerify: async token => {
      calls.jwt.push(token);
      if (token === 'bad-signature') throw new Error('bad signature');
      return { payload: {} };
    },
  };
  const Deno = {
    env: { get: name => env[name], toObject: () => ({ ...env }) },
    errors,
    readTextFile: async file => {
      calls.registry.push(file);
      assert.equal(file, '/run/zapp-e2e/functions.json');
      if (scenario.registryReadError) throw new errors.NotFound();
      return scenario.rawRegistry ?? JSON.stringify(config);
    },
    stat: async file => {
      calls.stat.push(file);
      if (scenario.statError) throw new Error('stat denied');
      if (scenario.sourceMissing) throw new errors.NotFound();
      const name = file.split('/').at(-1);
      if (!Object.hasOwn(config.functions ?? {}, name)) throw new errors.NotFound();
      return { isDirectory: !scenario.sourceIsFile };
    },
    readFile: async file => {
      calls.bundles.push(file);
      if (scenario.bundleMissing) throw new errors.NotFound();
      if (scenario.bundleReadError) throw new Error('bundle denied');
      return scenario.bundleBytes ?? bytes;
    },
    serve: (options, callback) => { onError = options.onError; handler = callback; },
  };
  const EdgeRuntime = {
    applySupabaseTag: (before, after) => calls.tags.push([before.url, after.url]),
    userWorkers: { create: async options => {
      calls.workers.push(options);
      if (scenario.retired === 'always' || calls.workers.length <= (scenario.retired ?? 0)) {
        throw new errors.WorkerAlreadyRetired();
      }
      if (scenario.runtimeError) throw new errors[scenario.runtimeError]();
      if (scenario.unknownError) throw new Error('worker error');
      return { fetch: async request => {
        calls.fetch.push({ url: request.url, body: await request.text(),
          compatibilityHeader: request.headers.get('sb-api-key') });
        return new Response('worker-double', {
          status: scenario.workerStatus ?? 200, headers: { 'x-original': 'kept' },
        });
      } };
    } },
  };
  const context = vm.createContext({
    Deno, EdgeRuntime, jose, crypto: webcrypto, TextEncoder, Uint8Array,
    URL, Request, Response, Headers, console: { log() {}, error() {}, warn() {} },
    startMemoryPressureLoop() {}, addEventListener() {},
  });
  let bootError;
  try { await vm.runInContext('(async () => {\n' + executable + '\n})()', context); }
  catch (error) { bootError = error; }
  return { handler, onError, calls, bootError };
}

const cases = [
  { name: 'auth-login sem token usa verify_jwt false', route: 'auth-login', expected: 200 },
  { name: 'auth-login ignora token inválido conforme política', route: 'auth-login', token: 'malformed', expected: 200 },
  { name: 'função protegida aceita HS256 verificado', token: 'valid-hs', expected: 200 },
  { name: 'função protegida aceita ES256 por JWKS local', token: 'valid-es', expected: 200 },
  { name: 'função protegida recusa ausência de token', expected: 401, code: 'UNAUTHORIZED_NO_AUTH_HEADER' },
  { name: 'função protegida recusa Bearer malformado', authHeader: 'not-bearer', expected: 401, code: 'UNAUTHORIZED_INVALID_JWT_FORMAT' },
  { name: 'função protegida recusa JWT malformado', token: 'malformed', expected: 401, code: 'UNAUTHORIZED_INVALID_JWT_FORMAT' },
  { name: 'função protegida recusa assinatura inválida', token: 'bad-signature', expected: 401, code: 'UNAUTHORIZED_LEGACY_JWT' },
  { name: 'algoritmo sem suporte é recusado', token: 'unsupported', expected: 401, code: 'UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM' },
  { name: 'HS256 sem secret não libera worker', token: 'valid-hs', noSecret: true, expected: 401, code: 'UNAUTHORIZED_LEGACY_JWT' },
  { name: 'ES256 sem JWKS não libera worker', token: 'valid-es', noJwks: true, expected: 401, code: 'UNAUTHORIZED_ASYMMETRIC_JWT' },
  { name: 'OPTIONS preserva exceção JWT do loader oficial', method: 'OPTIONS', expected: 200 },
  { name: 'token de compatibilidade é verificado e removido', authHeader: 'Bearer sb_opaque', compatibility: 'valid-hs', expected: 200 },
  { name: 'nome desconhecido sem token retorna404', route: 'unknown', expected: 404, code: 'NOT_FOUND', noBundle: true },
  { name: 'nome desconhecido com token retorna404', route: 'unknown', token: 'valid-hs', expected: 404, code: 'NOT_FOUND', noBundle: true },
  { name: 'raiz não escolhe função implicitamente', route: '', expected: 404, code: 'NOT_FOUND', noBundle: true },
  { name: 'segmento com barra codificada é recusado', route: 'auth-login%2Fextra', expected: 404, code: 'NOT_FOUND', noBundle: true },
  { name: 'segmento com ponto codificado é recusado', route: 'auth-login%2E', expected: 404, code: 'NOT_FOUND', noBundle: true },
  { name: 'segmento vazio com segunda barra é recusado', route: '/auth-login', expected: 404, code: 'NOT_FOUND', noBundle: true },
  { name: 'diretório shared não vira função', route: '_shared', expected: 404, code: 'NOT_FOUND', noBundle: true },
  { name: 'propriedade de protótipo não vira registro', route: 'constructor', expected: 404, code: 'NOT_FOUND', noBundle: true },
  { name: 'diretório de função ausente preserva404', route: 'auth-login', sourceMissing: true, expected: 404, code: 'NOT_FOUND' },
  { name: 'arquivo no lugar do diretório preserva404', route: 'auth-login', sourceIsFile: true, expected: 404, code: 'NOT_FOUND' },
  { name: 'erro de stat preserva BOOT_ERROR', route: 'auth-login', statError: true, expected: 503, code: 'BOOT_ERROR' },
  { name: 'bundle ausente falha sem fallback', route: 'auth-login', bundleMissing: true, expected: 503, code: 'BOOT_ERROR' },
  { name: 'bundle sem permissão falha sem fallback', route: 'auth-login', bundleReadError: true, expected: 503, code: 'BOOT_ERROR' },
  { name: 'bundle truncado reprova SHA256', route: 'auth-login', bundleBytes: bytes.slice(0, -1), expected: 503, code: 'BOOT_ERROR' },
  { name: 'bundle alterado reprova SHA256', route: 'auth-login', bundleBytes: new Uint8Array(bytes.length), expected: 503, code: 'BOOT_ERROR' },
  { name: 'checksum hexadecimal maiúsculo é equivalente', route: 'auth-login',
    changeRegistry: value => { value.functions['auth-login'].bundle_sha256 = sha(bytes).toUpperCase(); }, expected: 200 },
  { name: 'runtime ainda pode recusar ESZIP apesar de checksum correto', route: 'auth-login',
    runtimeError: 'InvalidWorkerCreation', expected: 503, code: 'BOOT_ERROR', attempts: 1 },
  { name: 'resposta500 do worker conserva código Edge', route: 'auth-login', workerStatus: 500,
    expected: 500, responseHeader: 'EDGE_FUNCTION_ERROR', attempts: 1 },
  { name: 'resposta403 do worker permanece intacta', route: 'auth-login', workerStatus: 403,
    expected: 403, responseHeader: null, attempts: 1 },
  { name: 'aposentadoria única repete antes do dispatch', route: 'auth-login', retired: 1, expected: 200, attempts: 2 },
  { name: 'aposentadoria permanente esgota3retries', route: 'auth-login', retired: 'always',
    expected: 500, code: 'WORKER_ERROR', attempts: 4 },
  { name: 'limite de recurso preserva546', route: 'auth-login', runtimeError: 'WorkerRequestCancelled',
    expected: 546, code: 'WORKER_RESOURCE_LIMIT', attempts: 1 },
  { name: 'idle timeout preserva504', route: 'auth-login', runtimeError: 'WorkerRequestIdleTimeout',
    expected: 504, code: 'IDLE_TIMEOUT', attempts: 1 },
  { name: 'erro desconhecido preserva500', route: 'auth-login', unknownError: true,
    expected: 500, code: 'EDGE_FUNCTION_ERROR', attempts: 1 },
  { name: 'registry ausente impede boot', registryReadError: true, bootFails: true },
  { name: 'JSON inválido impede boot', rawRegistry: '{invalid', bootFails: true },
  { name: 'registry null impede boot', rawRegistry: 'null', bootFails: true },
  { name: 'functions ausente impede boot', rawRegistry: '{}', bootFails: true },
  { name: 'functions array impede boot', rawRegistry: '{"functions":[]}', bootFails: true },
  { name: 'verify_jwt textual impede boot',
    changeRegistry: value => { value.functions['auth-login'].verify_jwt = 'false'; }, bootFails: true },
  { name: 'hash curto impede boot',
    changeRegistry: value => { value.functions['auth-login'].bundle_sha256 = 'a'.repeat(63); }, bootFails: true },
  { name: 'hash não hexadecimal impede boot',
    changeRegistry: value => { value.functions['auth-login'].bundle_sha256 = 'g'.repeat(64); }, bootFails: true },
  { name: 'entrada null impede boot',
    changeRegistry: value => { value.functions['auth-login'] = null; }, bootFails: true },
  { name: 'nome de traversal no registry impede boot',
    changeRegistry: value => { value.functions['../auth-login'] = value.functions['auth-login']; }, bootFails: true },
];

for (const scenario of cases) test('loader isolado: ' + scenario.name, async () => {
  const runtime = await boot(scenario);
  if (scenario.bootFails) {
    assert(runtime.bootError, 'registry inválido deve impedir boot');
    assert.equal(runtime.handler, undefined);
    assert.equal(runtime.calls.workers.length, 0);
    return;
  }
  assert.ifError(runtime.bootError);
  const name = scenario.route ?? 'message-delivery';
  const headers = {};
  if (scenario.token) headers.authorization = 'Bearer ' + scenario.token;
  if (scenario.authHeader) headers.authorization = scenario.authHeader;
  if (scenario.compatibility) headers['sb-api-key'] = scenario.compatibility;
  const request = new Request('http://127.0.0.1:9000/' + name, {
    method: scenario.method ?? 'POST', headers, body: 'request-body-must-survive-retry',
  });
  let response;
  try { response = await runtime.handler(request); }
  catch (error) { response = runtime.onError(error); }
  assert.equal(response.status, scenario.expected);
  if (scenario.code) assert.equal((await response.json()).code, scenario.code);
  if (Object.hasOwn(scenario, 'responseHeader')) {
    assert.equal(response.headers.get('sb-error-code'), scenario.responseHeader);
    assert.equal(response.headers.get('x-original'), 'kept');
  }
  const expectedAttempts = scenario.attempts ?? (scenario.expected === 200 ? 1 : 0);
  assert.equal(runtime.calls.workers.length, expectedAttempts);
  if (scenario.noBundle || scenario.expected === 401) assert.equal(runtime.calls.bundles.length, 0);
  for (const options of runtime.calls.workers) {
    assert.equal(options.servicePath, '/work/supabase/functions/' + name);
    assert.equal(options.allowRemoteModules, false);
    assert.equal(Object.hasOwn(options, 'importMapPath'), false);
    assert.equal(sha(options.maybeEszip), sha(bytes));
    assert.deepEqual(Array.from(Array.from(options.envVars).find(([key]) => key === 'SUPABASE_FUNCTION_SLUG')), ['SUPABASE_FUNCTION_SLUG', name]);
  }
  for (const forwarded of runtime.calls.fetch) {
    assert.equal(forwarded.body, 'request-body-must-survive-retry');
    assert.equal(forwarded.compatibilityHeader, null);
  }
  if (runtime.calls.workers.length) assert.deepEqual(runtime.calls.bundles, ['/bundles/' + name + '.eszip']);
});

test('loader isolado fixa JOSE6.2.15 e recebe ESZIP com hash real', () => {
  assert.match(source, /^import \* as jose from 'jsr:@panva\/jose@6\.2\.15'$/m);
  assert.match(source, /crypto\.subtle\.digest\('SHA-256', maybeEszip\)/);
  assert.doesNotMatch(source, /const VERIFY_JWT =/);
});
