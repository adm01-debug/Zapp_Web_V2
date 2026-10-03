#!/usr/bin/env node
/**
 * E65 (auditoria de GitHub Actions, 2026-10-01): o passo "Validar registro no
 * ledger" do db-migrate.yml provava apenas `count(*) = 1`. Essa prova aceita uma
 * linha cujo `statements` ficou NULL ou vazio: o registro existe, mas nao diz o
 * que foi aplicado, e a trilha perde o conteudo exato da migration.
 *
 * Passa a exigir, alem da contagem (que continua no SQL do passo):
 *   1. `statements IS NOT NULL` e `array_length(statements, 1) > 0`;
 *   2. IGUALDADE entre os statements gravados no ledger e o parse do arquivo
 *      local -- pelo `parseMigrationFile` do register-migration.mjs, o mesmo
 *      parser que a casa usa para ESCREVER o registro (CLAUDE.md orienta a
 *      gerar o SQL pelo parser em vez de transcrever a mao).
 *
 * A exigencia vale para a version alvo desta execucao. As versions antigas com
 * `statements` NULL foram corrigidas em 25/09 (CLAUDE.md) e nao passam por aqui.
 *
 * A comparacao e' pura e testavel; o CLI so' busca a linha no banco.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseMigrationFile } from './register-migration.mjs';

// `array_to_json` preserva a ordem e devolve `null` (texto) quando a coluna e
// NULL -- e' o que permite distinguir "NULL" de "array vazio".
export const SQL_STATEMENTS_DO_LEDGER = `SELECT coalesce(array_to_json(statements)::text, 'null')
  FROM supabase_migrations.schema_migrations
  WHERE version = :'target_version'
    AND name = :'target_name';`;

/**
 * @param {{ bruto: string, statementsDoArquivo: string[] }} entrada
 * @returns {{ ok: true, total: number } | { ok: false, motivo: string }}
 */
export function avaliarStatementsDoLedger({ bruto, statementsDoArquivo }) {
  const texto = String(bruto ?? '').trim();
  if (texto === '') return { ok: false, motivo: 'o ledger nao retornou linha para version+name' };
  if (texto === 'null') {
    return { ok: false, motivo: 'statements IS NULL no ledger: o registro nao guarda o que foi aplicado' };
  }
  let doLedger;
  try {
    doLedger = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: 'statements do ledger nao veio como JSON valido' };
  }
  if (!Array.isArray(doLedger)) return { ok: false, motivo: 'statements do ledger nao e um array' };
  if (doLedger.length === 0) return { ok: false, motivo: 'array_length(statements, 1) = 0' };
  if (doLedger.length !== statementsDoArquivo.length) {
    return {
      ok: false,
      motivo: `quantidade de statements difere: ledger=${doLedger.length} arquivo=${statementsDoArquivo.length}`,
    };
  }
  for (let i = 0; i < doLedger.length; i += 1) {
    if (doLedger[i] !== statementsDoArquivo[i]) {
      return { ok: false, motivo: `o statement ${i + 1} do ledger difere do arquivo` };
    }
  }
  return { ok: true, total: doLedger.length };
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const filePath = args[0];
  const targetVersion = process.env.TARGET_VERSION;
  const targetName = process.env.TARGET_NAME;
  if (!filePath || !targetVersion || !targetName) {
    console.error('Uso: TARGET_VERSION=<v> TARGET_NAME=<n> node verify-ledger-statements.mjs <arquivo.sql>');
    process.exitCode = 2;
    return;
  }
  if (!process.env.DESTINO_URL) {
    console.error('ERRO: DESTINO_URL nao definido no ambiente.');
    process.exitCode = 2;
    return;
  }

  const { statements } = parseMigrationFile(resolve(filePath));

  const psql = spawnSync(
    process.execPath,
    [resolve('scripts/db-audit/psql-safe.mjs'), '-X', '-v', 'ON_ERROR_STOP=1',
      '-v', `target_version=${targetVersion}`, '-v', `target_name=${targetName}`, '-At'],
    { input: SQL_STATEMENTS_DO_LEDGER, encoding: 'utf8' },
  );
  if (psql.error) {
    console.error('ERRO ao executar o cliente: ' + psql.error.message);
    process.exitCode = 2;
    return;
  }
  if (psql.status !== 0) {
    console.error('ERRO: consulta do ledger falhou (saida do psql preservada acima).');
    process.exitCode = 1;
    return;
  }

  const avaliacao = avaliarStatementsDoLedger({ bruto: psql.stdout, statementsDoArquivo: statements });
  if (!avaliacao.ok) {
    console.error(`::error::Registro no ledger invalido para version=${targetVersion} name=${targetName}: ${avaliacao.motivo}`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK: ledger guarda os ${avaliacao.total} statements da migration ${targetVersion}, iguais ao arquivo.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main();
}
