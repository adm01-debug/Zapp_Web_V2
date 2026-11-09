import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import {
  ISOLATED_HTTP_ORIGIN, observeIsolatedFunctionPosts, requireSipNotConfigured,
  requireDeviceResult, readIsolatedSessionIdentity, requireSessionAbsent,
  requireCanonicalSession, requireOwnedDevice, requireSameKnownSession,
  readBearerAccessToken, readLoginAccessToken, requireSyntheticUser, requireFreshAuthSession,
} from '../../e2e/fixtures/function-completion.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const authSessionId = '22222222-2222-4222-8222-222222222222';
const deviceId = '33333333-3333-4333-8333-333333333333';
const publicSessionId = '44444444-4444-4444-8444-444444444444';
const anotherId = '55555555-5555-4555-8555-555555555555';
const identity = { userId, authSessionId };
const device = { is_new_device: false, device_id: deviceId, session_id: publicSessionId, message: 'Known device updated' };
const sip = { error: 'SIP não configurado', code: 'SIP_NOT_CONFIGURED' };
const canonical = { id: publicSessionId, user_id: userId, auth_session_id: authSessionId, device_id: deviceId, is_active: true };

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function tracked(promise) {
  const state = { phase: 'pending' };
  state.settled = promise.then(
    value => { state.phase = 'fulfilled'; state.value = value; },
    error => { state.phase = 'rejected'; state.error = error; },
  );
  return state;
}
function fakeCall(name, options = {}) {
  const responseReady = deferred();
  const finished = deferred();
  const url = options.url ?? ISOLATED_HTTP_ORIGIN + '/functions/v1/' + name;
  const counters = { response: 0, finished: 0, json: 0 };
  const request = {
    method: () => options.method ?? 'POST',
    url: () => url,
    response: () => { counters.response += 1; return responseReady.promise; },
  };
  const response = {
    request: () => options.foreignRequest ? {} : request,
    url: () => options.responseUrl ?? url,
    status: () => options.status ?? (name === 'get-sip-password' ? 503 : 200),
    finished: () => { counters.finished += 1; return finished.promise; },
    json: async () => {
      counters.json += 1;
      if (options.badJson) throw new Error('SENSITIVE-RAW-NATIVE');
      return options.body ?? (name === 'get-sip-password' ? sip : device);
    },
  };
  return { request, response, responseReady, finished, counters };
}
function assertSafeRejection(state) {
  assert.equal(state.phase, 'rejected');
  assert.match(state.error.message, /^\[e2e-http\/[a-z-]+\]$/);
  assert.doesNotMatch(state.error.message, /SENSITIVE/);
}

for (const name of ['get-sip-password', 'detect-new-device']) {
  for (const timing of ['before-wait', 'during-wait', 'later-turn']) {
    for (const outcome of ['valid', 'pending-headers', 'no-response', 'unfinished', 'invalid-json', 'request-failed']) {
      test('observação: ' + name + ' / ' + timing + ' / ' + outcome, async () => {
        const page = new EventEmitter();
        const observation = observeIsolatedFunctionPosts(page, name);
        const call = fakeCall(name, { badJson: outcome === 'invalid-json' });
        if (timing === 'before-wait') page.emit('request', call.request);
        const state = tracked(observation.completed());
        if (timing === 'later-turn') await nextTurn();
        if (timing !== 'before-wait') page.emit('request', call.request);
        if (outcome === 'pending-headers') {
          await nextTurn();
          assert.equal(state.phase, 'pending');
          assert.equal(call.counters.json, 0);
        }
        if (outcome === 'request-failed') page.emit('requestfailed', call.request);
        else if (outcome === 'no-response') call.responseReady.resolve(null);
        else {
          call.responseReady.resolve(call.response);
          await nextTurn();
          assert.equal(state.phase, 'pending', 'headers sozinhos não concluem');
          assert.equal(call.counters.json, 0);
          call.finished.resolve(outcome === 'unfinished' ? new Error('SENSITIVE-RAW-NATIVE') : null);
        }
        await state.settled;
        if (['valid', 'pending-headers'].includes(outcome)) {
          assert.equal(state.phase, 'fulfilled');
          assert.equal(state.value.length, 1);
          if (name === 'get-sip-password') requireSipNotConfigured(state.value[0]);
          else assert.deepEqual(requireDeviceResult(state.value[0].status, state.value[0].body), device);
        } else assertSafeRejection(state);
        observation.dispose();
        assert.equal(page.listenerCount('request'), 0);
        assert.equal(page.listenerCount('requestfailed'), 0);
        assert.equal(page.listenerCount('close'), 0);
      });
    }
  }
}

const mismatches = [
  { method: 'OPTIONS' }, { method: 'GET' },
  { url: 'https://example.invalid/functions/v1/get-sip-password' },
  { url: 'http://127.0.0.1:5173/functions/v1/get-sip-password' },
  { url: ISOLATED_HTTP_ORIGIN + '/functions/v1/get-sip-password-extra' },
  { url: ISOLATED_HTTP_ORIGIN + '/functions/v1/get-sip-password?unexpected=1' },
  { url: ISOLATED_HTTP_ORIGIN + '/functions/v1/detect-new-device' },
];
for (const [index, options] of mismatches.entries()) {
  test('chamada fora do contrato não satisfaz presença #' + index, async () => {
    const page = new EventEmitter();
    const observation = observeIsolatedFunctionPosts(page, 'get-sip-password');
    const call = fakeCall('get-sip-password', options);
    const state = tracked(observation.completed());
    page.emit('request', call.request);
    await nextTurn();
    assert.equal(state.phase, 'pending');
    assert.equal(call.counters.response, 0);
    observation.dispose();
    await state.settled;
    assertSafeRejection(state);
  });
}

for (const terminal of ['dispose', 'close']) {
  for (const stage of ['zero-requests', 'before-headers', 'before-body']) {
    test('encerramento não aprova: ' + terminal + '/' + stage, async () => {
      const page = new EventEmitter();
      const observation = observeIsolatedFunctionPosts(page, 'get-sip-password');
      const state = tracked(observation.completed());
      if (stage !== 'zero-requests') {
        const call = fakeCall('get-sip-password');
        page.emit('request', call.request);
        if (stage === 'before-body') call.responseReady.resolve(call.response);
      }
      await nextTurn();
      assert.equal(state.phase, 'pending');
      if (terminal === 'close') page.emit('close');
      else observation.dispose();
      await state.settled;
      assertSafeRejection(state);
      observation.dispose();
    });
  }
}

test('segunda chamada iniciada durante a primeira precisa concluir', async () => {
  const page = new EventEmitter();
  const observation = observeIsolatedFunctionPosts(page, 'get-sip-password');
  const first = fakeCall('get-sip-password');
  const second = fakeCall('get-sip-password');
  const state = tracked(observation.completed());
  page.emit('request', first.request);
  first.responseReady.resolve(first.response);
  await nextTurn();
  page.emit('request', second.request);
  first.finished.resolve(null);
  second.responseReady.resolve(second.response);
  await nextTurn();
  assert.equal(state.phase, 'pending');
  second.finished.resolve(null);
  await state.settled;
  assert.equal(state.value.length, 2);
  state.value.forEach(requireSipNotConfigured);
  observation.dispose();
});

test('identidade Request impede contar evento repetido como segunda chamada', async () => {
  const page = new EventEmitter();
  const observation = observeIsolatedFunctionPosts(page, 'get-sip-password');
  const call = fakeCall('get-sip-password');
  page.emit('request', call.request);
  page.emit('request', call.request);
  call.responseReady.resolve(call.response);
  call.finished.resolve(null);
  const calls = await observation.completed();
  assert.equal(calls.length, 1);
  assert.equal(call.counters.response, 1);
  observation.dispose();
});

test('resposta de outra Request reprova sem imprimir corpo', async () => {
  const page = new EventEmitter();
  const observation = observeIsolatedFunctionPosts(page, 'get-sip-password');
  const call = fakeCall('get-sip-password', { foreignRequest: true });
  const state = tracked(observation.completed());
  page.emit('request', call.request);
  call.responseReady.resolve(call.response);
  await state.settled;
  assertSafeRejection(state);
  assert.equal(call.counters.json, 0);
  observation.dispose();
});

test('cleanup preserva listener alheio e é idempotente', () => {
  const page = new EventEmitter();
  const other = () => {};
  page.on('request', other);
  const observation = observeIsolatedFunctionPosts(page, 'get-sip-password');
  observation.dispose();
  observation.dispose();
  assert.deepEqual(page.listeners('request'), [other]);
});

for (const status of [200, 301, 400, 401, 403, 429, 500, 504]) {
  test('SIP recusa status ' + status + ' mesmo com corpo esperado', () => {
    assert.throws(() => requireSipNotConfigured({ status, body: sip }), /sip-contract/);
  });
}
for (const [index, body] of [null, [], {}, { error: 'SIP não configurado' }, { ...sip, code: 'BOOT_ERROR' }, { ...sip, password: 'SENSITIVE' }].entries()) {
  test('SIP recusa corpo alternativo #' + index, () => {
    assert.throws(() => requireSipNotConfigured({ status: 503, body }), /^Error: \[e2e-http\/sip-contract\]$/);
  });
}

test('PK pública diferente do claim Auth é aceita pela relação correta', () => {
  assert.notEqual(publicSessionId, authSessionId);
  requireCanonicalSession([canonical], identity, requireDeviceResult(200, device));
  assert.equal(requireOwnedDevice([{ id: deviceId, user_id: userId, device_fingerprint: 'synthetic' }], identity, device), 'synthetic');
  requireSessionAbsent([]);
  assert.equal(requireSameKnownSession([device, { ...device }], deviceId).session_id, publicSessionId);
});

const badCanonicalRows = [
  null, {}, [], [canonical, canonical],
  [{ ...canonical, id: authSessionId }],
  [{ ...canonical, id: anotherId }],
  [{ ...canonical, user_id: anotherId }],
  [{ ...canonical, auth_session_id: publicSessionId }],
  [{ ...canonical, auth_session_id: anotherId }],
  [{ ...canonical, device_id: anotherId }],
  [{ ...canonical, is_active: false }],
  [{ ...canonical, is_active: undefined }],
];
for (const [index, rows] of badCanonicalRows.entries()) {
  test('relação da sessão reprova inconsistência #' + index, () => {
    assert.throws(() => requireCanonicalSession(rows, identity, device), /session-canonical/);
  });
}
for (const [index, rows] of [null, {}, [canonical], [canonical, canonical]].entries()) {
  test('sessão nova exige ausência prévia #' + index, () => {
    assert.throws(() => requireSessionAbsent(rows), /session-already-present/);
  });
}
for (const [index, results] of [
  [], [device], [device, device, device],
  [device, { ...device, session_id: anotherId }],
  [device, { ...device, device_id: anotherId }],
  [device, { ...device, is_new_device: true }],
  [{ ...device, is_new_device: true }, device],
].entries()) {
  test('duas chamadas da sessão conhecida têm identidade comum #' + index, () => {
    assert.throws(() => requireSameKnownSession(results, deviceId), /session-concurrency/);
  });
}
for (const [index, [status, value]] of [
  [201, device], [401, device], [429, device], [500, device], [200, null],
  [200, { ...device, session_id: null }], [200, { ...device, session_id: 'bad' }],
  [200, { ...device, device_id: 'bad' }], [200, { ...device, is_new_device: 'false' }],
  [200, { ...device, message: 'unexpected' }], [200, { ...device, extra: 'SENSITIVE' }],
].entries()) {
  test('resultado Device exige resposta exata #' + index, () => {
    assert.throws(() => requireDeviceResult(status, value), /device-contract/);
  });
}
for (const [index, rows] of [
  [], null, [{ id: deviceId, user_id: anotherId, device_fingerprint: 'x' }],
  [{ id: anotherId, user_id: userId, device_fingerprint: 'x' }],
  [{ id: deviceId, user_id: userId, device_fingerprint: '' }],
  [{ id: deviceId, user_id: userId, device_fingerprint: 'x'.repeat(501) }],
].entries()) {
  test('dispositivo precisa ser próprio e já conhecido #' + index, () => {
    assert.throws(() => requireOwnedDevice(rows, identity, device), /device-ownership/);
  });
}

const baseClaims = { sub: userId, session_id: authSessionId, role: 'authenticated', iss: ISOLATED_HTTP_ORIGIN + '/auth/v1', exp: Math.floor(Date.now() / 1000) + 3600 };
const token = (claims = baseClaims, header = { alg: 'HS256' }) =>
  Buffer.from(JSON.stringify(header)).toString('base64url') + '.' +
  Buffer.from(JSON.stringify(claims)).toString('base64url') + '.synthetic-signature';

test('parser lê identidade sem confundir claim e PK público (não valida assinatura)', () => {
  assert.deepEqual(readIsolatedSessionIdentity(token()), identity);
});
for (const [index, value] of [
  '', 'opaque', token({ ...baseClaims, sub: 'bad' }), token({ ...baseClaims, session_id: null }),
  token({ ...baseClaims, exp: 1 }), token({ ...baseClaims, role: 'service_role' }),
  token({ ...baseClaims, iss: 'https://example.invalid/auth/v1' }),
  token(baseClaims, { alg: 'none' }), token(null), token(baseClaims, null),
].entries()) {
  test('identidade local rejeita token incompatível sem expor conteúdo #' + index, () => {
    assert.throws(() => readIsolatedSessionIdentity(value), /^Error: \[e2e-http\/session-token\]$/);
  });
}

test('Authorization/login mantêm token apenas em memória', () => {
  assert.equal(readBearerAccessToken('Bearer ' + token()), token());
  assert.equal(readLoginAccessToken({ access_token: token() }), token());
  assert.throws(() => readBearerAccessToken('Basic SENSITIVE'), /authorization/);
  assert.throws(() => readLoginAccessToken({ access_token: null, sensitive: 'SECRET' }), /login-token/);
});

test('sessão nova e usuário autenticado são conferidos sem comparar PK com claim', () => {
  requireFreshAuthSession({ userId, authSessionId: anotherId }, identity);
  requireSyntheticUser({ id: userId, email: 'synthetic@example.invalid' }, identity, 'synthetic@example.invalid');
  assert.throws(() => requireFreshAuthSession(identity, identity), /session-not-fresh/);
  assert.throws(() => requireFreshAuthSession({ userId: anotherId, authSessionId: anotherId }, identity), /session-not-fresh/);
  assert.throws(() => requireSyntheticUser({ id: userId, email: 'other@example.invalid' }, identity, 'synthetic@example.invalid'), /authenticated-user/);
  assert.throws(() => requireSyntheticUser({ id: userId, email: 'real@example.com' }, identity, 'real@example.com'), /authenticated-user/);
});

function controlledClock(t) {
  let now = 0;
  let serial = 0;
  let clears = 0;
  const timers = new Map();
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    const id = ++serial;
    timers.set(id, { callback, due: now + delay });
    return id;
  });
  t.mock.method(globalThis, 'clearTimeout', id => { clears += 1; timers.delete(id); });
  return {
    advance(delta) {
      const target = now + delta;
      for (;;) {
        const next = [...timers.entries()].filter(([, timer]) => timer.due <= target)
          .sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
        if (!next) break;
        const [id, timer] = next;
        now = timer.due;
        timers.delete(id);
        timer.callback();
      }
      now = target;
    },
    get pending() { return timers.size; },
    get clears() { return clears; },
  };
}

for (const stage of ['no-request', 'headers-pending', 'body-pending', 'second-body-pending']) {
  for (const elapsedBeforeBarrier of [0, 10_000, 40_000]) {
    for (const ending of ['success-before-deadline', 'timeout']) {
      test('prazo 30 s: ' + stage + '/' + elapsedBeforeBarrier + '/' + ending, async t => {
        const clock = controlledClock(t);
        const page = new EventEmitter();
        const observation = observeIsolatedFunctionPosts(page, 'get-sip-password');
        const first = fakeCall('get-sip-password');
        const second = fakeCall('get-sip-password');
        if (stage !== 'no-request') page.emit('request', first.request);
        if (stage === 'body-pending') first.responseReady.resolve(first.response);
        if (stage === 'second-body-pending') {
          first.responseReady.resolve(first.response);
          first.finished.resolve(null);
          page.emit('request', second.request);
          second.responseReady.resolve(second.response);
        }
        clock.advance(elapsedBeforeBarrier);
        await nextTurn();
        assert.equal(clock.pending, 0, 'instalar observação/boot não inicia deadline');
        const state = tracked(observation.completed());
        await nextTurn();
        assert.equal(clock.pending, 1);
        clock.advance(29_999);
        await nextTurn();
        assert.equal(state.phase, 'pending');
        if (ending === 'success-before-deadline') {
          if (stage === 'no-request') page.emit('request', first.request);
          first.responseReady.resolve(first.response);
          first.finished.resolve(null);
          second.finished.resolve(null);
        } else clock.advance(1);
        await state.settled;
        assert.equal(state.phase, ending === 'timeout' ? 'rejected' : 'fulfilled');
        if (ending === 'timeout') assert.equal(state.error.message, '[e2e-http/completion-timeout]');
        else state.value.forEach(requireSipNotConfigured);
        assert.equal(clock.pending, 0);
        assert.equal(clock.clears, 1);
        observation.dispose();
        // Término/evento tardio nunca recupera uma barreira que já expirou.
        page.emit('request', fakeCall('get-sip-password').request);
        first.responseReady.resolve(first.response);
        first.finished.resolve(null);
        second.finished.resolve(null);
        clock.advance(60_000);
        await nextTurn();
        assert.equal(clock.pending, 0);
        assert.equal(state.phase, ending === 'timeout' ? 'rejected' : 'fulfilled');
      });
    }
  }
}

for (const ending of ['dispose', 'close', 'requestfailed', 'invalid-json', 'finished-error', 'response-throw', 'no-response', 'foreign-response']) {
  test('deadline é limpo na saída ' + ending, async t => {
    const clock = controlledClock(t);
    const page = new EventEmitter();
    const observation = observeIsolatedFunctionPosts(page, 'get-sip-password');
    const call = fakeCall('get-sip-password', { badJson: ending === 'invalid-json', foreignRequest: ending === 'foreign-response' });
    const state = tracked(observation.completed());
    page.emit('request', call.request);
    if (ending === 'dispose') observation.dispose();
    else if (ending === 'close') page.emit('close');
    else if (ending === 'requestfailed') page.emit('requestfailed', call.request);
    else if (ending === 'response-throw') call.responseReady.reject(new Error('SENSITIVE-RAW-NATIVE'));
    else if (ending === 'no-response') call.responseReady.resolve(null);
    else {
      call.responseReady.resolve(call.response);
      call.finished.resolve(ending === 'finished-error' ? new Error('SENSITIVE-RAW-NATIVE') : null);
    }
    await state.settled;
    assertSafeRejection(state);
    assert.equal(clock.pending, 0);
    assert.equal(clock.clears, 1);
    clock.advance(60_000);
    await nextTurn();
    assert.notEqual(state.error.message, '[e2e-http/completion-timeout]');
    observation.dispose();
  });
}

test('segunda chamada tardia compartilha o prazo inicial, sem mais 30 s', async t => {
  const clock = controlledClock(t);
  const page = new EventEmitter();
  const observation = observeIsolatedFunctionPosts(page, 'get-sip-password');
  const first = fakeCall('get-sip-password');
  const second = fakeCall('get-sip-password');
  const state = tracked(observation.completed());
  page.emit('request', first.request);
  first.responseReady.resolve(first.response);
  clock.advance(29_990);
  page.emit('request', second.request);
  second.responseReady.resolve(second.response);
  first.finished.resolve(null);
  await nextTurn();
  assert.equal(state.phase, 'pending');
  clock.advance(10);
  await state.settled;
  assert.equal(state.error.message, '[e2e-http/completion-timeout]');
  assert.equal(clock.pending, 0);
  assert.equal(clock.clears, 1);
  observation.dispose();
  second.finished.resolve(null);
});

test('resposta concluída antes de completed cancela imediatamente seu deadline', async t => {
  const clock = controlledClock(t);
  const page = new EventEmitter();
  const observation = observeIsolatedFunctionPosts(page, 'get-sip-password');
  const call = fakeCall('get-sip-password');
  page.emit('request', call.request);
  call.responseReady.resolve(call.response);
  call.finished.resolve(null);
  await nextTurn();
  clock.advance(90_000);
  assert.equal(clock.pending, 0);
  const calls = await observation.completed();
  assert.equal(calls.length, 1);
  assert.equal(clock.pending, 0);
  assert.equal(clock.clears, 1);
  observation.dispose();
});

test('evento no instante posterior ao prazo não transforma timeout em aprovação', async t => {
  const clock = controlledClock(t);
  const page = new EventEmitter();
  const observation = observeIsolatedFunctionPosts(page, 'get-sip-password');
  const state = tracked(observation.completed());
  clock.advance(30_000);
  await state.settled;
  const call = fakeCall('get-sip-password');
  page.emit('request', call.request);
  call.responseReady.resolve(call.response);
  call.finished.resolve(null);
  await nextTurn();
  assert.equal(state.phase, 'rejected');
  assert.equal(state.error.message, '[e2e-http/completion-timeout]');
  assert.equal(clock.pending, 0);
  observation.dispose();
});
