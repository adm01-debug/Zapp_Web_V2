import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
test('production parity requires live legs, and runtime metadata is archived', () => {
  const workflow = read('../../.github/workflows/db-live-guard.yml');
  assert.match(workflow, /check-triple-parity\.mjs --require-live/);
  assert.match(workflow, /check-runtime-config\.mjs \/tmp\/runtime-config\.json/);
  assert.match(workflow, /\/tmp\/runtime-config\.json\n/);
  assert.doesNotMatch(workflow, /^  pull_request:/m);
  assert.ok(workflow.indexOf('Exigir credencial do banco oficial') < workflow.indexOf('Auditar configuracao runtime'));
});
test('types-sync includes the grants baseline in generation, drift and PR paths', () => {
  const workflow = read('../../.github/workflows/types-sync.yml');
  assert.match(workflow, /psqlFile\('scripts\/db-audit\/grants-baseline\.sql'\)/);
  assert.match(workflow, /\/tmp\/grants\.new\.json/);
  assert.match(workflow, /check-grants-fresh\.mjs \/tmp\/grants\.new\.json/);
  assert.match(workflow, /GRANTS_STATUS=\$\?/);
  assert.match(workflow, /grants_changed=\$\{GRANTS_CHANGED\}/);
  assert.match(workflow, /cp \/tmp\/grants\.new\.json scripts\/db-audit\/grants-baseline\.json/);
  assert.equal((workflow.match(/scripts\/db-audit\/grants-baseline\.json/g) || []).length, 3);
  assert.match(workflow, /baseline de grants alterado/);
});
test('types-sync generates catalog/manifest/grants via psql without the connection string in argv', () => {
  const workflow = read('../../.github/workflows/types-sync.yml');
  // DESTINO_URL (senha inclusa) nunca deve ir pro argv do psql — so pro env,
  // via withPsqlEnvironment(). Regressao real: PR anterior deste fix.
  assert.doesNotMatch(workflow, /psql ["']?\$\{?DESTINO_URL\}?["']?/);
  assert.match(workflow, /withPsqlEnvironment\(url, \(env\) => execFileSync\(/);
  assert.match(workflow, /psqlFile\('scripts\/db-audit\/catalog\.sql'\)/);
  assert.match(workflow, /psqlFile\('scripts\/db-audit\/manifest\.sql'\)/);
});
test('grants comparison logic lives in a standalone, unit-tested script (not just a regex-checked heredoc)', () => {
  const workflow = read('../../.github/workflows/types-sync.yml');
  assert.doesNotMatch(workflow, /GRANTS_CANDIDATE=/);
  assert.doesNotMatch(workflow, /GRANTS_COMMITTED=/);
  assert.ok(fs.existsSync(new URL('../db-audit/check-grants-fresh.mjs', import.meta.url)));
  assert.ok(fs.existsSync(new URL('../db-audit/check-grants-fresh.test.mjs', import.meta.url)));
});
test('db-live-guard runs psql without the connection string in argv (same regression as types-sync)', () => {
  const workflow = read('../../.github/workflows/db-live-guard.yml');
  // DESTINO_URL (senha inclusa) nunca deve ir pro argv do psql — so pro env,
  // via psql-safe.mjs/withPsqlEnvironment(). Escopo deixado de fora do PR #534
  // por ser workflow de guarda viva contra producao; fechado separadamente.
  assert.doesNotMatch(workflow, /psql ["']?\$\{?DESTINO_URL\}?["']?/);
  // 6 desde a V02 do plano Talk X V3 (2026-09-29): o passo que verifica o
  // contrato de transicao de campanha entrou pelo mesmo wrapper. Antes eram 5
  // (V01, security_invoker da view de metricas).
  // A contagem e exata de proposito -- uma invocacao nova de psql que nao
  // passe pelo wrapper quebra este teste em vez de vazar a senha.
  assert.equal((workflow.match(/node scripts\/db-audit\/psql-safe\.mjs/g) || []).length, 6);
  assert.ok(fs.existsSync(new URL('../db-audit/psql-safe.mjs', import.meta.url)));
  assert.ok(fs.existsSync(new URL('../db-audit/psql-safe.test.mjs', import.meta.url)));
});
test('db-migrate (production) runs psql without the connection string in argv (same regression as types-sync)', () => {
  const workflow = read('../../.github/workflows/db-migrate.yml');
  // DESTINO_URL (senha inclusa) nunca deve ir pro argv do psql — so pro env,
  // via psql-safe.mjs/withPsqlEnvironment(). Escopo deixado de fora do PR #534
  // por ser o workflow de migracao de producao mais sensivel do repositorio;
  // fechado separadamente, com o mesmo transporte, sem tocar a logica de
  // captura de saida (RUNTIME/RESULT/LEGACY_COUNT/BUNDLE_COUNT/LEDGER_COUNT).
  assert.doesNotMatch(workflow, /psql ["']?\$\{?DESTINO_URL\}?["']?/);
  // E62 (03/10/2026): os 12 bracos de contrato do `case "$TARGET_VERSION"` sairam do
  // YAML para scripts/db-audit/contracts/<versao>.sql, executados pelo runner
  // generico. A invariante que este teste protege nao e a contagem no YAML: e que
  // NENHUMA invocacao de psql escape do wrapper (psql-safe.mjs). Com os contratos
  // fora do arquivo, a verificacao passa a cobrir os tres lugares onde SQL chega ao
  // banco -- workflow, runner e contratos.
  const runner = read('../../scripts/db-audit/run-runtime-contract.mjs');
  assert.ok(
    (workflow.match(/node scripts\/db-audit\/psql-safe\.mjs/g) || []).length > 0,
    'o workflow tem de continuar passando pelo wrapper',
  );
  assert.match(runner, /psql-safe\.mjs/, 'o runner generico tem de usar o wrapper');
  assert.match(runner, /ON_ERROR_STOP=1/, 'e manter o ON_ERROR_STOP');
  for (const arquivo of fs.readdirSync(new URL('../db-audit/contracts/', import.meta.url))) {
    if (!arquivo.endsWith('.sql')) continue;
    const sql = fs.readFileSync(new URL(`../db-audit/contracts/${arquivo}`, import.meta.url), 'utf8');
    assert.doesNotMatch(sql, /^\s*psql(\s|$)/m, `${arquivo} nao pode invocar psql: so devolve SQL ao wrapper`);
  }
});
test('deployment brackets mutation with snapshots and stable post-collection', () => {
  const workflow = read('../../.github/workflows/deploy-functions.yml');
  const before = workflow.indexOf('collect-remote.mjs" --snapshot');
  const deploy = workflow.indexOf('      - name: Deploy\n');
  const after = workflow.indexOf('collect-remote.mjs" \\');
  assert.ok(before > 0 && before < deploy && deploy < after);
  assert.match(workflow, /--before "\$EVIDENCE_DIR\/edge-before\.json"/);
  assert.doesNotMatch(workflow, /node scripts\/edge-deploy\/verify-remote\.mjs/);
  assert.match(workflow, /Source\/bundle binary equivalence: NOT proven/);
  assert.match(workflow, /git archive "\$GITHUB_SHA" scripts\/edge-deploy/);
  assert.equal((workflow.match(/\$RUNNER_TEMP\/edge-tooling\/scripts\/edge-deploy\/collect-remote\.mjs/g) || []).length, 2);
});
test('runtime SQL is exercised on disposable PostgreSQL in PRs', () => {
  const workflow = read('../../.github/workflows/db-guard.yml');
  assert.match(workflow, /retry-disposable-postgres-test\.sh bash scripts\/db-audit\/runtime-config\.test\.sh/);
  assert.match(workflow,
    /retry-disposable-postgres-test\.sh bash scripts\/db-audit\/notification-delivery-atomicity\.test\.sh/);
});
test('production migration has fail-closed preflight and postflight for notification atomicity', () => {
  const workflow = read('../../.github/workflows/db-migrate.yml');
  // E62: o braco do `case` virou arquivo de contrato. O que se prende agora e que o
  // alvo 20260922220000 continue com o contrato de runtime disponivel e que a
  // verificacao do apply continue exigindo as contagens exatas.
  assert.ok(
    fs.existsSync(new URL('../db-audit/contracts/20260922220000.sql', import.meta.url)),
    'o contrato de runtime do alvo 20260922220000 tem de existir',
  );
  assert.ok(
    (workflow.match(/notification-delivery-atomicity-runtime\.sql/g) || []).length >= 1,
    'o workflow tem de continuar referenciando o contrato de atomicidade',
  );
  assert.match(workflow, /inputs\.migration_version == '20260922220000'/);
  assert.match(workflow, /proof\.service_execute_count === 2/);
  assert.match(workflow, /proof\.authenticated_execute_count === 0/);
});
test('DB guard installs the pinned AST dependency before checking Realtime subscriptions', () => {
  const workflow = read('../../.github/workflows/db-guard.yml');
  const install = workflow.indexOf('bun install --frozen-lockfile');
  const realtimeGuard = workflow.indexOf('node scripts/db-audit/check-realtime-subscriptions.mjs');

  assert.match(workflow, /oven-sh\/setup-bun@[0-9a-f]{40}/);
  assert.ok(install > 0 && install < realtimeGuard);
});
test('PR guard exercises libpq transport with real client authentication, not only SQL fixtures', () => {
  assert.match(read('../../.github/workflows/db-guard.yml'),
    /retry-disposable-postgres-test\.sh node scripts\/db-audit\/psql-environment\.integration\.mjs/);
});
