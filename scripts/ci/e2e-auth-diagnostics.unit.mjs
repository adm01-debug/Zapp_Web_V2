import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AuthTargetError, assertAuthenticatedTarget, classifyAuthTarget,
  diagnoseAuthFailure, isAuthLoginRequest, usesExternalHttpsServer,
} from '../../e2e/auth-diagnostics.ts';

const APP = 'https://zapp-web-v2.vercel.app';
const BACKEND = 'https://tnnnlkbymytvtqngbbqh.supabase.co';

function isCode(code) {
  return error => error instanceof AuthTargetError && error.code === code;
}

const targets = [
  ['alias canônico HTTPS', APP, 'remote'],
  ['preview do projeto', 'https://zappwebv2-feature-123-juca1.vercel.app', 'remote'],
  ['localhost', 'http://localhost:5173', 'local'],
  ['loopback IPv4', 'http://127.0.0.1:5174/', 'local'],
  ['loopback IPv6', 'http://[::1]:5173', 'local'],
  ['HTTPS local', 'https://localhost:5173', 'local'],
  ['HTTPS remoto explícito na porta padrão', `${APP}:443/`, 'remote'],
  ['alvo vazio', '', 'TARGET_INVALID'],
  ['alvo ausente', undefined, 'TARGET_INVALID'],
  ['URL relativa', '/auth', 'TARGET_INVALID'],
  ['espaços externos', ` ${APP}`, 'TARGET_INVALID'],
  ['controle no alvo', `${APP}\n`, 'TARGET_INVALID'],
  ['credencial embutida', 'https://usuario:segredo-inventado@zapp-web-v2.vercel.app', 'TARGET_CREDENTIALS'],
  ['caminho adicional', `${APP}/auth`, 'TARGET_NOT_ORIGIN'],
  ['query no alvo', `${APP}/?next=local`, 'TARGET_NOT_ORIGIN'],
  ['fragmento no alvo', `${APP}/#auth`, 'TARGET_NOT_ORIGIN'],
  ['origem remota HTTP', 'http://zapp-web-v2.vercel.app', 'TARGET_HTTPS_REQUIRED'],
  ['porta remota alternativa', `${APP}:8443`, 'TARGET_HTTPS_REQUIRED'],
  ['esquema não HTTP', 'ftp://zapp-web-v2.vercel.app', 'TARGET_HTTPS_REQUIRED'],
  ['origem externa', 'https://example.invalid', 'TARGET_ORIGIN_REJECTED'],
  ['preview de outra equipe', 'https://zappwebv2-123-outra.vercel.app', 'TARGET_ORIGIN_REJECTED'],
  ['sufixo hostil', 'https://zapp-web-v2.vercel.app.example.invalid', 'TARGET_ORIGIN_REJECTED'],
  ['localhost aparente', 'https://localhost.example.invalid', 'TARGET_ORIGIN_REJECTED'],
  ['domínio próprio ainda não verificado', 'https://zappweb.app.br', 'TARGET_DOMAIN_UNVERIFIED'],
  ['www ainda não verificado', 'https://www.zappweb.app.br', 'TARGET_DOMAIN_UNVERIFIED'],
];
for (const [name, input, expected] of targets) {
  test(`origem: ${name}`, () => {
    if (expected === 'local' || expected === 'remote') {
      assert.equal(classifyAuthTarget(input).kind, expected);
    } else {
      assert.throws(() => classifyAuthTarget(input), isCode(expected));
    }
  });
}


test('setup bloqueia suíte mutadora remota antes de qualquer I/O', () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('I/O não permitido'); };
  try {
    assert.throws(() => assertAuthenticatedTarget(APP), isCode('REMOTE_FULL_SUITE_BLOCKED'));
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('setup bloqueia preview remoto, mesmo pertencendo ao projeto', () => {
  assert.throws(() => assertAuthenticatedTarget('https://zappwebv2-feature-juca1.vercel.app'), isCode('REMOTE_FULL_SUITE_BLOCKED'));
});

test('setup preserva fluxo local sem declarar backend isolado', () => {
  assert.deepEqual(assertAuthenticatedTarget('http://localhost:5173'), { kind: 'local', origin: 'http://localhost:5173' });
});

// Não é uma validação de deployment: esses cenários provam apenas que informar
// SHA por ambiente não permite contornar a guarda específica da suíte mutadora.
for (const [name, sha] of [
  ['SHA igual ao código', 'a'.repeat(40)],
  ['SHA diferente do código', 'b'.repeat(40)],
  ['SHA ausente', undefined],
]) {
  test(`setup não autoriza remoto por ${name}`, () => {
    const previous = process.env.E2E_EXPECTED_COMMIT_SHA;
    if (sha === undefined) delete process.env.E2E_EXPECTED_COMMIT_SHA;
    else process.env.E2E_EXPECTED_COMMIT_SHA = sha;
    try {
      assert.throws(() => assertAuthenticatedTarget(APP), isCode('REMOTE_FULL_SUITE_BLOCKED'));
    } finally {
      if (previous === undefined) delete process.env.E2E_EXPECTED_COMMIT_SHA;
      else process.env.E2E_EXPECTED_COMMIT_SHA = previous;
    }
  });
}

const serverTargets = [
  ['padrão sem URL explícita', undefined, false],
  ['localhost HTTP', 'http://localhost:5173', false],
  ['loopback IPv4 HTTP', 'http://127.0.0.1:5173', false],
  ['loopback IPv6 HTTP', 'http://[::1]:5173', false],
  ['localhost HTTPS continua local', 'https://localhost:5173', false],
  ['HTTPS canônico público', APP, true],
  ['HTTPS preview público', 'https://zappwebv2-feature-juca1.vercel.app', true],
  ['HTTPS externo público preservado', 'https://example.invalid', true],
  ['HTTPS público com caminho preservado', 'https://example.invalid/app/', true],
  ['HTTPS público com porta preservada', 'https://example.invalid:8443', true],
  ['HTTP remoto não desativa Vite silenciosamente', 'http://example.invalid', false],
];
for (const [name, url, expected] of serverTargets) {
  test(`webServer: ${name}`, () => {
    assert.equal(usesExternalHttpsServer(url), expected);
  });
}

test('erro não reflete credenciais embutidas na URL', () => {
  assert.throws(
    () => assertAuthenticatedTarget('https://usuario:segredo-inventado@zapp-web-v2.vercel.app'),
    error => error.code === 'TARGET_CREDENTIALS' && !/usuario|segredo-inventado/.test(error.message),
  );
});

test('parser global da config não reflete URL inválida com credenciais', () => {
  assert.throws(
    () => usesExternalHttpsServer('https://usuario:segredo-inventado@'),
    error => error.code === 'TARGET_INVALID' && error.input === undefined &&
      error.cause === undefined && !/usuario|segredo-inventado/.test(error.message),
  );
});

const diagnoses = [
  ['CORS localhost oficial', 'http://localhost:5173', { backendOrigin: BACKEND, transportFailed: true }, 'CORS_ORIGIN_INCOMPATIBLE', false],
  ['CORS loopback oficial', 'http://127.0.0.1:5173', { backendOrigin: BACKEND }, 'CORS_ORIGIN_INCOMPATIBLE', false],
  ['transporte em origem autorizada', APP, { backendOrigin: BACKEND, transportFailed: true }, 'TRANSPORT_FAILED', true],
  ['backend local não herda diagnóstico de CORS oficial', 'http://localhost:5173', { backendOrigin: 'http://127.0.0.1:54321', transportFailed: true }, 'TRANSPORT_FAILED', true],
  ['HTTP 401 observado', APP, { status: 401 }, 'AUTH_REJECTED', false],
  ['HTTP 403 observado', APP, { status: 403 }, 'AUTH_REJECTED', false],
  ['recusa específica na UI', APP, { credentialRejected: true }, 'AUTH_REJECTED', false],
  ['HTTP 429 observado', APP, { status: 429 }, 'RATE_LIMIT', true],
  ['HTTP 500 observado', APP, { status: 500 }, 'UPSTREAM_HTTP', true],
  ['HTTP 503 vence hipótese de CORS', 'http://localhost:5173', { backendOrigin: BACKEND, status: 503 }, 'UPSTREAM_HTTP', true],
  ['HTTP 400 não prova senha incorreta', APP, { status: 400 }, 'REQUEST_REJECTED', false],
  ['HTTP 200 não prova app autenticada', APP, { status: 200, timedOut: true }, 'LOGIN_RESULT_NOT_CONFIRMED', false],
  ['prazo de espera sem status', APP, { timedOut: true }, 'WAIT_TIMEOUT', true],
  ['sem evidência de resposta', APP, {}, 'NO_HTTP_EVIDENCE', false],
  ['alvo externo rejeitado', 'https://example.invalid', { transportFailed: true }, 'TARGET_ORIGIN_REJECTED', false],
];
for (const [name, target, observation, code, retryable] of diagnoses) {
  test(`diagnóstico: ${name}`, () => {
    const result = diagnoseAuthFailure(target, observation);
    assert.equal(result.code, code);
    assert.equal(result.retryable, retryable);
  });
}

test('observador só aceita o pathname auth-login completo', () => {
  assert.equal(isAuthLoginRequest(`${BACKEND}/functions/v1/auth-login`), true);
  assert.equal(isAuthLoginRequest(`${BACKEND}/functions/v1/auth-login?x=1`), true);
  assert.equal(isAuthLoginRequest(`${BACKEND}/functions/v1/auth-login-extra`), false);
  assert.equal(isAuthLoginRequest(`${BACKEND}/rest/v1/messages`), false);
  assert.equal(isAuthLoginRequest('não é uma URL'), false);
});

