import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { jobOf, nestedValue, onlyStep, runOf, stepsOf, valueOf } from '../scripts/ci/workflow-test-support.mjs';
import { GROUPS, GROUP_SHARDS } from '../scripts/e2e-isolated/runtime-contract.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const WORKFLOW = join(RAIZ, '.github/workflows/e2e-logado.yml');

// E83: a lista original de projetos do job unico (linha `bun run test:e2e` da base
// dia/2026-10-10). A uniao dos grupos da matriz tem de ser EXATAMENTE esta lista:
// Sao 15 projetos distintos; repetir a selecao autenticada nos tres backends
// nao muda a uniao. Projeto extra, ausente ou no backend errado reprova.
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

const AUTH_SHARDS = {
  'authenticated-1-of-3': '1/3',
  'authenticated-2-of-3': '2/3',
  'authenticated-3-of-3': '3/3',
};
const EXPECTED_NAMES = [...Object.keys(AUTH_SHARDS), 'deslogado-principal', 'deslogado-secundario'];
const PUBLIC_PROJECTS = {
  'deslogado-principal': ['chromium-mapa', 'firefox-auth', 'webkit-auth'],
  'deslogado-secundario': ['chromium-telefonia', 'firefox-telefonia', 'webkit-telefonia'],
};
const AUTH_PROJECTS = ORIGINAIS.filter(name => !Object.values(PUBLIC_PROJECTS).flat().includes(name));
const EXPECTED_GROUPS = {
  ...Object.fromEntries(Object.keys(AUTH_SHARDS).map(name => [name, AUTH_PROJECTS])),
  ...PUBLIC_PROJECTS,
};

/** Linhas do include do job; comentarios e outros jobs nao inventam projetos. */
export function gruposDaMatriz(yaml) {
  const job = jobOf(yaml, 'e2e-logado');
  const strategy = valueOf(job, 'strategy', 4);
  const include = valueOf(valueOf(strategy, 'matrix', 0), 'include', 0);
  assert.equal(typeof include, 'string', 'include ausente');
  const rows = [];
  for (const block of include.split(/(?=^- )/m)) {
    if (!block.startsWith('- ')) {
      assert.ok(block.split('\n').every(line => !line.trim() || line.trim().startsWith('#')), 'formato da matriz nao reconhecido');
      continue;
    }
    const row = block.replace(/^- /, '  ');
    const name = valueOf(row, 'name', 2);
    assert.ok(typeof name === 'string' && name.trim(), 'linha de matriz sem nome');
    const projects = valueOf(row, 'projects', 2);
    assert.ok(typeof projects === 'string' && projects.trim(), 'grupo sem projetos');
    rows.push({ name, projects: projects.trim().split(/\s+/), timeout: valueOf(row, 'timeout-minutes', 2) });
  }
  return rows;
}

export function validarMatriz(yaml, groups = GROUPS, shards = GROUP_SHARDS) {
  const job = jobOf(yaml, 'e2e-logado');
  assert.equal(valueOf(job, 'timeout-minutes', 4), '${{ matrix.timeout-minutes }}');
  assert.equal(valueOf(valueOf(job, 'strategy', 4), 'fail-fast', 0), 'false');
  assert.deepEqual(shards, AUTH_SHARDS, 'mapa de shards fechado');
  assert.deepEqual(groups, EXPECTED_GROUPS, 'distribuicao historica por backend');
  const rows = gruposDaMatriz(yaml);
  assert.deepEqual(rows.map(row => row.name).sort(), [...EXPECTED_NAMES].sort(), 'nomes de grupos da matriz');
  for (const row of rows) {
    assert.ok(row.projects.every(token => token.startsWith('--project=')), 'prefixo Playwright');
    const names = row.projects.map(token => token.slice('--project='.length));
    assert.equal(new Set(names).size, names.length, 'projeto duplicado no mesmo backend');
    assert.deepEqual(names, groups[row.name], 'selecao exata por grupo');
    const authenticated = Object.hasOwn(shards, row.name);
    assert.equal(row.timeout, authenticated ? '75' : '45', 'timeout do grupo');
    assert.equal(names.filter(name => name === 'setup').length, authenticated ? 1 : 0, 'setup por backend');
  }
  const union = [...new Set(rows.flatMap(row => row.projects.map(token => token.slice('--project='.length))))].sort();
  assert.deepEqual(union, [...ORIGINAIS].sort(), '15 projetos independentes');
  return rows;
}

test('E83: workflow tem estrategia de matriz com timeout proprio por grupo', () => {
  const content = readFileSync(WORKFLOW, 'utf8');
  assert.ok(content.includes('strategy:'), 'workflow tem strategy');
  assert.ok(content.includes('matrix:'), 'workflow tem matrix');
  assert.ok(content.includes('fail-fast: false'), 'matriz nao aborta no primeiro falho');
  const job = jobOf(content, 'e2e-logado');
  assert.equal(valueOf(job, 'timeout-minutes', 4), '${{ matrix.timeout-minutes }}');
  assert.deepEqual(
    Object.fromEntries(gruposDaMatriz(content).map(grupo => [grupo.name, grupo.timeout])),
    Object.fromEntries(EXPECTED_NAMES.map(name => [name, Object.hasOwn(AUTH_SHARDS, name) ? '75' : '45'])),
    'orçamento por backend inclui preparo, browser e limpeza',
  );
  assert.ok(gruposDaMatriz(content).length === 5, 'matriz define os cinco grupos de projetos');
});

test('E83: matriz tem 5 grupos (3 shards autenticados + 2 deslogados)', () => {
  const content = readFileSync(WORKFLOW, 'utf8');
  const grupos = gruposDaMatriz(content);
  assert.equal(grupos.length, 5, `matriz tem ${grupos.length} grupos (esperado 5)`);
  assert.deepEqual(grupos.map(grupo => grupo.name).sort(), [...EXPECTED_NAMES].sort());
  validarMatriz(content);
});

test('E83: cada token da matriz leva o prefixo --project=', () => {
  const content = readFileSync(WORKFLOW, 'utf8');
  const grupos = gruposDaMatriz(content);
  assert.ok(grupos.length > 0, 'matriz tem grupos para avaliar');
  for (const { projects: tokens } of grupos) {
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
    .flatMap(grupo => grupo.projects)
    .map((t) => t.replace(/^--project=/, ''));
  assert.deepEqual(
    [...new Set(nomes)].sort(),
    [...ORIGINAIS].sort(),
    `uniao da matriz difere da lista original (matriz: ${new Set(nomes).size}, original: ${ORIGINAIS.length})`,
  );
});

test('E83: cada backend autenticado tem um setup e os publicos nenhum', () => {
  const content = readFileSync(WORKFLOW, 'utf8');
  for (const grupo of gruposDaMatriz(content)) {
    const n = grupo.projects.filter(token => token === '--project=setup').length;
    assert.equal(n, Object.hasOwn(GROUP_SHARDS, grupo.name) ? 1 : 0, grupo.name);
  }
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

// Fixtures canonicos nao dependem da formatacao ou ordem do workflow real.
const original = [
  'jobs:',
  '  e2e-logado:',
  '    timeout-minutes: ${{ matrix.timeout-minutes }}',
  '    strategy:',
  '      fail-fast: false',
  '      matrix:',
  '        include:',
  ...Object.entries(EXPECTED_GROUPS).flatMap(([name, projects]) => [
    '          - name: ' + name,
    '            projects: ' + projects.map(project => '--project=' + project).join(' '),
    '            timeout-minutes: ' + (Object.hasOwn(AUTH_SHARDS, name) ? '75' : '45'),
  ]),
  '    permissions:',
  '      contents: read',
].join('\n');
const rows = gruposDaMatriz(original);
const initialStart = original.indexOf('          - name: ');
const initialEnd = original.indexOf('    permissions:', initialStart);
const renderRows = list => list.map(row => '          - name: ' + row.name + '\n            projects: ' + row.projects.join(' ') + '\n            timeout-minutes: ' + row.timeout + '\n').join('');
const render = list => original.slice(0, initialStart) + renderRows(list) + original.slice(initialEnd);
const cloneRows = () => structuredClone(rows);
const scenarios = [];
const add = (name, expected, yaml, groups = GROUPS, shards = GROUP_SHARDS) => scenarios.push({ name, expected, yaml, groups, shards });
add('matriz real LF', true, original);
add('matriz real CRLF', true, original.replaceAll('\n', '\r\n'));
add('linhas vazias adicionais', true, original.replace('            projects:', '\n            projects:'));
add('comentario dentro da linha de grupo', true, original.replace('          - name: authenticated-1-of-3', '          - name: authenticated-1-of-3 # comentario'));
add('grupos reordenados preservam cobertura', true, render(cloneRows().reverse()));
add('outra chave projects fora do job e ignorada', true, original + '\n  decoy:\n    projects: --project=outside\n');
add('comentario com projects nao inventa grupo', true, original.replace('    permissions:', '    # projects: --project=outside\n    permissions:'));
add('grupo com nome entre aspas', true, original.replace('- name: authenticated-1-of-3', '- name: "authenticated-1-of-3"'));
for (let i = 0; i < rows.length; i++) {
  let changed = cloneRows(); changed.splice(i, 1); add('grupo ausente ' + rows[i].name, false, render(changed));
  changed = cloneRows(); changed[i].projects.pop(); add('projeto ausente ' + rows[i].name, false, render(changed));
  changed = cloneRows(); changed[i].projects.push('--project=chromium-extra'); add('projeto extra ' + rows[i].name, false, render(changed));
  changed = cloneRows(); changed[i].projects.push(changed[i].projects[0]); add('projeto duplicado ' + rows[i].name, false, render(changed));
  changed = cloneRows(); changed[i].timeout = '10'; add('timeout reduzido ' + rows[i].name, false, render(changed));
}
for (let i = 0; i < 3; i++) {
  let changed = cloneRows(); changed[i].projects = changed[i].projects.filter(name => name !== '--project=setup'); add('sem setup no shard ' + (i + 1), false, render(changed));
  changed = cloneRows(); changed[i].projects[1] = changed[i].projects[1].replace('--project=', ''); add('prefixo ausente shard ' + (i + 1), false, render(changed));
}
for (let i = 3; i < 5; i++) {
  const changed = cloneRows(); changed[i].projects.push('--project=setup'); add('setup indevido no publico ' + rows[i].name, false, render(changed));
}
let changed = cloneRows(); changed.push(structuredClone(changed[0])); add('grupo duplicado sexto', false, render(changed));
changed = cloneRows(); changed[1].name = changed[0].name; add('nome repetido substitui shard2', false, render(changed));
changed = cloneRows(); changed[0].name = '__proto__'; add('grupo desconhecido prototype', false, render(changed));
add('fail-fast true', false, original.replace('fail-fast: false', 'fail-fast: true'));
add('timeout global perde matrix', false, original.replace('timeout-minutes: ${{ matrix.timeout-minutes }}', 'timeout-minutes: 75'));
add('projects duplicado na mesma linha', false, original.replace('            timeout-minutes: 75', '            projects: --project=setup\n            timeout-minutes: 75'));
add('projects duplicado com nome na segunda chave', false, original.replace('          - name: authenticated-1-of-3\n            projects:', '          - projects: --project=setup\n            name: authenticated-1-of-3\n            projects:'));
add('shards do runtime repetem 1/3', false, original, GROUPS, { ...GROUP_SHARDS, 'authenticated-2-of-3': '1/3' });
add('shards do runtime usam 1/2', false, original, GROUPS, { ...GROUP_SHARDS, 'authenticated-1-of-3': '1/2' });
const trimmed = Object.fromEntries(Object.entries(GROUPS).map(([name, list]) => [name, list.filter(project => project !== 'firefox-catalog')]));
changed = cloneRows().map(row => ({ ...row, projects: row.projects.filter(project => project !== '--project=firefox-catalog') }));
add('runtime e workflow removem juntos um projeto historico', false, render(changed), trimmed);
let joint = structuredClone(GROUPS);
joint['authenticated-2-of-3'] = joint['authenticated-2-of-3'].filter(name => name !== 'firefox-catalog');
changed = cloneRows().map(row => ({ ...row, projects: joint[row.name].map(name => '--project=' + name) }));
add('runtime e workflow perdem projeto somente no shard2', false, render(changed), joint);
joint = structuredClone(GROUPS);
joint['authenticated-2-of-3'] = joint['authenticated-2-of-3'].map(name => name === 'firefox-catalog' ? 'chromium-mapa' : name);
joint['deslogado-principal'][0] = 'firefox-catalog';
changed = cloneRows().map(row => ({ ...row, projects: joint[row.name].map(name => '--project=' + name) }));
add('runtime e workflow trocam projeto entre shard2 e publico', false, render(changed), joint);
joint = structuredClone(GROUPS);
for (const name of Object.keys(AUTH_SHARDS)) joint[name] = joint[name].map(project => project === 'firefox-catalog' ? 'chromium-mapa' : project);
joint['deslogado-principal'][0] = 'firefox-catalog';
changed = cloneRows().map(row => ({ ...row, projects: joint[row.name].map(name => '--project=' + name) }));
add('runtime e workflow trocam distribuicao mas preservam15e33', false, render(changed), joint);
add('runtime clonado com mesmos valores', true, original, structuredClone(GROUPS), structuredClone(GROUP_SHARDS));
changed = cloneRows().slice(0, 1).concat(cloneRows().slice(3)); add('layout historico tres grupos', false, render(changed));
const fieldOrders = [
  ['name', 'projects', 'timeout-minutes'], ['name', 'timeout-minutes', 'projects'],
  ['projects', 'name', 'timeout-minutes'], ['projects', 'timeout-minutes', 'name'],
  ['timeout-minutes', 'name', 'projects'], ['timeout-minutes', 'projects', 'name'],
];
const fieldFormats = [
  { label: 'LF' }, { label: 'CRLF', crlf: true },
  { label: 'LF comentario', comments: true }, { label: 'CRLF comentario', comments: true, crlf: true },
];
function renderProperties(order, { comments = false, crlf = false, duplicate, missing } = {}) {
  const body = rows.map((row, groupIndex) => {
    const values = { name: row.name, projects: row.projects.join(' '), 'timeout-minutes': row.timeout };
    const keys = order.filter(key => groupIndex !== 0 || key !== missing);
    if (groupIndex === 0 && duplicate) keys.splice(keys.indexOf(duplicate), 0, duplicate);
    return keys.map((key, index) => (index === 0 ? '          - ' : '            ') + key + ': ' + values[key] + (comments ? ' # fixture' : '')).join('\n') + '\n';
  }).join('');
  const yaml = original.slice(0, initialStart) + body + original.slice(initialEnd);
  return crlf ? yaml.replaceAll('\n', '\r\n') : yaml;
}
for (const order of fieldOrders) for (const format of fieldFormats) {
  add('propriedades ' + order.join('/') + ' ' + format.label, true, renderProperties(order, format));
}
for (const key of fieldOrders[0]) {
  add('chave duplicada ' + key, false, renderProperties(fieldOrders[0], { duplicate: key }));
  add('chave ausente ' + key, false, renderProperties(fieldOrders[0], { missing: key }));
}
for (const { name, expected, yaml, groups, shards } of scenarios) {
  test('E83: guarda de matriz — ' + name, () => {
    const check = () => validarMatriz(yaml, groups, shards);
    if (expected) assert.doesNotThrow(check);
    else assert.throws(check);
  });
}
