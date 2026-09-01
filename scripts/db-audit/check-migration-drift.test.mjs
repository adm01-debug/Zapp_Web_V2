import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SCRIPT = fileURLToPath(new URL('./check-migration-drift.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(SCRIPT), '../..');
const VERSION = '20260829050000';
const FILE = `${VERSION}_create_demo.sql`;
const SQL = 'CREATE TABLE public.demo (id integer);\n';
const OTHER_SQL = 'CREATE TABLE public.legacy_demo (id integer);\n';
const HASH_DOMAIN = 'zapp-migration-ledger-statements-v1\0';
const JUSTIFICATION = 'Fixture factual com hashes independentes do ledger e do replay local para testar o guard.';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fixtureSqlHash(table = 'demo') {
  return sha256(`create table public . ${table} ( id integer )`);
}

function statementsHash(statements) {
  return sha256(HASH_DOMAIN + JSON.stringify(statements));
}

function ledgerRecord(overrides = {}) {
  return {
    version: VERSION,
    name: 'create_demo',
    statements: ['CREATE TABLE public.demo (id integer)'],
    ...overrides,
  };
}

function commentOnlyEvidence(content, statements = [], overrides = {}) {
  return {
    version: VERSION,
    filename: FILE,
    file_sha256: sha256(content),
    ledger_name: 'create_demo',
    ledger_statements_sha256: statementsHash(statements),
    kind: 'ledger-only/comment-only',
    justification: 'Fixture factual de teste para uma migration preservada somente como comentario.',
    ...overrides,
  };
}

function nameOnlyEvidence(content = SQL, overrides = {}) {
  return {
    version: VERSION,
    filename: FILE,
    file_sha256: sha256(content),
    ledger_name: 'create_demo',
    kind: 'ledger-only/name-and-file-pinned',
    justification: 'O ledger legado preserva nome e versao, mas nao possui SQL ou hash historico recuperavel.',
    ...overrides,
  };
}

function pinnedEvidence({
  content = SQL,
  statements = [OTHER_SQL.trim()],
  reason = 'ledger-summary',
  related_migration = null,
  overrides = {},
} = {}) {
  const table = content.includes('legacy_demo') ? 'legacy_demo' : 'demo';
  const ledgerTable = statements.join('\n').includes('legacy_demo') ? 'legacy_demo' : 'demo';
  return {
    version: VERSION,
    filename: FILE,
    file_sha256: sha256(content),
    file_sql_sha256: fixtureSqlHash(table),
    ledger_name: 'create_demo',
    ledger_statements_sha256: statementsHash(statements),
    ledger_sql_sha256: fixtureSqlHash(ledgerTable),
    kind: 'ledger-divergence/pinned-replay',
    reason,
    related_migration,
    justification: JUSTIFICATION,
    ...overrides,
  };
}

const RELATED_VERSION = '20260829060000';
const RELATED_FILE = `${RELATED_VERSION}_create_legacy_demo.sql`;

function collisionFixture(evidenceOverrides = {}) {
  const related = {
    version: RELATED_VERSION,
    filename: RELATED_FILE,
    file_sha256: sha256(OTHER_SQL),
    file_sql_sha256: fixtureSqlHash('legacy_demo'),
  };
  const evidence = pinnedEvidence({
    statements: [OTHER_SQL.trim()],
    reason: 'version-collision',
    related_migration: related,
    overrides: {
      ledger_name: 'create_legacy_demo',
      ...evidenceOverrides,
    },
  });
  return {
    files: { [FILE]: SQL, [RELATED_FILE]: OTHER_SQL },
    ledger: [
      ledgerRecord({ name: 'create_legacy_demo', statements: [OTHER_SQL.trim()] }),
      {
        version: RELATED_VERSION,
        name: 'create_legacy_demo',
        statements: [OTHER_SQL.trim()],
      },
    ],
    evidence: [evidence],
  };
}

function runGuard({
  files = { [FILE]: SQL },
  ledger = [ledgerRecord()],
  evidence = [],
  destino = true,
  schemaVersion = 2,
} = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-drift-test-'));
  const migrationsDir = path.join(tmp, 'migrations');
  const fakePsql = path.join(tmp, 'fake-psql.mjs');
  const evidencePath = path.join(tmp, 'migration-evidence.json');
  fs.mkdirSync(migrationsDir);

  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(migrationsDir, name), content);
  }
  fs.writeFileSync(
    fakePsql,
    '#!/usr/bin/env node\nprocess.stdout.write(process.env.FAKE_PSQL_OUTPUT || "");\n',
    { mode: 0o700 },
  );
  fs.writeFileSync(evidencePath, JSON.stringify({ schema_version: schemaVersion, exceptions: evidence }));

  const env = {
    ...process.env,
    MIGRATIONS_DIR: migrationsDir,
    MIGRATION_EVIDENCE_PATH: evidencePath,
    PSQL_BIN: fakePsql,
    FAKE_PSQL_OUTPUT: ledger.map((record) => JSON.stringify(record)).join('\n') + '\n',
  };
  if (destino) env.DESTINO_URL = 'postgres://fixture.invalid/test';
  else delete env.DESTINO_URL;

  try {
    return spawnSync(process.execPath, [SCRIPT], {
      cwd: ROOT,
      encoding: 'utf8',
      env,
      timeout: 10_000,
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test('aceita migration com nome e SQL equivalentes no ledger', () => {
  const result = runGuard();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 conteudo\(s\)\/hash\(es\) historico\(s\) verificado\(s\)/);
});

test('aceita registro legado sem name/statements, sem inventar evidencia', () => {
  const result = runGuard({ ledger: [ledgerRecord({ name: null, statements: null })] });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /legada\(s\) sem hash\/SQL verificavel/);
});

test('fixa arquivo legado por hash sem chamar seus bytes de conteudo historico', () => {
  const result = runGuard({
    ledger: [ledgerRecord({ statements: null })],
    evidence: [nameOnlyEvidence()],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /0 conteudo\(s\)\/hash\(es\) historico\(s\) verificado\(s\)/);
  assert.match(result.stdout, /1 arquivo\(s\) legado\(s\) fixado\(s\) sem prova de conteudo historico/);
  assert.doesNotMatch(result.stderr, /ATENCAO/);
});

test('name-and-file-pinned falha para arquivo/nome alterado ou SQL recuperado no ledger', () => {
  const changedFile = runGuard({
    files: { [FILE]: `${SQL}-- alterado\n` },
    ledger: [ledgerRecord({ statements: null })],
    evidence: [nameOnlyEvidence()],
  });
  assert.equal(changedFile.status, 1);
  assert.match(changedFile.stderr, /file_sha256 divergente do manifesto/);

  const changedName = runGuard({
    ledger: [ledgerRecord({ name: 'outro_nome', statements: null })],
    evidence: [nameOnlyEvidence()],
  });
  assert.equal(changedName.status, 1);
  assert.match(changedName.stderr, /ledger_name divergente do manifesto/);

  const recoveredSql = runGuard({
    ledger: [ledgerRecord({ statements: [SQL.trim()] })],
    evidence: [nameOnlyEvidence()],
  });
  assert.equal(recoveredSql.status, 1);
  assert.match(recoveredSql.stderr, /exige ledger sem SQL\/hash historico/);

  const nonSqlMetadata = runGuard({
    ledger: [ledgerRecord({ statements: ['metadado legado sem SQL executavel'] })],
    evidence: [nameOnlyEvidence()],
  });
  assert.equal(nonSqlMetadata.status, 0, nonSqlMetadata.stderr);
});

test('name-and-file-pinned exige SQL local e rejeita campos desconhecidos', () => {
  const commentOnly = '-- sem SQL historico\n';
  const noSql = runGuard({
    destino: false,
    files: { [FILE]: commentOnly },
    evidence: [nameOnlyEvidence(commentOnly)],
  });
  assert.equal(noSql.status, 1);
  assert.match(noSql.stderr, /name-and-file-pinned exige SQL executavel/);

  const unknownField = runGuard({
    destino: false,
    evidence: [nameOnlyEvidence(SQL, { historical_sql_sha256: '0'.repeat(64) })],
  });
  assert.equal(unknownField.status, 1);
  assert.match(unknownField.stderr, /campos ausentes ou desconhecidos/);
});

test('valida estrutura local mesmo sem DESTINO_URL', () => {
  const result = runGuard({ destino: false });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /estrutura local validada/);
});

test('falha fechado para versao duplicada no repositorio', () => {
  const result = runGuard({
    files: {
      [`${VERSION}_create_demo.sql`]: SQL,
      [`${VERSION}_create_other.sql`]: 'CREATE TABLE public.other (id integer);',
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /versao duplicada 20260829050000/);
});

test('falha fechado para nome/formato de arquivo invalido', () => {
  const result = runGuard({ files: { [`${VERSION}-create-demo.sql`]: SQL } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /nome\/formato invalido/);
});

test('falha fechado para arquivo vazio', () => {
  const result = runGuard({ files: { [FILE]: '' } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /arquivo vazio ou sem SQL/);
});

test('manifesto comment-only nao pode liberar arquivo vazio', () => {
  const result = runGuard({
    files: { [FILE]: '' },
    evidence: [commentOnlyEvidence('')],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /arquivo vazio ou sem SQL/);
  assert.match(result.stderr, /excecao comment-only nao pode cobrir arquivo vazio ou sem SQL/);
});

test('falha fechado para arquivo somente com comentarios SQL', () => {
  const commentOnly = '-- sem SQL\n/* comentario externo /* aninhado */ ainda comentario */\n';
  const result = runGuard({
    files: { [FILE]: commentOnly },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /arquivo vazio ou somente comentarios sem excecao exata/);
});

test('aceita comment-only somente com excecao versionada exata e ledger_name', () => {
  const commentOnly = '-- registro historico sem statements recuperados\n';
  const result = runGuard({
    files: { [FILE]: commentOnly },
    ledger: [ledgerRecord({ statements: null })],
    evidence: [commentOnlyEvidence(commentOnly)],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 conteudo\(s\)\/hash\(es\) historico\(s\) verificado\(s\)/);
});

test('falha se file_sha256 da excecao comment-only nao corresponde ao arquivo', () => {
  const commentOnly = '-- registro historico sem statements recuperados\n';
  const result = runGuard({
    files: { [FILE]: commentOnly },
    evidence: [commentOnlyEvidence(commentOnly, [], { file_sha256: '0'.repeat(64) })],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /file_sha256 divergente do manifesto/);
});

test('falha se ledger_name da excecao nao corresponde ao banco', () => {
  const commentOnly = '-- registro historico sem statements recuperados\n';
  const result = runGuard({
    files: { [FILE]: commentOnly },
    ledger: [ledgerRecord({ name: 'outro_nome', statements: null })],
    evidence: [commentOnlyEvidence(commentOnly)],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ledger_name divergente do manifesto/);
});

test('falha se ledger_name obrigatorio da excecao esta ausente no banco', () => {
  const commentOnly = '-- registro historico sem statements recuperados\n';
  const result = runGuard({
    files: { [FILE]: commentOnly },
    ledger: [ledgerRecord({ name: null, statements: null })],
    evidence: [commentOnlyEvidence(commentOnly)],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ledger_name ausente para excecao/);
});

test('nao permite que excecao comment-only cubra SQL executavel', () => {
  const commentOnly = '-- registro historico sem statements recuperados\n';
  const result = runGuard({ evidence: [commentOnlyEvidence(commentOnly)] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /excecao comment-only nao pode cobrir SQL executavel/);
});

test('falha para excecao orfa no manifesto', () => {
  const orphanVersion = '20260829050100';
  const orphanFile = `${orphanVersion}_orphan.sql`;
  const result = runGuard({
    evidence: [commentOnlyEvidence('-- orfa\n', [], {
      version: orphanVersion,
      filename: orphanFile,
      file_sha256: sha256('-- orfa\n'),
      ledger_name: 'orphan',
    })],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /excecao orfa no manifesto/);
});

test('falha para manifesto com versao duplicada', () => {
  const commentOnly = '-- registro historico sem statements recuperados\n';
  const exception = commentOnlyEvidence(commentOnly);
  const result = runGuard({
    files: { [FILE]: commentOnly },
    evidence: [exception, { ...exception }],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /versao duplicada no manifesto/);
});

test('falha para conteudo arbitrario quando o ledger conserva SQL aplicado', () => {
  const statements = ['CREATE TABLE public.demo (id integer)'];
  const result = runGuard({
    files: { [FILE]: 'DROP TABLE public.demo;' },
    ledger: [ledgerRecord({ statements })],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /conteudo SQL divergente/);
  assert.match(result.stderr, /ledger_name="create_demo"/);
  assert.match(
    result.stderr,
    new RegExp(`ledger_statements_sha256=${statementsHash(statements)}`),
  );
  assert.match(result.stderr, new RegExp(`ledger_sql_sha256=${fixtureSqlHash()}`));
});

test('aceita file-sha256 explicito sem fabricar hash retroativo', () => {
  const hash = crypto.createHash('sha256').update(SQL).digest('hex');
  const result = runGuard({
    ledger: [ledgerRecord({ statements: [`-- file-sha256: ${hash}`] })],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 conteudo\(s\)\/hash\(es\) historico\(s\) verificado\(s\)/);
});

test('falha para file-sha256 divergente', () => {
  const result = runGuard({
    ledger: [ledgerRecord({ statements: [`-- file-sha256: ${'0'.repeat(64)}`] })],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /hash de arquivo divergente/);
});

test('falha fechado para marcador file-sha256 malformado', () => {
  const result = runGuard({
    ledger: [ledgerRecord({ statements: ['-- file-sha256: hash-invalido'] })],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /marcador file-sha256 invalido/);
});

test('falha quando arquivo do repo nao possui versao no banco', () => {
  const result = runGuard({ ledger: [] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Arquivo no repo sem registro no banco/);
});

test('falha quando ledger fornece nome divergente', () => {
  const result = runGuard({ ledger: [ledgerRecord({ name: 'outro_nome' })] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /nome divergente/);
});

test('nome malformado com arquivo local permanece escapado em todo diagnostico', () => {
  const maliciousName = 'create_demo\nforged-log-line\u001b[31m';
  const result = runGuard({ ledger: [ledgerRecord({ name: maliciousName })] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`name malformado no ledger para ${VERSION}`));
  assert.match(result.stderr, /ledger="create_demo\\nforged-log-line\\u001b\[31m"/);
  assert.doesNotMatch(result.stderr, /create_demo\nforged-log-line/);
  assert.doesNotMatch(result.stderr, /\u001b/);
});

test('registro extra informa hashes seguros e nome normalizado sem vazar statements', () => {
  const extraVersion = '20260829050100';
  const secret = 'literal-sensivel-do-ledger';
  const extraStatements = [
    `SELECT '${secret}'`,
    `-- comentario ${secret} que tambem nao pode aparecer`,
  ];
  const result = runGuard({
    ledger: [
      ledgerRecord(),
      {
        version: extraVersion,
        name: `${extraVersion}_db_only.sql`,
        statements: extraStatements,
      },
    ],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Registro no banco sem arquivo no repo/);
  assert.match(result.stderr, new RegExp(`version=${extraVersion}`));
  assert.match(result.stderr, new RegExp(`ledger_name="${extraVersion}_db_only\\.sql"`));
  assert.match(result.stderr, /normalized_name="db_only"/);
  assert.match(
    result.stderr,
    new RegExp(`ledger_statements_sha256=${statementsHash(extraStatements)}`),
  );
  assert.match(
    result.stderr,
    new RegExp(`ledger_sql_sha256=${sha256(`select '${secret}'`)}`),
  );
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
  assert.doesNotMatch(result.stdout + result.stderr, /SELECT '/);
});

test('registro extra sem name/statements ainda informa hashes deterministas', () => {
  const extraVersion = '20260829050100';
  const result = runGuard({
    ledger: [
      ledgerRecord(),
      { version: extraVersion, name: null, statements: null },
    ],
  });
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    new RegExp(`version=${extraVersion} ledger_name=null normalized_name=null`),
  );
  assert.match(
    result.stderr,
    new RegExp(`ledger_statements_sha256=${statementsHash([])}`),
  );
  assert.match(result.stderr, new RegExp(`ledger_sql_sha256=${sha256('')}`));
});

test('registro extra escapa controles do nome sem injetar linha ou ANSI no log', () => {
  const extraVersion = '20260829050100';
  const controlName = 'db\nonly\u001b[31m';
  const result = runGuard({
    ledger: [
      ledgerRecord(),
      { version: extraVersion, name: controlName, statements: [] },
    ],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`name malformado no ledger para ${extraVersion}`));
  assert.match(result.stderr, /ledger_name="db\\nonly\\u001b\[31m"/);
  assert.match(result.stderr, /normalized_name="db\\nonly\\u001b\[31m"/);
  assert.doesNotMatch(result.stderr, /db\nonly/);
  assert.doesNotMatch(result.stderr, /\u001b/);
});

test('registro extra preserva whitespace do ledger e normaliza em campo separado', () => {
  const extraVersion = '20260829050100';
  const result = runGuard({
    ledger: [
      ledgerRecord(),
      { version: extraVersion, name: `  ${extraVersion}_db_only.sql  `, statements: [] },
    ],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`name malformado no ledger para ${extraVersion}`));
  assert.match(
    result.stderr,
    new RegExp(`ledger_name="  ${extraVersion}_db_only\\.sql  "`),
  );
  assert.match(result.stderr, /normalized_name="db_only"/);
});

test('registro extra distingue nome whitespace-only de null', () => {
  const extraVersion = '20260829050100';
  const result = runGuard({
    ledger: [
      ledgerRecord(),
      { version: extraVersion, name: '   ', statements: [] },
    ],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`name malformado no ledger para ${extraVersion}`));
  assert.match(result.stderr, /ledger_name="   " normalized_name=""/);
  assert.doesNotMatch(result.stderr, /ledger_name=null/);
});

test('registro extra comments-only distingue statements mesmo com SQL canonico vazio', () => {
  const extraVersion = '20260829050100';
  const secret = 'comentario-sensivel-do-ledger';
  const extraStatements = [`-- ${secret}`];
  const result = runGuard({
    ledger: [
      ledgerRecord(),
      { version: extraVersion, name: 'comments_only', statements: extraStatements },
    ],
  });
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    new RegExp(`ledger_statements_sha256=${statementsHash(extraStatements)}`),
  );
  assert.match(result.stderr, new RegExp(`ledger_sql_sha256=${sha256('')}`));
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
});

test('falha fechado para saida malformada do psql fake', () => {
  const result = runGuard({ ledger: ['nao-e-json'] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /registro invalido no ledger/);
});

test('rejeita schema_version anterior e campos desconhecidos no manifesto', () => {
  const oldSchema = runGuard({ schemaVersion: 1, destino: false });
  assert.equal(oldSchema.status, 1);
  assert.match(oldSchema.stderr, /schema_version do manifesto deve ser 2/);

  const commentOnly = '-- registro historico sem statements recuperados\n';
  const unknownField = runGuard({
    files: { [FILE]: commentOnly },
    destino: false,
    evidence: [{ ...commentOnlyEvidence(commentOnly), extra: true }],
  });
  assert.equal(unknownField.status, 1);
  assert.match(unknownField.stderr, /campos ausentes ou desconhecidos/);
});

test('rejeita manifesto fora de ordem estrita e hashes que nao sejam lowercase', () => {
  const firstVersion = '20260829040000';
  const firstFile = `${firstVersion}_first.sql`;
  const secondVersion = '20260829030000';
  const secondFile = `${secondVersion}_second.sql`;
  const firstContent = '-- primeiro registro historico\n';
  const secondContent = '-- segundo registro historico\n';
  const result = runGuard({
    destino: false,
    files: { [firstFile]: firstContent, [secondFile]: secondContent },
    evidence: [
      commentOnlyEvidence(firstContent, [], {
        version: firstVersion,
        filename: firstFile,
        file_sha256: sha256(firstContent).toUpperCase(),
        ledger_name: 'first',
      }),
      commentOnlyEvidence(secondContent, [], {
        version: secondVersion,
        filename: secondFile,
        file_sha256: sha256(secondContent),
        ledger_name: 'second',
      }),
    ],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ordem estritamente crescente/);
  assert.match(result.stderr, /file_sha256 invalido/);
});

test('manifesto nao pode pinar ledger_name com whitespace; exige reconciliacao', () => {
  const statements = [OTHER_SQL.trim()];
  const result = runGuard({
    destino: false,
    evidence: [pinnedEvidence({
      statements,
      overrides: { ledger_name: ' create_demo ' },
    })],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ledger_name invalido/);
});

test('comment-only fixa o array integral do ledger e rejeita SQL canonico', () => {
  const commentOnly = '-- registro historico sem statements recuperados\n';
  const changedStatements = runGuard({
    files: { [FILE]: commentOnly },
    ledger: [ledgerRecord({ statements: ['-- comentario alterado'] })],
    evidence: [commentOnlyEvidence(commentOnly)],
  });
  assert.equal(changedStatements.status, 1);
  assert.match(changedStatements.stderr, /ledger_statements_sha256 divergente/);

  const executableLedger = [SQL.trim()];
  const hasSql = runGuard({
    files: { [FILE]: commentOnly },
    ledger: [ledgerRecord({ statements: executableLedger })],
    evidence: [commentOnlyEvidence(commentOnly, executableLedger)],
  });
  assert.equal(hasSql.status, 1);
  assert.match(hasSql.stderr, /comment-only exige ledger sem SQL canonico/);
});

test('aceita pinned-replay somente quando todas as dimensoes estao fixadas', () => {
  const statements = [OTHER_SQL.trim()];
  const result = runGuard({
    ledger: [ledgerRecord({ statements })],
    evidence: [pinnedEvidence({ statements })],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 conteudo\(s\)\/hash\(es\) historico\(s\) verificado\(s\)/);
});

test('pinned-replay falha para adulteracao independente de arquivo e SQL local', () => {
  const statements = [OTHER_SQL.trim()];
  const changedBytes = runGuard({
    files: { [FILE]: `${SQL}-- comentario local alterado\n` },
    ledger: [ledgerRecord({ statements })],
    evidence: [pinnedEvidence({ statements })],
  });
  assert.equal(changedBytes.status, 1);
  assert.match(changedBytes.stderr, /file_sha256 divergente/);

  const changedSqlHash = runGuard({
    ledger: [ledgerRecord({ statements })],
    evidence: [pinnedEvidence({ statements, overrides: { file_sql_sha256: '0'.repeat(64) } })],
  });
  assert.equal(changedSqlHash.status, 1);
  assert.match(changedSqlHash.stderr, /file_sql_sha256 divergente/);
});

test('pinned-replay falha para adulteracao independente de statements, SQL e nome do ledger', () => {
  const statements = [OTHER_SQL.trim()];
  const changedStatements = runGuard({
    ledger: [ledgerRecord({ statements: [...statements, '-- comentario novo'] })],
    evidence: [pinnedEvidence({ statements })],
  });
  assert.equal(changedStatements.status, 1);
  assert.match(changedStatements.stderr, /ledger_statements_sha256 divergente/);

  const changedSql = runGuard({
    ledger: [ledgerRecord({ statements: [SQL.trim()] })],
    evidence: [pinnedEvidence({ statements })],
  });
  assert.equal(changedSql.status, 1);
  assert.match(changedSql.stderr, /ledger_(statements|sql)_sha256 divergente/);

  const changedName = runGuard({
    ledger: [ledgerRecord({ name: 'create_demo_changed', statements })],
    evidence: [pinnedEvidence({ statements })],
  });
  assert.equal(changedName.status, 1);
  assert.match(changedName.stderr, /ledger_name divergente do manifesto/);

  const whitespaceName = runGuard({
    ledger: [ledgerRecord({ name: ' create_demo ', statements })],
    evidence: [pinnedEvidence({ statements })],
  });
  assert.equal(whitespaceName.status, 1);
  assert.match(whitespaceName.stderr, /ledger_name divergente do manifesto/);
});

test('pinned-replay rejeita reason desconhecido, related fora de colisao e nome generico divergente', () => {
  const statements = [OTHER_SQL.trim()];
  const unknownReason = runGuard({
    destino: false,
    evidence: [pinnedEvidence({ statements, reason: 'qualquer-coisa' })],
  });
  assert.equal(unknownReason.status, 1);
  assert.match(unknownReason.stderr, /reason nao permitido/);

  const relatedOutsideCollision = runGuard({
    destino: false,
    evidence: [pinnedEvidence({ statements, related_migration: {} })],
  });
  assert.equal(relatedOutsideCollision.status, 1);
  assert.match(relatedOutsideCollision.stderr, /related_migration deve ser null/);

  const genericName = runGuard({
    destino: false,
    evidence: [pinnedEvidence({ statements, overrides: { ledger_name: 'outro_nome' } })],
  });
  assert.equal(genericName.status, 1);
  assert.match(genericName.stderr, /ledger_name so pode divergir/);
});

test('pinned-replay obsoleto falha quando nome e SQL voltam a coincidir', () => {
  const statements = [SQL.trim()];
  const result = runGuard({
    ledger: [ledgerRecord({ statements })],
    evidence: [pinnedEvidence({ statements })],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pinned-replay obsoleta/);
});

test('pinned-replay nao pode autorizar arquivo executavel com ledgerSql vazio', () => {
  const statements = ['-- apenas resumo em comentario'];
  const result = runGuard({
    ledger: [ledgerRecord({ statements })],
    evidence: [pinnedEvidence({
      statements,
      overrides: { ledger_sql_sha256: sha256('') },
    })],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pinned-replay exige ledgerSql canonico nao vazio/);
});

test('markers invalidos ou conflitantes continuam falhando sob pinned-replay', () => {
  const malformed = ['-- file-sha256: invalido', OTHER_SQL.trim()];
  const malformedResult = runGuard({
    ledger: [ledgerRecord({ statements: malformed })],
    evidence: [pinnedEvidence({ statements: malformed })],
  });
  assert.equal(malformedResult.status, 1);
  assert.match(malformedResult.stderr, /marcador file-sha256 invalido/);

  const conflicting = [
    `-- sql-sha256: ${'1'.repeat(64)}`,
    `-- sql-sha256: ${'2'.repeat(64)}`,
    OTHER_SQL.trim(),
  ];
  const conflictResult = runGuard({
    ledger: [ledgerRecord({ statements: conflicting })],
    evidence: [pinnedEvidence({ statements: conflicting })],
  });
  assert.equal(conflictResult.status, 1);
  assert.match(conflictResult.stderr, /hashes SQL conflitantes/);
});

test('valida marker sql-sha256 normal e rejeita divergente ou malformado', () => {
  const valid = runGuard({
    ledger: [ledgerRecord({ statements: [`-- sql-sha256: ${fixtureSqlHash()}`] })],
  });
  assert.equal(valid.status, 0, valid.stderr);

  const divergent = runGuard({
    ledger: [ledgerRecord({ statements: [`-- sql-sha256: ${'0'.repeat(64)}`] })],
  });
  assert.equal(divergent.status, 1);
  assert.match(divergent.stderr, /hash SQL divergente/);

  const malformed = runGuard({
    ledger: [ledgerRecord({ statements: ['-- sql-sha256: invalido'] })],
  });
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /marcador sql-sha256 invalido/);
});

test('referencia source stale nao vence nome e SQL exatos', () => {
  const statements = [SQL.trim(), '-- source: 20260829050000_nome_antigo.sql'];
  const result = runGuard({ ledger: [ledgerRecord({ statements })] });
  assert.equal(result.status, 0, result.stderr);
});

test('referencia source stale nao vence nome e file-sha256 exatos', () => {
  const statements = [
    '-- source: 20260829050000_nome_antigo.sql',
    `-- file-sha256: ${sha256(SQL)}`,
  ];
  const result = runGuard({ ledger: [ledgerRecord({ statements })] });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 conteudo\(s\)\/hash\(es\) historico\(s\) verificado\(s\)/);
});

test('referencia source stale nao vence nome e sql-sha256 exatos', () => {
  const statements = [
    '-- source: 20260829050000_nome_antigo.sql',
    `-- sql-sha256: ${fixtureSqlHash()}`,
  ];
  const result = runGuard({ ledger: [ledgerRecord({ statements })] });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 conteudo\(s\)\/hash\(es\) historico\(s\) verificado\(s\)/);
});

test('referencia source stale exige nome exato mesmo com hash exato', () => {
  const statements = [
    '-- source: 20260829050000_nome_antigo.sql',
    `-- file-sha256: ${sha256(SQL)}`,
  ];
  const result = runGuard({
    ledger: [ledgerRecord({ name: 'outro_nome', statements })],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /nome divergente/);
  assert.match(result.stderr, /fonte divergente/);
});

test('referencia source stale sem prova forte continua fail-closed', () => {
  const statements = ['-- source: 20260829050000_nome_antigo.sql'];
  const result = runGuard({ ledger: [ledgerRecord({ statements })] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fonte divergente/);
});

test('referencia source stale nao mascara file-sha256 conflitante', () => {
  const statements = [
    '-- source: 20260829050000_nome_antigo.sql',
    `-- file-sha256: ${sha256(SQL)}`,
    `-- file-sha256: ${'0'.repeat(64)}`,
  ];
  const result = runGuard({ ledger: [ledgerRecord({ statements })] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /hashes de arquivo conflitantes/);
  assert.match(result.stderr, /fonte divergente/);
});

test('referencia source stale exige uma unica ocorrencia do mesmo hash', () => {
  const marker = `-- file-sha256: ${sha256(SQL)}`;
  const statements = [
    '-- source: 20260829050000_nome_antigo.sql',
    marker,
    marker,
  ];
  const result = runGuard({ ledger: [ledgerRecord({ statements })] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fonte divergente/);
});

test('referencia source divergente falha com SQL divergente sem excecao pinned', () => {
  const statements = [OTHER_SQL.trim(), '-- source: 20260829050000_nome_antigo.sql'];
  const result = runGuard({ ledger: [ledgerRecord({ statements })] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fonte divergente/);
  assert.match(result.stderr, /conteudo SQL divergente/);
});

test('referencia source historica e aceita somente por excecao pinned integral', () => {
  const statements = [OTHER_SQL.trim(), '-- source: 20260829050000_nome_antigo.sql'];
  const result = runGuard({
    ledger: [ledgerRecord({ statements })],
    evidence: [pinnedEvidence({ statements })],
  });
  assert.equal(result.status, 0, result.stderr);
});

test('falhas do guard nunca registram statements brutos', () => {
  const secret = 'segredo-sql-nao-pode-aparecer';
  const result = runGuard({
    ledger: [ledgerRecord({ statements: [`SELECT '${secret}'`] })],
  });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
  assert.match(result.stderr, /conteudo SQL divergente/);
});

test('aceita version-collision completa e ainda valida o registro proprio do related', () => {
  const fixture = collisionFixture();
  const result = runGuard(fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 conteudo\(s\)\/hash\(es\) historico\(s\) verificado\(s\)/);

  const driftedRelatedLedger = runGuard({
    ...fixture,
    ledger: [fixture.ledger[0], { ...fixture.ledger[1], statements: [SQL.trim()] }],
  });
  assert.equal(driftedRelatedLedger.status, 1);
  assert.match(driftedRelatedLedger.stderr, /conteudo SQL divergente/);
});

test('version-collision falha sem related, com related anterior ou nome incoerente', () => {
  const withoutRelated = runGuard({
    destino: false,
    evidence: [pinnedEvidence({
      reason: 'version-collision',
      related_migration: null,
      overrides: { ledger_name: 'create_legacy_demo' },
    })],
  });
  assert.equal(withoutRelated.status, 1);
  assert.match(withoutRelated.stderr, /related_migration completo/);

  const fixture = collisionFixture();
  const earlier = {
    ...fixture.evidence[0],
    related_migration: {
      ...fixture.evidence[0].related_migration,
      version: '20260829040000',
      filename: '20260829040000_create_legacy_demo.sql',
    },
  };
  const earlierResult = runGuard({ destino: false, evidence: [earlier] });
  assert.equal(earlierResult.status, 1);
  assert.match(earlierResult.stderr, /related_migration posterior/);

  const wrongName = {
    ...fixture.evidence[0],
    related_migration: {
      ...fixture.evidence[0].related_migration,
      filename: `${RELATED_VERSION}_outro_nome.sql`,
    },
  };
  const wrongNameResult = runGuard({ destino: false, evidence: [wrongName] });
  assert.equal(wrongNameResult.status, 1);
  assert.match(wrongNameResult.stderr, /nome do related_migration/);
});

test('version-collision falha para related orfa ou adulterada', () => {
  const fixture = collisionFixture();
  const orphan = runGuard({
    files: { [FILE]: SQL },
    ledger: [fixture.ledger[0]],
    evidence: fixture.evidence,
  });
  assert.equal(orphan.status, 1);
  assert.match(orphan.stderr, /related_migration orfa/);

  const changedRelated = runGuard({
    ...fixture,
    files: { ...fixture.files, [RELATED_FILE]: `${OTHER_SQL}-- adulterado\n` },
  });
  assert.equal(changedRelated.status, 1);
  assert.match(changedRelated.stderr, /file_sha256 do related_migration divergente/);
});

test('version-collision rejeita reuso e cadeias do related_migration', () => {
  const fixture = collisionFixture();
  const secondVersion = '20260829055000';
  const secondFile = `${secondVersion}_create_second.sql`;
  const secondEvidence = {
    ...fixture.evidence[0],
    version: secondVersion,
    filename: secondFile,
    file_sha256: sha256(SQL),
    file_sql_sha256: fixtureSqlHash(),
  };
  const reused = runGuard({
    destino: false,
    files: { ...fixture.files, [secondFile]: SQL },
    evidence: [fixture.evidence[0], secondEvidence],
  });
  assert.equal(reused.status, 1);
  assert.match(reused.stderr, /related_migration reutilizada/);

  const chainTarget = {
    ...fixture.evidence[0],
    version: RELATED_VERSION,
    filename: RELATED_FILE,
    file_sha256: sha256(OTHER_SQL),
    file_sql_sha256: fixtureSqlHash('legacy_demo'),
    ledger_name: 'create_final_demo',
    related_migration: {
      version: '20260829070000',
      filename: '20260829070000_create_final_demo.sql',
      file_sha256: sha256(SQL),
      file_sql_sha256: fixtureSqlHash(),
    },
  };
  const chained = runGuard({
    destino: false,
    files: {
      ...fixture.files,
      '20260829070000_create_final_demo.sql': SQL,
    },
    evidence: [fixture.evidence[0], chainTarget],
  });
  assert.equal(chained.status, 1);
  assert.match(chained.stderr, /ciclo\/cadeia de version-collision/);
});
