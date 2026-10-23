import test from 'node:test';
import assert from 'node:assert/strict';

import { escolherRefParaRollback } from './resolve-rollback-ref.mjs';

const ATUAL = 'sha-atual-publicado-agora';
const ANTERIOR = 'sha-anterior-bom';
const ANTIGO = 'sha-antigo-bom';

// GA30: fixture com o `success` mais recente = SHA atual ("No change").
// O resolvedor tem de PULAR o atual e escolher o anterior.
test('GA30: success mais recente = SHA atual -> escolhe o anterior', async () => {
  const deployments = [
    { id: 30, sha: ATUAL },
    { id: 20, sha: ANTERIOR },
    { id: 10, sha: ANTIGO },
  ];
  const statuses = { 30: [{ state: 'success' }], 20: [{ state: 'success' }], 10: [{ state: 'success' }] };
  const escolhido = await escolherRefParaRollback({
    deployments,
    shaAtual: ATUAL,
    listarStatuses: async (id) => statuses[id] ?? [],
  });
  assert.equal(escolhido, ANTERIOR);
});

// GA30: sem `success` anterior nao ha para onde voltar -> recusa (null).
test('GA30: so o SHA atual tem success -> recusa (null)', async () => {
  const deployments = [
    { id: 30, sha: ATUAL },
    { id: 20, sha: ANTERIOR },
  ];
  const statuses = { 30: [{ state: 'success' }], 20: [{ state: 'failure' }] };
  const escolhido = await escolherRefParaRollback({
    deployments,
    shaAtual: ATUAL,
    listarStatuses: async (id) => statuses[id] ?? [],
  });
  assert.equal(escolhido, null);
});

// GA30: status ilegivel num deployment nao aborta a busca (pula para o proximo).
test('GA30: statuses com erro sao pulados, nao abortam', async () => {
  const deployments = [
    { id: 20, sha: ANTERIOR },
    { id: 10, sha: ANTIGO },
  ];
  const escolhido = await escolherRefParaRollback({
    deployments,
    shaAtual: ATUAL,
    listarStatuses: async (id) => {
      if (id === 20) throw new Error('HTTP 500');
      return [{ state: 'success' }];
    },
  });
  assert.equal(escolhido, ANTIGO);
});

test('GA30: lista vazia -> recusa (null)', async () => {
  const escolhido = await escolherRefParaRollback({
    deployments: [],
    shaAtual: ATUAL,
    listarStatuses: async () => [],
  });
  assert.equal(escolhido, null);
});
