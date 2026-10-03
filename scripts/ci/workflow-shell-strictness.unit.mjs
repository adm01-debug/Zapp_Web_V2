// E59 (auditoria de GitHub Actions, 2026-10-01): todo bloco `run:` multi-linha
// do deploy-functions.yml abre com modo estrito de shell.
//
// Por que isto virou teste: a auditoria pediu `set -euo pipefail` no topo de
// cada bloco multi-linha e encontrou ZERO. O `set -o pipefail` do passo Deploy
// existia sozinho, e apenas porque uma falha do CLI mascarada pelo `tee` custou
// ~12 min de diagnostico (F-02). Uma exigencia que so' vive no texto do plano se
// perde na proxima edicao do arquivo; aqui ela fica presa.
//
// A verificacao oficial da etapa e' o `actionlint` (roda no CI); este teste
// cobre o invariante que o actionlint nao expressa.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../../.github/workflows/deploy-functions.yml', import.meta.url), 'utf8');

function blocosMultiLinha(texto) {
  const linhas = texto.split('\n');
  const blocos = [];
  for (let i = 0; i < linhas.length; i += 1) {
    const abertura = /^(\s*)run:\s*\|\s*$/.exec(linhas[i]);
    if (!abertura) continue;
    const indent = abertura[1].length + 2;
    const corpo = [];
    let j = i + 1;
    for (; j < linhas.length; j += 1) {
      const atual = linhas[j];
      const recuo = atual.length - atual.trimStart().length;
      if (atual.trim() && recuo <= indent - 2) break;
      corpo.push(atual);
    }
    blocos.push({ linha: i + 1, corpo });
    i = j - 1;
  }
  return blocos;
}

test('E59: todo run: | do deploy-functions.yml abre com set estrito', () => {
  const blocos = blocosMultiLinha(workflow);
  assert.ok(blocos.length >= 12, `esperava os 12 blocos multi-linha, achei ${blocos.length}`);
  for (const { linha, corpo } of blocos) {
    // Comentarios e linhas vazias podem vir antes; a primeira executavel e' que vale.
    const primeira = corpo.find((l) => l.trim() && !l.trim().startsWith('#'));
    assert.ok(primeira !== undefined, `bloco da linha ${linha} esta vazio`);
    assert.match(
      primeira.trim(),
      /^set -euo pipefail$/,
      `bloco da linha ${linha} nao abre com modo estrito (primeira linha: ${primeira.trim()})`,
    );
  }
});

test('E59: o passo Deploy mantem o pipefail explicito do F-02', () => {
  const inicio = workflow.indexOf('- name: Deploy\n');
  const fim = workflow.indexOf('- name: Capturar e validar manifesto remoto pos-deploy');
  assert.ok(inicio > 0 && fim > inicio);
  const passo = workflow.slice(inicio, fim);
  assert.match(passo, /^          set -euo pipefail$/m);
  // O tee continua sendo o canal do log do CLI: sem ele o extrator de
  // "No change found" nao tem o que ler.
  assert.match(passo, /\| tee "\$DEPLOY_LOG"/);
});

test('E59: o curl do catalogo tem teto de tempo', () => {
  assert.match(workflow, /--connect-timeout 10 --max-time 30/);
});
