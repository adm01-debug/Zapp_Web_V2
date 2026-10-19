// GA05: verifica que avaliarStatementsDoLedger normaliza ambos os lados com
// flatMap(splitStatements) — o CLI pode gravar o cabeçalho "-- <slug>" como
// parte do primeiro statement do ledger (run 37355980323). Sem normalização,
// o cabeçalho faz o statement diferir do arquivo e o apply é recusado.
// Fixture tirada da migration real 20261004195051 (gmail_oauth_states).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMigrationFile } from './register-migration.mjs';
import { avaliarStatementsDoLedger } from './verify-ledger-statements.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(DIR, '../../supabase/migrations/20261004195051_gmail_oauth_state_attempts.sql');

const { statements } = parseMigrationFile(FIXTURE);

test('GA05: ledger com cabeçalho "-- <slug>" no primeiro statement passa (run 37355980323)', () => {
  // Simula o que o CLI gravava: o slug do arquivo como comentário de cabeçalho
  // prefixado ao primeiro statement. Sem flatMap(splitStatements) no lado do
  // ledger isso causava "statement 1 difere do arquivo".
  const comCabecalho = [
    '-- gmail_oauth_state_attempts\n' + statements[0],
    ...statements.slice(1),
  ];
  const r = avaliarStatementsDoLedger({
    bruto: JSON.stringify(comCabecalho),
    statementsDoArquivo: statements,
  });
  assert.ok(r.ok, `esperava ok=true, got: ${JSON.stringify(r)}`);
  assert.strictEqual(r.total, statements.length);
});

test('GA05: ledger sem cabeçalho passa normalmente', () => {
  const r = avaliarStatementsDoLedger({
    bruto: JSON.stringify(statements),
    statementsDoArquivo: statements,
  });
  assert.ok(r.ok, `esperava ok=true, got: ${JSON.stringify(r)}`);
});

test('GA05: arquivo diferente continua reprovando (statement com conteúdo errado)', () => {
  const errado = [
    statements[0].replace('gmail_oauth_states', 'gmail_oauth_states_ERRADA'),
    ...statements.slice(1),
  ];
  const r = avaliarStatementsDoLedger({
    bruto: JSON.stringify(errado),
    statementsDoArquivo: statements,
  });
  assert.strictEqual(r.ok, false, 'esperava falha para statement com conteúdo errado');
  assert.match(r.motivo, /statement 1 do ledger difere do arquivo/);
});

test('GA05: arquivo diferente continua reprovando (statements a mais no ledger)', () => {
  const extra = [...statements, 'SELECT 1'];
  const r = avaliarStatementsDoLedger({
    bruto: JSON.stringify(extra),
    statementsDoArquivo: statements,
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.motivo, /quantidade de statements difere/);
});

test('GA05: statements NULL no ledger reprovam', () => {
  const r = avaliarStatementsDoLedger({ bruto: 'null', statementsDoArquivo: statements });
  assert.strictEqual(r.ok, false);
  assert.match(r.motivo, /NULL/);
});

test('GA05: ledger vazio reprovam', () => {
  const r = avaliarStatementsDoLedger({ bruto: '[]', statementsDoArquivo: statements });
  assert.strictEqual(r.ok, false);
  assert.match(r.motivo, /array_length/);
});
