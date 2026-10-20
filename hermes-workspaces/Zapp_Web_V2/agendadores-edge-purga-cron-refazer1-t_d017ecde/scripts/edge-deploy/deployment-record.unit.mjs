import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { construirDeployment, construirStatus, resumirDeployment, AMBIENTE_PADRAO } from './deployment-record.mjs';

const sha40 = (c) => c.repeat(40);

test('E60: o Deployment prende o sha DEPLOYADO, nao a branch', () => {
  const d = construirDeployment({ shaDeployado: sha40('a'), runId: '123', runUrl: 'https://x/runs/123', escopo: 'all' });
  assert.equal(d.ref, sha40('a'), 'ref tem de ser o sha deployado (em rollback e um ancestral, nao a main)');
  assert.notEqual(d.ref, 'main');
  assert.equal(d.environment, AMBIENTE_PADRAO);
  assert.equal(d.payload.run_id, '123');
  assert.equal(d.payload.run_url, 'https://x/runs/123');
  assert.equal(d.payload.escopo, 'all');
});

test('E60: `required_contexts: []` — sem isso o GitHub recusa o deployment de um ancestral antigo', () => {
  const d = construirDeployment({ shaDeployado: sha40('b'), runId: '1' });
  assert.deepEqual(d.required_contexts, []);
  assert.equal(d.auto_merge, false);
  assert.equal(d.transient_environment, false);
  assert.equal(d.production_environment, true);
});

test('E60: sha invalido e recusado (nao inventa ref)', () => {
  for (const ruim of ['main', 'abc123', '', null, undefined, sha40('Z')]) {
    assert.throws(() => construirDeployment({ shaDeployado: ruim, runId: '1' }), /sha de 40 hex/);
  }
});

test('E60: o status aponta para o deployment e nao cria um novo', () => {
  const s = construirStatus({ id: 42, runUrl: 'https://x/runs/9' });
  assert.equal(s.deployment_id, 42);
  assert.equal(s.state, 'success');
  assert.equal(s.environment, AMBIENTE_PADRAO);
  assert.equal(s.log_url, 'https://x/runs/9');
  assert.equal(s.auto_inactive, false);
  assert.throws(() => construirStatus({ id: null }), /id do deployment/);
});

test('E60: resumo cita ambiente, sha curto e run', () => {
  const d = construirDeployment({ shaDeployado: sha40('c'), runId: '77' });
  assert.equal(resumirDeployment(d), `${AMBIENTE_PADRAO} @ ${'c'.repeat(8)} (run 77)`);
});

test('E60: o workflow troca a tag por Deployment e mantem o best-effort (pin)', () => {
  const y = readFileSync('.github/workflows/deploy-functions.yml', 'utf8');
  // a tag de rastreabilidade sai de cena: o objeto passa a ser o Deployment
  assert.equal(/git\s+tag\s+-a\s+"?\$?\{?TAG/.test(y), false, 'nao pode sobrar criacao de tag de deploy');
  assert.equal(y.includes('edge-deploy/$(date -u +%Y%m%d-%H%M%S)'), false, 'a tag edge-deploy/<data> nao deve mais ser criada');
  // o Deployment entra: permissao, chamada a API e o sha deployado (nao github.sha)
  assert.ok(/deployments:\s*write/.test(y), 'o job precisa de deployments: write');
  const cli = readFileSync('scripts/edge-deploy/register-deployment.mjs', 'utf8');
  assert.ok(cli.includes('/deployments'), 'o CLI tem de chamar a API de deployments');
  assert.ok(cli.includes('DEPLOYED_GIT_SHA'), 'o CLI tem de registrar o sha DEPLOYADO');
  assert.equal(cli.includes('github.sha'), false, 'nao pode registrar o sha do run no lugar do deployado');
  assert.ok(y.includes('register-deployment.mjs'), 'o passo tem de usar o CLI testado');
  // best-effort preservado e no ensaio nem roda
  assert.ok(y.includes('if: success() && inputs.dry_run != true'), 'best-effort continua e o ensaio nao registra');
});
