import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { GROUPS, GROUP_SHARDS } from '../e2e-isolated/runtime-contract.mjs';
import {
  assertBlocking, conditionAllows, conditionOf, jobOf, jobsOf, nestedValue,
  onlyStep, permission, runOf, stepsOf, valueOf,
} from './workflow-test-support.mjs';

// Executa os corpos Bash do YAML, não uma reimplementação dos guards. Só o
// controller é substituído: não há Docker, credenciais, rede ou API GitHub.
const root = new URL('../../', import.meta.url);
const yaml = readFileSync(new URL('.github/workflows/e2e-logado-isolado.yml', root), 'utf8');
const metadata = jobOf(yaml, 'image-metadata');
const login = jobOf(yaml, 'bootstrap-login');
const suite = jobOf(yaml, 'full-suite');
const network = jobOf(yaml, 'network-proof');
const request = onlyStep(stepsOf(metadata), step => valueOf(step, 'id') === 'request', 'admissão');
const runSuite = onlyStep(stepsOf(suite), step => valueOf(step, 'id') === 'suite', 'controller da suíte');
const temp = mkdtempSync(join(tmpdir(), 'e2e-isolated-workflow-'));
after(() => rmSync(temp, { recursive: true, force: true }));
const fixture = join(temp, 'scripts/e2e-isolated');
mkdirSync(fixture, { recursive: true });
cpSync(fileURLToPath(new URL('scripts/e2e-isolated/runtime-contract.mjs', root)), join(fixture, 'runtime-contract.mjs'));
writeFileSync(join(fixture, 'run.sh'), '#!/bin/bash\nnode -e \'require("node:fs").writeFileSync(process.env.RECORDED, JSON.stringify(process.argv.slice(1)))\' -- "$@"\nexit "${CONTROLLER_EXIT:-0}"\n');
let sequence = 0;
const sha = 'a'.repeat(40);

function bash(code, env) {
  return spawnSync('bash', ['-s'], {
    input: code, cwd: temp, env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8', timeout: 10000,
  });
}

function assertRequest(env, expected) {
  const output = join(temp, 'output-' + sequence++);
  writeFileSync(output, '');
  const result = bash(runOf(request), { GITHUB_OUTPUT: output, ...env });
  assert.equal(result.status, expected ? 0 : 1, result.stderr);
  const values = Object.fromEntries(readFileSync(output, 'utf8').trim().split('\n').filter(Boolean).map(line => line.split('=')));
  assert.deepEqual(values, expected ?? {});
}

for (const scope of ['', 'login', 'full-suite', 'network-proof', 'network-proof-contexts', 'NETWORK-PROOF-CONTEXTS', ' network-proof-contexts', 'network-proof-contexts ', 'network-proof-contexts\n', 'NETWORK-PROOF', ' network-proof', 'network-proof ', 'network-proof\n', 'LOGIN', 'suite', 'authenticated', ' full-suite', 'full-suite ', 'login\n', '$(id)', '../suite']) {
  for (const event of ['pull_request', 'workflow_dispatch']) {
    test(`admissão real: ${event}, scope ${JSON.stringify(scope)}`, () => {
      const accepted = event === 'pull_request' || ['', 'login', 'full-suite', 'network-proof', 'network-proof-contexts'].includes(scope);
      assertRequest({ EVENT_NAME: event, REQUEST_SCOPE: scope, CHECKOUT_SHA: sha }, accepted ? {
        scope: event === 'pull_request' ? 'login' : scope || 'login', sha,
      } : undefined);
    });
  }
}

for (const event of ['push', 'workflow_run', 'schedule', 'pull_request_target', '']) {
  test(`admissão real: rejeita evento ${JSON.stringify(event)} sem produzir SHA`, () => {
    assertRequest({ EVENT_NAME: event, REQUEST_SCOPE: 'full-suite', CHECKOUT_SHA: sha });
  });
}

for (const badSha of ['', 'a'.repeat(39), 'a'.repeat(41), 'A'.repeat(40), 'g'.repeat(40), '0'.repeat(40), sha + '\n', 'refs/heads/main', '$(id)']) {
  for (const event of ['pull_request', 'workflow_dispatch']) {
    test(`admissão real: ${event} rejeita SHA ${JSON.stringify(badSha)}`, () => {
      assertRequest({ EVENT_NAME: event, REQUEST_SCOPE: 'login', CHECKOUT_SHA: badSha });
    });
  }
}

for (const [group, projects] of Object.entries(GROUPS)) {
  for (const status of [0, 1, 137]) {
    test(`comando real: ${group} preserva argumentos e saída ${status}`, () => {
      const recorded = join(temp, 'argv-' + sequence++);
      const output = join(temp, 'output with spaces');
      const result = bash(runOf(runSuite), {
        E2E_GROUP: group, E2E_PROJECTS: projects.map(name => '--project=' + name).join(' '),
        E2E_OUTPUT: output, RECORDED: recorded, CONTROLLER_EXIT: String(status),
      });
      assert.equal(result.status, status, result.stderr);
      assert.deepEqual(JSON.parse(readFileSync(recorded, 'utf8')), ['suite', group, output]);
    });
  }
}

for (const [group, projects] of [
  ['unknown', ''], ['authenticated', '--project=setup'], ['authenticated;id', '--project=setup'],
  ['deslogado-principal', GROUPS['deslogado-principal'].map(name => '--project=' + name).reverse().join(' ')],
]) {
  test(`comando real: ${JSON.stringify(group)} com inventário divergente bloqueia antes do controller`, () => {
    const recorded = join(temp, 'argv-' + sequence++);
    const result = bash(runOf(runSuite), {
      E2E_GROUP: group, E2E_PROJECTS: projects, E2E_OUTPUT: join(temp, 'output'), RECORDED: recorded,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(existsSync(recorded), false);
  });
}

for (const event of ['pull_request', 'workflow_dispatch', 'push']) {
  for (const scope of ['login', 'full-suite', 'network-proof', 'network-proof-contexts', 'unexpected']) {
    for (const status of ['success', 'failure', 'cancelled', 'skipped']) {
      test(`grafo de jobs: ${event}/${scope}/${status}`, () => {
        const context = {
          'github.event_name': event, 'needs.image-metadata.result': status,
          'needs.image-metadata.outputs.scope': scope,
        };
        const eligible = conditionAllows(conditionOf(metadata, 4), context);
        const loginAllowed = eligible && conditionAllows(conditionOf(login, 4), context);
        const suiteAllowed = eligible && conditionAllows(conditionOf(suite, 4), context);
        const networkAllowed = eligible && conditionAllows(conditionOf(network, 4), context);
        assert.equal(loginAllowed, ['pull_request', 'workflow_dispatch'].includes(event) && status === 'success' && scope === 'login');
        assert.equal(suiteAllowed, event === 'workflow_dispatch' && status === 'success' && scope === 'full-suite');
        assert.equal(networkAllowed, event === 'workflow_dispatch' && status === 'success' && ['network-proof', 'network-proof-contexts'].includes(scope));
        assert.ok([loginAllowed, suiteAllowed, networkAllowed].filter(Boolean).length <= 1);
      });
    }
  }
}

test('entrada restrita, permissões de leitura e SHA único para todos os checkouts', () => {
  const events = valueOf(yaml, 'on', 0);
  const dispatch = valueOf(events, 'workflow_dispatch', 0);
  const inputs = valueOf(dispatch, 'inputs', 0);
  assert.deepEqual([...inputs.matchAll(/^([\w-]+):/gm)].map(match => match[1]), ['scope']);
  const scope = valueOf(inputs, 'scope', 0);
  assert.equal(valueOf(scope, 'type', 0), 'choice');
  assert.equal(valueOf(scope, 'default', 0), 'login');
  assert.deepEqual(valueOf(scope, 'options', 0).split('\n'), ['- login', '- full-suite', '- network-proof', '- network-proof-contexts']);
  assert.deepEqual([...events.matchAll(/^([\w-]+):/gm)].map(match => match[1]).sort(), ['pull_request', 'workflow_dispatch']);
  assert.equal(permission(yaml, 'contents', 0), 'read');
  assert.doesNotMatch(yaml, /secrets\s*\.|issues:\s*write|contents:\s*write|pull_request_target|e2e-teardown|catalog_send_events/);
  assert.equal(valueOf(valueOf(yaml, 'concurrency', 0), 'group', 0), 'e2e-isolado-preparo-${{ github.ref }}');
  assert.equal(valueOf(valueOf(yaml, 'concurrency', 0), 'cancel-in-progress', 0), 'true');
  assert.equal(nestedValue(request, 'env', 'CHECKOUT_SHA'), '${{ github.sha }}');
  assert.equal(nestedValue(request, 'env', 'REQUEST_SCOPE'), '${{ inputs.scope }}');
  assert.equal(nestedValue(request, 'env', 'EVENT_NAME'), '${{ github.event_name }}');
  assert.equal(valueOf(valueOf(metadata, 'outputs', 4), 'sha', 0), '${{ steps.request.outputs.sha }}');
  assert.equal(valueOf(valueOf(metadata, 'outputs', 4), 'scope', 0), '${{ steps.request.outputs.scope }}');
  for (const [id, job] of jobsOf(yaml)) {
    assertBlocking(job, 4);
    const steps = stepsOf(job);
    const checkout = onlyStep(steps, step => /actions\/checkout@/.test(valueOf(step, 'uses') ?? ''), 'checkout');
    assert.equal(nestedValue(checkout, 'with', 'persist-credentials'), 'false');
    assert.equal(nestedValue(checkout, 'with', 'ref'), id === 'image-metadata'
      ? '${{ steps.request.outputs.sha }}' : '${{ github.sha }}');
    if (id === 'image-metadata') assert.ok(steps.indexOf(request) < steps.indexOf(checkout));
    else assert.equal(valueOf(job, 'needs', 4), 'image-metadata');
    for (const step of steps) {
      assertBlocking(step);
      const action = valueOf(step, 'uses');
      if (action) assert.match(action, /^[\w/-]+@[0-9a-f]{40}$/);
    }
  }
});

test('matriz fixa preserva os três shards autenticados, 15 projetos e orçamentos', () => {
  const matrix = [...suite.matchAll(/^ {10}- name: ([\w-]+)\n {12}projects: (.+)\n {12}timeout-minutes: (\d+)$/gm)];
  assert.deepEqual(matrix.map(match => match[1]), Object.keys(GROUPS));
  assert.deepEqual(matrix.map(match => match[2].split(' ').map(token => token.replace(/^--project=/, ''))), Object.values(GROUPS));
  assert.deepEqual(matrix.map(match => Number(match[3])), [75, 75, 75, 45, 45]);
  assert.deepEqual(Object.values(GROUPS).map(projects => projects.length), [9, 9, 9, 3, 3]);
  assert.deepEqual(Object.values(GROUP_SHARDS), ['1/3', '2/3', '3/3']);
  assert.equal(new Set(Object.values(GROUPS).flat()).size, 15);
  assert.equal(valueOf(valueOf(suite, 'strategy', 4), 'fail-fast', 0), 'false');
  assert.equal(valueOf(suite, 'timeout-minutes', 4), '${{ matrix.timeout-minutes }}');
  assert.equal(nestedValue(runSuite, 'env', 'E2E_GROUP'), '${{ matrix.name }}');
  assert.equal(nestedValue(runSuite, 'env', 'E2E_PROJECTS'), '${{ matrix.projects }}');
  assert.equal(nestedValue(runSuite, 'env', 'E2E_OUTPUT'), '${{ runner.temp }}/e2e-isolated-suite-${{ matrix.name }}');
  const invocation = runOf(runSuite).split('\n').find(line => line.startsWith('bash scripts/e2e-isolated/run.sh '));
  assert.ok(invocation);
  assert.doesNotMatch(invocation, /--workers|--no-deps|--project=|eval\b/);
});

for (const [id, job, controllerId] of [['bootstrap-login', login, 'bootstrap'], ['full-suite', suite, 'suite'], ['network-proof', network, 'network']]) {
  test(`${id}: dependências e ferramentas TLS vêm antes do controller; sem browsers no host`, () => {
    const steps = stepsOf(job);
    const controller = onlyStep(steps, step => valueOf(step, 'id') === controllerId, 'controller');
    const install = onlyStep(steps, step => /bun install/.test(runOf(step)), 'instalação frozen');
    const tls = onlyStep(steps, step => /libnss3-tools/.test(runOf(step)), 'ferramentas TLS');
    const setup = onlyStep(steps, step => /setup-bun@/.test(valueOf(step, 'uses') ?? ''), 'Bun');
    const cache = onlyStep(steps, step => /actions\/cache@/.test(valueOf(step, 'uses') ?? ''), 'cache de pacotes');
    assert.equal(nestedValue(setup, 'with', 'bun-version'), '1.4.0');
    assert.equal(nestedValue(cache, 'with', 'path'), '~/.bun/install/cache');
    assert.match(runOf(install), /bun install --frozen-lockfile --ignore-scripts/);
    assert.match(runOf(tls), /sudo apt-get update\n.*sudo apt-get install --no-install-recommends -y openssl libnss3-tools/);
    assert.ok(steps.indexOf(setup) < steps.indexOf(cache));
    assert.ok(steps.indexOf(cache) < steps.indexOf(install));
    assert.ok(steps.indexOf(install) < steps.indexOf(controller));
    assert.ok(steps.indexOf(tls) < steps.indexOf(controller));
    assert.doesNotMatch(steps.map(runOf).join('\n'), /playwright.*install|update-ca-certificates|NODE_TLS_REJECT_UNAUTHORIZED|ignoreHTTPSErrors|curl .*--insecure/);
  });
}

for (const [job, stepId, expectedPath] of [
  [metadata, 'resolve', '${{ runner.temp }}/e2e-isolated-images/report.json'],
  [login, 'bootstrap', '${{ runner.temp }}/e2e-isolated-login/public'],
  [suite, 'suite', '${{ runner.temp }}/e2e-isolated-suite-${{ matrix.name }}/public'],
  [network, 'network', '${{ runner.temp }}/e2e-network-proof/report.json'],
]) {
  const artifact = onlyStep(stepsOf(job), step => /actions\/upload-artifact@/.test(valueOf(step, 'uses') ?? ''), 'artifact público');
  test(`artifact ${stepId}: só saída pública, retenção curta e caminho obrigatório`, () => {
    assert.equal(nestedValue(artifact, 'with', 'path'), expectedPath);
    assert.equal(nestedValue(artifact, 'with', 'retention-days'), '3');
    assert.equal(nestedValue(artifact, 'with', 'if-no-files-found'), 'error');
    assert.notEqual(nestedValue(artifact, 'with', 'overwrite'), 'true');
    assert.match(nestedValue(artifact, 'with', 'name'), /\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}$/);
  });
  for (const ready of ['true', 'false', '', true, undefined]) {
    test(`artifact ${stepId}: ready ${JSON.stringify(ready)} exige saída explícita do redator`, () => {
      assert.equal(conditionAllows(conditionOf(artifact), {
        'always()': true, [`steps.${stepId}.outputs.report_ready`]: ready,
      }), ready === 'true');
    });
  }
}

test('artefatos da matriz não colidem entre grupos, runs e retentativas', () => {
  const artifact = onlyStep(stepsOf(suite), step => /actions\/upload-artifact@/.test(valueOf(step, 'uses') ?? ''), 'artifact');
  const template = nestedValue(artifact, 'with', 'name');
  const names = [];
  for (const group of Object.keys(GROUPS)) for (const run of ['101', '102']) for (const attempt of ['1', '2']) {
    names.push(template.replace('${{ matrix.name }}', group).replace('${{ github.run_id }}', run).replace('${{ github.run_attempt }}', attempt));
  }
  assert.equal(new Set(names).size, 20);
});
