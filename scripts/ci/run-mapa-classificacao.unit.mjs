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
  const r = rodarSuite({ comando: process.execPath, argumentos: ['-e', "process.stderr.write('falha de inicialização'); process.exit(1)"] });
  assert.equal(r.estado, ESTADOS.infra);
  assert.notEqual(r.estado, ESTADOS.morto);
  assert.match(r.diagnostico, /falha de inicialização/);
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

test('resumo do Vitest com cores do GitHub Actions é reconhecido', () => {
  const r = interpretarRodada({
    status: 0,
    signal: null,
    stdout: '\u001b[2m      Tests \u001b[22m \u001b[1m\u001b[32m99 passed\u001b[39m\u001b[22m (99)\n',
    stderr: '',
  });
  assert.equal(r.estado, ESTADOS.sobrevivente);
  assert.match(r.resumo, /Tests\s+99 passed/);
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

const RESUMOS_SEM_MEDICAO = [
  'no tests', '0 passed (0)', '0 failed | 0 passed (0)',
  '42 skipped (42)', '42 todo (42)', '21 skipped | 21 todo (42)',
  '0 passed | 42 skipped (42)', '0 failed | 42 todo (42)',
  '', 'nonsense', 'passed (1)', '-1 passed (1)', '-1 failed (1)',
  '1.5 passed (1)', '1.5 failed (1)', '1e3 passed (1000)', '+1 passed (1)',
  '1,000 passed (1000)', '1_000 passed (1000)', 'NaN passed (1)',
  'Infinity passed (1)', '9007199254740992 passed (9007199254740992)',
  '1 passedXYZ (1)', 'garbage 1 passed (1)', '1 passed (1) garbage',
  '1 passed (0)', '1 passed (2)', '1 passed | 1 passed (2)',
];

for (const resumo of RESUMOS_SEM_MEDICAO) {
  for (const colorido of [false, true]) {
    test(`resumo sem prova reprova baseline e equivalente: ${JSON.stringify(resumo)}${colorido ? ' ANSI/CRLF' : ''}`, () => {
      const texto = `      Tests  ${resumo}\n`;
      const stdout = colorido ? `\u001b[2m${texto.replaceAll('\n', '\r\n')}\u001b[22m` : texto;
      const rodada = interpretarRodada({ status: 0, signal: null, stdout, stderr: '' });
      assert.ok([ESTADOS.infra, ESTADOS.inconclusivo].includes(rodada.estado));
      assert.equal(veredito({ baseline: rodada, resultados: [MUTANTE_MORTO] }).codigo, 2);
      assert.equal(veredito({ baseline: BASELINE_VERDE, resultados: [
        MUTANTE_MORTO, { id: 'F3-abort', ...rodada },
      ] }).codigo, 2);
    });
  }
}

for (const resumo of [
  '1 expected fail (1)', '1 passed | 1 expected fail | 2 skipped | 3 todo (7)',
  '1 passed | 42 skipped (43)', '1 passed | 42 todo (43)',
  '0 failed | 1 passed (1)',
]) {
  test(`execução real continua conclusiva: ${resumo}`, () => {
    const rodada = interpretarRodada({ status: 0, signal: null,
      stdout: `\u001b[2m      Tests  ${resumo}\u001b[22m\r\n`, stderr: '' });
    assert.equal(rodada.estado, ESTADOS.sobrevivente);
  });
}

test('falha nomeada com skip/todo mantém a detecção do mutante', () => {
  const rodada = interpretarRodada({ status: 1, signal: null,
    stdout: '   × mapa > asserção rastreável\n      Tests  1 failed | 2 skipped | 3 todo (6)\n', stderr: '' });
  assert.equal(rodada.estado, ESTADOS.morto);
});

test('resumo e saída contraditórios não concluem medição', () => {
  for (const resumo of ['1 failed (1)', '1 passed (1)']) {
    const rodada = interpretarRodada({ status: 0, signal: null,
      stdout: `   × mapa > asserção vermelha\n      Tests  ${resumo}\n`, stderr: '' });
    assert.equal(rodada.estado, ESTADOS.inconclusivo);
  }
});

test('linha vazia de resumo não consome contagem na linha seguinte', () => {
  const rodada = interpretarRodada({ status: 0, signal: null,
    stdout: '      Tests  \n42 passed (42)\n', stderr: '' });
  assert.notEqual(rodada.estado, ESTADOS.sobrevivente);
});

test('spawn real sem execução não aprova equivalente documentado', () => {
  const rodada = rodarSuite({ comando: process.execPath,
    argumentos: ['-e', "process.stdout.write('      Tests  42 skipped (42)\\n')"] });
  assert.equal(rodada.estado, ESTADOS.inconclusivo);
  assert.equal(veredito({ baseline: BASELINE_VERDE,
    resultados: [{ id: 'F3-abort', ...rodada }] }).codigo, 2);
});
