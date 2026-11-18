// GA29: o health check consulta o endpoint documentado (GET .../endpoints/logs,
// ClickHouse sobre `logs`/`edge_logs`) e trata 4xx como erro real.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLogsSql, queryAnalytics, slugValido } from './health-check.mjs';

const BASE = { projectRef: 'tnnnlkbymytvtqngbbqh', token: 'token', sql: 'SELECT 1', inicio: '2026-10-20T00:00:00Z', fim: '2026-10-20T00:05:00Z' };

test('GA29: SQL usa a tabela unificada logs com source edge_logs (ClickHouse)', () => {
  const sql = buildLogsSql(['crm-integration']);
  assert.match(sql, /FROM logs WHERE source = 'edge_logs'/);
  assert.match(sql, /log_attributes\['response\.status_code'\]/);
  assert.match(sql, /\/functions\/v1\/crm-integration/);
  assert.match(buildLogsSql([]), /source = 'edge_logs'$/);
});

test('GA29: slug fora do padrao nao entra na SQL (sem injecao)', () => {
  assert.equal(slugValido('crm-integration'), true);
  assert.equal(slugValido("x') OR ('1'='1"), false);
  assert.match(buildLogsSql(["x') OR ('1'='1"]), /source = 'edge_logs'$/);
});

test('GA29: consulta e GET no endpoint documentado, com janela iso', async () => {
  let vista = null;
  const fetchImpl = async (url, opcoes) => {
    vista = { url, opcoes };
    return { ok: true, status: 200, json: async () => ({ result: [{ total: 10, errors: 1 }] }) };
  };
  const row = await queryAnalytics({ ...BASE, fetchImpl });
  assert.deepEqual(row, { total: 10, errors: 1 });
  assert.equal(vista.opcoes.method, 'GET', 'metodo documentado: GET, nao POST');
  assert.match(vista.url, /\/analytics\/endpoints\/logs\?/, 'endpoint documentado, sem logs.all');
  assert.match(vista.url, /iso_timestamp_start=/);
  assert.match(vista.url, /iso_timestamp_end=/);
  assert.equal(vista.opcoes.headers.Authorization, 'Bearer token');
});

test('GA29: 4xx vira erro (exit 1 no main); 5xx e transporte viram aviso', async () => {
  const erro404 = await queryAnalytics({
    ...BASE, fetchImpl: async () => ({ ok: false, status: 404 }),
  }).catch((e) => e);
  assert.equal(erro404.severidade, 'erro', '404 = defeito real');
  const erro403 = await queryAnalytics({
    ...BASE, fetchImpl: async () => ({ ok: false, status: 403 }),
  }).catch((e) => e);
  assert.equal(erro403.severidade, 'erro');
  const aviso500 = await queryAnalytics({
    ...BASE, fetchImpl: async () => ({ ok: false, status: 500 }),
  }).catch((e) => e);
  assert.equal(aviso500.severidade, 'aviso', '5xx = observabilidade indisponivel');
  const avisoRede = await queryAnalytics({
    ...BASE, fetchImpl: async () => { throw new Error('boom'); },
  }).catch((e) => e);
  assert.equal(avisoRede.severidade, 'aviso');
});
