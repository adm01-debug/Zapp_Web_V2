import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { GROUPS } from '../e2e-isolated/runtime-contract.mjs';
import {
  assertBlocking, conditionAllows, conditionOf, jobOf, nestedValue, onlyStep,
  permission, runOf, scriptOf, stepsOf, valueOf,
} from './workflow-test-support.mjs';

const root = new URL('../../', import.meta.url);
const yaml = readFileSync(new URL('.github/workflows/e2e-logado.yml', root), 'utf8');
const job = jobOf(yaml, 'e2e-logado');
const steps = stepsOf(job);
const request = onlyStep(steps, step => valueOf(step, 'id') === 'request', 'admissão antes do checkout');
const controller = onlyStep(steps, step => valueOf(step, 'id') === 'suite', 'controller isolado');
const alert = onlyStep(steps, step => scriptOf(step).includes('github.rest.issues.create('), 'alerta existente');
const temp = mkdtempSync(join(tmpdir(), 'e2e-legacy-workflow-'));
after(() => rmSync(temp, { recursive: true, force: true }));
const fixture = join(temp, 'scripts/e2e-isolated');
mkdirSync(fixture, { recursive: true });
cpSync(fileURLToPath(new URL('scripts/e2e-isolated/runtime-contract.mjs', root)), join(fixture, 'runtime-contract.mjs'));
writeFileSync(join(fixture, 'run.sh'), '#!/bin/bash\nnode -e \'require("node:fs").writeFileSync(process.env.RECORDED, JSON.stringify(process.argv.slice(1)))\' -- "$@"\nexit "${CONTROLLER_EXIT:-0}"\n');
const sha = 'a'.repeat(40), newer = 'b'.repeat(40);
const base = {
  EVENT_NAME: 'workflow_run', SOURCE_CONCLUSION: 'success', SOURCE_EVENT: 'push', SOURCE_BRANCH: 'main',
  SOURCE_REPOSITORY: 'owner/repo', REPOSITORY: 'owner/repo', SOURCE_SHA: sha,
  DISPATCH_REF: 'refs/heads/main', DISPATCH_SHA: newer,
};
let sequence = 0;
function bash(code, env) {
  return spawnSync('bash', ['-s'], { input: code, cwd: temp, encoding: 'utf8', timeout: 10000, env: { PATH: process.env.PATH, ...env } });
}
function admission(changes, expectedSha) {
  const env = { ...base, ...changes };
  const output = join(temp, 'output-' + sequence++);
  writeFileSync(output, '');
  const result = bash(runOf(request), { ...env, GITHUB_OUTPUT: output });
  assert.equal(result.status, expectedSha ? 0 : 1, result.stderr);
  assert.equal(readFileSync(output, 'utf8'), expectedSha ? `sha=${expectedSha}\n` : '');
  const jobAllowed = conditionAllows(conditionOf(job, 4), {
    'github.event_name': env.EVENT_NAME,
    'github.event.workflow_run.conclusion': env.SOURCE_CONCLUSION,
    'github.event.workflow_run.event': env.SOURCE_EVENT,
    'github.event.workflow_run.head_branch': env.SOURCE_BRANCH,
    'github.event.workflow_run.head_repository.full_name': env.SOURCE_REPOSITORY,
    'github.repository': env.REPOSITORY,
  });
  if (expectedSha) assert.equal(jobAllowed, true);
  if (env.EVENT_NAME === 'workflow_run' && ['SOURCE_CONCLUSION', 'SOURCE_EVENT', 'SOURCE_BRANCH', 'SOURCE_REPOSITORY'].some(key => env[key] !== base[key])) assert.equal(jobAllowed, false);
}

test('main: workflow_run fixa o SHA aprovado mesmo se a main já avançou', () => admission({}, sha));
test('main: dispatch fixa o SHA capturado no evento', () => admission({ EVENT_NAME: 'workflow_dispatch' }, newer));
for (const value of ['failure', 'cancelled', 'skipped', 'timed_out', 'neutral', '']) {
  test(`main: CI de origem ${JSON.stringify(value)} não admite checkout`, () => admission({ SOURCE_CONCLUSION: value }));
}
for (const value of ['pull_request', 'workflow_dispatch', 'schedule', '']) {
  test(`main: evento de origem ${JSON.stringify(value)} não comprova push`, () => admission({ SOURCE_EVENT: value }));
}
for (const value of ['feature', 'refs/heads/main', 'Main', '']) {
  test(`main: branch de origem ${JSON.stringify(value)} não é main`, () => admission({ SOURCE_BRANCH: value }));
}
for (const value of ['fork/repo', 'owner/other', '']) {
  test(`main: repositório de origem ${JSON.stringify(value)} não é o checkout confiável`, () => admission({ SOURCE_REPOSITORY: value }));
}
for (const value of ['refs/heads/feature', 'refs/tags/main', 'main', '', 'refs/heads/main\n']) {
  test(`main: dispatch rejeita ref ${JSON.stringify(value)}`, () => admission({ EVENT_NAME: 'workflow_dispatch', DISPATCH_REF: value }));
}
for (const value of ['', 'a'.repeat(39), 'a'.repeat(41), 'A'.repeat(40), 'g'.repeat(40), '0'.repeat(40), sha + '\n', 'refs/heads/main', '$(id)']) {
  for (const event of ['workflow_run', 'workflow_dispatch']) {
    test(`main: ${event} rejeita SHA ${JSON.stringify(value)}`, () => admission({ EVENT_NAME: event, SOURCE_SHA: value, DISPATCH_SHA: value }));
  }
}
for (const event of ['push', 'pull_request', 'schedule', '']) {
  test(`main: rejeita evento ${JSON.stringify(event)}`, () => admission({ EVENT_NAME: event }));
}

for (const [group, projects] of Object.entries(GROUPS)) for (const status of [0, 1, 137]) {
  test(`legado: Bash real entrega ${group} ao controller e propaga ${status}`, () => {
    const recorded = join(temp, 'argv-' + sequence++);
    const output = join(temp, 'output with spaces');
    const result = bash(runOf(controller), {
      E2E_GROUP: group, E2E_PROJECTS: projects.map(name => '--project=' + name).join(' '), E2E_OUTPUT: output,
      RECORDED: recorded, CONTROLLER_EXIT: String(status),
    });
    assert.equal(result.status, status, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(recorded, 'utf8')), ['suite', group, output]);
  });
}
for (const [group, projects] of [['unknown', ''], ['authenticated', '--project=setup'], ['authenticated;id', '--project=setup'], ['deslogado-principal', GROUPS['deslogado-principal'].map(name => '--project=' + name).reverse().join(' ')]]) {
  test(`legado: inventário inválido de ${JSON.stringify(group)} bloqueia antes do controller`, () => {
    const recorded = join(temp, 'argv-' + sequence++);
    const result = bash(runOf(controller), { E2E_GROUP: group, E2E_PROJECTS: projects, E2E_OUTPUT: join(temp, 'output'), RECORDED: recorded });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(existsSync(recorded), false);
  });
}

test('legado conserva os gatilhos, fila e main-only sem secrets nem chamadas de produção', () => {
  const on = valueOf(yaml, 'on', 0);
  assert.deepEqual([...on.matchAll(/^([\w-]+):/gm)].map(match => match[1]).sort(), ['workflow_dispatch', 'workflow_run']);
  const source = valueOf(on, 'workflow_run', 0);
  assert.equal(valueOf(source, 'workflows', 0), '["CI/CD Pipeline"]');
  assert.equal(valueOf(source, 'branches', 0), '[main]');
  assert.equal(valueOf(source, 'types', 0), '[completed]');
  assert.equal(valueOf(on, 'workflow_dispatch', 0), '');
  const concurrency = valueOf(yaml, 'concurrency', 0);
  assert.equal(valueOf(concurrency, 'group', 0), "${{ github.ref == 'refs/heads/main' && 'e2e-logado' || format('e2e-logado-branch-{0}', github.run_id) }}");
  assert.equal(valueOf(concurrency, 'cancel-in-progress', 0), 'false');
  assert.equal(permission(yaml, 'contents', 0), 'read');
  assert.equal(permission(yaml, 'issues', 0), undefined);
  assert.equal(permission(job, 'issues'), 'write');
  assert.doesNotMatch(yaml, /secrets\s*\.|supabase\.co|curl\b|node scripts\/ci\/e2e-teardown\.mjs|SERVICE_ROLE_KEY|E2E_TEST_PASSWORD|E2E_TEST_EMAIL/);
  const checkout = onlyStep(steps, step => valueOf(step, 'id') === 'checkout', 'checkout');
  assert.equal(nestedValue(checkout, 'with', 'ref'), '${{ steps.request.outputs.sha }}');
  assert.equal(nestedValue(checkout, 'with', 'persist-credentials'), 'false');
  assert.ok(steps.indexOf(request) < steps.indexOf(checkout));
  for (const [key, value] of Object.entries({
    EVENT_NAME: '${{ github.event_name }}', SOURCE_CONCLUSION: '${{ github.event.workflow_run.conclusion }}',
    SOURCE_EVENT: '${{ github.event.workflow_run.event }}', SOURCE_BRANCH: '${{ github.event.workflow_run.head_branch }}',
    SOURCE_REPOSITORY: '${{ github.event.workflow_run.head_repository.full_name }}', REPOSITORY: '${{ github.repository }}',
    SOURCE_SHA: '${{ github.event.workflow_run.head_sha }}', DISPATCH_REF: '${{ github.ref }}', DISPATCH_SHA: '${{ github.sha }}',
  })) assert.equal(nestedValue(request, 'env', key), value);
  assertBlocking(job, 4);
  for (const step of steps) assertBlocking(step);
});

test('legado prepara Bun e ferramentas TLS antes do backend; browsers vêm da imagem fixada', () => {
  const bun = onlyStep(steps, step => /setup-bun@/.test(valueOf(step, 'uses') ?? ''), 'Bun');
  const install = onlyStep(steps, step => /bun install/.test(runOf(step)), 'instalação frozen');
  const tls = onlyStep(steps, step => /libnss3-tools/.test(runOf(step)), 'ferramentas TLS');
  assert.equal(nestedValue(bun, 'with', 'bun-version'), '1.4.0');
  assert.match(runOf(install), /bun install --frozen-lockfile --ignore-scripts/);
  assert.match(runOf(tls), /sudo apt-get update\n.*sudo apt-get install --no-install-recommends -y openssl libnss3-tools/);
  assert.ok(steps.indexOf(install) < steps.indexOf(controller));
  assert.ok(steps.indexOf(tls) < steps.indexOf(controller));
  assert.doesNotMatch(steps.map(runOf).join('\n'), /playwright.*install|update-ca-certificates|NODE_TLS_REJECT_UNAUTHORIZED|ignoreHTTPSErrors/);
  assert.equal(nestedValue(controller, 'env', 'E2E_GROUP'), '${{ matrix.name }}');
  assert.equal(nestedValue(controller, 'env', 'E2E_PROJECTS'), '${{ matrix.projects }}');
  assert.equal(nestedValue(controller, 'env', 'E2E_OUTPUT'), '${{ runner.temp }}/e2e-isolated-suite-${{ matrix.name }}');
});

for (const failed of [false, true]) for (const checkout of ['success', 'failure', 'skipped', 'cancelled']) {
  test(`alerta preservado exige checkout confiável: failure=${failed}, checkout=${checkout}`, () => {
    assert.equal(conditionAllows(conditionOf(alert), { 'failure()': failed, 'steps.checkout.outcome': checkout }), failed && checkout === 'success');
  });
}
