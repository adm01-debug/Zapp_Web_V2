// API de issues em memória. Executa o github-script real e o marcador versionado;
// não envia mensagens nem lê relatórios privados do Playwright.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPS, GROUP_SHARDS } from '../e2e-isolated/runtime-contract.mjs';
import { jobOf, nestedValue, onlyStep, scriptOf, stepsOf } from './workflow-test-support.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const yaml = readFileSync(join(root, '.github/workflows/e2e-logado.yml'), 'utf8');
const alert = onlyStep(stepsOf(jobOf(yaml, 'e2e-logado')), step => scriptOf(step).includes('github.rest.issues.create('), 'alerta');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const body = new AsyncFunction('github', 'context', 'core', 'process', 'fetch', scriptOf(alert));
const title = '[e2e-logado] Suíte logada quebrada na main';
const sentinel = 'synthetic-private-email-and-token-never-published';
const key = 'a'.repeat(64);
const rejected = ['failed', 'flaky', 'unexpected_pass', 'skipped_explicit', 'skipped_runtime', 'not_run', 'missing_from_report', 'extra_reported'];
const accepted = ['passed', 'expected_failure', 'known_runtime_skip'];
const authenticatedGroup = Object.keys(GROUP_SHARDS)[0];
const scenarios = [];
for (const [group, projects] of Object.entries(GROUPS)) for (const outcome of [...rejected, ...accepted]) scenarios.push({
  name: `${group}/${outcome}`, group, ready: 'true',
  summary: { schema: 1, cases: [{ project: projects[0], key, outcome, title: sentinel, error: sentinel }] },
  names: rejected.includes(outcome) ? [`${projects[0]}:${key}`] : [],
});
for (const badKey of ['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), sentinel]) scenarios.push({
  name: `key inválida ${JSON.stringify(badKey)}`, group: authenticatedGroup, ready: 'true',
  summary: { schema: 1, cases: [{ project: 'setup', key: badKey, outcome: 'failed' }] }, names: [],
});
for (const project of ['chromium-mapa', 'chromium', '../outside', sentinel, '']) scenarios.push({
  name: `projeto fora do grupo ${JSON.stringify(project)}`, group: authenticatedGroup, ready: 'true',
  summary: { schema: 1, cases: [{ project, key, outcome: 'failed' }] }, names: [],
});
for (const ready of ['false', '', true, undefined]) scenarios.push({
  name: `redator não confirmou ${JSON.stringify(ready)}`, group: authenticatedGroup, ready,
  summary: { schema: 1, cases: [{ project: 'setup', key, outcome: 'failed' }] }, names: [],
});
for (const [name, summary] of [['ausente', undefined], ['null', null], ['sem cases', { schema: 1 }], ['schema errado', { schema: 2, cases: [] }], ['objeto em cases', { schema: 1, cases: {} }], ['JSON inválido', sentinel]]) scenarios.push({
  name, group: authenticatedGroup, ready: 'true', summary, names: [],
});
scenarios.push({ name: 'cleanup falhou depois dos casos aprovados', group: authenticatedGroup, ready: 'true', summary: { schema: 1, ok: true, cases: [{ project: 'setup', key, outcome: 'passed' }] }, names: [] });

function fakeApi() {
  const issues = [];
  return { issues, github: { rest: { issues: {
    async listForRepo() { return { data: issues }; },
    async create(args) { issues.push({ ...args, number: 1, comments: [] }); },
    async listComments() { return { data: issues[0].comments }; },
    async createComment({ body: text }) { issues[0].comments.push({ body: text }); },
  } } } };
}

async function execute(scenario, api = fakeApi()) {
  const temp = mkdtempSync(join(tmpdir(), 'e2e-public-alert-'));
  const logs = [];
  try {
    if (scenario.summary !== undefined) writeFileSync(join(temp, 'results-summary.json'), typeof scenario.summary === 'string' ? scenario.summary : JSON.stringify(scenario.summary));
    await body(api.github, { repo: { owner: 'offline', repo: 'fixture' } }, { info(message) { logs.push(message); } }, { env: {
      GITHUB_WORKSPACE: root, TITULO: title, PUBLIC_REPORT: temp,
      REPORT_READY: scenario.ready, E2E_GROUP: scenario.group,
    } }, () => { throw new Error('rede proibida neste teste'); });
    return { ...api, logs };
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

for (const scenario of scenarios) test(`alerta público: ${scenario.name}`, async () => {
  const { issues, logs } = await execute(scenario);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].title, title);
  assert.equal(issues[0].body.includes(sentinel), false);
  assert.equal(logs.join('\n').includes(sentinel), false);
  assert.match(issues[0].body, /<!-- e2e-logado-specs:[a-f0-9]{16} -->/);
  for (const name of scenario.names) assert.ok(issues[0].body.includes(name));
  if (!scenario.names.length) assert.match(issues[0].body, /preparo, coleta ou limpeza também bloqueiam/);
});

test('alerta público: mesma causa não comenta; causa diferente reutiliza a mesma issue', async () => {
  const api = fakeApi();
  const scenario = scenarios[0];
  await execute(scenario, api);
  await execute(scenario, api);
  assert.equal(api.issues.length, 1);
  assert.equal(api.issues[0].comments.length, 0);
  await execute({ ...scenario, summary: { schema: 1, cases: [{ project: 'setup', key: 'b'.repeat(64), outcome: 'failed' }] } }, api);
  assert.equal(api.issues.length, 1);
  assert.equal(api.issues[0].comments.length, 1);
  assert.match(api.issues[0].comments[0].body, /Falha nova, causa diferente/);
  assert.equal(nestedValue(alert, 'env', 'PUBLIC_REPORT'), '${{ runner.temp }}/e2e-isolated-suite-${{ matrix.name }}/public');
  assert.equal(nestedValue(alert, 'env', 'REPORT_READY'), '${{ steps.suite.outputs.report_ready }}');
  assert.equal(nestedValue(alert, 'env', 'E2E_GROUP'), '${{ matrix.name }}');
});
