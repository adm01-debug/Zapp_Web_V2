import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CANONICAL_PROJECT,
  MAX_LOG_WINDOW_MS,
  TransientAnalyticsError,
  buildLogsSql,
  parseArgs,
  queryAnalytics,
  resolveScope,
  runHealthCheck,
  semQuebra,
} from './health-check.mjs';

const manifest = JSON.stringify({
  functions: [
    { name: 'auth-login' },
    { name: 'message-delivery' },
  ],
});

const baseArgs = {
  projectRef: CANONICAL_PROJECT,
  manifestPath: '/virtual/manifest.json',
  scope: 'auth-login',
  threshold: 0.1,
  waitMs: 0,
  dryRun: false,
};

const readFileImpl = async () => manifest;
const silentLogger = { log() {}, error() {} };
const response = (status, payload) => ({
  status,
  ok: status >= 200 && status < 300,
  async json() {
    if (payload instanceof Error) throw payload;
    return payload;
  },
});

test('parseArgs valida projeto, manifesto, threshold, espera e slug', () => {
  assert.deepEqual(
    parseArgs([
      '--project-ref', CANONICAL_PROJECT,
      '--manifest', 'manifest.json',
      '--scope', 'auth-login',
      '--threshold', '0.25',
      '--wait-ms', '1000',
    ]),
    {
      projectRef: CANONICAL_PROJECT,
      manifestPath: 'manifest.json',
      scope: 'auth-login',
      threshold: 0.25,
      waitMs: 1000,
      dryRun: false,
    },
  );

  for (const argv of [
    ['--project-ref', CANONICAL_PROJECT, '--manifest', 'x', '--threshold', 'NaN'],
    ['--project-ref', CANONICAL_PROJECT, '--manifest', 'x', '--threshold', '1.01'],
    ['--project-ref', CANONICAL_PROJECT, '--manifest', 'x', '--wait-ms', '-1'],
    ['--project-ref', CANONICAL_PROJECT, '--manifest', 'x', '--wait-ms', '999999999'],
    ['--project-ref', CANONICAL_PROJECT, '--manifest', 'x', '--scope', "x' OR 1=1 --"],
    ['--project-ref', CANONICAL_PROJECT, '--manifest', 'x', '--scope', '../auth-login'],
  ]) {
    assert.throws(() => parseArgs(argv));
  }
  assert.throws(() => parseArgs(['--project-ref', CANONICAL_PROJECT]), /manifest/i);
});

test('resolveScope exige slug conhecido e manifesto íntegro', async () => {
  assert.deepEqual(await resolveScope('all', 'unused', readFileImpl), ['auth-login', 'message-delivery']);
  assert.deepEqual(await resolveScope('auth-login', 'unused', readFileImpl), ['auth-login']);
  await assert.rejects(
    resolveScope('unknown-function', 'unused', readFileImpl),
    /fora do manifesto/,
  );
  await assert.rejects(
    resolveScope('all', 'unused', async () => '{'),
    /JSON válido/,
  );
});

test('buildLogsSql usa ClickHouse, fonte correta e pathname fechado', () => {
  const sql = buildLogsSql(['auth-login', 'message-delivery']);
  assert.match(sql, /count\(\) AS total/);
  assert.match(sql, /countIf\(toInt32OrZero\(log_attributes\['response\.status_code'\]\) BETWEEN 500 AND 599\)/);
  assert.match(sql, /FROM logs/);
  assert.match(sql, /source = 'function_edge_logs'/);
  assert.match(sql, /log_attributes\['request\.pathname'\] = '\/functions\/v1\/auth-login'/);
  assert.match(sql, /startsWith\(log_attributes\['request\.pathname'\], '\/functions\/v1\/message-delivery\/'\)/);
  assert.doesNotMatch(sql, /logs\.all|FROM edge_logs|source = 'edge_logs'|UNNEST|COUNT\(1\)|statusCode/);
  assert.throws(() => buildLogsSql(["auth-login' OR 1=1 --"]), /slug/i);
  assert.throws(() => buildLogsSql([]), /vazio/);
});

test('queryAnalytics usa GET com searchParams, SQL e janela ISO sem expor token na URL', async () => {
  const calls = [];
  const start = new Date('2026-11-07T12:00:00.000Z');
  const end = new Date('2026-11-07T12:05:00.000Z');
  const result = await queryAnalytics({
    projectRef: CANONICAL_PROJECT,
    token: 'management-token-secret',
    sql: 'SELECT count() AS total, 0 AS errors FROM logs',
    start,
    end,
    timeoutSignal: () => 'signal',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response(200, { result: [{ total: '12', errors: '2' }] });
    },
  });

  assert.deepEqual(result, { total: 12, errors: 2 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.signal, 'signal');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer management-token-secret');
  assert.equal(calls[0].url.pathname, `/v1/projects/${CANONICAL_PROJECT}/analytics/endpoints/logs`);
  assert.match(calls[0].url.searchParams.get('sql'), /FROM logs/);
  assert.equal(calls[0].url.searchParams.get('iso_timestamp_start'), start.toISOString());
  assert.equal(calls[0].url.searchParams.get('iso_timestamp_end'), end.toISOString());
  assert.doesNotMatch(calls[0].url.href, /management-token-secret/);
  assert.equal(calls[0].init.body, undefined);
});

test('buildLogsSql usa prefixo /functions/v1/ para escopos com mais de 20 funções', () => {
  const manySlugs = Array.from({ length: 21 }, (_, i) => `fn-${String(i + 1).padStart(2, '0')}`);
  const sql = buildLogsSql(manySlugs);
  assert.match(sql, /count\(\) AS total/);
  assert.match(sql, /FROM logs/);
  assert.match(sql, /source = 'function_edge_logs'/);
  assert.match(sql, /startsWith\(log_attributes\['request\.pathname'\], '\/functions\/v1\/'\)/);
  assert.doesNotMatch(sql, /fn-01/);
});

test('queryAnalytics limita a janela a 24h e valida o contrato agregado', async () => {
  const fetchImpl = async () => response(200, { result: [] });
  const start = new Date('2026-11-01T00:00:00.000Z');
  const end = new Date(start.getTime() + MAX_LOG_WINDOW_MS);
  assert.equal(await queryAnalytics({
    projectRef: CANONICAL_PROJECT,
    token: 'token-ok',
    sql: 'SELECT count() FROM logs',
    start,
    end,
    fetchImpl,
  }), null);

  await assert.rejects(queryAnalytics({
    projectRef: CANONICAL_PROJECT,
    token: 'token-ok',
    sql: 'SELECT count() FROM logs',
    start,
    end: new Date(end.getTime() + 1),
    fetchImpl,
  }), /24 horas/);

  for (const payload of [
    {},
    { result: [{ total: -1, errors: 0 }] },
    { result: [{ total: 1, errors: 2 }] },
    { result: [{ total: '1x', errors: 0 }] },
    { result: [{ total: 1, errors: 0 }, { total: 2, errors: 0 }] },
  ]) {
    await assert.rejects(queryAnalytics({
      projectRef: CANONICAL_PROJECT,
      token: 'token-ok',
      sql: 'SELECT count() FROM logs',
      start,
      end,
      fetchImpl: async () => response(200, payload),
    }));
  }
});

const countCases = [
  ['zero', 0, true], ['inteiro', 1, true], ['limite seguro', Number.MAX_SAFE_INTEGER, true],
  ['zero textual', '0', true], ['inteiro textual', '1', true],
  ['limite seguro textual', String(Number.MAX_SAFE_INTEGER), true],
  ['null', null, false], ['false', false, false], ['true', true, false],
  ['array vazio', [], false], ['array zero', [0], false], ['array um', [1], false],
  ['objeto', {}, false], ['objeto conversível', { valueOf() { throw new Error('coerção não permitida'); } }, false],
  ['ausente', undefined, false], ['bigint', 0n, false], ['NaN', NaN, false], ['infinito', Infinity, false],
  ['negativo', -1, false], ['fração', 0.5, false], ['vazio textual', '', false],
  ['espaço textual', ' 1', false], ['zero inicial', '01', false], ['exponencial', '1e2', false],
  ['negativo textual', '-1', false], ['hexadecimal', '0x1', false], ['decimal textual', '1.0', false],
  ['inteiro impreciso', Number.MAX_SAFE_INTEGER + 1, false],
  ['inteiro textual impreciso', String(Number.MAX_SAFE_INTEGER + 1), false], ['symbol', Symbol('count'), false],
];

for (const field of ['total', 'errors']) {
  for (const [label, value, valid] of countCases) {
    test(`queryAnalytics ${valid ? 'aceita' : 'recusa'} ${field}: ${label}`, async () => {
      const query = queryAnalytics({
        projectRef: CANONICAL_PROJECT, token: 'token-local', sql: 'SELECT count() FROM logs',
        start: new Date('2026-11-07T12:00:00Z'), end: new Date('2026-11-07T12:05:00Z'),
        fetchImpl: async () => response(200, { result: [{ total: Number.MAX_SAFE_INTEGER, errors: 0, [field]: value }] }),
      });
      if (valid) assert.equal((await query)[field], Number(value));
      else await assert.rejects(query, new RegExp(`${field} inválido`));
    });
  }
}

for (const value of [null, false, true, [], [0], [1]]) {
  test(`runHealthCheck não aprova contagens inválidas do tipo ${JSON.stringify(value)}`, async () => {
    await assert.rejects(runHealthCheck(baseArgs, {
      env: { SUPABASE_ACCESS_TOKEN: 'token-local' }, readFileImpl, logger: silentLogger,
      fetchImpl: async () => response(200, { result: [{ total: value, errors: 0 }] }),
    }), /total inválido/);
  });
}

test('runHealthCheck conserva no-traffic para contagem zero legítima', async () => {
  const result = await runHealthCheck(baseArgs, {
    env: { SUPABASE_ACCESS_TOKEN: 'token-local' }, readFileImpl, logger: silentLogger,
    fetchImpl: async () => response(200, { result: [{ total: '0', errors: 0 }] }),
  });
  assert.deepEqual(result, { status: 'no-traffic', total: 0, errors: 0 });
});

test('queryAnalytics falha fechado em 4xx e contrato; 5xx e transporte são transitórios', async () => {
  const common = {
    projectRef: CANONICAL_PROJECT,
    token: 'token-ok',
    sql: 'SELECT count() FROM logs',
    start: new Date('2026-11-07T12:00:00.000Z'),
    end: new Date('2026-11-07T12:05:00.000Z'),
  };
  await assert.rejects(
    queryAnalytics({ ...common, fetchImpl: async () => response(401, {}) }),
    /recusou.*401/,
  );
  await assert.rejects(
    queryAnalytics({ ...common, fetchImpl: async () => response(429, {}) }),
    /recusou.*429/,
  );
  await assert.rejects(
    queryAnalytics({ ...common, fetchImpl: async () => response(200, new Error('json')) }),
    /JSON inválido/,
  );
  await assert.rejects(
    queryAnalytics({ ...common, fetchImpl: async () => response(503, {}) }),
    (error) => error instanceof TransientAnalyticsError,
  );
  await assert.rejects(
    queryAnalytics({ ...common, fetchImpl: async () => { throw new Error('network secret'); } }),
    (error) => error instanceof TransientAnalyticsError && !error.message.includes('secret'),
  );
});

test('runHealthCheck só degrada falhas transitórias e exige token', async () => {
  await assert.rejects(
    runHealthCheck(baseArgs, { env: {}, readFileImpl, logger: silentLogger }),
    /TOKEN ausente/,
  );

  const transient = await runHealthCheck(baseArgs, {
    env: { SUPABASE_ACCESS_TOKEN: 'token-ok' },
    readFileImpl,
    logger: silentLogger,
    now: () => Date.parse('2026-11-07T12:05:00.000Z'),
    fetchImpl: async () => response(503, {}),
  });
  assert.equal(transient.status, 'warning');

  await assert.rejects(
    runHealthCheck(baseArgs, {
      env: { SUPABASE_ACCESS_TOKEN: 'token-ok' },
      readFileImpl,
      logger: silentLogger,
      now: () => Date.parse('2026-11-07T12:05:00.000Z'),
      fetchImpl: async () => response(403, {}),
    }),
    /recusou.*403/,
  );
});

test('runHealthCheck dry-run não exige SUPABASE_ACCESS_TOKEN', async () => {
  const dryArgs = { ...baseArgs, dryRun: true, waitMs: 0 };
  const outcome = await runHealthCheck(dryArgs, { env: {}, readFileImpl, logger: silentLogger });
  assert.equal(outcome.status, 'dry-run');
});

// S5145: um nome de função com quebra de linha no manifesto não pode forjar
// uma anotação `::error::`/`::warning::` nova no log do Actions quando o erro
// sobe cru pelo catch de topo do CLI. Executa o script de verdade (child
// process) — mesmo padrão de scripts/edge-deploy/register-deployment.mjs e
// scripts/ci/github-settings-guard.mjs.
test('semQuebra neutraliza quebra de linha e caracteres de controle', () => {
  assert.equal(semQuebra('foo\nbar'), 'foo bar');
  assert.equal(semQuebra('foo\r\nbar'), 'foo  bar');
  assert.equal(semQuebra('foo\u0000bar'), 'foo bar');
  assert.equal(semQuebra(null), '');
  assert.equal(semQuebra(undefined), '');
  assert.equal(semQuebra(42), '42');
});

test('CLI real: slug com quebra de linha no manifesto não forja anotação nova no log', () => {
  const dir = mkdtempSync(join(tmpdir(), 'health-check-manifest-'));
  try {
    const manifestPath = join(dir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({
      functions: [{ name: 'auth-login\n::error::forjado' }],
    }));
    const r = spawnSync(process.execPath, [
      'scripts/edge-deploy/health-check.mjs',
      '--project-ref', CANONICAL_PROJECT,
      '--manifest', manifestPath,
      '--dry-run',
    ], { encoding: 'utf8' });

    assert.notEqual(r.status, 0);
    const linhas = `${r.stdout}${r.stderr}`.split('\n');
    const linhaErro = linhas.find((l) => l.includes('health-check.mjs falhou:'));
    assert.ok(linhaErro, `linha de erro ausente na saída:\n${r.stdout}${r.stderr}`);
    assert.ok(
      linhaErro.includes('auth-login ::error::forjado'),
      `valor não-confiável vazou cru numa linha nova: ${JSON.stringify(linhaErro)}`,
    );
    assert.ok(
      !linhas.some((l) => l.trim() === '::error::forjado'),
      `linha de anotação forjada apareceu sozinha:\n${r.stdout}${r.stderr}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runHealthCheck aplica limiar e não espera quando waitMs é zero', async () => {
  let slept = false;
  const outcome = await runHealthCheck(baseArgs, {
    env: { SUPABASE_ACCESS_TOKEN: 'token-ok' },
    readFileImpl,
    logger: silentLogger,
    sleep: async () => { slept = true; },
    now: () => Date.parse('2026-11-07T12:05:00.000Z'),
    fetchImpl: async () => response(200, { result: [{ total: 10, errors: 2 }] }),
  });
  assert.equal(slept, false);
  assert.deepEqual(outcome, { status: 'failed', total: 10, errors: 2, errorRate: 0.2 });
});
