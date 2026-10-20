// R2-INF-019 (#366): o runner de mutação contava FALHA DE INFRAESTRUTURA como
// mutante morto (`killed = status !== 0`). Um binário que não inicia, uma
// configuração quebrada ou um "No test files found" davam MORTO sem executar um
// único teste — dava para "provar" qualidade sem medir nada.
//
// Estes testes provam a classificação nova e a política de saída:
//   - infraestrutura (binário/sinal/configuração) NUNCA é mutante morto;
//   - detecção só com pelo menos um teste NOMEADO vermelho (asserção rastreável);
//   - baseline verde é obrigatório: sem ele nada é medido;
//   - o código de saída reflete a conclusão (0 medido e limpo, 1 sobrevivente
//     não declarado, 2 medição inválida).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EQUIVALENTES_DECLARADOS,
  ESTADOS,
  interpretarRodada,
  rodarSuite,
  veredito,
} from '../mutation/run-mapa.mjs';

/** Saída mínima de uma rodada VERDE do vitest (formato do reporter default). */
const SAIDA_VERDE = [
  ' Test Files  4 passed (4)',
  '      Tests  42 passed (42)',
  '   Duration  4.31s',
].join('\n');

/** Saída de uma rodada VERMELHA: resumo + o teste nomeado que pegou a mutação. */
const SAIDA_VERMELHA = [
  ' ❯ src/components/inbox/location-picker/__tests__/useAddressAutocomplete.test.tsx (3 tests | 1 failed)',
  '   × useAddressAutocomplete > desce para /forward quando o /suggest falha',
  '     → expected 200 to be 500',
  ' Test Files  1 failed | 3 passed (4)',
  '      Tests  1 failed | 41 passed (42)',
].join('\n');

const BASELINE_VERDE = { id: 'BASELINE', estado: ESTADOS.sobrevivente };
const MUTANTE_MORTO = { id: 'E21-M1', estado: ESTADOS.morto };

test('INF-019.1 binário que não inicia (ENOENT) é INFRA, nunca mutante morto', () => {
  const r = interpretarRodada({
    status: null,
    signal: null,
    error: Object.assign(new Error('spawn vitest ENOENT'), { code: 'ENOENT' }),
    stdout: '',
    stderr: '',
  });
  assert.equal(r.estado, ESTADOS.infra);
  assert.notEqual(r.estado, ESTADOS.morto);
});

test('INF-019.2 processo morto por sinal (OOM/kill) é INFRA, mesmo com resumo de falha', () => {
  const r = interpretarRodada({
    status: null,
    signal: 'SIGKILL',
    stdout: ' Test Files  1 failed (1)\n      Tests  1 failed (42)',
    stderr: '',
  });
  assert.equal(r.estado, ESTADOS.infra);
  assert.match(r.motivo, /sinal/i);
});

test('INF-019.3 suíte que sai 1 sem imprimir nenhum teste é INFRA (configuração/coleta)', () => {
  const r = interpretarRodada({
    status: 1,
    signal: null,
    stdout: '',
    stderr: 'Error: No test files found, exiting with code 1',
  });
  assert.equal(r.estado, ESTADOS.infra);
  assert.notEqual(r.estado, ESTADOS.morto);
});

test('INF-019.4 resumo verde + erro de infraestrutura (saída 1) é INCONCLUSIVO, não morto', () => {
  const r = interpretarRodada({
    status: 1,
    signal: null,
    stdout: SAIDA_VERDE,
    stderr: 'Error: Unhandled error. (out of memory)',
  });
  assert.equal(r.estado, ESTADOS.inconclusivo);
  assert.notEqual(r.estado, ESTADOS.morto);
});

test('INF-019.5 contagem de falha sem teste nomeado é INCONCLUSIVO (sem asserção rastreável)', () => {
  const r = interpretarRodada({
    status: 1,
    signal: null,
    stdout: ' Test Files  1 failed (4)\n      Tests  1 failed | 41 passed (42)',
    stderr: '',
  });
  assert.equal(r.estado, ESTADOS.inconclusivo);
  assert.notEqual(r.estado, ESTADOS.morto);
});

test('INF-019.6 teste nomeado vermelho com contagem de falha é MORTO (asserção rastreável)', () => {
  const r = interpretarRodada({ status: 1, signal: null, stdout: SAIDA_VERMELHA, stderr: '' });
  assert.equal(r.estado, ESTADOS.morto);
  assert.equal(r.falhas.length, 1);
  assert.match(r.falhas[0], /desce para \/forward/);
  assert.match(r.resumo, /1 failed/);
});

test('INF-019.7 rodada verde (saída 0, nada vermelho) é SOBREVIVENTE', () => {
  const r = interpretarRodada({ status: 0, signal: null, stdout: SAIDA_VERDE, stderr: '' });
  assert.equal(r.estado, ESTADOS.sobrevivente);
});

test('INF-019.8 spawn real: processo que sai 1 sem rodar teste não vira mutante morto', () => {
  const r = rodarSuite({ comando: process.execPath, argumentos: ['-e', 'process.exit(1)'] });
  assert.equal(r.estado, ESTADOS.infra);
  assert.notEqual(r.estado, ESTADOS.morto);
});

test('INF-019.9 spawn real: binário inexistente não vira mutante morto', () => {
  const r = rodarSuite({ comando: '/caminho/que/nao/existe/vitest-do-366' });
  assert.equal(r.estado, ESTADOS.infra);
  assert.notEqual(r.estado, ESTADOS.morto);
});

test('INF-019.10 spawn real: suíte verde é lida como SOBREVIVENTE (não como infra)', () => {
  const r = rodarSuite({
    comando: process.execPath,
    argumentos: [
      '-e',
      "process.stdout.write(' Test Files  4 passed (4)\\n      Tests  42 passed (42)\\n')",
    ],
  });
  assert.equal(r.estado, ESTADOS.sobrevivente);
});

test('INF-019.11 baseline não verde invalida a medição (código 2)', () => {
  const v = veredito({
    baseline: { estado: ESTADOS.infra, motivo: 'vitest não iniciou' },
    resultados: [MUTANTE_MORTO],
  });
  assert.equal(v.codigo, 2);
  assert.equal(veredito({ baseline: { estado: ESTADOS.morto }, resultados: [MUTANTE_MORTO] }).codigo, 2);
  assert.equal(veredito({ baseline: null, resultados: [MUTANTE_MORTO] }).codigo, 2);
});

test('INF-019.12 rodada INFRA/INCONCLUSIVA invalida a medição (código 2), nunca aprova', () => {
  for (const estado of [ESTADOS.infra, ESTADOS.inconclusivo]) {
    const v = veredito({
      baseline: BASELINE_VERDE,
      resultados: [MUTANTE_MORTO, { id: 'F3-empty', estado }],
    });
    assert.equal(v.codigo, 2);
    assert.match(v.motivo, /F3-empty/);
  }
});

test('INF-019.13 sobrevivente NÃO declarado reprova a rodada (código 1)', () => {
  const v = veredito({
    baseline: BASELINE_VERDE,
    resultados: [MUTANTE_MORTO, { id: 'F3-empty', estado: ESTADOS.sobrevivente }],
  });
  assert.equal(v.codigo, 1);
  assert.deepEqual(v.sobreviventesInesperados, ['F3-empty']);
});

test('INF-019.14 equivalente declarado não reprova, mas continua reportado', () => {
  assert.ok(EQUIVALENTES_DECLARADOS.has('F3-abort'));
  const v = veredito({
    baseline: BASELINE_VERDE,
    resultados: [MUTANTE_MORTO, { id: 'F3-abort', estado: ESTADOS.sobrevivente }],
  });
  assert.equal(v.codigo, 0);
  assert.deepEqual(v.sobreviventesEsperados, ['F3-abort']);
});

test('INF-019.15 controle com `esperado: sobrevivente` não reprova a rodada', () => {
  const v = veredito({
    baseline: BASELINE_VERDE,
    resultados: [
      MUTANTE_MORTO,
      { id: 'CTRL', estado: ESTADOS.sobrevivente, esperado: ESTADOS.sobrevivente },
    ],
  });
  assert.equal(v.codigo, 0);
  assert.deepEqual(v.sobreviventesEsperados, ['CTRL']);
  assert.deepEqual(v.sobreviventesInesperados, []);
});

test('INF-019.16 baseline verde + todos mortos é o único caminho para o código 0', () => {
  const v = veredito({
    baseline: BASELINE_VERDE,
    resultados: [MUTANTE_MORTO, { id: 'E21-M3', estado: ESTADOS.morto }],
  });
  assert.equal(v.codigo, 0);
  assert.deepEqual(v.sobreviventesEsperados, []);
  assert.deepEqual(v.sobreviventesInesperados, []);
});

test('INF-019.17 controle que NÃO sobrevive não inventa sobrevivente nem reprova por isso', () => {
  const v = veredito({
    baseline: BASELINE_VERDE,
    resultados: [
      { id: 'CTRL', estado: ESTADOS.morto, esperado: ESTADOS.sobrevivente },
      MUTANTE_MORTO,
    ],
  });
  assert.equal(v.codigo, 0);
  assert.deepEqual(v.sobreviventesEsperados, []);
  assert.deepEqual(v.sobreviventesInesperados, []);
});
