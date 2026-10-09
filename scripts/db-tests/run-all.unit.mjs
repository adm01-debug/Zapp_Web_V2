import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodificarResposta, resumirSuite, codigoDeSaida } from './rpc-envelope.mjs';

// R2-INF-010: o runner tratava o jsonb de mcp_exec como array (`rows.filter(...)`),
// entao com o envelope real morria em "rows.filter is not a function" e, quando a
// resposta era um array vazio, imprimia "0 PASS / 0 FAIL" e saia 0 — a suite passava
// com zero assertivas. Estes testes executam o run-all.mjs DE VERDADE (child process),
// com `fetch` stubbed (a fronteira de rede), contra um diretorio de .sql sintetico.
// A reproducao original e o probe offline 'db_tests_response_contract'
// (docs/reconciliation/reaudit/2026-10-03/reports/infra/probe.mjs:79-87).
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..');
const RUNNER = join(RAIZ, 'scripts/db-tests/run-all.mjs');

const SQL_FIXTURE = [
  '-- fixture sintetica do runner (nao vai a banco nenhum)',
  "SELECT 'PASS' AS result, 'FI-01: fixture' AS test, 'ok' AS detail;",
  '',
].join('\n');

/**
 * Roda o runner de verdade. `payload` e o corpo JSON que o RPC devolveria (ou uma
 * funcao `(sql) => payload` para respostas diferentes por arquivo). `arquivos` e o
 * diretorio sintetico de .sql; `logPedidos` grava as chamadas feitas ao RPC.
 */
function executarRunner({ payload, arquivos, logPedidos }) {
  const dir = mkdtempSync(join(tmpdir(), 'db-tests-runner-'));
  const entrada = arquivos ?? { '10-fixture.sql': SQL_FIXTURE };
  for (const [nome, sql] of Object.entries(entrada)) writeFileSync(join(dir, nome), sql);

  const corpoPayload = typeof payload === 'function'
    ? `const payload = (${payload.toString()})(JSON.parse(init.body ?? '{}').sql);`
    : `const payload = ${JSON.stringify(payload)};`;
  const stubFonte = [
    logPedidos ? "import { appendFileSync } from 'node:fs';" : '',
    'globalThis.fetch = async (url, init = {}) => {',
    logPedidos
      ? "  appendFileSync(process.env.STUB_LOG, JSON.stringify({ url: String(url), body: init.body ?? null }) + '\\n');"
      : '',
    `  ${corpoPayload}`,
    '  return { ok: true, json: async () => payload };',
    '};',
    '',
  ].join('\n');

  const res = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(stubFonte), RUNNER], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SUPABASE_URL: 'https://stub.invalid/',
      SUPABASE_SERVICE_KEY: 'stub-key',
      DB_TESTS_DIR: dir,
      ...(logPedidos ? { STUB_LOG: logPedidos } : {}),
    },
  });

  return { status: res.status, saida: `${res.stdout}${res.stderr}` };
}

const ENVELOPE_PASS = {
  rows: [{ result: 'PASS', test: 'FI-01: fixture', detail: 'ok' }],
  row_count: 1,
  truncated: false,
  ms: 3,
};

describe('run-all: contrato da resposta do mcp_exec (R2-INF-010)', () => {
  it('sai 0 e conta a assertiva quando o RPC devolve o envelope real', () => {
    const { status, saida } = executarRunner({ payload: ENVELOPE_PASS });
    assert.equal(status, 0, `o envelope de mcp_exec deveria ser decodificado:\n${saida}`);
    assert.match(saida, /RESULTADO: 1 PASS \/ 0 FAIL \/ 0 SKIP/);
    assert.match(saida, /✓ FI-01: fixture/);
  });

  it('fala com POST /rest/v1/rpc/mcp_exec mandando o SQL no corpo', () => {
    const log = join(mkdtempSync(join(tmpdir(), 'db-tests-pedidos-')), 'pedidos.jsonl');
    const { status, saida } = executarRunner({ payload: ENVELOPE_PASS, logPedidos: log });
    assert.equal(status, 0, saida);

    const pedido = JSON.parse(readFileSync(log, 'utf8').trim().split('\n')[0]);
    assert.ok(pedido.url.endsWith('/rest/v1/rpc/mcp_exec'), `endpoint errado: ${pedido.url}`);
    assert.ok(String(JSON.parse(pedido.body).sql).includes('FI-01: fixture'), 'SQL do arquivo nao foi enviado');
  });

  it('reprova resposta vazia: zero assertiva nao e aprovacao', () => {
    const { status, saida } = executarRunner({
      payload: { rows: [], row_count: 0, truncated: false, ms: 1 },
    });
    assert.equal(status, 1, `suite com zero assertivas deveria reprovar:\n${saida}`);
    assert.match(saida, /nenhuma assertiva executada/);
    assert.match(saida, /RESULTADO INVALIDO/);
  });

  it('reprova array no lugar do envelope (formato antigo do runner)', () => {
    const { status, saida } = executarRunner({ payload: [] });
    assert.equal(status, 1, `array vazio era tratado como 0 PASS / 0 FAIL e saida 0:\n${saida}`);
    assert.match(saida, /nao e o envelope de mcp_exec/);
  });

  it('reprova resposta truncada', () => {
    const { status, saida } = executarRunner({
      payload: { rows: ENVELOPE_PASS.rows, row_count: 7, truncated: true, ms: 1 },
    });
    assert.equal(status, 1, saida);
    assert.match(saida, /truncada/);
  });

  it('reprova envelope inconsistente (row_count != rows.length)', () => {
    const { status, saida } = executarRunner({
      payload: { rows: ENVELOPE_PASS.rows, row_count: 4, truncated: false, ms: 1 },
    });
    assert.equal(status, 1, saida);
    assert.match(saida, /row_count=4 != rows=1/);
  });

  it('reprova comando sem conjunto de resultado (ramo ok/rows_affected)', () => {
    const { status, saida } = executarRunner({ payload: { ok: true, rows_affected: 3, ms: 1 } });
    assert.equal(status, 1, saida);
    assert.match(saida, /sem conjunto de resultado/);
  });

  it('reprova linha sem PASS/FAIL e identifica a linha', () => {
    const { status, saida } = executarRunner({
      payload: { rows: [{ test: 'FI-02', detail: 'sem coluna result' }], row_count: 1, truncated: false, ms: 1 },
    });
    assert.equal(status, 1, saida);
    assert.match(saida, /FI-02.*sem resultado PASS\/FAIL\/SKIP/);
  });

  it('reprova quando so houve SKIP (nao provou nada)', () => {
    const { status, saida } = executarRunner({
      payload: { rows: [{ result: 'SKIP', test: 'FI-03', detail: 'sem dado' }], row_count: 1, truncated: false, ms: 1 },
    });
    assert.equal(status, 1, saida);
    assert.match(saida, /1 SKIP/);
    assert.match(saida, /nenhuma assertiva executada/);
  });

  it('reprova o arquivo que falha e mantem o resto da suite', () => {
    const { status, saida } = executarRunner({
      payload: (sql) => (sql.includes('FI-FAIL')
        ? { rows: [{ result: 'FAIL', test: 'FI-FAIL', detail: 'quebrou' }], row_count: 1, truncated: false, ms: 1 }
        : { rows: [{ result: 'PASS', test: 'FI-01: fixture', detail: 'ok' }], row_count: 1, truncated: false, ms: 1 }),
      arquivos: { '10-ok.sql': SQL_FIXTURE, '20-falho.sql': "-- FI-FAIL\nSELECT 1;\n" },
    });
    assert.equal(status, 1, saida);
    assert.match(saida, /✗ FI-FAIL: quebrou/);
    assert.match(saida, /RESULTADO: 1 PASS \/ 1 FAIL/);
  });
});

describe('rpc-envelope: decodificacao do envelope', () => {
  const casos = [
    ['array', [], /nao e o envelope/],
    ['null', null, /nao e o envelope/],
    ['string', '{"rows":[]}', /nao e o envelope/],
    ['numero', 0, /nao e o envelope/],
    ['sem rows', { ok: false, error: 'permission denied' }, /nao tem 'rows'/],
    ['linha nao-objeto', { rows: ['PASS'], row_count: 1 }, /nao e um objeto de assertiva/],
    ['linha sem id', { rows: [{ result: 'PASS' }], row_count: 1 }, /sem identificador/],
    ['id vazio', { rows: [{ test: '   ', result: 'PASS' }], row_count: 1 }, /sem identificador/],
    ['result desconhecido', { rows: [{ test: 'x', result: 'OK' }], row_count: 1 }, /sem resultado PASS\/FAIL\/SKIP/],
  ];

  for (const [nome, payload, esperado] of casos) {
    it(`recusa ${nome}`, () => {
      assert.throws(() => decodificarResposta(payload, 'fixture.sql'), esperado);
    });
  }

  it('aceita PASS/FAIL/SKIP em qualquer caixa e normaliza o detalhe', () => {
    const { assertivas } = decodificarResposta({
      rows: [
        { result: 'pass', test: ' A ' },
        { result: 'Fail', test: 'B', detail: 7 },
        { result: 'SKIP', test: 'C', detail: null },
      ],
      row_count: 3,
      truncated: false,
    });
    assert.deepEqual(assertivas, [
      { id: 'A', status: 'PASS', detail: '' },
      { id: 'B', status: 'FAIL', detail: '7' },
      { id: 'C', status: 'SKIP', detail: '' },
    ]);
  });

  it('nao confunde SKIP com prova no resumo da suite', () => {
    const resumo = resumirSuite([{ arquivo: 'a.sql', assertivas: [{ id: 'x', status: 'SKIP', detail: '' }] }]);
    assert.equal(resumo.total, 0);
    assert.equal(resumo.skip, 1);
    assert.equal(codigoDeSaida(resumo), 1);
    assert.match(resumo.erros[0].motivo, /nenhuma assertiva executada/);
  });

  it('erro de um arquivo reprova a suite mesmo com outro arquivo verde', () => {
    const resumo = resumirSuite([
      { arquivo: 'ok.sql', assertivas: [{ id: 'a', status: 'PASS', detail: '' }] },
      { arquivo: 'erro.sql', erro: 'resposta (erro.sql) nao e o envelope de mcp_exec' },
    ]);
    assert.equal(resumo.pass, 1);
    assert.equal(codigoDeSaida(resumo), 1);
  });
});
