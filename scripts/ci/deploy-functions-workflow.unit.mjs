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

test('registro de deploy e unico por run (deploys paralelos no mesmo segundo)', async () => {
  // E60 (03/10/2026): o rastro de deploy deixou de ser a tag
  // `edge-deploy/<data>-<sha8>-<run>` e passou a ser um Deployment do GitHub. A
  // propriedade que importa continua a mesma -- registros de runs diferentes nao
  // podem colidir, mesmo terminando no mesmo segundo -- e agora vive no payload,
  // que carrega o run id e o sha deployado.
  assert.match(workflow, /register-deployment\.mjs/, 'o passo tem de registrar o Deployment');
  const cli = await readFile(new URL('../edge-deploy/register-deployment.mjs', import.meta.url), 'utf8');
  assert.match(cli, /GITHUB_RUN_ID/, 'o registro tem de carregar o run id (unicidade por run)');
  assert.match(cli, /DEPLOYED_GIT_SHA/, 'e o sha deployado (o que esta no ar, nao a branch)');
  assert.doesNotMatch(workflow, /TAG="edge-deploy\//, 'a tag de rastreabilidade saiu de cena na E60');
});

test('timeout do job cobre a espera maxima do gate mais um deploy completo', async () => {
  // Com 60 min e espera de ate 40, sobravam ~20 para setup + deploy + coletor de ~24 min.
  const { MAX_WAIT_MINUTES } = await import('../edge-deploy/serialize-scope.mjs');
  const timeout = Number(/^    timeout-minutes: (\d+)$/m.exec(workflow)?.[1]);
  assert.ok(timeout >= MAX_WAIT_MINUTES + 60, `timeout-minutes=${timeout} < ${MAX_WAIT_MINUTES} + 60`);
});


test('R2-INF-002: o artifact so sobe se a sanitizacao do log terminar com sucesso', () => {
  // Re-pino R2-INF-002: redator e upload usavam always() de forma independente —
  // se a redacao falhasse, o diretorio de evidencia subia para o storage do GitHub
  // com o log bruto (que carrega access_token). Este teste prende o contrato do
  // workflow: a versao publicavel sai de um diretorio SEPARADO e o upload exige o
  // sucesso do passo do redator.
  const inicioRedacao = workflow.indexOf('- name: Limpar segredos do log de deploy');
  const inicioUpload = workflow.indexOf('- name: Arquivar manifesto, atestado e smokes');
  assert.ok(inicioRedacao > 0 && inicioUpload > inicioRedacao, 'a sanitizacao tem de vir antes do upload');
  const redacao = workflow.slice(inicioRedacao, inicioUpload);
  const upload = workflow.slice(inicioUpload);

  // (1) o redator tem id proprio e o upload exige que o passo dele tenha saido com sucesso
  assert.match(redacao, /^        id: redigir_log$/m, 'o passo do redator precisa de id proprio');
  assert.match(
    upload,
    /steps\.redigir_log\.outcome == 'success'/,
    'o upload tem de exigir outcome success do redator (falha do redator = nenhum artifact)',
  );

  // (2) a versao publicada sai de um diretorio SEPARADO — o diretorio com o log bruto
  // nunca pode ser o alvo do upload
  assert.match(upload, /path: \$\{\{ runner\.temp \}\}\/edge-deployment-evidence-public\//);
  assert.doesNotMatch(
    upload,
    /path: \$\{\{ runner\.temp \}\}\/edge-deployment-evidence\//,
    'o diretorio com o log bruto nao pode ser publicado',
  );

  // (3) a logica de shell vive num script do repositorio, nao inline no passo: e' o
  // arquivo que o teste de unidade executa de verdade (scripts/edge-deploy/
  // preparar-artifact-deploy.unit.mjs). Passo de YAML com shell proprio nao seria
  // exercitado por nenhum teste.
  assert.match(
    redacao,
    /bash "\$RUNNER_TEMP\/edge-tooling\/scripts\/edge-deploy\/preparar-artifact-deploy\.sh"/,
    'o passo tem de chamar o script testado, nao carregar shell inline',
  );
  assert.doesNotMatch(
    redacao,
    /node "\$RUNNER_TEMP\/edge-tooling\/scripts\/edge-deploy\/redigir-log\.mjs"/,
    'o passo nao pode mais redigir o log do diretorio de evidencia (alvo do upload antigo)',
  );

  // (4) a base do redator e' explicita no passo e cobre o staging em $RUNNER_TEMP —
  // sem isso o confinamento recusaria o caminho (exit 2) e o artifact sumiria em todo deploy
  assert.match(redacao, /REDIGIR_LOG_BASE: \$\{\{ runner\.temp \}\}/, 'a base do redator tem de ser explicita no passo');
});

test('E55: o passo de atestacao tem teto proprio de 10 min', () => {
  // O job tem 100 min, mas a atestacao nao pode consumir esse orcamento: se a
  // Management API nao estabilizar, o passo falha com lastReason e o run nao
  // termina em success.
  const inicio = workflow.indexOf('- name: Capturar e validar manifesto remoto pos-deploy');
  const fim = workflow.indexOf('- name: Executar smoke positivo e negativo por funcao');
  assert.ok(inicio > 0 && fim > inicio);
  const bloco = workflow.slice(inicio, fim);
  assert.match(bloco, /^        timeout-minutes: 10$/m);
  assert.ok(workflow.indexOf('    timeout-minutes: 100') < inicio, 'o job mantem os 100 min');
});
