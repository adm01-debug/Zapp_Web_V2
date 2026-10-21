import test from 'node:test';
import assert from 'node:assert/strict';
import { classificar, decidir, estadoDoCheck, checksObrigatorios, resolverDesconhecidos, confirmarCandidato } from './fila-merge.mjs';

const OBRIG = ['🧪 Unit Tests', 'Contrato DB offline'];
const ok = (name) => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-15T10:00:00Z' });
const rodando = (name) => ({ __typename: 'CheckRun', name, status: 'IN_PROGRESS', conclusion: '', startedAt: '2026-10-15T10:05:00Z' });
const falhou = (name, startedAt = '2026-10-15T10:00:00Z') => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion: 'FAILURE', startedAt });
const verde = OBRIG.map(ok);
// Tempo fixo para testes com teto GA49: 10 min após os checks de startedAt '10:00'/'10:05'
const AGORA_TESTE = new Date('2026-10-15T10:10:00Z').getTime();

function pr(number, extra = {}) {
  return {
    number,
    isDraft: false,
    baseRefName: 'main',
    autoMergeRequest: { enabledAt: `2026-10-15T0${number % 10}:00:00Z` },
    mergeStateStatus: 'BEHIND',
    statusCheckRollup: verde,
    ...extra,
  };
}

test('os checks obrigatórios saem do baseline do settings-guard (fonte única)', () => {
  const lista = checksObrigatorios();
  assert.equal(lista.length, 6);
  assert.ok(lista.includes('🧩 Node CI Scripts'));
});

test('estado do check: ausente e em andamento são pendentes; cancelado não conta como falha', () => {
  assert.equal(estadoDoCheck([], '🧪 Unit Tests'), 'pendente');
  assert.equal(estadoDoCheck([rodando('🧪 Unit Tests')], '🧪 Unit Tests'), 'pendente');
  assert.equal(estadoDoCheck([{ ...ok('🧪 Unit Tests'), conclusion: 'CANCELLED' }], '🧪 Unit Tests'), 'pendente');
  assert.equal(estadoDoCheck([falhou('🧪 Unit Tests')], '🧪 Unit Tests'), 'falhou');
  assert.equal(estadoDoCheck([{ ...ok('🧪 Unit Tests'), conclusion: 'SKIPPED' }], '🧪 Unit Tests'), 'passou');
});

test('estado do check: shard com nome parecido não é confundido com o agregador', () => {
  assert.equal(estadoDoCheck([falhou('🧪 Unit Tests (1/3)')], '🧪 Unit Tests'), 'pendente');
});

test('estado do check: vale o run mais recente do mesmo nome', () => {
  const rollup = [falhou('🧪 Unit Tests', '2026-10-15T09:00:00Z'), ok('🧪 Unit Tests')];
  assert.equal(estadoDoCheck(rollup, '🧪 Unit Tests'), 'passou');
});

test('estado do check: StatusContext usa state', () => {
  assert.equal(estadoDoCheck([{ __typename: 'StatusContext', context: 'Contrato DB offline', state: 'PENDING' }], 'Contrato DB offline'), 'pendente');
  assert.equal(estadoDoCheck([{ __typename: 'StatusContext', context: 'Contrato DB offline', state: 'SUCCESS' }], 'Contrato DB offline'), 'passou');
});

test('classificar: draft, sem auto-merge, outra base e conflito ficam fora da fila', () => {
  assert.equal(classificar(pr(1, { isDraft: true }), OBRIG), 'fora');
  assert.equal(classificar(pr(1, { autoMergeRequest: null }), OBRIG), 'fora');
  assert.equal(classificar(pr(1, { baseRefName: 'outra' }), OBRIG), 'fora');
  assert.equal(classificar(pr(1, { mergeStateStatus: 'DIRTY' }), OBRIG), 'fora');
  assert.equal(classificar(pr(1, { isCrossRepository: true }), OBRIG), 'fora');
  // Fork em dia com a main e rodando checks ocupa a vez como qualquer outra.
  assert.equal(classificar(pr(1, { isCrossRepository: true, mergeStateStatus: 'BLOCKED', statusCheckRollup: OBRIG.map(rodando) }), OBRIG), 'em-voo');
});

test('classificar: BEHIND com checks verdes aguarda; com check obrigatório vermelho fica bloqueada', () => {
  assert.equal(classificar(pr(1), OBRIG), 'aguardando');
  assert.equal(classificar(pr(1, { statusCheckRollup: [ok('🧪 Unit Tests'), falhou('Contrato DB offline')] }), OBRIG), 'bloqueada');
});

test('classificar: atualizada com a main e rodando (ou verde) ocupa a vez', () => {
  assert.equal(classificar(pr(1, { mergeStateStatus: 'BLOCKED', statusCheckRollup: OBRIG.map(rodando) }), OBRIG, AGORA_TESTE), 'em-voo');
  assert.equal(classificar(pr(1, { mergeStateStatus: 'CLEAN' }), OBRIG, AGORA_TESTE), 'em-voo');
  assert.equal(classificar(pr(1, { mergeStateStatus: 'UNKNOWN' }), OBRIG, AGORA_TESTE), 'em-voo');
});

test('decidir: com uma PR em voo, ninguém mais é atualizado (o desperdicio O(N²) de 15/10)', () => {
  const prs = [pr(1, { mergeStateStatus: 'BLOCKED', statusCheckRollup: OBRIG.map(rodando) }), pr(2), pr(3)];
  const d = decidir(prs, OBRIG);
  assert.equal(d.acao, 'esperar');
  assert.deepEqual(d.emVoo, [1]);
});

test('decidir: sem PR em voo, atualiza só UMA — a que habilitou o auto-merge primeiro (FIFO)', () => {
  const prs = [
    pr(7, { autoMergeRequest: { enabledAt: '2026-10-15T12:00:00Z' } }),
    pr(4, { autoMergeRequest: { enabledAt: '2026-10-15T08:00:00Z' } }),
    pr(5, { autoMergeRequest: { enabledAt: '2026-10-15T09:00:00Z' } }),
  ];
  const d = decidir(prs, OBRIG);
  assert.equal(d.acao, 'atualizar');
  assert.equal(d.pr, 4);
  assert.deepEqual(d.fila, [4, 5, 7]);
  assert.deepEqual(d.restantes, [5, 7]);
});

test('decidir: PR bloqueada não entra na fila nem a trava', () => {
  const prs = [pr(1, { statusCheckRollup: [falhou('🧪 Unit Tests')] }), pr(2)];
  const d = decidir(prs, OBRIG);
  assert.equal(d.acao, 'atualizar');
  assert.equal(d.pr, 2);
  assert.deepEqual(d.bloqueadas, [1]);
});

test('decidir: em voo que ficou vermelha libera a vez para a próxima', () => {
  const prs = [pr(1, { mergeStateStatus: 'BLOCKED', statusCheckRollup: [ok('🧪 Unit Tests'), falhou('Contrato DB offline')] }), pr(2)];
  const d = decidir(prs, OBRIG);
  assert.equal(d.acao, 'atualizar');
  assert.equal(d.pr, 2);
});

test('decidir: fila vazia não faz nada', () => {
  assert.equal(decidir([], OBRIG).acao, 'nada');
  assert.equal(decidir([pr(1, { autoMergeRequest: null })], OBRIG).acao, 'nada');
});

test('UNKNOWN com auto-merge vira BEHIND quando a comparação diz que está atrás (a fila não trava)', async () => {
  const prs = [
    pr(1, { mergeStateStatus: 'UNKNOWN', headRefOid: 'h1' }),
    pr(2, { mergeStateStatus: 'UNKNOWN', headRefOid: 'h2' }),
    pr(3, { mergeStateStatus: 'UNKNOWN', headRefOid: 'h3' }),
  ];
  const atras = { h1: 4, h2: 0 };
  const resolvidas = await resolverDesconhecidos(prs, async (h) => {
    if (!(h in atras)) throw new Error('HTTP 502');
    return atras[h];
  });
  assert.deepEqual(resolvidas.map((p) => p.mergeStateStatus), ['BEHIND', 'UNKNOWN', 'UNKNOWN']);
  // h2 está em dia (ocupa a vez); h3 sem resposta fica conservador (também ocupa).
  assert.equal(decidir(resolvidas, OBRIG, AGORA_TESTE).acao, 'esperar');
  assert.equal(decidir([resolvidas[0]], OBRIG, AGORA_TESTE).pr, 1);
});

test('PR sem auto-merge ou draft não gasta chamada de API', async () => {
  let chamadas = 0;
  await resolverDesconhecidos(
    [pr(1, { mergeStateStatus: 'UNKNOWN', autoMergeRequest: null, headRefOid: 'h' }), pr(2, { mergeStateStatus: 'UNKNOWN', isDraft: true, headRefOid: 'h' })],
    async () => { chamadas += 1; return 1; },
  );
  assert.equal(chamadas, 0);
});

test('PR de fork na frente não trava a fila: fica fora e a próxima é escolhida', () => {
  const prs = [
    pr(1, { isCrossRepository: true, autoMergeRequest: { enabledAt: '2026-10-15T01:00:00Z' } }),
    pr(2, { autoMergeRequest: { enabledAt: '2026-10-15T02:00:00Z' } }),
  ];
  const d = decidir(prs, OBRIG);
  assert.equal(d.acao, 'atualizar');
  assert.deepEqual(d.fila, [2]);
});

test('fork em dia com a main segura a fila; nenhuma interna é atualizada junto', () => {
  const prs = [
    pr(1, { isCrossRepository: true, mergeStateStatus: 'BLOCKED', statusCheckRollup: OBRIG.map(rodando) }),
    pr(2),
  ];
  const d = decidir(prs, OBRIG);
  assert.equal(d.acao, 'esperar');
  assert.deepEqual(d.emVoo, [1]);
});

test('GA50: PR com mergeable=CONFLICTING fica fora da fila', () => {
  assert.equal(classificar(pr(1, { mergeable: 'CONFLICTING', mergeStateStatus: 'BEHIND' }), OBRIG), 'fora');
  assert.equal(classificar(pr(1, { mergeable: 'CONFLICTING', mergeStateStatus: 'BLOCKED' }), OBRIG), 'fora');
  // MERGEABLE e ausente não devem afetar
  assert.equal(classificar(pr(1, { mergeable: 'MERGEABLE' }), OBRIG), 'aguardando');
});

test('GA49: PR em dia com checks todos COMPLETED e CANCELLED → bloqueada (não trava a fila para sempre)', () => {
  const cancelado = (name) => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion: 'CANCELLED', startedAt: '2026-10-15T10:00:00Z', completedAt: '2026-10-15T10:05:00Z' });
  const rollupCancelado = OBRIG.map(cancelado);
  // PR em dia (BLOCKED = checando) com todos COMPLETED+CANCELLED → bloqueada
  assert.equal(classificar(pr(1, { mergeStateStatus: 'BLOCKED', statusCheckRollup: rollupCancelado }), OBRIG), 'bloqueada');
  // PR BEHIND com CANCELLED ainda aguarda (update-branch vai re-trigar)
  assert.equal(classificar(pr(1, { mergeStateStatus: 'BEHIND', statusCheckRollup: rollupCancelado }), OBRIG), 'aguardando');
});

test('GA49 teto: PR em dia sem check em andamento há > 45 min → bloqueada', () => {
  const agora = new Date('2026-10-15T12:00:00Z').getTime();
  const velhoCompleto = (name) => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-15T10:00:00Z', completedAt: '2026-10-15T10:55:00Z' }); // 65 min atrás
  const rollupVelho = OBRIG.map(velhoCompleto);
  assert.equal(classificar(pr(1, { mergeStateStatus: 'BLOCKED', statusCheckRollup: rollupVelho }), OBRIG, agora), 'bloqueada');
});

test('GA49 teto: check IN_PROGRESS protege a PR do teto temporal', () => {
  const agora = new Date('2026-10-15T12:00:00Z').getTime();
  const rollupMisto = [
    { __typename: 'CheckRun', name: OBRIG[0], status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-15T10:00:00Z', completedAt: '2026-10-15T10:55:00Z' },
    { __typename: 'CheckRun', name: OBRIG[1], status: 'IN_PROGRESS', conclusion: '', startedAt: '2026-10-15T11:55:00Z' },
  ];
  assert.equal(classificar(pr(1, { mergeStateStatus: 'BLOCKED', statusCheckRollup: rollupMisto }), OBRIG, agora), 'em-voo');
});

test('confirmarCandidato: só autoriza o próximo não recusado, com ninguém em voo', () => {
  const fila = { acao: 'atualizar', pr: 1, fila: [1, 2], restantes: [2], bloqueadas: [] };
  assert.equal(confirmarCandidato(fila, 2, [1]), true);
  assert.equal(confirmarCandidato(fila, 2), false, 'sem recusa, a 1 ainda está à frente');
  // PR mais antiga ficou elegível no meio da execução: ela passa à frente da 2 (Codex, #1951).
  assert.equal(confirmarCandidato({ acao: 'atualizar', pr: 7, fila: [7, 1, 2], restantes: [1, 2], bloqueadas: [] }, 2, [1]), false);
  assert.equal(confirmarCandidato({ acao: 'esperar', emVoo: [9], bloqueadas: [] }, 2), false);
  assert.equal(confirmarCandidato({ acao: 'atualizar', pr: 1, fila: [1], restantes: [], bloqueadas: [] }, 2), false);
  assert.equal(confirmarCandidato({ acao: 'nada', bloqueadas: [] }, 2), false);
});
