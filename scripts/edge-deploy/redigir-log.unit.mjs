import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { redigir } from './redigir-log.mjs';

const raiz = new URL('../../', import.meta.url);
const ler = (p) => readFileSync(new URL(p, raiz), 'utf8');

test('E74: o valor do token sai do log, e a chave deixa de existir como tal', () => {
  const entrada = [
    'Deploying function talkx-send',
    '  curl https://tnnnlkbymytvtqngbbqh.functions.supabase.co/talkx-send?access_token=sbp_abc123def456',
    '  warning: access_token expirado',
  ].join('\n');
  const saida = redigir(entrada, ['sbp_abc123def456']);
  assert.equal(saida.includes('access_token'), false, 'a string access_token nao pode sobrar no artifact');
  assert.equal(saida.includes('sbp_abc123def456'), false, 'o valor do token nao pode sobrar');
  assert.ok(saida.includes('token='), 'o parametro continua visivel, so sem credencial');
});

test('E74: valor curto demais nao e tratado como segredo (nao troca texto comum)', () => {
  const entrada = 'campo status=ok e access_token=abc';
  const saida = redigir(entrada, ['abc']);
  assert.ok(saida.includes('status=ok'), 'texto comum tem de sobreviver');
  assert.equal(saida.includes('access_token'), false);
});

test('E74: o CLI e fail-closed quando o log nao existe', () => {
  const r = spawnSync(process.execPath, ['scripts/edge-deploy/redigir-log.mjs', '/nao/existe/deploy-output.log'], {
    cwd: new URL('../../', import.meta.url).pathname,
    encoding: 'utf8',
  });
  assert.equal(r.status, 2, 'log ausente tem de sair com 2');
});

test('R2-INF-002: falha de gravacao derruba o processo — e disso que o gate do upload depende', () => {
  // Injecao de erro de escrita: arquivo somente-leitura dentro da base. Se o
  // processo saisse com 0 aqui, o passo do workflow terminaria "com sucesso" e
  // o artifact subiria com o log bruto — exatamente o cenario do achado.
  const base = mkdtempSync(join(tmpdir(), 'redigir-ro-'));
  const dir = join(base, 'edge-deployment-evidence');
  mkdirSync(dir);
  const alvo = join(dir, 'deploy-output.log');
  const bruto = 'curl https://x.functions.supabase.co/f?access_token=LEAK1234567890\n';
  writeFileSync(alvo, bruto);
  chmodSync(alvo, 0o444);
  try {
    const r = spawnSync(
      process.execPath,
      ['scripts/edge-deploy/redigir-log.mjs', alvo, '--segredo-env=SUPABASE_ACCESS_TOKEN'],
      {
        cwd: new URL('../../', import.meta.url).pathname,
        encoding: 'utf8',
        env: { ...process.env, REDIGIR_LOG_BASE: base, SUPABASE_ACCESS_TOKEN: 'LEAK1234567890' },
      },
    );
    assert.notEqual(r.status, 0, 'falha de gravacao tem de sair com erro para o gate barrar o upload');
    assert.equal(readFileSync(alvo, 'utf8'), bruto, 'o bruto nao pode sair "limpo" pela metade');
  } finally {
    chmodSync(alvo, 0o644);
  }
});

test('E74: supabase-sync retem 7 dias e o log do deploy e redigido antes de subir', () => {
  const sync = ler('.github/workflows/supabase-sync.yml');
  const deploy = ler('.github/workflows/deploy-functions.yml');

  // (1) o artifact do supabase-sync passa a ter retencao explicita de 7 dias
  const blocoSync = sync.slice(sync.indexOf('Archive validation logs'));
  assert.match(blocoSync, /retention-days: 7/, 'o artifact validation-logs precisa de retention-days: 7');

  // (2) o artifact do deploy cai de 30 para 14 dias
  const blocoDeploy = deploy.slice(deploy.indexOf('Arquivar manifesto'));
  assert.match(blocoDeploy, /retention-days: 14/, 'o artifact do deploy precisa de retention-days: 14');
  assert.equal(/retention-days: 30/.test(deploy), false, 'nao pode sobrar retencao de 30 dias');

  // (3) a redacao roda ANTES do upload, sobre o log, com o valor vindo do ambiente
  const posRedacao = deploy.indexOf('redigir-log.mjs');
  const posUpload = deploy.indexOf('Arquivar manifesto');
  assert.ok(posRedacao > 0, 'o passo de redacao tem de existir');
  assert.ok(posRedacao < posUpload, 'a redacao tem de vir antes do passo de arquivar');
  assert.match(deploy, /--segredo-env=SUPABASE_ACCESS_TOKEN/, 'o valor tem de vir do ambiente, nunca do codigo');
  assert.match(deploy, /deploy-output\.log/, 'a redacao tem de mirar o log do deploy');
});
