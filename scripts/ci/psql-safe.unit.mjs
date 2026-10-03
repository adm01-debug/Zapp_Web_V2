// E66: prova de que o retry de conexao do preflight do db-migrate realmente
// funciona pelo caminho do psql-safe.mjs.
//
// Contexto: a politica de retry ja existia em psql-environment.mjs e ja era
// usada pelo db-live-guard, mas o psql-safe.mjs nao a acionava -- o callback
// devolvia o exit code em vez de lancar, entao `PSQL_CONNECT_RETRIES` no
// preflight nao tinha efeito nenhum e uma oscilacao do pooler derrubava o
// passo de primeira. Os testes abaixo fixam: (a) falha de conexao (exit 2) e
// repetida quando a variavel esta ligada; (b) erro de SQL (exit 1) NUNCA e
// repetido -- repetir um erro de SQL seria reexecutar a consulta por outro
// motivo; (c) desligado por padrao, nada muda.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const PSQL_SAFE = fileURLToPath(new URL('../db-audit/psql-safe.mjs', import.meta.url));

function fakePsql(corpo) {
  const dir = mkdtempSync(join(tmpdir(), 'psql-safe-'));
  const bin = join(dir, 'fake-psql.sh');
  const contador = join(dir, 'contador');
  writeFileSync(
    bin,
    `#!/usr/bin/env bash\n`
    + `n=$(cat "${contador}" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "${contador}"\n`
    + `${corpo}\n`,
  );
  chmodSync(bin, 0o755);
  return { bin, contador };
}

function rodar({ bin, contador }, extras = {}) {
  const env = {
    ...process.env,
    DESTINO_URL: 'postgresql://usuario:senha@127.0.0.1:5432/banco',
    PSQL_BIN: bin,
    PSQL_CONNECT_RETRY_DELAY_MS: '0',
    ...extras,
  };
  const r = spawnSync('node', [PSQL_SAFE, '-c', 'select 1'], { env, encoding: 'utf8' });
  return { status: r.status, chamadas: Number(readFileSync(contador, 'utf8').trim()), stderr: r.stderr };
}

test('desligado por padrao: falha de conexao nao e repetida e o exit code e preservado', () => {
  const r = rodar(fakePsql('exit 2'));
  assert.equal(r.chamadas, 1);
  assert.equal(r.status, 2, 'exit 2 (falha de conexao) precisa continuar saindo como 2');
});

test('PSQL_CONNECT_RETRIES=2 repete a falha de conexao e conclui quando o banco responde', () => {
  const r = rodar(fakePsql('if [ "$n" -le 2 ]; then exit 2; fi\nexit 0'), { PSQL_CONNECT_RETRIES: '2' });
  assert.equal(r.chamadas, 3, 'duas repeticoes depois da primeira tentativa');
  assert.equal(r.status, 0);
});

test('erro de SQL (exit 1) nunca e repetido, mesmo com a variavel ligada', () => {
  const r = rodar(fakePsql('exit 1'), { PSQL_CONNECT_RETRIES: '3' });
  assert.equal(r.chamadas, 1, 'repetir erro de SQL reexecutaria a consulta por outro motivo');
  assert.equal(r.status, 1);
});

test('valor invalido em PSQL_CONNECT_RETRIES nao vira repeticao', () => {
  const r = rodar(fakePsql('exit 2'), { PSQL_CONNECT_RETRIES: 'nao-e-numero' });
  assert.equal(r.chamadas, 1);
  assert.equal(r.status, 2);
});

test('a mensagem de falha nao ecoa a conexao (a URI nunca vai para o log)', () => {
  const r = rodar(fakePsql('exit 2'));
  assert.doesNotMatch(r.stderr, /senha/, 'a senha da URI nao pode aparecer no erro');
  assert.match(r.stderr, /falha de conexao \(exit 2\)/);
});
