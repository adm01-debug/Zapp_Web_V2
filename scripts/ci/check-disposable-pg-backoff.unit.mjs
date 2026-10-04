/**
 * Prova do backoff do bootstrap do PostgreSQL descartavel
 * (scripts/db-audit/retry-disposable-postgres-test.sh).
 *
 * O job "Contrato DB offline" reprovava PRs sem relacao com banco: o wrapper
 * tentava 3 vezes em 2,9 segundos, sondando o socket antes de o container
 * aceitar conexao. Medido no run 37064633610 (02/10/2026):
 *
 *   21:16:18.084  psql: socket .s.PGSQL.5432 failed: No such file or directory
 *   21:16:18.086  WARN: repetindo bootstrap (1/3)
 *   21:16:21.029  ##[error] exit code 2
 *
 * Roda o wrapper de verdade, com um comando falso no lugar do contrato de RLS.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const WRAPPER = resolve('scripts/db-audit/retry-disposable-postgres-test.sh');
const SOCKET_ERR =
  'psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: ' +
  'No such file or directory';

// /bin/bash explicito, nao 'bash': o primeiro argumento de spawnSync nao pode ser
// um literal resolvido por PATH (javascript:S4036, CWE-427) -- com o literal, um
// PATH adulterado trocaria o interpretador que roda o wrapper do contrato.
const BASH = '/bin/bash';

/** Roda o wrapper com um contrato falso. Devolve status, saida e tempo. */
function rodaWrapper(corpoDoStub, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pg-backoff-'));
  const comando = join(dir, 'falso-contrato.sh');
  writeFileSync(comando, corpoDoStub, { mode: 0o755 });
  const inicio = Date.now();
  const r = spawnSync(BASH, [WRAPPER, comando], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  rmSync(dir, { recursive: true, force: true });
  return {
    status: r.status,
    saida: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    decorrido: Date.now() - inicio,
  };
}

test('container lento: espera crescente e conclui quando o servidor sobe', () => {
  const r = rodaWrapper(
    `#!/usr/bin/env bash
contador="\${0%.sh}.contador"
n=0; [[ -f "$contador" ]] && n=$(cat "$contador")
n=$((n + 1)); echo "$n" > "$contador"
if [[ "$n" -lt 3 ]]; then
  echo '${SOCKET_ERR}' >&2
  exit 2
fi
echo "servidor pronto na tentativa $n"
exit 0
`,
    { DISPOSABLE_PG_ATTEMPTS: '6', DISPOSABLE_PG_BASE_WAIT: '1' },
  );

  assert.equal(r.status, 0, `esperava exit 0, veio ${r.status}: ${r.saida.slice(0, 300)}`);
  assert.match(r.saida, /servidor pronto na tentativa 3/);

  // Nao pode ser 0 (nada de retry) nem 6 (sem fail-fast depois de subir).
  const retentativas = r.saida.match(/nova tentativa em \d+s/g) ?? [];
  assert.equal(retentativas.length, 2, `esperava 2 retentativas, veio ${retentativas.length}`);

  // Espera base de 1s, dobrando: 1s + 2s = 3s. Abaixo de 2,5s seria backoff de mentira.
  assert.ok(
    r.decorrido >= 2500,
    `esperava >= 2500ms de espera acumulada, veio ${r.decorrido}ms`,
  );
});

test('esgotou: nomeia a causa real e preserva o exit code', () => {
  const r = rodaWrapper(
    `#!/usr/bin/env bash
echo '${SOCKET_ERR}' >&2
echo 'FATAL: could not connect to server' >&2
exit 2
`,
    { DISPOSABLE_PG_ATTEMPTS: '3', DISPOSABLE_PG_BASE_WAIT: '1' },
  );

  assert.equal(r.status, 2, `esperava exit 2 (o do comando), veio ${r.status}`);
  assert.match(r.saida, /nao subiu em 3 tentativas/);
  // A assinatura e impressa como o proprio padrao do repo a casou.
  assert.match(r.saida, /assinatura de bootstrap casada: connection to server on socket/);
  assert.match(r.saida, /ultima linha do servidor: FATAL: could not connect to server/);
  // E o mais importante: dizer que a culpa NAO e do contrato de RLS.
  assert.match(r.saida, /NAO e falha do contrato de RLS/);
});

test('contrato quebrado: NAO repete (o backoff nao afrouxa o RLS)', () => {
  const r = rodaWrapper(
    `#!/usr/bin/env bash
echo 'FAIL: policy de talkx_settings nao barrou o agente'
echo 'assertion failed: linha 42'
exit 1
`,
    { DISPOSABLE_PG_ATTEMPTS: '6', DISPOSABLE_PG_BASE_WAIT: '1' },
  );

  assert.equal(r.status, 1, `esperava exit 1, veio ${r.status}`);
  assert.doesNotMatch(r.saida, /nova tentativa em/, 'falha de contrato nao pode repetir');
  assert.ok(r.decorrido < 1000, `nao deveria esperar; decorreu ${r.decorrido}ms`);
});

test('limites vem do ambiente, nao de constante escondida', () => {
  const bruto = readFileSync(WRAPPER, 'utf8');
  assert.match(bruto, /attempts="\$\{DISPOSABLE_PG_ATTEMPTS:-6\}"/);
  assert.match(bruto, /espera="\$\{DISPOSABLE_PG_BASE_WAIT:-5\}"/);
});
