import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { redigir, contarValoresLiterais } from './redigir-log.mjs';

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

test('E74: o log do deploy e redigido antes de subir e o artifact retem 14 dias', () => {
  const deploy = ler('.github/workflows/deploy-functions.yml');

  // (1) o artifact do supabase-sync (7 dias) saiu junto com o workflow, removido em 15/10/2026
  // (2) o artifact do deploy cai de 30 para 14 dias
  const blocoDeploy = deploy.slice(deploy.indexOf('Arquivar manifesto'));
  assert.match(blocoDeploy, /retention-days: 14/, 'o artifact do deploy precisa de retention-days: 14');
  assert.equal(/retention-days: 30/.test(deploy), false, 'nao pode sobrar retencao de 30 dias');

  // (3) a redacao roda ANTES do upload, sobre o log, com o valor vindo do ambiente
  // R2-INF-002: o shell do passo saiu do YAML para o script testado
  // (scripts/edge-deploy/preparar-artifact-deploy.sh, exercitado por
  // preparar-artifact-deploy.unit.mjs); o passo do workflow passa a chama-lo e a
  // invocacao do redator (com o valor vindo do ambiente, nunca do codigo) passa a
  // viver no script — conferida aqui para nao perder a propriedade.
  const scriptRedator = ler('scripts/edge-deploy/preparar-artifact-deploy.sh');
  const posRedacao = deploy.indexOf('preparar-artifact-deploy.sh');
  const posUpload = deploy.indexOf('Arquivar manifesto');
  assert.ok(posRedacao > 0, 'o passo de redacao tem de existir');
  assert.ok(posRedacao < posUpload, 'a redacao tem de vir antes do passo de arquivar');
  assert.match(scriptRedator, /redigir-log\.mjs/, 'o redator tem de ser invocado');
  assert.match(scriptRedator, /--segredo-env=SUPABASE_ACCESS_TOKEN/, 'o valor tem de vir do ambiente, nunca do codigo');
  assert.match(deploy, /deploy-output\.log/, 'a redacao tem de mirar o log do deploy');
});

test('contarValoresLiterais conta ocorrencias reais, nao o numero de segredos informados', () => {
  const texto = 'a=sbp_longtoken12345 b=sbp_longtoken12345 c=sbp_longtoken12345';
  assert.equal(contarValoresLiterais(texto, ['sbp_longtoken12345']), 3);
  assert.equal(contarValoresLiterais('nada aqui bate com o segredo', ['sbp_longtoken12345']), 0);
  assert.equal(contarValoresLiterais(texto, ['curto']), 0, 'valor curto demais nao conta (mesmo limiar de redigir)');
});

test('E74: a contagem impressa pela CLI reflete ocorrencias reais, nao a lista de nomes de segredo', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'redigir-log-'));
  try {
    const log3x = path.join(dir, 'tres-ocorrencias.log');
    writeFileSync(log3x, [
      'curl .../a?x=sbp_longtoken12345',
      'curl .../b?x=sbp_longtoken12345',
      'curl .../c?x=sbp_longtoken12345',
    ].join('\n'));
    const r3 = spawnSync(process.execPath, ['scripts/edge-deploy/redigir-log.mjs', log3x, '--segredo-env=FOO_TOKEN'], {
      cwd: new URL('../../', import.meta.url).pathname,
      encoding: 'utf8',
      env: { ...process.env, REDIGIR_LOG_BASE: dir, FOO_TOKEN: 'sbp_longtoken12345' },
    });
    assert.equal(r3.status, 0, r3.stderr);
    assert.match(r3.stdout, /3 ocorrencia\(s\) de valor\(es\)/, `3 ocorrencias reais, nao o numero de nomes de segredo (1): ${r3.stdout}`);

    const log0x = path.join(dir, 'zero-ocorrencias.log');
    writeFileSync(log0x, 'nenhum segredo aparece aqui\n');
    const r0 = spawnSync(process.execPath, ['scripts/edge-deploy/redigir-log.mjs', log0x, '--segredo-env=FOO_TOKEN'], {
      cwd: new URL('../../', import.meta.url).pathname,
      encoding: 'utf8',
      env: { ...process.env, REDIGIR_LOG_BASE: dir, FOO_TOKEN: 'sbp_longtoken12345' },
    });
    assert.equal(r0.status, 0, r0.stderr);
    assert.match(r0.stdout, /0 ocorrencia\(s\) de valor\(es\)/, `0 ocorrencias reais: valor nunca apareceu no log, nao pode anunciar remocao: ${r0.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
