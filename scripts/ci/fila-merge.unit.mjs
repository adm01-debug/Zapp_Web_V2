import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classificar, decidir, estadoDoCheck, checksObrigatorios, resolverDesconhecidos, confirmarCandidato, listaSaturada, LIMITE_PRS } from './fila-merge.mjs';

const OBRIG = ['🧪 Unit Tests', 'Contrato DB offline'];
const ok = (name) => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-15T10:00:00Z' });
const rodando = (name) => ({ __typename: 'CheckRun', name, status: 'IN_PROGRESS', conclusion: '', startedAt: '2026-10-15T10:05:00Z' });
const falhou = (name, startedAt = '2026-10-15T10:00:00Z') => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion: 'FAILURE', startedAt });
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
  // Resgate: as duas assertivas originais cravavam `length === 6` e o nome
  // '🧩 Node CI Scripts'. As duas envelheceram e contradiziam o titulo deste
  // teste: o perimetro mudou (hoje o baseline tem 3 — CI Gate, Build e
  // TypeCheck; os demais passaram a ser agregados pelo CI Gate) e numero/nome
  // cravados aqui transformam "fonte unica" em "duas fontes que precisam ser
  // mantidas em sincronia a mao". Agora comparamos contra o PROPRIO baseline,
  // entao o teste segue valido em qualquer mudanca de perimetro.
  const baseline = JSON.parse(
    readFileSync(new URL('./github-settings-baseline.json', import.meta.url), 'utf8'),
  );
  const lista = checksObrigatorios();
  assert.deepEqual(lista, baseline.branch_protection_main.required_status_checks);
  // Nao-vacuidade: baseline sem check obrigatorio deixaria a fila cega (toda PR
  // pareceria verde e a fila autorizaria qualquer uma).
  assert.ok(lista.length > 0);
});

test('estado do check: ausente e em andamento são pendentes; cancelado é encerrado, não falha', () => {
  assert.equal(estadoDoCheck([], '🧪 Unit Tests'), 'pendente');
  assert.equal(estadoDoCheck([rodando('🧪 Unit Tests')], '🧪 Unit Tests'), 'pendente');
  // CANCELLED/ACTION_REQUIRED/STALE terminaram sem sucesso e sem culpar o código, e
  // não voltam a rodar sozinhos: estado próprio, nem 'falhou' nem 'pendente'.
  assert.equal(estadoDoCheck([{ ...ok('🧪 Unit Tests'), conclusion: 'CANCELLED' }], '🧪 Unit Tests'), 'encerrado');
  assert.equal(estadoDoCheck([{ ...ok('🧪 Unit Tests'), conclusion: 'ACTION_REQUIRED' }], '🧪 Unit Tests'), 'encerrado');
  assert.equal(estadoDoCheck([{ ...ok('🧪 Unit Tests'), conclusion: 'STALE' }], '🧪 Unit Tests'), 'encerrado');
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

test('classificar: atualizada com check obrigatório cancelado SAI da fila; BEHIND continua nela', () => {
  const cancelado = { ...ok('Contrato DB offline'), conclusion: 'CANCELLED' };
  const rollup = [ok('🧪 Unit Tests'), cancelado];
  // Já atualizada: nada vai rodar de novo sozinho, então ocupar a vez travaria a fila.
  assert.equal(classificar(pr(1, { mergeStateStatus: 'BLOCKED', statusCheckRollup: rollup }), OBRIG), 'bloqueada');
  assert.equal(classificar(pr(1, { mergeStateStatus: 'CLEAN', statusCheckRollup: rollup }), OBRIG), 'bloqueada');
  // BEHIND: o update-branch gera head novo e os checks rodam outra vez — segue na fila.
  assert.equal(classificar(pr(1, { statusCheckRollup: rollup }), OBRIG), 'aguardando');
});

test('decidir: CI cancelada numa PR atualizada não segura a fila para sempre (Codex e Devin, #3231)', () => {
  const cancelados = OBRIG.map((n) => ({ ...ok(n), conclusion: 'CANCELLED' }));
  const prs = [pr(1, { mergeStateStatus: 'BLOCKED', statusCheckRollup: cancelados }), pr(2)];
  const d = decidir(prs, OBRIG);
  // Antes do fix este caso devolvia { acao: 'esperar', emVoo: [1] } em toda execução.
  assert.equal(d.acao, 'atualizar');
  assert.equal(d.pr, 2);
  assert.deepEqual(d.bloqueadas, [1]);
});

test('lista saturada é recusada: decidir com página cortada quebraria FIFO e serialização', () => {
  const cheia = Array.from({ length: LIMITE_PRS }, (_, i) => pr(i + 1));
  assert.equal(listaSaturada(cheia), true);
  assert.equal(listaSaturada(cheia.slice(0, LIMITE_PRS - 1)), false);
  assert.equal(listaSaturada([]), false);
  assert.ok(LIMITE_PRS > 100, 'o limite tem de caber a folga real do repo');
});
