import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  assertBlocking, conditionOf, jobOf, onlyStep, runOf, stepsOf, valueOf,
} from './workflow-test-support.mjs';

const source = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const required = ['typecheck', 'unit-tests', 'node-scripts', 'edge-contracts', 'build', 'security', 'workflow-lint'];
const gate = jobOf(source, 'ci-gate');
const step = onlyStep(stepsOf(gate), (item) => runOf(item).includes('needs.'), 'decisao do CI Gate');
const script = runOf(step);

test('CI Gate mantém as sete dependências e executa uma decisão bloqueante', () => {
  const needs = valueOf(gate, 'needs', 4);
  assert.match(needs, /^\[[\w,\s-]+\]$/);
  const names = needs.slice(1, -1).split(',').map((name) => name.trim());
  assert.equal(new Set(names).size, names.length, 'dependência duplicada');
  assert.deepEqual(new Set(names), new Set(required));
  assert.equal(conditionOf(gate, 4), 'always()');
  assert.equal(conditionOf(step), 'success()');
  assertBlocking(gate, 4);
  assertBlocking(step);
  const defaults = valueOf(valueOf(source, 'defaults', 0), 'run', 0);
  assert.equal(valueOf(defaults, 'shell', 0), 'bash --noprofile --norc -euo pipefail {0}');
  const nodeRun = stepsOf(jobOf(source, 'node-scripts')).map(runOf).join('\n');
  assert.match(nodeRun, /node --test scripts\/ci\/\*\.unit\.mjs/);
});

test('as únicas exceções de draft continuam sendo Unit e Build', () => {
  for (const name of required) {
    const expected = ['unit-tests', 'build'].includes(name)
      ? 'github.event.pull_request.draft != true'
      : 'success()';
    assert.equal(conditionOf(jobOf(source, name), 4), expected, name);
  }
});

// Valores constantes de needs.result; não há credenciais, rede ou outros passos
// do workflow. O Bash executado abaixo vem do YAML real, não de uma cópia do gate.
const acceptedFixtures = new Set(['success', 'failure', 'cancelled', 'skipped', 'unknown', undefined]);
function renderScript(scenario) {
  const rendered = script.replace(/\$\{\{\s*([^{}]+?)\s*\}\}/g, (_, expression) => {
    const result = /^needs\.([\w-]+)\.result$/.exec(expression.trim());
    if (result) {
      assert.ok(required.includes(result[1]), 'dependência não simulada: ' + result[1]);
      const value = scenario.states[result[1]];
      assert.ok(acceptedFixtures.has(value), 'resultado fora das fixtures constantes');
      return value ?? ''; // Uma propriedade ausente do contexto é uma string vazia.
    }
    assert.equal(expression.trim(), 'github.event.pull_request.draft == true', 'expressão não simulada');
    return String(scenario.event.pull_request?.draft === true);
  });
  assert.doesNotMatch(rendered, /\$\{\{/, 'expressão GitHub não resolvida');
  return rendered;
}

const success = Object.fromEntries(required.map((name) => [name, 'success']));
const normalEvent = { pull_request: { draft: false } };
const draftEvent = { pull_request: { draft: true } };
const draftSkips = { 'unit-tests': 'skipped', build: 'skipped' };
const scenarios = [];
function add(name, changes, passes, event = normalEvent, fullSuccess = false) {
  scenarios.push({ name, states: { ...success, ...changes }, event, passes, fullSuccess });
}

add('all_success', {}, true, normalEvent, true);
for (const name of required) {
  for (const result of ['failure', 'cancelled', 'skipped']) {
    add('single_' + name + '_' + result, { [name]: result }, false);
  }
}
for (let left = 0; left < required.length; left++) {
  for (let right = left + 1; right < required.length; right++) {
    const a = required[left], b = required[right];
    add('pair_' + a + '_cancelled_' + b + '_skipped', { [a]: 'cancelled', [b]: 'skipped' }, false);
    add('pair_' + a + '_skipped_' + b + '_cancelled', { [a]: 'skipped', [b]: 'cancelled' }, false);
  }
}
for (const result of ['failure', 'cancelled', 'skipped']) {
  add('all_' + result, Object.fromEntries(required.map((name) => [name, result])), false);
}
add('draft_intentional_skips', draftSkips, true, draftEvent);
for (const name of ['node-scripts', 'edge-contracts', 'security', 'workflow-lint']) {
  add('draft_' + name + '_cancelled', { ...draftSkips, [name]: 'cancelled' }, false, draftEvent);
}
for (const name of required.filter((item) => !['unit-tests', 'build'].includes(item))) {
  add('draft_' + name + '_skipped', { ...draftSkips, [name]: 'skipped' }, false, draftEvent);
}

// Contraprovas adicionais: contexto incompleto, exceção de draft estreita e
// push/dispatch sem pull_request. Valores inesperados também devem bloquear.
for (const name of required) {
  for (const result of [undefined, 'unknown']) {
    add('single_' + name + '_' + (result ?? 'missing'), { [name]: result }, false);
  }
}
add('draft_all_success', {}, true, draftEvent, true);
add('draft_only_unit_skipped', { 'unit-tests': 'skipped' }, true, draftEvent);
add('draft_only_build_skipped', { build: 'skipped' }, true, draftEvent);
for (const name of ['unit-tests', 'build']) {
  for (const result of ['failure', 'cancelled', undefined, 'unknown']) {
    add('draft_' + name + '_' + (result ?? 'missing'), { ...draftSkips, [name]: result }, false, draftEvent);
  }
}
add('non_draft_unit_and_build_skipped', draftSkips, false);

assert.equal(new Set(scenarios.map(({ states, event }) => JSON.stringify({ states, draft: event.pull_request?.draft === true }))).size, scenarios.length);

for (const scenario of scenarios) {
  test('CI Gate: ' + scenario.name, () => {
    const rendered = renderScript(scenario);
    if (scenario.name === 'non_draft_unit_and_build_skipped') {
      assert.equal(renderScript({ ...scenario, event: {} }), rendered, 'push/dispatch não podem habilitar a exceção de draft');
    }
    const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', rendered], {
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
      encoding: 'utf8',
      timeout: 3000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.stderr, '');
    assert.equal(result.status, scenario.passes ? 0 : 1, result.stdout);
    assert.equal(result.stdout.includes('Todos os jobs obrigatórios passaram'), scenario.fullSuccess, result.stdout);
    assert.equal(result.stdout.includes('Validação parcial de draft'), scenario.passes && !scenario.fullSuccess, result.stdout);
  });
}
