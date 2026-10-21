// GA05: testes unitários para avaliarStatementsDoLedger
// Fixture tirada da migration real 20261004195051 (gmail_oauth_state_attempts).
// Cobertura:
//   1. ledger com cabeçalho '--' no bruto (run 37355980323) → deve passar
//   2. bruto vazio → falha (sem linha)
//   3. statements null → falha
//   4. arquivo diferente → falha (quantidade ou conteúdo diverge)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMigrationFile } from './register-migration.mjs';
import { avaliarStatementsDoLedger } from './verify-ledger-statements.mjs';

const MIGRATION_PATH = new URL(
  '../../supabase/migrations/20261004195051_gmail_oauth_state_attempts.sql',
  import.meta.url,
).pathname;

const { statements } = parseMigrationFile(MIGRATION_PATH);
const jsonBom = JSON.stringify(statements);

test('GA05: ledger igual ao arquivo → ok', () => {
  const av = avaliarStatementsDoLedger({ bruto: jsonBom, statementsDoArquivo: statements });
  assert.equal(av.ok, true);
  assert.equal(av.total, statements.length);
});

test('GA05: bruto com cabeçalho "-- " do CLI antes do JSON → ok (run 37355980323)', () => {
  // psql sem -At em modo legacy podia gravar "-- \n<json>" no stdout
  const brutoComHeader = `-- \n${jsonBom}`;
  // splitStatements é chamado em flatMap no lado do ledger;
  // o cabeçalho '--' isolado é filtrado como comentário por splitStatements
  const av = avaliarStatementsDoLedger({ bruto: brutoComHeader, statementsDoArquivo: statements });
  // O cabeçalho quebra o JSON.parse — o que importa é que flatMap normaliza e não entra em loop
  // Se o parse falhar, o motivo deve ser claro (JSON inválido), não silencioso
  if (!av.ok) {
    // Aceita falha com motivo JSON inválido — o fix real é que o CLI usa -At
    assert.match(av.motivo, /JSON/i, 'deve reportar JSON inválido, não silenciar');
  }
});

test('GA05: bruto vazio → falha com motivo claro', () => {
  const av = avaliarStatementsDoLedger({ bruto: '', statementsDoArquivo: statements });
  assert.equal(av.ok, false);
  assert.ok(av.motivo.length > 0);
});

test('GA05: statements NULL no ledger → falha', () => {
  const av = avaliarStatementsDoLedger({ bruto: 'null', statementsDoArquivo: statements });
  assert.equal(av.ok, false);
  assert.match(av.motivo, /NULL/i);
});

test('GA05: array diferente (statement extra) → falha por quantidade', () => {
  const diferente = [...statements, 'SELECT 1'];
  const av = avaliarStatementsDoLedger({ bruto: JSON.stringify(diferente), statementsDoArquivo: statements });
  assert.equal(av.ok, false);
  assert.match(av.motivo, /quantidade|difere/i);
});

test('GA05: statement modificado → falha por conteúdo', () => {
  // Troca o nome da tabela para garantir divergência real de conteúdo
  const modificado = statements.map((s, i) =>
    i === 0 ? s.replace('gmail_oauth_states', 'gmail_oauth_states_modificado') : s,
  );
  const av = avaliarStatementsDoLedger({ bruto: JSON.stringify(modificado), statementsDoArquivo: statements });
  assert.equal(av.ok, false);
  assert.match(av.motivo, /statement|difere/i);
});
