// Executa os corpos reais de github-script com uma API somente em memoria.
// O agendamento do Actions nao e emulado: o contrato estrutural abaixo exige
// um job unico dependente da matriz, e os cenarios avaliam seu guard real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPS } from '../e2e-isolated/runtime-contract.mjs';
import {
  conditionAllows, conditionOf, jobOf, jobsOf, nestedValue, onlyStep,
  scriptOf, stepsOf, valueOf,
} from './workflow-test-support.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const workflow = readFileSync(new URL('../../.github/workflows/e2e-logado.yml', import.meta.url), 'utf8');
const matrix = jobOf(workflow, 'e2e-logado');
const groups = [...matrix.matchAll(/^ {10}- name: (.+)$/gm)].map((match) => match[1]);
assert.equal(groups.length, 3, 'atualize os cenarios se os grupos da matriz mudarem');
const alert = onlyStep(stepsOf(matrix), (step) => scriptOf(step).includes('github.rest.issues.create('), 'alerta E2E');
const closing = [...jobsOf(workflow)].flatMap(([id, job]) => stepsOf(job)
  .filter((step) => /state:\s*['"]closed['"]/.test(scriptOf(step))).map((step) => ({ id, job, step })));
assert.equal(closing.length, 1, 'deve existir um unico passo de fechamento');
const close = closing[0];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const body = (step) => new AsyncFunction('github', 'context', 'core', 'process', 'fetch', scriptOf(step));
const alertBody = body(alert);
const closeBody = body(close.step);
const title = nestedValue(alert, 'env', 'TITULO');

test('E83: a recuperacao fica fora da matriz e depende de seu resultado completo', () => {
  assert.notEqual(close.id, 'e2e-logado', 'um grupo verde nao pode fechar o alerta dos demais');
  assert.equal(valueOf(close.job, 'strategy', 4), undefined, 'recuperacao nao deve abrir outra matriz');
  assert.match(valueOf(close.job, 'needs', 4) ?? '', /^(?:e2e-logado|\[\s*e2e-logado\s*\])$/);
  assert.equal(nestedValue(close.step, 'env', 'TITULO'), title);
  assert.equal(conditionOf(close.step), 'success()');
});

function permutations(values) {
  if (!values.length) return [[]];
  return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map((rest) => [value, ...rest]));
}
const orders = permutations(groups);
const scenarios = [];
for (let mask = 0; mask < 2 ** groups.length; mask++) {
  for (const [index, order] of orders.entries()) scenarios.push({
    name: `sucesso/falha ${mask}, ordem ${index + 1}`,
    statuses: Object.fromEntries(groups.map((group, i) => [group, mask & (1 << i) ? 'failure' : 'success'])),
    order, initialOpen: false,
  });
}
for (const status of ['cancelled', 'skipped']) {
  for (const [index, order] of orders.entries()) scenarios.push({
    name: `${status}, ordem ${index + 1}`,
    statuses: Object.fromEntries(groups.map((group, i) => [group, i === 0 ? status : 'success'])),
    order, initialOpen: true,
  });
}
for (const [index, order] of orders.entries()) scenarios.push({
  name: `recuperacao de alerta anterior, ordem ${index + 1}`,
  statuses: Object.fromEntries(groups.map((group) => [group, 'success'])), order, initialOpen: true,
});
scenarios.push({
  name: 'cancelamento global apos os grupos terminarem',
  statuses: Object.fromEntries(groups.map((group) => [group, 'success'])),
  order: orders[0], initialOpen: true, cancelled: true,
});

for (const scenario of scenarios) test(`E83: ${scenario.name}`, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-recovery-'));
  const originalCwd = process.cwd();
  const issues = scenario.initialOpen ? [{ number: 1, title, state: 'open', body: 'Falha anterior', comments: [] }] : [];
  let completed = 0;
  let closeCalls = 0;
  let updates = 0;
  const find = (number) => {
    const issue = issues.find((item) => item.number === number);
    assert.ok(issue, 'numero desconhecido na API fake');
    return issue;
  };
  const github = { rest: { issues: {
    async listForRepo({ state }) { assert.equal(state, 'open'); return { data: issues.filter((issue) => issue.state === 'open') }; },
    async create(args) {
      assert.equal(args.title, title);
      issues.push({ ...args, number: issues.length + 1, state: 'open', comments: [] });
    },
    async listComments({ issue_number }) { return { data: find(issue_number).comments }; },
    async createComment({ issue_number, body: comment }) { find(issue_number).comments.push({ body: comment }); },
    async update({ issue_number, state }) {
      assert.equal(completed, groups.length, 'fechamento antes de todos os grupos terminarem');
      assert.equal(state, 'closed');
      find(issue_number).state = state;
      updates++;
    },
  } } };
  const execute = async (fn, step, group) => {
    const fixture = join(dir, group);
    const published = join(fixture, 'public');
    mkdirSync(published, { recursive: true });
    writeFileSync(join(published, 'results-summary.json'), JSON.stringify({ schema: 1, cases: [{
      project: GROUPS[group]?.[0] ?? 'setup', key: createHash('sha256').update(group).digest('hex'), outcome: 'failed',
    }] }));
    process.chdir(fixture);
    await fn(github, { repo: { owner: 'offline', repo: 'fixture' } }, { info() {} },
      { env: { GITHUB_WORKSPACE: ROOT, TITULO: nestedValue(step, 'env', 'TITULO'),
        PUBLIC_REPORT: published, REPORT_READY: 'true', E2E_GROUP: group } },
      () => { throw new Error('rede proibida neste teste'); });
  };
  try {
    for (const group of scenario.order) {
      const status = scenario.statuses[group];
      completed++;
      if (conditionAllows(conditionOf(alert), {
        'failure()': status === 'failure', 'success()': status === 'success',
        'cancelled()': status === 'cancelled', 'always()': true,
        'steps.checkout.outcome': 'success',
      })) await execute(alertBody, alert, group);
    }
    const statuses = Object.values(scenario.statuses);
    const result = statuses.every((status) => status === 'success') ? 'success'
      : statuses.includes('failure') ? 'failure' : statuses.includes('cancelled') ? 'cancelled' : 'skipped';
    const shouldClose = result === 'success' && !scenario.cancelled;
    if (conditionAllows(conditionOf(close.job, 4), {
      'needs.e2e-logado.result': result,
      'cancelled()': Boolean(scenario.cancelled), 'success()': result === 'success',
      'failure()': result === 'failure', 'always()': true,
    })) { closeCalls++; await execute(closeBody, close.step, 'recovery'); }
    assert.equal(closeCalls, Number(shouldClose), 'o guard real deve liberar somente a recuperacao completa');
    assert.equal(updates, Number(shouldClose && scenario.initialOpen), 'fechar uma vez ou conservar o alerta');
    assert.equal(issues.some((issue) => issue.state === 'open'), !shouldClose && (scenario.initialOpen || statuses.includes('failure')));
  } finally {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});
