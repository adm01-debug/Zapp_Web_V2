import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SCRIPT = fileURLToPath(new URL('./workflow-invariants.mjs', import.meta.url));
const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const CI_WORKFLOW = readFileSync(join(RAIZ, '.github/workflows/ci.yml'), 'utf8');
const TALKX_WORKFLOW = readFileSync(join(RAIZ, '.github/workflows/e2e-talkx.yml'), 'utf8');
const DB_LIVE_WORKFLOW = readFileSync(join(RAIZ, '.github/workflows/db-live-guard.yml'), 'utf8');
const DB_LIVE_AGGREGATOR = readFileSync(join(RAIZ, 'scripts/db-audit/consolidar-veredito.mjs'), 'utf8');
const REQUIRED_CI_JOBS = ['typecheck', 'unit-tests', 'node-scripts', 'build', 'security', 'e2e'];

function workflowStepBlock(workflow, name) {
  const lines = workflow.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.trim() === `- name: ${name}`);
  assert.notEqual(start, -1, `step ausente: ${name}`);
  const indent = lines[start].length - lines[start].trimStart().length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*-\s/u.test(line) && line.length - line.trimStart().length === indent) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function workflowRunBody(stepBlock) {
  const lines = stepBlock.split('\n');
  const start = lines.findIndex((line) => /^\s+run:\s*\|\s*$/u.test(line));
  assert.notEqual(start, -1, 'step não declara run: |');
  const indent = lines[start].length - lines[start].trimStart().length;
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const currentIndent = line.length - line.trimStart().length;
    if (line.trim() && currentIndent <= indent) break;
    body.push(line.trim() ? line.slice(indent + 2) : '');
  }
  return body.join('\n');
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
  });
  assert.equal(result.status, 0, `git ${args.join(' ')} falhou: ${result.stderr}`);
  return result.stdout.trim();
}

function runMutationFilter(script, cwd, baseSha, outputPath) {
  writeFileSync(outputPath, '');
  return spawnSync('bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', script], {
    cwd,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      BASE_SHA: baseSha,
      GITHUB_OUTPUT: outputPath,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
    },
  });
}

function invariantFixture(buildSteps = '') {
  const jobs = REQUIRED_CI_JOBS.map((id) => {
    const body = id === 'build' && buildSteps ? `\n${buildSteps}` : '';
    return `  ${id}:\n    runs-on: ubuntu-latest${body}`;
  });
  return `name: fixture\njobs:\n${jobs.join('\n')}\n`;
}

function runWorkflowInvariant(workflow) {
  const root = mkdtempSync(join(tmpdir(), 'workflow-invariants-'));
  try {
    const workflowDir = join(root, '.github', 'workflows');
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(join(workflowDir, 'ci.yml'), workflow);
    return spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf8' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('W46 aceita o if antes de uses no próprio step upload-artifact de dist', () => {
  const result = runWorkflowInvariant(invariantFixture(`    steps:
      - name: Upload build artifacts
        if: github.event_name == 'workflow_dispatch'
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/`));

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /W46: dist artifact tem if: guard/);
});

test('W46 não aceita if de steps vizinhos como guard do artifact de dist', () => {
  const result = runWorkflowInvariant(invariantFixture(`    steps:
      - name: Guarded previous step
        if: always()
        run: echo previous
      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
      - name: Guarded next step
        if: always()
        run: echo next`));

  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /W46: upload-artifact para dist não tem `if:` guard/);
});

test('R5: simula todos os required jobs atuais e rejeita if: always() no nível do job', () => {
  for (const target of REQUIRED_CI_JOBS) {
    const jobs = REQUIRED_CI_JOBS.map((id) => `  ${id}:\n${id === target ? '    if: always()\n' : ''}    runs-on: ubuntu-latest`).join('\n');
    const result = runWorkflowInvariant(`name: fixture\njobs:\n${jobs}\n`);
    assert.equal(result.status, 1, `o job ${target} com always() deveria falhar`);
    assert.match(result.stderr, new RegExp(`R5: job '${target}' em ci\\.yml usa always\\(\\)`));
    assert.doesNotMatch(result.stdout, /R5: nenhum required-check usa always/u);
  }
});

test('R5: aceita if: always() em step e !cancelled() no nível do job', () => {
  const jobs = REQUIRED_CI_JOBS.map((id) => `  ${id}:\n${id === 'build' ? '    if: ${{ !cancelled() }}\n    steps:\n      - if: always()\n        run: echo cleanup\n' : ''}    runs-on: ubuntu-latest`).join('\n');
  const result = runWorkflowInvariant(`name: fixture\njobs:\n${jobs}\n`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /R5: nenhum required-check usa always\(\) no nível do job/u);
});

test('R5: falha fechado se um required job foi renomeado e saiu da lista protegida', () => {
  const jobs = REQUIRED_CI_JOBS.filter((id) => id !== 'unit-tests').map((id) => `  ${id}:\n    runs-on: ubuntu-latest`).join('\n');
  const result = runWorkflowInvariant(`name: fixture\njobs:\n${jobs}\n`);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /R5: required-check 'unit-tests' não foi encontrado/u);
});

test('R5: IDs dos checks protegidos continuam alinhados com os jobs reais do ci.yml', () => {
  for (const id of REQUIRED_CI_JOBS) assert.match(CI_WORKFLOW, new RegExp(`^  ${id}:$`, 'mu'));
});

test('E70: filtro do mapa usa checkout raso + SHA base, inclusive em PR antigo', () => {
  const jobMatch = CI_WORKFLOW.match(/  mutation-mapa:\n([\s\S]*?)(?=\n  [a-zA-Z0-9_-]+:|\s*$)/u);
  assert.ok(jobMatch, 'job mutation-mapa ausente');
  const job = jobMatch[0];
  assert.match(job, /^    if: github\.event_name == 'pull_request'$/mu);
  assert.match(job, /^          fetch-depth: 2$/mu, 'checkout raso deve incluir os pais do merge sintético');

  const step = workflowStepBlock(CI_WORKFLOW, '🔎 Detectar mudança no módulo do mapa (paths filter)');
  const script = workflowRunBody(step);
  assert.match(step, /^\s+BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}$/mu);
  assert.doesNotMatch(script, /git fetch/u, 'o filtro não deve depender de credenciais de fetch persistidas');
  assert.match(script, /git diff --name-only "\$effective_base" HEAD/u);
  assert.match(script, /HEAD\^1/u, 'o fallback usa HEAD^1 (pai base do merge sintético, não o head do PR)');
  assert.doesNotMatch(script, /git merge-base|\.\.\.HEAD/u, 'o filtro não pode depender do histórico ancestral');

  const root = mkdtempSync(join(tmpdir(), 'mutation-tree-diff-'));
  try {
    const origin = join(root, 'origin.git');
    const seed = join(root, 'seed');
    const shallowMergeCheckout = join(root, 'shallow-merge-checkout');
    const outputPath = join(root, 'github-output');
    git(root, 'init', '--bare', '--initial-branch=main', origin);
    git(root, 'init', '--initial-branch=main', seed);
    git(seed, 'config', 'user.name', 'Workflow Test');
    git(seed, 'config', 'user.email', 'workflow-test@example.invalid');

    let forkPoint = '';
    for (let index = 1; index <= 80; index += 1) {
      git(seed, 'commit', '--allow-empty', '-m', `main-${index}`);
      if (index === 5) forkPoint = git(seed, 'rev-parse', 'HEAD');
    }
    const baseSha = git(seed, 'rev-parse', 'HEAD');
    git(seed, 'remote', 'add', 'origin', origin);
    git(seed, 'push', '-u', 'origin', 'main');

    git(seed, 'checkout', '-b', 'pr-map', forkPoint);
    mkdirSync(join(seed, 'src/lib'), { recursive: true });
    writeFileSync(join(seed, 'src/lib/mapbox.ts'), 'export const changed = true;\n');
    git(seed, 'add', 'src/lib/mapbox.ts');
    git(seed, 'commit', '-m', 'change map module');
    git(seed, 'checkout', 'main');
    git(seed, 'merge', '--no-ff', 'pr-map', '-m', 'synthetic pull request merge');
    const mergeRef = git(seed, 'rev-parse', 'HEAD');
    git(seed, 'push', 'origin', 'HEAD:pr-merge');

    const originUrl = new URL(`file://${origin}`).href;
    git(root, 'clone', '--depth=2', '--branch', 'pr-merge', originUrl, shallowMergeCheckout);
    assert.equal(git(shallowMergeCheckout, 'rev-parse', '--is-shallow-repository'), 'true');
    assert.equal(git(shallowMergeCheckout, 'rev-parse', 'HEAD'), mergeRef);
    assert.equal(spawnSync('git', ['cat-file', '-e', `${baseSha}^{commit}`], {
      cwd: shallowMergeCheckout,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' },
    }).status, 0, 'o checkout raso precisa incluir o SHA base como pai do merge');

    let filtered = runMutationFilter(script, shallowMergeCheckout, baseSha, outputPath);
    assert.equal(filtered.status, 0, filtered.stderr);
    assert.match(readFileSync(outputPath, 'utf8'), /map_changed=true/u);

    const missingBase = runMutationFilter(script, shallowMergeCheckout, 'deadbeef', outputPath);
    // BASE_SHA inválido: fallback para HEAD^1 (pai base do merge sintético).
    // O PR mudou src/lib/mapbox.ts, então map_changed=true mesmo pelo fallback.
    assert.equal(missingBase.status, 0, `fallback HEAD^1 deve detectar mudança no mapa: ${missingBase.stderr}`);
    assert.match(readFileSync(outputPath, 'utf8'), /map_changed=true/u, 'fallback HEAD^1 deve detectar mudança no mapa');

    // O diff direto de árvores não precisa do merge-base, mesmo que a PR tenha
    // começado há 75 commits e o checkout local tenha apenas o merge sintético.
    git(shallowMergeCheckout, 'fetch', '--no-tags', '--depth=1', 'origin', 'main', '--quiet');
    const currentBaseSha = git(shallowMergeCheckout, 'rev-parse', 'FETCH_HEAD');
    filtered = runMutationFilter(script, shallowMergeCheckout, currentBaseSha, outputPath);
    assert.equal(filtered.status, 0, filtered.stderr);
    assert.match(readFileSync(outputPath, 'utf8'), /map_changed=true/u);

    const noBase = runMutationFilter(script, shallowMergeCheckout, '', outputPath);
    assert.notEqual(noBase.status, 0, 'base ausente nunca deve ser tratado como sem arquivos alterados');

    git(seed, 'checkout', '-b', 'pr-docs', forkPoint);
    mkdirSync(join(seed, 'docs'), { recursive: true });
    writeFileSync(join(seed, 'docs/notes.md'), 'unrelated path\n');
    git(seed, 'add', 'docs/notes.md');
    git(seed, 'commit', '-m', 'change unrelated docs');
    git(seed, 'checkout', '-b', 'pr-docs-merge', baseSha);
    git(seed, 'merge', '--no-ff', 'pr-docs', '-m', 'synthetic unrelated PR merge');
    git(seed, 'push', 'origin', 'HEAD:pr-docs-merge');

    const unrelatedCheckout = join(root, 'unrelated-shallow-checkout');
    git(root, 'clone', '--depth=2', '--branch', 'pr-docs-merge', originUrl, unrelatedCheckout);
    const unrelated = runMutationFilter(script, unrelatedCheckout, baseSha, outputPath);
    assert.equal(unrelated.status, 0, `${unrelated.stdout}\n${unrelated.stderr}`);
    assert.match(readFileSync(outputPath, 'utf8'), /map_changed=false/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('E2E Talk X: o gatilho cobre apenas suites que este workflow realmente executa', () => {
  const pathBlock = TALKX_WORKFLOW.match(/paths:\n([\s\S]*?)\n  workflow_dispatch:/u)?.[1];
  assert.ok(pathBlock, 'gatilho pull_request.paths ausente');
  for (const executed of [
    "'src/components/talkx/**'",
    "'e2e/talkx-visual.spec.ts'",
    "'e2e/talkx-launch.spec.ts'",
    "'e2e/fixtures/e2e-talkx.unit.test.mjs'",
  ]) assert.ok(pathBlock.includes(executed), `gatilho deve cobrir ${executed}`);
  for (const notExecuted of [
    "'e2e/talkx.spec.ts'",
    "'e2e/fixtures/e2e-talkx.ts'",
    "'supabase/functions/talkx-*'",
  ]) assert.ok(!pathBlock.includes(notExecuted), `gatilho não deve prometer cobertura de ${notExecuted}`);

  const collection = workflowStepBlock(TALKX_WORKFLOW, "'📋 Conferir coleção: Auth smoke + Talk X visual/launch'");
  assert.match(collection, /--project=chromium-talkx-visual/u);
  assert.match(collection, /--project=chromium-talkx-launch/u);
  const auth = workflowStepBlock(TALKX_WORKFLOW, '🔐 Smoke público da tela Auth (projeto chromium; Auth-only)');
  assert.match(auth, /--project=chromium\b/u);
  assert.doesNotMatch(auth, /e2e\/talkx\.spec/u);
});

test('DB Live Guard executa e agrega o passo live-invariants com o log correto', () => {
  const registro = DB_LIVE_AGGREGATOR.match(
    /\{ id: 'live-invariants', nome: '([^']+)', log: '([^']+)' \}/u,
  );
  assert.ok(registro, 'live-invariants ausente no registro do agregador');
  const step = workflowStepBlock(DB_LIVE_WORKFLOW, 'Verificar invariantes gerais do banco vivo');
  assert.match(step, /^\s+id: live-invariants$/mu);
  assert.match(step, /^\s+if: steps\.credencial\.outcome == 'success'$/mu);
  assert.match(step, /^\s+continue-on-error: true$/mu);
  assert.match(step, /-f scripts\/db-audit\/check-live-invariants\.sql/u);
  assert.ok(step.includes(`tee ${registro[2]}`), 'o log do passo diverge do caminho registrado no agregador');
  const evidence = workflowStepBlock(DB_LIVE_WORKFLOW, 'Publicar evidencias estruturais');
  assert.ok(evidence.includes(registro[2]), 'o artifact estrutural não inclui o log do passo');

  const indexStep = DB_LIVE_WORKFLOW.indexOf('id: live-invariants');
  const indexCatalog = DB_LIVE_WORKFLOW.indexOf('id: catalog');
  assert.ok(indexStep < indexCatalog, 'live-invariants deve executar na ordem declarada em PASSOS');
});
