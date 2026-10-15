import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/codeql.yml', import.meta.url), 'utf8');

test('W84: o pull_request do CodeQL NAO tem paths-ignore (pre-requisito para virar required check)', () => {
  // E78 (01/10/2026) tinha paths-ignore aqui para economizar runner. W84
  // (15/10/2026) removeu: um check required com paths-ignore trava para
  // sempre uma PR que so mexe nesses caminhos ("Expected — Waiting for
  // status"), e a fila de merge so roda 1 PR por vez (R1).
  const bloco = workflow.slice(workflow.indexOf('  pull_request:'), workflow.indexOf('  schedule:'));
  assert.doesNotMatch(bloco, /paths-ignore:/, 'o pull_request nao pode voltar a filtrar por caminho');
});

test('W84: o schedule continua sem filtro — a varredura semanal cobre o repositorio inteiro', () => {
  const agendado = workflow.slice(workflow.indexOf('  schedule:'), workflow.indexOf('\npermissions:'));
  assert.doesNotMatch(agendado, /paths-ignore/, 'o schedule nao pode ser filtrado por caminho');
  const topo = workflow.slice(workflow.indexOf('on:'), workflow.indexOf('  pull_request:'));
  assert.doesNotMatch(topo, /paths-ignore/, 'o filtro nao pode voltar no gatilho inteiro');
});
