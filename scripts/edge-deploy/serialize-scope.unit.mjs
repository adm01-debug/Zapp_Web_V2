import test from 'node:test';
import assert from 'node:assert/strict';
import { GATE_STEP_NAME, blockingRuns, parseScopeFromTitle, waitForTurn } from './serialize-scope.mjs';

test('escopo vem do titulo do run; titulo antigo sem escopo conta como all', () => {
  assert.equal(parseScopeFromTitle('Deploy Edge Functions (send-email)'), 'send-email');
  assert.equal(parseScopeFromTitle('Deploy Edge Functions (all)'), 'all');
  assert.equal(parseScopeFromTitle('Deploy Edge Functions'), 'all');
  assert.equal(parseScopeFromTitle(undefined), 'all');
});

test('funcoes diferentes nao se bloqueiam', () => {
  const me = { id: 20, scope: 'send-email' };
  assert.deepEqual(blockingRuns(me, [{ id: 10, scope: 'detect-new-device', gatePassed: true }]), []);
});

test('all espera deploy por funcao que ja passou do gate, mesmo mais novo', () => {
  const me = { id: 10, scope: 'all' };
  assert.deepEqual(blockingRuns(me, [{ id: 20, scope: 'send-email', gatePassed: true }]).map(r => r.id), [20]);
});

test('deploy por funcao espera o all que ja passou do gate', () => {
  const me = { id: 20, scope: 'send-email' };
  assert.deepEqual(blockingRuns(me, [{ id: 10, scope: 'all', gatePassed: true }]).map(r => r.id), [10]);
});

test('empate no gate: o mais antigo segue, o mais novo espera (sem espera mutua)', () => {
  const older = { id: 10, scope: 'all' };
  const newer = { id: 20, scope: 'send-email' };
  assert.deepEqual(blockingRuns(older, [{ ...newer, gatePassed: false }]), []);
  assert.deepEqual(blockingRuns(newer, [{ ...older, gatePassed: false }]).map(r => r.id), [10]);
});

test('ignora o proprio run', () => {
  assert.deepEqual(blockingRuns({ id: 10, scope: 'all' }, [{ id: 10, scope: 'all', gatePassed: true }]), []);
});

function fakeApi(states, counter = { jobs: 0 }) {
  let call = 0;
  return async (path) => {
    const state = states[Math.min(call, states.length - 1)];
    if (path.includes('/runs?status=in_progress')) { call += 1; return { workflow_runs: state.runs }; }
    counter.jobs += 1;
    const id = Number(/runs\/(\d+)\/jobs/.exec(path)[1]);
    const done = state.gatePassed.includes(id);
    return { jobs: [{ steps: [{ name: GATE_STEP_NAME, status: done ? 'completed' : 'in_progress' }] }] };
  };
}

test('waitForTurn espera o all conflitante terminar e entao segue', async () => {
  let tick = 0;
  const logs = [];
  await waitForTurn({
    me: { id: 20, scope: 'send-email' }, repo: 'o/r', workflowFile: 'w.yml', token: 't',
    get: fakeApi([
      { runs: [{ id: 10, display_title: 'Deploy Edge Functions (all)' }], gatePassed: [10] },
      { runs: [{ id: 10, display_title: 'Deploy Edge Functions (all)' }], gatePassed: [10] },
      { runs: [], gatePassed: [] },
    ]),
    intervalMs: 1, now: () => tick, sleep: async (ms) => { tick += ms; }, log: (m) => logs.push(m),
  });
  assert.equal(logs.length, 2);
  assert.match(logs[0], /10\(all\)/);
});

test('waitForTurn falha alto quando o conflito passa do teto', async () => {
  let tick = 0;
  await assert.rejects(waitForTurn({
    me: { id: 20, scope: 'all' }, repo: 'o/r', workflowFile: 'w.yml', token: 't',
    get: fakeApi([{ runs: [{ id: 10, display_title: 'Deploy Edge Functions (send-email)' }], gatePassed: [10] }]),
    intervalMs: 1_000, maxWaitMs: 5_000, now: () => tick, sleep: async (ms) => { tick += ms; }, log: () => {},
  }), /ainda conflita com run\(s\) 10\(send-email\)/);
});

test('gate ja visto passando nao e reconsultado (cota da API)', async () => {
  let tick = 0;
  const counter = { jobs: 0 };
  const running = { runs: [10, 11, 12].map((id) => ({ id, display_title: `Deploy Edge Functions (fn-${id})` })), gatePassed: [10, 11, 12] };
  await waitForTurn({
    me: { id: 20, scope: 'all' }, repo: 'o/r', workflowFile: 'w.yml', token: 't',
    get: fakeApi([running, running, running, running, { runs: [], gatePassed: [] }], counter),
    intervalMs: 1, now: () => tick, sleep: async (ms) => { tick += ms; }, log: () => {},
  });
  // 4 polls com 3 runs conflitantes: sem cache seriam 12 consultas de jobs; com cache, 3.
  assert.equal(counter.jobs, 3);
});

