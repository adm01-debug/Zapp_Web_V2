import test from 'node:test';
import assert from 'node:assert/strict';
import { classificar, decidir, estadoDoCheck, checksObrigatorios, resolverDesconhecidos, confirmarCandidato, motivoFora, TETO_TRAVADA_MS } from './fila-merge.mjs';

const OBRIG = ['🧪 Unit Tests', 'Contrato DB offline'];
const AGORA_ISO = () => new Date().toISOString();
const ok = (name) => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: AGORA_ISO() });
const rodando = (name) => ({ __typename: 'CheckRun', name, status: 'IN_PROGRESS', conclusion: '', startedAt: AGORA_ISO() });
const falhou = (name, startedAt = AGORA_ISO()) => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion: 'FAILURE', startedAt });
const verde = OBRIG.map(ok);

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

test('estado do check: ausente e em andamento são pendentes; cancelado trava (GA49)', () => {
  assert.equal(estadoDoCheck([], '🧪 Unit Tests'), 'pendente');
  assert.equal(estadoDoCheck([rodando('🧪 Unit Tests')], '🧪 Unit Tests'), 'pendente');
  assert.equal(estadoDoCheck([{ ...ok('🧪 Unit Tests'), conclusion: 'CANCELLED' }], '🧪 Unit Tests'), 'bloqueado');
  assert.equal(estadoDoCheck([{ ...ok('🧪 Unit Tests'), conclusion: 'ACTION_REQUIRED' }], '🧪 Unit Tests'), 'bloqueado');
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

test('GA03: CodeQL em FAILURE bloqueia a PR (app trocado tambem bloqueia)', () => {
  const codeqlDown = (name) => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-15T10:00:00Z' });
  const obrigComCodeql = [...OBRIG, 'CodeQL'];
  assert.equal(classificar(pr(1, { statusCheckRollup: [ok('Contrato DB offline'), codeqlDown('CodeQL')] }), obrigComCodeql), 'bloqueada');
});

test('classificar: BEHIND com checks verdes aguarda; com check obrigatório vermelho fica bloqueada', () => {
  assert.equal(classificar(pr(1), OBRIG), 'aguardando');
  assert.equal(classificar(pr(1, { statusCheckRollup: [ok('🧪 Unit Tests'), falhou('Contrato DB offline')] }), OBRIG), 'bloqueada');
});

test('GA49: em dia com check CANCELLED vira bloqueada (nao pendente eterna)', () => {
  const cancelado = [{ ...ok('🧪 Unit Tests'), conclusion: 'CANCELLED' }, ok('Contrato DB offline')];
  assert.equal(classificar(pr(1, { mergeStateStatus: 'CLEAN', statusCheckRollup: cancelado }), OBRIG), 'bloqueada');
  const d = decidir(
    [pr(1, { mergeStateStatus: 'CLEAN', statusCheckRollup: cancelado }), pr(2)],
    OBRIG,
  );
  assert.equal(d.acao, 'atualizar');
  assert.equal(d.pr, 2);
  assert.deepEqual(d.bloqueadas, [1]);
});

test('GA49: teto de 45 min — em dia e sem andamento ha mais de 45 min libera a vez', () => {
  const agora = Date.parse('2026-10-15T12:00:00Z');
  const velho = new Date(agora - TETO_TRAVADA_MS - 60_000).toISOString();
  const travado = OBRIG.map((name) => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: velho }));
  // COMPLETED+sUCCESS ha 46 min, nada rodando: a fila nao pode esperar para sempre.
  assert.equal(classificar(pr(1, { mergeStateStatus: 'CLEAN', statusCheckRollup: travado }), OBRIG, agora), 'bloqueada');
  const recente = new Date(agora - 5 * 60_000).toISOString();
  const fresco = OBRIG.map((name) => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: recente }));
  assert.equal(classificar(pr(1, { mergeStateStatus: 'CLEAN', statusCheckRollup: fresco }), OBRIG, agora), 'em-voo');
  // Rodando agora, mesmo com startedAt velho: continua em voo.
  const rodandoVelho = [{ __typename: 'CheckRun', name: OBRIG[0], status: 'IN_PROGRESS', conclusion: '', startedAt: velho }, fresco[1]];
  assert.equal(classificar(pr(1, { mergeStateStatus: 'CLEAN', statusCheckRollup: rodandoVelho }), OBRIG, agora), 'em-voo');
});

test('GA50: mergeable CONFLICTING fica fora como conflito; decidir lista o motivo', () => {
  assert.equal(classificar(pr(9, { mergeStateStatus: 'CLEAN', mergeable: 'CONFLICTING' }), OBRIG), 'fora');
  assert.equal(motivoFora(pr(9, { mergeStateStatus: 'CLEAN', mergeable: 'CONFLICTING' })), 'conflito');
  assert.equal(motivoFora(pr(9, { isDraft: true })), 'draft');
  assert.equal(motivoFora(pr(9, { autoMergeRequest: null })), 'sem auto-merge');
  const d = decidir(
    [pr(9, { mergeStateStatus: 'DIRTY' }), pr(2)],
    OBRIG,
  );
  assert.equal(d.acao, 'atualizar');
  assert.deepEqual(d.fora, [{ number: 9, motivo: 'conflito' }]);
  // PR sem auto-merge fora nao entra no resumo (nao e "fila travada").
  const d2 = decidir([pr(9, { autoMergeRequest: null })], OBRIG);
  assert.deepEqual(d2.fora, []);
});

test('classificar: atualizada com a main e rodando (ou verde) ocupa a vez', () => {
  assert.equal(classificar(pr(1, { mergeStateStatus: 'BLOCKED', statusCheckRollup: OBRIG.map(rodando) }), OBRIG), 'em-voo');
  assert.equal(classificar(pr(1, { mergeStateStatus: 'CLEAN' }), OBRIG), 'em-voo');
  assert.equal(classificar(pr(1, { mergeStateStatus: 'UNKNOWN' }), OBRIG), 'em-voo');
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
  assert.equal(decidir(resolvidas, OBRIG).acao, 'esperar');
  assert.equal(decidir([resolvidas[0]], OBRIG).pr, 1);
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
