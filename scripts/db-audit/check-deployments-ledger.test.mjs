import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { versoesSemDeployment } from './check-deployments-ledger.mjs';

const SCRIPT = new URL('./check-deployments-ledger.mjs', import.meta.url);
const ENV = 'producao-ddl';
const SINCE = '20261016000000';

function rodarCli(ledger, deployments) {
  const root = mkdtempSync(join(tmpdir(), 'zapp-ga25-'));
  try {
    const led = join(root, 'ledger.json');
    const dep = join(root, 'deployments.json');
    writeFileSync(led, JSON.stringify(ledger));
    writeFileSync(dep, JSON.stringify(deployments));
    return spawnSync(
      process.execPath,
      [SCRIPT.pathname, '--ledger', led, '--deployments', dep, '--since', SINCE, '--environment', ENV],
      { encoding: 'utf8' },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const deployment = (versions, environment = ENV) => ({ environment, payload: { versions } });

test('GA25: version com Deployment passa', () => {
  const r = rodarCli(['20261020090000'], [deployment(['20261020090000'])]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /OK/);
});

test('GA25: version sem Deployment (DDL por fora) e acusada', () => {
  const r = rodarCli(['20261020090000', '20261020100000'], [deployment(['20261020090000'])]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /20261020100000/);
  assert.match(r.stderr, /DDL FORA DO FLUXO/);
});

test('GA25: version anterior ao corte (caso 20261015200000) nao e acusada', () => {
  const r = rodarCli(['20261015200000'], []);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('GA25: Deployment de outro environment nao conta', () => {
  const r = rodarCli(['20261020090000'], [deployment(['20261020090000'], 'preview')]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
});

test('GA25: entrada invalida e fail-closed (exit 2)', () => {
  const root = mkdtempSync(join(tmpdir(), 'zapp-ga25-bad-'));
  try {
    const led = join(root, 'ledger.json');
    writeFileSync(led, '{ invalido');
    const r = spawnSync(
      process.execPath,
      [SCRIPT.pathname, '--ledger', led, '--deployments', led, '--since', SINCE],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unidade: versoesSemDeployment filtra corte e environment', () => {
  const faltando = versoesSemDeployment({
    ledger: ['20261015000000', '20261017000000', '20261018000000'],
    deployments: [deployment(['20261017000000'])],
    since: SINCE,
    environment: ENV,
  });
  assert.deepEqual(faltando, ['20261018000000']);
});
