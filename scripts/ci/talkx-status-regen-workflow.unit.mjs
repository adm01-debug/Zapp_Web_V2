/**
 * Regressao (02/10/2026): o workflow "Talk X V4 placar regen" empurrava direto na
 * main e era recusado pela branch protection:
 *
 *   remote: error: GH006: Protected branch update failed for refs/heads/main.
 *   remote: - 6 of 6 required status checks are expected.
 *   error: failed to push some refs
 *
 * (run 37061271438). O commit do bot era criado e o push rejeitado — o job ficava
 * vermelho na main a cada mudanca de placar. O desenho anterior so funcionava
 * antes da branch protection.
 *
 * Este teste trava o desenho novo: nada de push direto, PR pelo mesmo mecanismo
 * do types-sync (create-pull-request + destravar os checks).
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../../.github/workflows/talkx-status-regen.yml', import.meta.url),
  'utf8',
);

test('nao empurra direto na main (a main tem branch protection)', () => {
  assert.doesNotMatch(
    workflow,
    /^\s*git push\s*$/mu,
    'push direto na main volta a ser recusado com GH006 (run 37061271438)',
  );
  assert.doesNotMatch(
    workflow,
    /^\s*git commit\s+-m/mu,
    'o workflow nao deve commitar localmente: quem commita e o create-pull-request',
  );
});

test('abre/atualiza o PR do placar pelo mesmo mecanismo do types-sync', () => {
  assert.match(
    workflow,
    /uses:\s*peter-evans\/create-pull-request@[a-f0-9]{40}/u,
    'usa create-pull-request pinado por SHA',
  );
  assert.match(workflow, /branch:\s*automation\/talkx-status/u);
  assert.match(
    workflow,
    /add-paths:\s*\|[\s\S]*docs\/talkx\/v4\/STATUS\.md/u,
    'add-paths precisa declarar o STATUS.md (o caso "ja atualizado" vira no-op)',
  );
  assert.match(workflow, /token:\s*\$\{\{\s*github\.token\s*\}\}/u);
});

test('destrava os checks do PR aberto com GITHUB_TOKEN', () => {
  // Gap encontrado em producao depois do primeiro merge (run 37068185925): o
  // job tinha contents+actions:write mas NAO pull-requests:write, e o
  // create-pull-request falhou com "Resource not accessible by integration".
  // O push do branch passava — so a criacao do PR quebrava.
  assert.match(
    workflow,
    /pull-requests:\s*write/u,
    'sem pull-requests: write o GITHUB_TOKEN nao cria o PR (Resource not accessible by integration)',
  );
  assert.match(workflow, /actions:\s*write/u, 'precisa de actions:write para aprovar os runs');
  assert.match(workflow, /uses:\s*actions\/github-script@[a-f0-9]{40}/u);
  assert.match(workflow, /approveWorkflowRun/u);
});

test('continua regenerando o placar pelo gerador oficial', () => {
  assert.match(workflow, /node scripts\/talkx\/v4-status\.mjs/u);
});
