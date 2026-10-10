import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const WORKFLOW = join(RAIZ, '.github/workflows/e2e-logado.yml');

test('E83: workflow tem estrategia de matriz com timeout proprio por grupo', () => {
  const content = readFileSync(WORKFLOW, 'utf8');
  assert.ok(content.includes('strategy:'), 'workflow tem strategy');
  assert.ok(content.includes('matrix:'), 'workflow tem matrix');
  assert.ok(content.includes('fail-fast: false'), 'matriz nao aborta no primeiro falho');
  assert.ok(content.includes('timeout-minutes: 15'), 'cada job tem timeout de 15 min');
  assert.ok(content.includes('projects:'), 'cada grupo de matriz define seus projetos');
});

test('E83: matriz tem pelo menos 2 grupos (autenticado + deslogado)', () => {
  const content = readFileSync(WORKFLOW, 'utf8');
  const grupos = content.match(/name: \w+/g) ?? [];
  const nomes = grupos.map((g) => g.replace('name: ', ''));
  assert.ok(nomes.length >= 3, `matriz tem ${nomes.length} grupos (esperado >= 3)`);
  assert.ok(nomes.includes('authenticated'), 'grupo authenticated existe');
  assert.ok(
    nomes.some((n) => n.startsWith('deslogado')),
    'existe pelo menos um grupo deslogado',
  );
});

test('E83: projeto setup nao esta duplicado entre grupos de matriz', () => {
  const content = readFileSync(WORKFLOW, 'utf8');
  const projetos = content.match(/projects:[\s\S]*?(?=\n\s+#|\n\s+- name:|$)/g) ?? [];
  const todos = projetos.join(' ').match(/setup/g) ?? [];
  assert.equal(todos.length, 1, 'setup aparece em exatamente um grupo de matriz');
});

test('E83: comando de run usa matrix.projects em vez de lista hardcoded', () => {
  const content = readFileSync(WORKFLOW, 'utf8');
  assert.ok(
    content.includes('${{ matrix.projects }}'),
    'step de run usa ${{ matrix.projects }} (nao lista hardcoded)',
  );
});