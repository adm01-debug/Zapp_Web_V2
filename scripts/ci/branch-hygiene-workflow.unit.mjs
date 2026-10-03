// E91 (auditoria de GitHub Actions, 2026-10-01): o branch-hygiene-audit.yml
// publicava o relatorio SO no Job Summary, que morre com o run. A etapa pediu que
// ele tambem mantivesse uma issue aberta (historico consultavel) e que o corte de
// PR parado passasse de 14 dias por criacao para 7 dias sem push.
//
// Por que isto virou teste: a exigencia so' no texto do plano se perde na proxima
// edicao do YAML — e este arquivo ja' e' editado por varias etapas. O `actionlint`
// (verificacao oficial) valida sintaxe, nao o invariante de negocio: ele ficaria
// verde com o corte de volta em 14 dias ou com a issue removida.
//
// O caso do caminho do relatorio e' regressao real, nao hipotese: a primeira
// versao usava `mktemp` e o passo 2 morreu com "RELATORIO: unbound variable" —
// cada `run:` e' um shell novo, entao a variavel nao atravessa, so' o arquivo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../../.github/workflows/branch-hygiene-audit.yml', import.meta.url), 'utf8');

/** Blocos `run: |` do arquivo, com o numero da linha de abertura. */
function blocos(texto) {
  const linhas = texto.split('\n');
  const saida = [];
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
    saida.push({ linha: i + 1, corpo: corpo.join('\n') });
    i = j - 1;
  }
  return saida;
}

const todos = blocos(workflow);

test('E91: o relatorio vai para a issue, alem do Job Summary', () => {
  assert.match(workflow, /GITHUB_STEP_SUMMARY/, 'o Job Summary sumiu — ele era o comportamento anterior e deve continuar');
  assert.match(workflow, /gh issue edit/, 'falta o ramo de ATUALIZACAO da issue');
  assert.match(workflow, /gh issue create/, 'falta o ramo de CRIACAO da issue (primeira execucao)');
  assert.match(workflow, /startswith\("\[branch-hygiene\]"\)/, 'o upsert deve achar a issue aberta pelo marcador no titulo');
});

test('E91: o upsert e idempotente (procura a aberta antes de criar)', () => {
  const edicao = workflow.indexOf('gh issue edit');
  const criacao = workflow.indexOf('gh issue create');
  assert.ok(edicao > 0 && criacao > 0, 'os dois ramos precisam existir');
  assert.ok(
    /if\s*\[\s*-n\s+"\$EXISTENTE"\s*\]/.test(workflow),
    'a criacao precisa estar atras de um teste de existencia; sem isso cada semana abre outra issue',
  );
});

test('E91: PR parado e medido por updatedAt com corte de 7 dias', () => {
  assert.match(workflow, /updatedAt/, 'o corte passou a ser por ultimo movimento, nao por criacao');
  assert.match(workflow, /7\*86400/, 'o corte de 7 dias sumiu');
  assert.doesNotMatch(workflow, /14\*86400/, 'o corte antigo de 14 dias voltou');
});

test('E91: o passo que publica recalcula o caminho do relatorio', () => {
  // Cada `run:` e' um shell novo: se o passo 2 nao redefinir o caminho, ele morre
  // com "unbound variable" (regressao observada). Precisa haver a atribuicao nos
  // DOIS passos, e o passo de publicacao tem que falhar alto se o arquivo faltar.
  const atribuicoes = (workflow.match(/RELATORIO="\$RUNNER_TEMP\//g) ?? []).length;
  assert.ok(atribuicoes >= 2, `o caminho do relatorio deve ser definido nos 2 passos, achei ${atribuicoes}`);
  assert.match(workflow, /if\s*\[\s*!\s*-s\s+"\$RELATORIO"\s*\]/, 'sem a checagem, um relatorio ausente viraria issue vazia em silencio');
  assert.doesNotMatch(workflow, /RELATORIO="\$\(mktemp\)"/, 'mktemp nao sobrevive ao fim do shell do passo');
});

test('E91: o ref simbolico `origin` nao entra na lista de branches', () => {
  // `git branch -r` lista `origin` (o proprio remote) alem de `origin/<branch>`.
  // Ele apareceu como "patch-equivalente a main" na primeira execucao real.
  for (const { linha, corpo } of todos) {
    if (!corpo.includes('git branch -r')) continue;
    assert.match(
      corpo,
      /grep -v '\^origin\$'/,
      `linha ${linha}: o loop de branches nao filtra o ref simbolico \`origin\``,
    );
  }
});
