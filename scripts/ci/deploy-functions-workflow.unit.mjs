import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../../.github/workflows/deploy-functions.yml', import.meta.url), 'utf8');

test('full Edge deploy runs CRM secret preflight', () => {
  assert.match(
    workflow,
    /if \[ "\$FN" = "crm-integration" \] \|\| \[ -z "\$FN" \]; then/,
    'deploy-all must not bypass crm-integration preflight',
  );
});

test('fetch-link-preview deploy fails closed without a valid secure egress configuration', () => {
  assert.match(workflow, /PREVIEW_EGRESS_PROXY_URL: \$\{\{ secrets\.PREVIEW_EGRESS_PROXY_URL \}\}/);
  assert.match(workflow, /PREVIEW_EGRESS_SHARED_SECRET: \$\{\{ secrets\.PREVIEW_EGRESS_SHARED_SECRET \}\}/);
  assert.match(
    workflow,
    /if \[ "\$FN" = "fetch-link-preview" \] \|\| \[ -z "\$FN" \]; then/,
    'deploy-all must not bypass fetch-link-preview preflight',
  );
  assert.match(workflow, /PREVIEW_EGRESS_PROXY_URL e PREVIEW_EGRESS_SHARED_SECRET sao obrigatorios/);
  assert.match(workflow, /endpoint\.protocol !== 'https:'/);
  assert.match(workflow, /!\/\(\?:\^\|\\\/\)v1\\\/fetch\$\/\.test\(endpoint\.pathname\)/);
  assert.match(workflow, /PREVIEW_EGRESS_SHARED_SECRET\.length < 32/);
  assert.match(workflow, /supabase secrets set[\s\\]+PREVIEW_EGRESS_PROXY_URL=/);
});

test('secure egress route accepts a Traefik prefix only on a path boundary', () => {
  const route = /(?:^|\/)v1\/fetch$/;
  assert.equal(route.test('/v1/fetch'), true);
  assert.equal(route.test('/preview-egress/v1/fetch'), true);
  assert.equal(route.test('/preview-egressv1/fetch'), false);
  assert.equal(route.test('/v1/fetch/extra'), false);
});

test('rollback deploy is pinned to a historical ancestor and attests deployed SHA', () => {
  assert.match(workflow, /source_ref:/);
  assert.match(workflow, /git merge-base --is-ancestor "\$DEPLOYED_GIT_SHA" "\$GITHUB_SHA"/);
  assert.equal((workflow.match(/--git-sha "\$DEPLOYED_GIT_SHA"/g) || []).length, 2);
});

test('concurrency e por funcao: dispatch de uma funcao nao cancela o pendente de outra', () => {
  // Grupo unico fazia o GitHub cancelar o pendente de OUTRA funcao a cada dispatch
  // (30/09/2026: 11 cancelados em 16 runs; 3 funcoes do #1240 nunca publicaram).
  const block = workflow.match(/^concurrency:\n((?:  .*\n)+)/m);
  assert.ok(block, 'bloco concurrency de topo ausente');
  assert.match(block[1], /^  group: deploy-edge-functions-\$\{\{ inputs\.function_name \|\| 'all' \}\}$/m);
  assert.match(block[1], /^  cancel-in-progress: false$/m);
});

test('escopo all e serializado contra deploys por funcao antes do Deploy', () => {
  // Grupos diferentes (all x funcao) rodariam juntos: rollback por source_ref ou SHAs
  // diferentes publicariam bundles distintos da mesma funcao (review do #1315).
  assert.match(workflow, /^run-name: Deploy Edge Functions \(\$\{\{ inputs\.function_name \|\| 'all' \}\}\)$/m);
  assert.match(workflow, /^      actions: read$/m);
  const gate = workflow.indexOf('- name: Serializar escopo TODAS contra deploys por funcao');
  const deploy = workflow.indexOf('- name: Deploy\n');
  assert.ok(gate > 0 && deploy > gate, 'gate precisa vir antes do Deploy');
  assert.match(workflow.slice(gate, deploy), /edge-tooling\/scripts\/edge-deploy\/serialize-scope\.mjs/);
});

test('tag de deploy e unica por run (deploys paralelos no mesmo segundo)', () => {
  assert.match(workflow, /TAG="edge-deploy\/[^"\n]*\$\{GITHUB_RUN_ID\}"/);
});

test('timeout do job cobre a espera maxima do gate mais um deploy completo', async () => {
  // Com 60 min e espera de ate 40, sobravam ~20 para setup + deploy + coletor de ~24 min.
  const { MAX_WAIT_MINUTES } = await import('../edge-deploy/serialize-scope.mjs');
  const timeout = Number(/^    timeout-minutes: (\d+)$/m.exec(workflow)?.[1]);
  assert.ok(timeout >= MAX_WAIT_MINUTES + 60, `timeout-minutes=${timeout} < ${MAX_WAIT_MINUTES} + 60`);
});

