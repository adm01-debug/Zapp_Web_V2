import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { jobOf, stepsOf, shellCode } from './workflow-test-support.mjs';

const read = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const source = read('playwright.config.ts');
const task = read('e2e/tarefas-quadro.spec.ts');
const script = stripTypeScriptTypes(source).replace(/^import .*?;$/gm, '').replace('export default defineConfig(', 'globalThis.config = defineConfig(');
const context = vm.createContext({ URL, defineConfig: value => value, devices: new Proxy({}, { get: () => ({}) }),
  usesExternalHttpsServer: () => false, quarentena: [], process: { env: { CI: 'true' } } });
new vm.Script(script).runInContext(context);
const projects = context.config.projects;
const chromium = projects.find(project => project.name === 'chromium');
const matches = (pattern, file) => Array.isArray(pattern) ? pattern.some(value => matches(value, file)) : pattern?.test?.(file) ?? false;
const selected = (project, file) => (!project.testMatch || matches(project.testMatch, file)) && !matches(project.testIgnore, file);

test('Tarefas R1: o CI público seleciona o Chromium deslogado que inclui seus três casos', () => {
  const code = stepsOf(jobOf(read('.github/workflows/ci.yml'), 'e2e')).map(shellCode).filter(value => /\bbun run test:e2e\b/.test(value));
  assert.equal(code.length, 1);
  const selectedProjects = [...code[0].matchAll(/--project(?:=|\s+)([a-z0-9-]+)/g)].map(match => match[1]);
  assert.ok(selectedProjects.includes('chromium'));
  assert.equal(selected(chromium, 'tarefas-quadro.spec.ts'), true);
  assert.equal(selected(chromium, 'auth.spec.ts'), true);
  assert.equal(selected(chromium, 'contacts-crud.spec.ts'), false);
});
test('Tarefas R1: único coletor é chromium, sem dependência de setup ou sessão salva', () => {
  assert.deepEqual(Array.from(projects.filter(project => selected(project, 'tarefas-quadro.spec.ts')), project => project.name), ['chromium']);
  assert.equal(chromium.use.storageState, undefined);
  assert.ok(!chromium.dependencies?.length);
});

let guard; let fixtureOptions;
const fakeTest = {
  use(value) { fixtureOptions = value; }, setTimeout() {},
  beforeEach(callback) { assert.equal(guard, undefined); guard = callback; },
  skip(value) { if (value) throw new Error('R1_SKIP'); },
};
const prefix = task.slice(0, task.indexOf('// Backend fake de'));
new vm.Script(stripTypeScriptTypes(prefix).replace(/^import .*?;$/gm, '')).runInContext(vm.createContext({ test: fakeTest }));
const identities = [...task.matchAll(/^  test\('(.+)', async \(\{ page \}\) => \{/gm)].map(match => match[1]);
test('Tarefas R1: preparação mantém contexto vazio e os três corpos existentes', () => {
  assert.equal(identities.length, 3);
  assert.equal(fixtureOptions.storageState.cookies.length, 0);
  assert.equal(fixtureOptions.storageState.origins.length, 0);
  assert.equal(fixtureOptions.viewport.width, 1600);
});
for (const title of identities) test('Tarefas R1: a guarda real admite o corpo de ' + title, () => {
  const fixtures = { browserName: 'chromium' };
  Object.defineProperty(fixtures, 'page', { get() { assert.fail('guard must run before page'); } });
  assert.doesNotThrow(() => guard(fixtures, { project: chromium }));
});
test('Tarefas R1: projeto autenticado ainda é recusado pela guarda antes de page', () => {
  const fixtures = { browserName: 'chromium' };
  Object.defineProperty(fixtures, 'page', { get() { assert.fail('guard must run before page'); } });
  assert.throws(() => guard(fixtures, { project: projects.find(project => project.name === 'chromium-authenticated') }), /R1_SKIP/);
});
