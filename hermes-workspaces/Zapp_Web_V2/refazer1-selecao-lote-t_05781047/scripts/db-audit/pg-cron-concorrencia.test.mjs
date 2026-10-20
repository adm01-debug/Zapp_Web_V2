import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { resolverExecutavel } from '../lib/seguranca-processo.mjs';

const SCRIPT = fileURLToPath(new URL('./pg-cron-concorrencia.py', import.meta.url));

/** Roda o medidor e devolve status/stdout/stderr sem lancar. */
function rodar(rotulo, caminho) {
  try {
    const stdout = execFileSync(resolverExecutavel('python3'), [SCRIPT, rotulo, caminho], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (erro) {
    return {
      status: erro.status ?? 1,
      stdout: erro.stdout ?? '',
      stderr: erro.stderr ?? String(erro.message),
    };
  }
}

function arquivoTemporario(nome, conteudo) {
  const dir = mkdtempSync(join(tmpdir(), 'pg-cron-concorrencia-'));
  const caminho = join(dir, nome);
  writeFileSync(caminho, conteudo);
  return caminho;
}

test('mede o arquivo de jobs e reporta slots e pior slot', () => {
  const caminho = arquivoTemporario(
    'jobs-medir.txt',
    'job-a|0 0 * * *\njob-b|0 0 * * *\njob-c|30 0 * * *\n',
  );
  const r = rodar('antes', caminho);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /antes: jobs=3 slots=2 max_por_slot=2 slots_>=5=0 slots_>=7=0/);
  assert.match(r.stdout, /piores:.*00:00=2/);
});

test('arquivo sem dados e PROVA INVALIDA: sai 1 sem imprimir medicao', () => {
  const caminho = arquivoTemporario('vazio.txt', '\n   \n');
  const r = rodar('antes', caminho);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /SEM DADOS -- PROVA INVALIDA/);
});

test('recusa caminho fora das raizes permitidas (jssecurity:S8707)', () => {
  const r = rodar('antes', '/etc/hostname');
  assert.notEqual(r.status, 0, 'caminho fora das raizes tem de ser recusado');
  assert.match(r.stderr, /fora das raizes permitidas/);
});

test('nao confunde prefixo de diretorio: /tmpfoo nao esta dentro de /tmp', () => {
  const r = rodar('antes', '/tmpfoo/jobs-medir.txt');
  assert.notEqual(r.status, 0, 'prefixo parecido nao pode passar pela validacao');
  assert.match(r.stderr, /fora das raizes permitidas/);
});
