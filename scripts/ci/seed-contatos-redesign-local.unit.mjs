import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/db/seed-contatos-redesign-local.sh');

function runScript(args, extraEnv = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'seed-contatos-unit-'));
  const fakePsql = join(temp, 'psql');
  const argsLog = join(temp, 'args.log');
  const envLog = join(temp, 'env.log');
  const stdinLog = join(temp, 'stdin.log');

  writeFileSync(fakePsql, `#!/usr/bin/env bash
set -euo pipefail
{
  printf '%s\\n' '--- call ---'
  printf 'arg=<%s>\\n' "$@"
} >> "$PSQL_ARGS_LOG"
password_state=missing
if [[ -n "\${PGPASSWORD:-}" ]]; then password_state=set; fi
printf '%s|%s|%s|%s|%s|seed_url=%s\\n' \
  "\${PGHOST:-}" "\${PGPORT:-}" "\${PGUSER:-}" "\${PGDATABASE:-}" "$password_state" "\${SEED_DB_URL+x}" \
  >> "$PSQL_ENV_LOG"
if [[ -n "\${EXPECTED_PGPASSWORD:-}" && "\${PGPASSWORD:-}" != "$EXPECTED_PGPASSWORD" ]]; then
  exit 91
fi
{
  printf '%s\\n' '--- stdin ---'
  cat
} >> "$PSQL_STDIN_LOG"
exit "\${PSQL_FAKE_EXIT:-0}"
`);
  chmodSync(fakePsql, 0o755);

  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 3_000,
    env: {
      ...process.env,
      PATH: `${temp}:${process.env.PATH ?? ''}`,
      SEED_DB_URL: '',
      DATABASE_URL: '',
      PSQL_ARGS_LOG: argsLog,
      PSQL_ENV_LOG: envLog,
      PSQL_STDIN_LOG: stdinLog,
      ...extraEnv,
    },
  });

  const readIfExists = path => existsSync(path) ? readFileSync(path, 'utf8') : '';
  const evidence = {
    ...result,
    argsLog: readIfExists(argsLog),
    envLog: readIfExists(envLog),
    stdinLog: readIfExists(stdinLog),
  };
  rmSync(temp, { recursive: true, force: true });
  return evidence;
}

test('--url sem valor falha imediatamente, sem loop nem psql', () => {
  for (const args of [['--url'], ['--url='], ['--url', '--rollback']]) {
    const result = runScript(args);
    assert.equal(result.status, 2, `${args.join(' ')}: ${result.stderr}`);
    assert.match(result.stderr, /--url exige uma URI/);
    assert.equal(result.argsLog, '');
    assert.notEqual(result.error?.code, 'ETIMEDOUT');
  }
});

test('parser recusa esquemas, hosts, parametros e fragmentos que podem desviar o destino', () => {
  const refused = [
    'http://postgres@localhost/app',
    'postgres://postgres@db.example.com/app',
    'postgres://postgres@0.0.0.0/app',
    'postgres://postgres@localhost/app?hostaddr=203.0.113.10',
    'postgres://postgres@localhost/app?host=db.example.com',
    'postgres://postgres@localhost/app?sslmode=disable',
    'postgres://postgres@localhost/app?',
    'postgres://postgres@localhost/app#fragmento',
    'postgres://postgres@localhost/',
    'nao-e-uri',
  ];

  for (const uri of refused) {
    const result = runScript(['--rollback', '--url', uri]);
    assert.equal(result.status, 3, `${uri}: ${result.stderr}`);
    assert.match(result.stderr, /RECUSADO:/);
    assert.equal(result.argsLog, '', uri);
    assert.doesNotMatch(result.stderr, /203\.0\.113\.10|db\.example\.com/);
  }
});

test('localhost, IPv4 e IPv6 locais chegam ao psql apenas por variaveis libpq', () => {
  const cases = [
    {
      uri: 'postgres://alice:segredo-local@localhost:6543/app',
      env: 'localhost|6543|alice|app|set|seed_url=',
      display: 'banco local: localhost:6543',
      password: 'segredo-local',
    },
    {
      uri: 'postgresql://bob@127.0.0.1/app_local',
      env: '127.0.0.1|5432|bob|app_local|set|seed_url=',
      display: 'banco local: 127.0.0.1:5432',
      password: 'fallback-local',
    },
    {
      uri: 'postgresql://carol@[::1]/app_ipv6',
      env: '::1|5432|carol|app_ipv6|set|seed_url=',
      display: 'banco local: [::1]:5432',
      password: 'fallback-local',
    },
  ];

  for (const entry of cases) {
    const result = runScript(['--rollback', '--url', entry.uri], {
      SEED_DB_PASSWORD: 'fallback-local',
      EXPECTED_PGPASSWORD: entry.password,
    });
    assert.equal(result.status, 0, `${entry.uri}: ${result.stderr}`);
    assert.match(result.stdout, new RegExp(entry.display.replace(/[\[\]]/gu, '\\$&')));
    assert.match(result.envLog, new RegExp(entry.env));
    assert.doesNotMatch(result.argsLog, /postgres(?:ql)?:\/\//);
    assert.doesNotMatch(result.argsLog, /segredo-local|fallback-local/);
    assert.match(result.argsLog, /arg=<-X>/);
  }
});

test('host local com caixa diferente (LOCALHOST) nao e tratado como remoto', () => {
  // postgres:/postgresql: nao e esquema "especial" do parser WHATWG URL: sem
  // lowercase explicito no host, "LOCALHOST" (alvo local de verdade, so com caixa
  // diferente) cairia no mesmo RECUSADO usado para host remoto de verdade.
  const result = runScript(['--rollback', '--url', 'postgres://postgres@LOCALHOST:6543/app']);
  assert.notEqual(result.status, 3, result.stderr);
  assert.doesNotMatch(result.stderr, /RECUSADO:/);
  assert.match(result.envLog, /localhost\|6543\|postgres\|app\|set\|seed_url=/);
});

test('componentes percent-encoded sao decodificados sem avaliacao pelo shell', () => {
  const result = runScript(
    ['--rollback', '--url', 'postgres://user%20local:p%40ss%20local@localhost/db%20local'],
    { EXPECTED_PGPASSWORD: 'p@ss local' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.envLog, /localhost\|5432\|user local\|db local\|set\|seed_url=/);
  assert.doesNotMatch(result.argsLog, /p%40ss|p@ss|postgres:/);
});

test('URI recebida pelo ambiente tambem e removida antes de chamar psql', () => {
  const result = runScript(['--rollback'], {
    SEED_DB_URL: 'postgres://postgres:ambiente-secreto@localhost:6432/app_env',
    EXPECTED_PGPASSWORD: 'ambiente-secreto',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.envLog, /localhost\|6432\|postgres\|app_env\|set\|seed_url=/);
  assert.doesNotMatch(result.argsLog, /ambiente-secreto|postgres:/);
});

test('rollback verifica o endereco no banco antes do DELETE e fecha a transacao', () => {
  const result = runScript(['--rollback', '--url', 'postgres://postgres@localhost/app']);
  assert.equal(result.status, 0, result.stderr);

  const guard = result.stdinLog.indexOf('inet_client_addr()');
  const deletion = result.stdinLog.indexOf("delete from public.contacts where id::text like 'd9000000-%'");
  const commit = result.stdinLog.indexOf('commit;');
  assert.ok(guard >= 0, result.stdinLog);
  assert.ok(deletion > guard, result.stdinLog);
  assert.ok(commit > deletion, result.stdinLog);
});

test('falha do psql interrompe o rollback e nunca anuncia sucesso', () => {
  const result = runScript(['--rollback', '--url', 'postgres://postgres@localhost/app'], {
    PSQL_FAKE_EXIT: '9',
  });
  assert.equal(result.status, 9, result.stderr);
  assert.doesNotMatch(result.stdout, /rollback concluido/);
});
