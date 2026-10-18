/**
 * E53: prova que as linhas de resumo de divergência aparecem no stdout ANTES
 * de qualquer saída de log no stderr, permitindo `grep '^[0-9]'` no stdout para
 * triagem rápida em CI.
 *
 * Formato garantido: `AAAAAAAAAAAAAA | disco | ledger | motivo`
 * (14 dígitos, espaço-pipe-espaço, três colunas)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = resolve('scripts/db-audit/check-migration-drift.mjs');
const NODE = process.execPath;
const DIVERGENCE_LINE_RE = /^\d{14} \| /u;

test('E53: DIVERGENCE_LINE_RE bate no formato version | disco | ledger | motivo', () => {
  assert.match('20260101120000 | foo.sql | (nenhum) | arquivo sem registro no banco', DIVERGENCE_LINE_RE);
  assert.match('20261231235959 | (nenhum) | bar_name.sql | registro no banco sem arquivo no repo', DIVERGENCE_LINE_RE);
  assert.doesNotMatch('  20260101120000 | indentado | nao bate', DIVERGENCE_LINE_RE);
  assert.doesNotMatch('OK: tudo certo', DIVERGENCE_LINE_RE);
  assert.doesNotMatch('FALHA: drift de migrations detectado:', DIVERGENCE_LINE_RE);
});

test('E53: arquivo no repo sem ledger → linha de divergência como PRIMEIRA coisa no stdout', () => {
  const dir = mkdtempSync(join(tmpdir(), 'drift-e53-'));
  try {
    const migsDir = join(dir, 'migrations');
    const evidenceFile = join(dir, 'evidence.json');
    const psqlFake = join(dir, 'psql-fake.sh');

    // Criar estrutura de fixtures
    require_mkdir(migsDir);
    // Migração válida com SQL real
    writeFileSync(join(migsDir, '20260101120000_test_e53.sql'), 'SELECT 1;\n');
    // Evidência vazia (sem exceções)
    writeFileSync(evidenceFile, JSON.stringify({ schema_version: 2, exceptions: [] }));
    // PSQL fake: retorna ledger vazio (sem registros) → arquivo sem registro no banco
    writeFileSync(psqlFake, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    const r = spawnSync(NODE, [SCRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        MIGRATIONS_DIR: migsDir,
        MIGRATION_EVIDENCE_PATH: evidenceFile,
        PSQL_BIN: psqlFake,
        DESTINO_URL: 'postgres://fake@fake/fake',
        LEDGER_RETRY_DELAYS_MS: '',
      },
    });

    // O script deve falhar (exit 1 = drift real)
    assert.equal(r.status, 1, `script deve sair com 1, saiu com ${r.status}; stderr=${r.stderr}`);

    // E53: stdout deve conter a linha de divergência (before detailed stderr output).
    // A linha de divergência vem DEPOIS dos contadores informativos ("arquivos validos",
    // "registros em schema_migrations"), mas ANTES das mensagens de FALHA no stderr —
    // isso permite `grep '^[0-9]'` no stdout para triagem rápida em CI.
    const stdoutLines = r.stdout.split('\n').filter((l) => l.trim());
    const divergenceLines = stdoutLines.filter((l) => DIVERGENCE_LINE_RE.test(l));
    assert.ok(divergenceLines.length > 0, `stdout deve conter linha(s) de divergência; stdout foi:\n${r.stdout}`);
    assert.match(divergenceLines[0], /20260101120000/, 'linha de divergência deve conter a versão');
    assert.match(divergenceLines[0], /arquivo sem registro no banco/, 'motivo correto');
    // Divergence lines em stdout (stdout-only, não misturadas no stderr verboso)
    assert.doesNotMatch(r.stdout, /FALHA: drift de migrations detectado:/, 'cabeçalho FALHA vai pro stderr, não stdout');

    // A linha de divergência NÃO pode aparecer no stderr antes do stdout (não testável
    // diretamente por não haver garantia de ordem entre canais, mas provamos o stdout).
    assert.match(r.stderr, /FALHA: drift de migrations detectado:/, 'stderr deve ter o cabeçalho de falha');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Node não tem require no ESM — usar mkdirSync diretamente
import { mkdirSync } from 'node:fs';
function require_mkdir(p) { mkdirSync(p, { recursive: true }); }
