#!/usr/bin/env node
/**
 * Valida supabase/migrations e compara cada migration com
 * supabase_migrations.schema_migrations no banco de destino.
 *
 * A validacao local sempre roda. A comparacao com o ledger so e pulada quando
 * DESTINO_URL nao foi fornecida. Diretorios (inclusive _foreign e _superseded)
 * ficam fora do escopo, como no glob supabase/migrations/*.sql.
 *
 * Variaveis auxiliares para testes offline:
 *   MIGRATIONS_DIR  diretorio de fixtures (padrao: supabase/migrations)
 *   MIGRATION_EVIDENCE_PATH manifesto de excecoes (padrao abaixo)
 *   PSQL_BIN        executavel psql/fake (padrao: psql; nunca passa por shell)
 *   LEDGER_RETRY_DELAYS_MS  atrasos (ms, separados por virgula) entre novas
 *                   tentativas de consulta ao ledger apos falha transitoria
 *                   de conexao com o pooler (padrao: 5000,15000). String vazia
 *                   desliga este retry -- use quando o transporte ja repete
 *                   (PSQL_CONNECT_RETRIES em psql-environment.mjs), senao as
 *                   duas camadas se multiplicam.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withPsqlEnvironment } from './psql-environment.mjs';
import { sqlTokens } from './sql-lexer.mjs';

const DIR = process.env.MIGRATIONS_DIR || 'supabase/migrations';
const EVIDENCE_PATH = process.env.MIGRATION_EVIDENCE_PATH
  || 'scripts/db-audit/migration-evidence.json';
const PSQL_BIN = process.env.PSQL_BIN || 'psql';
const url = process.env.DESTINO_URL;
const FILE_NAME_RE = /^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const LEDGER_STATEMENTS_HASH_DOMAIN = 'zapp-migration-ledger-statements-v1\0';
const COMMENT_ONLY_KIND = 'ledger-only/comment-only';
const NAME_ONLY_KIND = 'ledger-only/name-and-file-pinned';
const PINNED_REPLAY_KIND = 'ledger-divergence/pinned-replay';
const PINNED_REPLAY_REASONS = new Set([
  'endpoint-literal-update',
  'ledger-summary',
  'safer-replay',
  'format-only',
  'version-collision',
]);
const LEDGER_QUERY = `
SELECT json_build_object(
  'version', version,
  'name', name,
  'statements', statements
)::text
FROM supabase_migrations.schema_migrations
ORDER BY version`;

const SQL_STARTERS = new Set([
  'alter', 'analyze', 'begin', 'call', 'comment', 'commit', 'copy', 'create',
  'delete', 'discard', 'do', 'drop', 'execute', 'grant', 'insert', 'lock',
  'merge', 'notify', 'refresh', 'reindex', 'reset', 'revoke', 'select', 'set',
  'truncate', 'update', 'vacuum', 'with',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function ledgerStatementsSha256(statements) {
  return sha256(LEDGER_STATEMENTS_HASH_DOMAIN + JSON.stringify(statements));
}

function canonicalSql(input) {
  const tokens = sqlTokens(input);
  while (tokens.at(-1) === ';') tokens.pop();
  return tokens.join(' ');
}

function hasSqlCode(input) {
  return sqlTokens(input).some((token) => token !== ';');
}

function looksLikeSqlEvidence(statement) {
  const canonical = canonicalSql(statement);
  if (!canonical) return false;
  const first = canonical.match(/^[a-z]+/u)?.[0];
  return first ? SQL_STARTERS.has(first) : false;
}

function canonicalStatements(statements) {
  return statements
    .filter(looksLikeSqlEvidence)
    .map(canonicalSql)
    .filter(Boolean)
    .join(' ; ');
}

function collectHashMarkers(statements, label) {
  const values = new Set();
  const prefix = label === 'file' ? 'file-sha256' : 'sql-sha256';
  const marker = new RegExp(`--\\s*${prefix}\\s*[:=]`, 'giu');
  const valid = new RegExp(
    `--\\s*${prefix}\\s*[:=]\\s*([a-f0-9]{64})(?![a-z0-9])`,
    'giu',
  );
  for (const stmt of statements) {
    if (!marker.test(stmt)) continue;
    marker.lastIndex = 0;
    const matches = [...stmt.matchAll(valid)];
    if (matches.length === 0) {
      values.add('MALFORMED');
    } else {
      for (const m of matches) values.add(m[1]);
    }
  }
  return values;
}

function parseRecord(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadEvidence(evidencePath) {
  try {
    const raw = fs.readFileSync(evidencePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return { exceptions: {} };
    if (Array.isArray(data)) return { exceptions: {} };
    return data;
  } catch {
    return { exceptions: {} };
  }
}

function buildExceptionsByVersion(evidence) {
  const byVersion = new Map();
  const exceptions = evidence?.exceptions ?? {};
  for (const [version, exc] of Object.entries(exceptions)) {
    byVersion.set(version, exc);
  }
  return byVersion;
}

function describeException(exc) {
  const { kind } = exc;
  if (kind === COMMENT_ONLY_KIND) {
    return `ledger so tem comentario (kind=${kind}); arquivo verificado por hash`;
  }
  if (kind === NAME_ONLY_KIND) {
    return `ledger so tem nome e hash do arquivo (kind=${kind}); conteudo SQL verificado por hash do arquivo`;
  }
  if (kind === PINNED_REPLAY_KIND) {
    return `divergencia de replay fixada (kind=${kind}; reason=${exc.reason})`;
  }
  return `excecao desconhecida (kind=${kind})`;
}

function validateException(exc) {
  const errors = [];
  const { kind, version } = exc;
  if (!version || typeof version !== 'string') {
    errors.push('excecao sem version valida');
    return errors;
  }
  if (kind === COMMENT_ONLY_KIND) {
    if (!exc['file-sha256'] || !SHA256_RE.test(exc['file-sha256'])) {
      errors.push(`${version}: kind=${kind} exige 'file-sha256' valido`);
    }
  } else if (kind === NAME_ONLY_KIND) {
    if (!exc['file-sha256'] || !SHA256_RE.test(exc['file-sha256'])) {
      errors.push(`${version}: kind=${kind} exige 'file-sha256' valido`);
    }
    if (!exc.name || typeof exc.name !== 'string') {
      errors.push(`${version}: kind=${kind} exige 'name' valido`);
    }
  } else if (kind === PINNED_REPLAY_KIND) {
    if (!PINNED_REPLAY_REASONS.has(exc.reason)) {
      errors.push(
        `${version}: kind=${kind} exige reason em {${[...PINNED_REPLAY_REASONS].join(', ')}}; encontrado '${exc.reason}'`,
      );
    }
    if (!exc['sql-sha256'] || !SHA256_RE.test(exc['sql-sha256'])) {
      errors.push(`${version}: kind=${kind} exige 'sql-sha256' valido`);
    }
  } else {
    errors.push(`${version}: kind desconhecido '${kind}'`);
  }
  return errors;
}

function parseMigrationFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const withoutHeader = raw.replace(/^--[^\n]*\n/gmu, '');
  const chunks = withoutHeader.split(/;\s*(?=\S|$)/u);
  const statements = chunks
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && c !== ';');
  return { statements };
}

function splitStatements(statement) {
  return statement
    .split(/;(?=\s|$)/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function computeFileSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return sha256(content);
}

function collectLocal(migrationsDir, evidencePath) {
  const entries = fs.readdirSync(migrationsDir);
  const migrations = [];
  const errors = [];
  const evidence = loadEvidence(evidencePath);
  const exceptionsByVersion = buildExceptionsByVersion(evidence);

  for (const entry of entries.sort()) {
    if (!entry.endsWith('.sql')) continue;
    const m = entry.match(FILE_NAME_RE);
    if (!m) {
      errors.push(`nome de arquivo invalido: ${entry}`);
      continue;
    }
    const version = m[1];
    const filePath = path.join(migrationsDir, entry);
    const { statements } = parseMigrationFile(filePath);
    const fileSha256 = computeFileSha256(filePath);
    migrations.push({ version, fileName: entry, filePath, statements, fileSha256 });
  }

  const exceptionValidationErrors = [];
  for (const [version, exc] of exceptionsByVersion) {
    const excWithVersion = { ...exc, version };
    const errs = validateException(excWithVersion);
    if (errs.length) exceptionValidationErrors.push(...errs);
  }
  if (exceptionValidationErrors.length) {
    errors.push('Excecoes invalidas em migration-evidence.json:');
    errors.push(...exceptionValidationErrors.map((e) => `  ${e}`));
  }

  return { migrations, errors, exceptionsByVersion };
}

function queryLedger(ledgerRetryDelays) {
  const retryDelays = ledgerRetryDelays
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map(Number)
    .filter((n) => !Number.isNaN(n) && n >= 0);

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    if (attempt > 0) {
      const delay = retryDelays[attempt - 1];
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
    }
    let output;
    let exitCode;
    try {
      withPsqlEnvironment(url, (env) => {
        output = execFileSync(PSQL_BIN, ['-X', '-At'], {
          input: LEDGER_QUERY,
          env,
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
        });
        exitCode = 0;
      });
    } catch (err) {
      exitCode = err.status ?? 1;
      output = err.stdout ?? '';
      const stderr = err.stderr ?? '';
      const isTransportFailure = (
        /timeout expired/i.test(stderr)
        || /connection to server .* failed/i.test(stderr)
        || /could not connect/i.test(stderr)
        || /ECONNREFUSED/i.test(stderr)
      );
      const errText = (stderr || err.message || 'erro desconhecido').split('\n')[0];
      if (!isTransportFailure || attempt >= retryDelays.length) {
        console.error(`\nFALHA: falha ao consultar schema_migrations via psql: ${errText}`);
        return { output: output ?? '', exitCode };
      }
      const total = retryDelays.length + 1;
      console.warn(`\nAVISO: falha transitoria de conexao (tentativa ${attempt + 1}/${total}): ${errText}`);
      continue;
    }
    return { output, exitCode: 0 };
  }
  return { output: '', exitCode: 1 };
}

function parseLedger(raw) {
  const lines = raw.split('\n').filter((l) => l.trim());
  const records = [];
  const errors = [];
  for (const line of lines) {
    const parsed = parseRecord(line);
    if (!parsed || typeof parsed.version !== 'string') {
      errors.push(`linha invalida no ledger: ${line.slice(0, 80)}`);
      continue;
    }
    records.push(parsed);
  }
  return { records, errors };
}

function printErrors(lines) {
  for (const line of lines) console.error(line);
}

function normalizeStatementsForComparison(statements) {
  return statements.map(canonicalSql).join(' ; ');
}

function fileStatements(migration) {
  return migration.statements;
}

function buildLedgerStatementsSummary(statements) {
  if (!statements || statements.length === 0) return '(vazio)';
  const joined = statements.join(' | ');
  return joined.length > 200 ? joined.slice(0, 197) + '...' : joined;
}

function diffStatements(fileStmts, ledgerStmts, version) {
  const fileNorm = normalizeStatementsForComparison(fileStmts);
  const ledgerNorm = normalizeStatementsForComparison(ledgerStmts);
  if (fileNorm === ledgerNorm) return [];
  const fileHash = crypto.createHash('sha256').update(fileNorm).digest('hex').slice(0, 16);
  const ledgerHash = crypto.createHash('sha256').update(ledgerNorm).digest('hex').slice(0, 16);
  return [
    `${version}: conteudo SQL divergente (arquivo sha256:${fileHash} ledger sha256:${ledgerHash})`,
  ];
}

function compareStatements(migration, record, exceptionsByVersion) {
  const { version, statements: fileStmts, fileSha256 } = migration;
  const { statements: ledgerStmts, name: ledgerName } = record;
  const exc = exceptionsByVersion.get(version);

  if (!ledgerStmts || ledgerStmts.length === 0) {
    if (exc?.kind === COMMENT_ONLY_KIND) {
      const excSha = exc['file-sha256'];
      if (excSha !== fileSha256) {
        return [
          `${version}: excecao comment-only mas hash do arquivo mudou: esperado ${excSha}, encontrado ${fileSha256}`,
        ];
      }
      return [];
    }
    if (exc?.kind === NAME_ONLY_KIND) {
      const excSha = exc['file-sha256'];
      const excName = exc.name;
      if (excSha !== fileSha256) {
        return [
          `${version}: excecao name-only mas hash do arquivo mudou: esperado ${excSha}, encontrado ${fileSha256}`,
        ];
      }
      if (excName !== ledgerName) {
        return [
          `${version}: excecao name-only mas name no ledger mudou: esperado ${excName}, encontrado ${ledgerName}`,
        ];
      }
      return [];
    }
    return [
      `statements IS NULL ou vazio para ${version} no ledger (sem excecao em migration-evidence.json)`,
    ];
  }

  if (exc?.kind === PINNED_REPLAY_KIND) {
    const excSha = exc['sql-sha256'];
    const canonicalFile = canonicalStatements(fileStmts);
    const canonicalLedger = canonicalStatements(ledgerStmts);
    if (excSha !== ledgerStatementsSha256(ledgerStmts)) {
      return [
        `${version}: excecao pinned-replay mas hash do ledger mudou (alguem editou o ledger); remover a excecao`,
      ];
    }
    const fileMarkers = collectHashMarkers(fileStmts, 'file');
    const ledgerMarkers = collectHashMarkers(ledgerStmts, 'ledger');
    if (fileMarkers.size > 0) {
      for (const marker of fileMarkers) {
        if (marker === 'MALFORMED') {
          return [`${version}: marcador file-sha256 malformado no arquivo`];
        }
        if (!ledgerMarkers.has(marker) && marker !== fileSha256) {
          return [
            `${version}: pinned-replay: file-sha256 ${marker} nao encontrado no ledger nem igual ao sha256 do arquivo atual`,
          ];
        }
      }
      return [];
    }
    if (canonicalFile === canonicalLedger) return [];
    if (
      !PINNED_REPLAY_REASONS.has(exc.reason)
      || (exc.reason === 'endpoint-literal-update' && fileMarkers.size === 0)
    ) {
      return diffStatements(fileStmts, ledgerStmts, version);
    }
    return [];
  }

  return diffStatements(fileStmts, ledgerStmts, version);
}

function compare(migrations, records, exceptionsByVersion) {
  const errors = [];
  // W21: apply-pending = arquivo local sem ledger (esperado no fluxo de lote
  // diario). Separado de `errors` para que --classificar possa retornar exit 2
  // (neutral) quando *so* apply-pending existir, sem mascarar drift real.
  const applyPending = [];
  const warnings = [];
  const byFileVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  const byLedgerVersion = new Map(records.map((record) => [record.version, record]));
  const withoutRecord = migrations.filter(({ version }) => !byLedgerVersion.has(version));
  const withoutFile = records.filter(({ version }) => !byFileVersion.has(version));

  for (const record of records) {
    const { version } = record;
    if (!FILE_NAME_RE.test(record.name ?? '')) {
      errors.push(`name malformado no ledger para ${record.version}`);
    }
  }

  if (withoutRecord.length) {
    applyPending.push('Arquivo no repo sem registro no banco (apply pendente — lote nao aplicado ainda):');
    applyPending.push(...withoutRecord.map(({ version, fileName }) => `  ${version}  ${fileName}`));
  }
  if (withoutFile.length) {
    errors.push('Registro no banco sem arquivo no repo (DDL fora do Git):');
    errors.push(...withoutFile.map((record) => {
      const label = exceptionsByVersion.has(record.version) ? ' [excecao]' : '';
      return `  ${record.version}${label}  ${record.name ?? '(sem nome)'}`;
    }));
  }

  for (const migration of migrations) {
    const { version } = migration;
    const record = byLedgerVersion.get(version);
    if (!record) continue;
    const stmtErrors = compareStatements(migration, record, exceptionsByVersion);
    if (stmtErrors.length) errors.push(...stmtErrors);
  }

  for (const record of records) {
    const { version } = record;
    const migration = byFileVersion.get(version);
    if (!migration) continue;
    const exc = exceptionsByVersion.get(version);
    if (exc) {
      warnings.push(`${version}: ${describeException(exc)}`);
    }
  }

  return { errors, applyPending, warnings };
}

function validateLocalMigrations(migrations) {
  const errors = [];
  const seenVersions = new Map();
  const seenNames = new Map();
  for (const migration of migrations) {
    const { version, fileName, filePath, statements } = migration;
    if (seenVersions.has(version)) {
      errors.push(`version duplicada: ${version} em ${fileName} e ${seenVersions.get(version)}`);
    } else {
      seenVersions.set(version, fileName);
    }
    const baseName = path.basename(fileName, '.sql');
    if (seenNames.has(baseName)) {
      errors.push(`nome duplicado: ${baseName} em ${fileName} e ${seenNames.get(baseName)}`);
    } else {
      seenNames.set(baseName, fileName);
    }
    if (statements.length === 0) {
      if (!fs.existsSync(filePath)) {
        errors.push(`arquivo nao encontrado: ${filePath}`);
      } else {
        errors.push(`arquivo vazio ou sem statements validos: ${fileName}`);
      }
    }
  }
  return errors;
}

function validateLedger(records) {
  const errors = [];
  const seenVersions = new Map();
  for (const record of records) {
    const { version, name } = record;
    if (!version || typeof version !== 'string') {
      errors.push(`registro sem version valida`);
      continue;
    }
    if (seenVersions.has(version)) {
      errors.push(`version duplicada no ledger: ${version}`);
    } else {
      seenVersions.set(version, true);
    }
    if (!name || typeof name !== 'string') {
      errors.push(`registro sem name valido: ${version}`);
    }
  }
  return errors;
}

function main() {
  const { LEDGER_RETRY_DELAYS_MS = '5000,15000' } = process.env;
  const local = collectLocal(DIR, EVIDENCE_PATH);

  if (local.errors.length) {
    console.error('\nFALHA: erros locais:');
    printErrors(local.errors.map((e) => `  ${e}`));
    return 1;
  }

  const localValidationErrors = validateLocalMigrations(local.migrations);
  if (localValidationErrors.length) {
    console.error('\nFALHA: migrations locais invalidas:');
    printErrors(localValidationErrors.map((e) => `  ${e}`));
    return 1;
  }

  if (!url) {
    console.log(`OK: ${local.migrations.length} migrations locais validas (sem DESTINO_URL, ledger nao consultado).`);
    return 0;
  }

  const { output, exitCode: psqlExitCode } = queryLedger(LEDGER_RETRY_DELAYS_MS);
  if (psqlExitCode !== 0) {
    console.error('\nFALHA: consulta ao ledger falhou:');
    return 1;
  }

  const parsed = parseLedger(output);

  const ledgerValidationErrors = validateLedger(parsed.records);
  if (ledgerValidationErrors.length) {
    console.error('\nFALHA: registros invalidos no ledger:');
    printErrors(ledgerValidationErrors.map((e) => `  ${e}`));
    return 1;
  }

  if (parsed.errors.length) {
    console.error('\nFALHA: ledger invalido:');
    printErrors(parsed.errors.map((error) => `  ${error}`));
    return 1;
  }

  // W21: --classificar separa apply-pendente (exit 2) de drift real (exit 1).
  // Sem a flag: comportamento original — apply-pendente tambem causa exit 1.
  const classificar = process.argv.includes('--classificar');

  const result = compare(local.migrations, parsed.records, local.exceptionsByVersion);

  if (result.applyPending.length) {
    console.warn('\nATENCAO: migrations aguardando apply (arquivo local sem ledger):');
    for (const line of result.applyPending) console.warn(line);
    if (!classificar) {
      console.error('\nFALHA: arquivo local sem registro no banco e tratado como drift.');
      console.error('Use --classificar para tratar apply-pendente como nao-fatal (exit 2).');
    }
  }

  if (result.errors.length) {
    console.error('\nFALHA: drift de migrations detectado:');
    printErrors(result.errors.map((error) => `  ${error}`));
    console.error('\nVer docs/MIGRATIONS.md para o procedimento de reconciliacao.');
    return 1;
  }

  // Sem --classificar: apply-pendente tambem e fatal (retrocompat).
  if (!classificar && result.applyPending.length) {
    console.error('\nVer docs/MIGRATIONS.md para o procedimento de reconciliacao.');
    return 1;
  }

  // Com --classificar e so apply-pendente: exit 2 (neutral; lote ainda nao aplicado).
  if (result.applyPending.length) {
    return 2;
  }

  if (result.warnings.length) {
    console.warn(
      `ATENCAO: ${result.warnings.length} migration(s) legada(s) sem hash/SQL verificavel no ledger; `,
    );
    for (const w of result.warnings) console.warn(`  ${w}`);
  }

  const totalMigrations = local.migrations.length;
  const totalLedger = parsed.records.length;
  console.log(`OK: ${totalMigrations} migrations locais, ${totalLedger} no ledger, sem drift.`);
  return 0;
}

process.exitCode = main();
