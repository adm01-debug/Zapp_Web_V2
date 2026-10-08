// E22 (auditoria de GitHub Actions, 2026-10-01) / SL-025: o PR de tipos nasce com
// a label `automerge-ok` e com o auto-merge armado (`gh pr merge --auto --squash`).
// Sem isto o PR de sincronizacao ficava aberto esperando alguem lembrar dele, e o
// `auto-update-pr-branch.yml` — que filtra `autoMergeRequest != null` — seguia
// codigo morto (G-06): nunca encontrava PR nenhum.
//
// Por que isto virou teste: o invariante vive no YAML, e a verificacao do plano
// ("PR de sync mergeia sozinho quando verde") nao existe em nenhum gate. O
// `actionlint` valida sintaxe — ele fica verde com a label removida, com o passo
// de auto-merge apagado ou com um `continue-on-error` de volta.
//
// A ordem tambem e' invariante, nao estetica: `create-pull-request` recebe
// `labels: types-sync,automerge-ok` e a API do GitHub recusa label que nao existe
// no repositorio — por isso a criacao das DUAS labels tem de vir ANTES do passo
// do PR.
//
// Comentarios YAML NAO contam como prova: as linhas `#` sao removidas antes de
// cada assercao (esta mesma explicacao cita `labels: types-sync,automerge-ok`, e
// sem o corte o teste passaria com o passo do PR sem label nenhuma).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(
  new URL('../../.github/workflows/types-sync.yml', import.meta.url),
  'utf8',
);

/** Passos do arquivo, na ordem em que aparecem (itens de lista com recuo de 6). */
function passos(texto) {
  const linhas = texto.split('\n');
  const saida = [];
  let atual = null;
  for (let i = 0; i < linhas.length; i += 1) {
    if (/^ {6}- /.test(linhas[i])) {
      if (atual) saida.push(atual);
      atual = { linha: i + 1, corpo: [] };
    }
    if (atual) atual.corpo.push(linhas[i]);
  }
  if (atual) saida.push(atual);
  return saida;
}

const todos = passos(workflow);
/** Corpo do passo sem as linhas de comentario YAML. */
const limpo = (i) => todos[i].corpo.filter((l) => !l.trim().startsWith('#')).join('\n');
const achar = (teste) => todos.findIndex((_, i) => teste(limpo(i)));

const passoPR = achar((corpo) => /uses:\s*peter-evans\/create-pull-request@/.test(corpo));
const passoLabels = achar((corpo) => corpo.includes('createLabel') && /name:\s*'automerge-ok'/.test(corpo));
const passoAutoMerge = achar((corpo) => /gh\s+pr\s+merge/.test(corpo));

test('E22: o PR de tipos carrega exatamente as labels types-sync e automerge-ok', () => {
  assert.notEqual(passoPR, -1, 'nao achei o passo do create-pull-request');
  const declaradas = /^\s*labels:\s*(\S.*)$/mu.exec(limpo(passoPR));
  assert.ok(declaradas, 'o passo do PR nao declara `labels:`');
  assert.deepEqual(
    declaradas[1].split(',').map((l) => l.trim()).sort(),
    ['automerge-ok', 'types-sync'],
    'as labels do PR de tipos mudaram (E22 pede types-sync e automerge-ok)',
  );
});

test('E22: as duas labels existem antes de o PR ser aberto', () => {
  assert.notEqual(passoLabels, -1, 'o passo que garante as labels nao cria a automerge-ok');
  assert.notEqual(passoPR, -1, 'nao achei o passo do create-pull-request');
  assert.ok(
    passoLabels < passoPR,
    `a label precisa existir ANTES do PR (labels na linha ${todos[passoLabels].linha}, PR na ${todos[passoPR].linha})`,
  );
  const corpo = limpo(passoLabels);
  assert.match(corpo, /name:\s*'types-sync'/u, 'a label types-sync deixou de ser garantida');
});

test('E22: o auto-merge e armado depois do PR e so quando o PR existe', () => {
  assert.notEqual(passoAutoMerge, -1, 'nao existe passo de auto-merge (E22)');
  assert.ok(
    passoAutoMerge > passoPR,
    'o passo de auto-merge tem de vir depois do passo que abre/atualiza o PR',
  );
  const corpo = limpo(passoAutoMerge);
  assert.match(corpo, /--auto/u, 'o auto-merge perdeu a flag --auto');
  assert.match(corpo, /--squash/u, 'o repositorio so aceita squash: sem --squash o merge nao entra');
  assert.match(
    corpo,
    /steps\.pull-request\.outputs\.pull-request-number/u,
    'o passo nao esta amarrado ao PR criado: sem isso ele roda (e falha) tambem quando nao ha PR',
  );
  assert.doesNotMatch(
    corpo,
    /continue-on-error/u,
    'auto-merge que nao arma e falha real: engolir o erro deixa o PR parado em silencio',
  );
});

test('E22: o job do sync tem permissao de escrita para armar o auto-merge', () => {
  assert.match(
    workflow,
    /pull-requests:\s*write/u,
    'sem pull-requests: write o auto-merge nao pode ser armado',
  );
});
