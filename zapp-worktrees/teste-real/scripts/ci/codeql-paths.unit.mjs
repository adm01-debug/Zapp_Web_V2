import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/codeql.yml', import.meta.url), 'utf8');

test('E78: o pull_request do CodeQL ignora docs, markdown e migrations', () => {
  const bloco = workflow.slice(workflow.indexOf('  pull_request:'), workflow.indexOf('  schedule:'));
  assert.match(bloco, /paths-ignore:/, 'o pull_request precisa de paths-ignore');
  assert.match(bloco, /- 'docs\/\*\*'/, 'docs/ tem de ser ignorado');
  assert.match(bloco, /- '\*\*\/\*\.md'/, 'markdown tem de ser ignorado');
  assert.match(bloco, /- 'supabase\/migrations\/\*\*'/, 'as migrations tem de ser ignoradas');
});

test('E78: o schedule NAO herda o filtro — a varredura semanal cobre o repositorio inteiro', () => {
  // Se o paths-ignore fosse no `on:` de topo, ele valeria tambem para o schedule e um
  // repositorio que so recebesse PR de docs nunca seria analisado. Preso isso.
  const agendado = workflow.slice(workflow.indexOf('  schedule:'), workflow.indexOf('\npermissions:'));
  assert.doesNotMatch(agendado, /paths-ignore/, 'o schedule nao pode ser filtrado por caminho');
  const topo = workflow.slice(workflow.indexOf('on:'), workflow.indexOf('  pull_request:'));
  assert.doesNotMatch(topo, /paths-ignore/, 'o filtro tem de viver no pull_request, nao no gatilho inteiro');
});

test('E78: ignorar esses caminhos nao esconde nada que o CodeQL analise', () => {
  // O escopo declarado do workflow e' JS/TS de src/, scripts/ e supabase/functions/,
  // alem dos proprios workflows. Nenhum deles esta na lista ignorada -- e este teste
  // impede que alguem alargue a lista para um diretorio que o CodeQL de fato le.
  const escopo = ['src', 'scripts', 'supabase/functions', '.github/workflows'];
  const ignorados = [...workflow.matchAll(/- '([^']+)'/g)]
    .map((m) => m[1])
    .filter((p) => p.includes('/') || p.includes('*'));
  for (const alvo of escopo) {
    for (const padrao of ignorados) {
      const base = padrao.replace(/\*\*.*$/, '').replace(/\/$/, '');
      assert.notEqual(
        base,
        alvo,
        `o padrao ignorado "${padrao}" cobre ${alvo}, que o CodeQL analisa`,
      );
    }
  }
  assert.ok(ignorados.includes('docs/**'), 'a lista ignorada tem de conter docs/**');
});
