import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { jobOf, nestedValue, onlyStep, runOf, stepsOf, valueOf } from '../scripts/ci/workflow-test-support.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const WORKFLOW = join(RAIZ, '.github/workflows/e2e-logado.yml');

// E83: a lista original de projetos do job unico (linha `bun run test:e2e` da base
// dia/2026-10-10). A uniao dos grupos da matriz tem de ser EXATAMENTE esta lista:
// a mais (ex: chromium, chromium-theme, email-navy -- que rodam no ci.yml de PR)
// ou a menos, o teste reprova.
const ORIGINAIS = [
  'setup',
  'chromium-e2e-core',
  'chromium-authenticated',
  'chromium-mapa',
  'firefox-auth',
  'webkit-auth',
  'firefox-talkx',
  'webkit-talkx',
  'firefox-conversation',
  'webkit-conversation',
  'firefox-catalog',
  'webkit-catalog',
  'chromium-telefonia',
  'firefox-telefonia',
  'webkit-telefonia',
];

/**
 * Extrai os grupos da matriz: cada linha `projects: ...` do workflow vira um
 * grupo (lista de tokens crus). Nao inventa token: o que esta no YAML e' o que
 * o teste avalia.
 */
function gruposDaMatriz(yaml) {
  const grupos = [];
  for (const linha of yaml.split('\n')) {
    const m = /^\s*projects:\s*(.+?)\s*$/.exec(linha);
    if (m) grupos.push(m[1].trim().split(/\s+/));
  }
  return grupos;
}

test('E83: workflow tem estrategia de matriz com timeout proprio por grupo', () => {
  const content = readFileSync(WORKFLOW, 'utf8');
  assert.ok(content.includes('strategy:'), 'workflow tem strategy');
  assert.ok(content.includes('matrix:'), 'workflow tem matrix');
  assert.ok(content.includes('fail-fast: false'), 'matriz nao aborta no primeiro falho');
  const job = jobOf(content, 'e2e-logado');
  assert.equal(valueOf(job, 'timeout-minutes', 4), '${{ matrix.timeout-minutes }}');
  assert.deepEqual([...job.matchAll(/^ {12}timeout-minutes: (\d+)$/gm)].map(match => Number(match[1])), [75, 45, 45], 'orçamento inclui bootstrap e limpeza além do browser 45/15/15');
  assert.ok(gruposDaMatriz(content).length >= 2, 'matriz define pelo menos 2 grupos de projetos');
});

test('E83: matriz tem 3 grupos (authenticated + 2 deslogados)', () => {
  const content = readFileSync(WORKFLOW, 'utf8');
  const grupos = gruposDaMatriz(content);
  assert.equal(grupos.length, 3, `matriz tem ${grupos.length} grupos (esperado 3)`);
  assert.ok(content.includes('name: authenticated'), 'grupo authenticated existe');
  assert.ok(content.includes('name: deslogado-principal'), 'grupo deslogado-principal existe');
  assert.ok(content.includes('name: deslogado-secundario'), 'grupo deslogado-secundario existe');
});

test('E83: cada token da matriz leva o prefixo --project=', () => {
  const content = readFileSync(WORKFLOW, 'utf8');
  const grupos = gruposDaMatriz(content);
  assert.ok(grupos.length > 0, 'matriz tem grupos para avaliar');
  for (const tokens of grupos) {
    for (const token of tokens) {
      assert.ok(
        token.startsWith('--project='),
        `token "${token}" sem o prefixo --project=: o Playwright o trataria como path de spec e ignoraria o projeto`,
      );
    }
  }
});

test('E83: a uniao da matriz e EXATAMENTE a lista original (15 projetos)', () => {
  const content = readFileSync(WORKFLOW, 'utf8');
  const nomes = gruposDaMatriz(content)
    .flat()
    .map((t) => t.replace(/^--project=/, ''));
  assert.deepEqual(
    [...nomes].sort(),
    [...ORIGINAIS].sort(),
    `uniao da matriz difere da lista original (matriz: ${nomes.length}, original: ${ORIGINAIS.length})`,
  );
});

test('E83: projeto setup nao esta duplicado entre grupos de matriz', () => {
  const content = readFileSync(WORKFLOW, 'utf8');
  const nomes = gruposDaMatriz(content)
    .flat()
    .map((t) => t.replace(/^--project=/, ''));
  const n = nomes.filter((x) => x === 'setup').length;
  assert.equal(n, 1, 'setup aparece em exatamente um grupo de matriz');
});

test('E83: controller recebe grupo e valida matrix.projects sem lista hardcoded', () => {
  const content = readFileSync(WORKFLOW, 'utf8');
  const step = onlyStep(stepsOf(jobOf(content, 'e2e-logado')), step => valueOf(step, 'id') === 'suite', 'controller');
  assert.equal(nestedValue(step, 'env', 'E2E_PROJECTS'), '${{ matrix.projects }}');
  assert.equal(nestedValue(step, 'env', 'E2E_GROUP'), '${{ matrix.name }}');
  const run = runOf(step);
  assert.match(run, /import \{ GROUPS \} from '\.\/scripts\/e2e-isolated\/runtime-contract\.mjs'/);
  assert.match(run, /process\.env\.E2E_PROJECTS/);
  assert.match(run, /GROUPS\[group\]\.map/);
  const command = run.split('\n').find(line => line.startsWith('bash scripts/e2e-isolated/run.sh '));
  assert.equal(command, 'bash scripts/e2e-isolated/run.sh suite "$E2E_GROUP" "$E2E_OUTPUT"');
});
