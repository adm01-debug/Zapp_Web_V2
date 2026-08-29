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

function ledgerRecord(overrides = {}) {
  return {
    version: VERSION,
    name: 'create_demo',
    statements: ['CREATE TABLE public.demo (id integer)'],
    ...overrides,
  };
}

function evidenceException(content, overrides = {}) {
  return {
    version: VERSION,
    filename: FILE,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    ledger_name: 'create_demo',
    kind: 'ledger-only/comment-only',
    justification: 'Fixture factual de teste para uma migration preservada somente como comentario.',
    ...overrides,
  };
}

function runGuard({
  files = { [FILE]: SQL },
  ledger = [ledgerRecord()],
  evidence = [],
  destino = true,
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
  fs.writeFileSync(evidencePath, JSON.stringify({ schema_version: 1, exceptions: evidence }));

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
  assert.match(result.stdout, /1 conteudo\(s\)\/hash\(es\) verificado\(s\)/);
});

test('aceita registro legado sem name/statements, sem inventar evidencia', () => {
  const result = runGuard({ ledger: [ledgerRecord({ name: null, statements: null })] });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /legada\(s\) sem hash\/SQL verificavel/);
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
    evidence: [evidenceException('')],
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
    evidence: [evidenceException(commentOnly)],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 conteudo\(s\)\/hash\(es\) verificado\(s\)/);
});

test('falha se o hash da excecao comment-only nao corresponde ao arquivo', () => {
  const commentOnly = '-- registro historico sem statements recuperados\n';
  const result = runGuard({
    files: { [FILE]: commentOnly },
    evidence: [evidenceException(commentOnly, { sha256: '0'.repeat(64) })],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /sha256 divergente do manifesto/);
});

test('falha se ledger_name da excecao nao corresponde ao banco', () => {
  const commentOnly = '-- registro historico sem statements recuperados\n';
  const result = runGuard({
    files: { [FILE]: commentOnly },
    ledger: [ledgerRecord({ name: 'outro_nome', statements: null })],
    evidence: [evidenceException(commentOnly)],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ledger_name divergente do manifesto/);
});

test('falha se ledger_name obrigatorio da excecao esta ausente no banco', () => {
  const commentOnly = '-- registro historico sem statements recuperados\n';
  const result = runGuard({
    files: { [FILE]: commentOnly },
    ledger: [ledgerRecord({ name: null, statements: null })],
    evidence: [evidenceException(commentOnly)],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ledger_name ausente para excecao/);
});

test('nao permite que excecao comment-only cubra SQL executavel', () => {
  const commentOnly = '-- registro historico sem statements recuperados\n';
  const result = runGuard({ evidence: [evidenceException(commentOnly)] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /excecao comment-only nao pode cobrir SQL executavel/);
});

test('falha para excecao orfa no manifesto', () => {
  const orphanVersion = '20260829050100';
  const orphanFile = `${orphanVersion}_orphan.sql`;
  const result = runGuard({
    evidence: [evidenceException('-- orfa\n', {
      version: orphanVersion,
      filename: orphanFile,
      sha256: crypto.createHash('sha256').update('-- orfa\n').digest('hex'),
      ledger_name: 'orphan',
    })],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /excecao orfa no manifesto/);
});

test('falha para manifesto com versao duplicada', () => {
  const commentOnly = '-- registro historico sem statements recuperados\n';
  const exception = evidenceException(commentOnly);
  const result = runGuard({
    files: { [FILE]: commentOnly },
    evidence: [exception, { ...exception }],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /versao duplicada no manifesto/);
});

test('falha para conteudo arbitrario quando o ledger conserva SQL aplicado', () => {
  const result = runGuard({ files: { [FILE]: 'DROP TABLE public.demo;' } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /conteudo SQL divergente/);
});

test('aceita file-sha256 explicito sem fabricar hash retroativo', () => {
  const hash = crypto.createHash('sha256').update(SQL).digest('hex');
  const result = runGuard({
    ledger: [ledgerRecord({ statements: [`-- file-sha256: ${hash}`] })],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 conteudo\(s\)\/hash\(es\) verificado\(s\)/);
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

test('falha quando banco possui versao extra sem arquivo', () => {
  const result = runGuard({
    ledger: [
      ledgerRecord(),
      {
        version: '20260829050100',
        name: 'db_only',
        statements: ['SELECT 1'],
      },
    ],
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Registro no banco sem arquivo no repo/);
});

test('falha fechado para saida malformada do psql fake', () => {
  const result = runGuard({ ledger: ['nao-e-json'] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /registro invalido no ledger/);
});
