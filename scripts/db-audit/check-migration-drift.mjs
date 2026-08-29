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
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = process.env.MIGRATIONS_DIR || 'supabase/migrations';
const EVIDENCE_PATH = process.env.MIGRATION_EVIDENCE_PATH
  || 'scripts/db-audit/migration-evidence.json';
const PSQL_BIN = process.env.PSQL_BIN || 'psql';
const url = process.env.DESTINO_URL;
const FILE_NAME_RE = /^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/;
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

/**
 * Tokeniza SQL removendo somente comentarios fora de strings/identificadores e
 * normalizando espacos/case de tokens nao quoted. Dollar-quoted bodies sao
 * preservados integralmente: mudar o corpo de uma funcao continua sendo drift.
 */
function sqlTokens(input) {
  const source = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const tokens = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];

    if (/\s/u.test(char)) {
      i += 1;
      continue;
    }

    if (char === '-' && next === '-') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < source.length && depth > 0) {
        if (source[i] === '/' && source[i + 1] === '*') {
          depth += 1;
          i += 2;
        } else if (source[i] === '*' && source[i + 1] === '/') {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      continue;
    }

    if (char === '$') {
      const opening = source.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (opening) {
        const end = source.indexOf(opening, i + opening.length);
        if (end === -1) {
          tokens.push(source.slice(i));
          break;
        }
        tokens.push(source.slice(i, end + opening.length));
        i = end + opening.length;
        continue;
      }
    }

    if (char === "'" || char === '"') {
      const quote = char;
      let token = char;
      i += 1;
      while (i < source.length) {
        token += source[i];
        if (source[i] === quote) {
          if (source[i + 1] === quote) {
            token += source[i + 1];
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      tokens.push(token);
      continue;
    }

    if (/[A-Za-z0-9_$]/u.test(char)) {
      const start = i;
      i += 1;
      while (i < source.length && /[A-Za-z0-9_$]/u.test(source[i])) i += 1;
      tokens.push(source.slice(start, i).toLowerCase());
      continue;
    }

    tokens.push(char);
    i += 1;
  }

  return tokens;
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
  let markerCount = 0;
  let validCount = 0;

  for (const statement of statements) {
    markerCount += [...statement.matchAll(marker)].length;
    for (const match of statement.matchAll(valid)) {
      values.add(match[1].toLowerCase());
      validCount += 1;
    }
  }
  return { values: [...values], invalid: markerCount !== validCount };
}

function normalizeLedgerName(version, name) {
  let normalized = path.basename(name.trim());
  if (normalized.endsWith('.sql')) normalized = normalized.slice(0, -4);
  if (normalized.startsWith(version + '_')) normalized = normalized.slice(15);
  return normalized;
}

function loadEvidence(filePath) {
  const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const errors = [];
  const expectedRootKeys = ['exceptions', 'schema_version'];
  const rootKeys = document && typeof document === 'object' && !Array.isArray(document)
    ? Object.keys(document).sort()
    : [];

  if (JSON.stringify(rootKeys) !== JSON.stringify(expectedRootKeys)) {
    errors.push('manifesto deve conter somente schema_version e exceptions');
  }
  if (document?.schema_version !== 1) errors.push('schema_version do manifesto deve ser 1');
  if (!Array.isArray(document?.exceptions)) errors.push('exceptions deve ser um array');

  const exceptions = [];
  const expectedKeys = ['filename', 'justification', 'kind', 'ledger_name', 'sha256', 'version'];
  for (const [index, item] of (Array.isArray(document?.exceptions) ? document.exceptions : []).entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`excecao ${index + 1} deve ser um objeto`);
      continue;
    }
    if (JSON.stringify(Object.keys(item).sort()) !== JSON.stringify(expectedKeys)) {
      errors.push(`excecao ${index + 1} possui campos ausentes ou desconhecidos`);
      continue;
    }
    const match = typeof item.filename === 'string' ? item.filename.match(FILE_NAME_RE) : null;
    if (typeof item.version !== 'string' || !/^\d{14}$/.test(item.version)) {
      errors.push(`excecao ${index + 1} possui version invalida`);
    }
    if (!match || match[1] !== item.version) {
      errors.push(`excecao ${index + 1} possui filename invalido ou de outra versao`);
    }
    if (typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) {
      errors.push(`excecao ${index + 1} possui sha256 invalido`);
    }
    if (typeof item.ledger_name !== 'string' || !item.ledger_name.trim()) {
      errors.push(`excecao ${index + 1} possui ledger_name invalido`);
    } else if (match && normalizeLedgerName(item.version, item.ledger_name) !== match[2]) {
      errors.push(`excecao ${index + 1} possui ledger_name divergente do filename`);
    }
    if (item.kind !== 'ledger-only/comment-only') {
      errors.push(`excecao ${index + 1} possui kind nao permitido`);
    }
    if (typeof item.justification !== 'string' || item.justification.trim().length < 20) {
      errors.push(`excecao ${index + 1} precisa de justificativa factual`);
    }
    exceptions.push(item);
  }

  const versions = new Set();
  const filenames = new Set();
  for (const item of exceptions) {
    if (versions.has(item.version)) errors.push(`versao duplicada no manifesto: ${item.version}`);
    if (filenames.has(item.filename)) errors.push(`filename duplicado no manifesto: ${item.filename}`);
    versions.add(item.version);
    filenames.add(item.filename);
  }

  return { exceptions, errors };
}

function loadMigrations(dir, evidence) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const migrations = [];
  const errors = [];
  const exceptionsByVersion = new Map(evidence.exceptions.map((item) => [item.version, item]));

  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (!entry.isFile()) {
      errors.push(`entrada nao suportada em ${dir}: ${entry.name}`);
      continue;
    }

    const match = entry.name.match(FILE_NAME_RE);
    if (!match) {
      errors.push(`nome/formato invalido: ${entry.name} (esperado: 14 digitos_nome.sql)`);
      continue;
    }

    const filePath = path.join(dir, entry.name);
    const buffer = fs.readFileSync(filePath);
    const content = buffer.toString('utf8');
    const rawHash = sha256(buffer);
    const hasCode = hasSqlCode(content);
    const blank = content.replace(/^\uFEFF/, '').trim() === '';
    const commentOnly = !hasCode && !blank && /--|\/\*/u.test(content);
    if (buffer.includes(0)) errors.push(`arquivo contem byte NUL: ${entry.name}`);
    if (!hasCode && !commentOnly) errors.push(`arquivo vazio ou sem SQL: ${entry.name}`);

    migrations.push({
      version: match[1],
      name: match[2],
      fileName: entry.name,
      content,
      rawHash,
      sqlHash: sha256(canonicalSql(content)),
      hasCode,
      commentOnly,
    });
  }

  const byVersion = new Map();
  for (const migration of migrations) {
    const group = byVersion.get(migration.version) || [];
    group.push(migration.fileName);
    byVersion.set(migration.version, group);
  }
  for (const [version, names] of byVersion) {
    if (names.length > 1) errors.push(`versao duplicada ${version}: ${names.sort().join(', ')}`);
  }

  const migrationsByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  for (const migration of migrations) {
    const exception = exceptionsByVersion.get(migration.version);
    if (migration.commentOnly && !exception) {
      errors.push(`arquivo vazio ou somente comentarios sem excecao exata: ${migration.fileName}`);
    }
    if (!exception) continue;
    if (exception.filename !== migration.fileName) {
      errors.push(`filename divergente do manifesto em ${migration.version}`);
    }
    if (exception.sha256 !== migration.rawHash) {
      errors.push(`sha256 divergente do manifesto em ${migration.version}`);
    }
    if (!migration.commentOnly) {
      const reason = migration.hasCode ? 'SQL executavel' : 'arquivo vazio ou sem SQL';
      errors.push(`excecao comment-only nao pode cobrir ${reason}: ${migration.fileName}`);
    }
  }
  for (const exception of evidence.exceptions) {
    if (!migrationsByVersion.has(exception.version)) {
      errors.push(`excecao orfa no manifesto: ${exception.version} (${exception.filename})`);
    }
  }

  return {
    migrations: migrations.sort((a, b) => a.version.localeCompare(b.version)),
    errors,
    exceptionsByVersion,
  };
}

function queryLedger() {
  try {
    return execFileSync(
      PSQL_BIN,
      [
        '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--tuples-only', '--no-align',
        '--quiet', '--dbname', url, '--command', LEDGER_QUERY,
      ],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
  } catch (error) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
    const safe = stderr ? stderr.replaceAll(url, '<DESTINO_URL>').slice(0, 2000) : 'sem detalhe';
    throw new Error(`falha ao consultar schema_migrations via psql: ${safe}`);
  }
}

function parseLedger(raw) {
  const records = [];
  const errors = [];
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);

  for (const [index, line] of lines.entries()) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      errors.push(`saida JSON invalida do ledger na linha ${index + 1}`);
      continue;
    }

    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push(`registro invalido no ledger na linha ${index + 1}`);
      continue;
    }
    if (typeof record.version !== 'string' || !/^\d{14}$/.test(record.version)) {
      errors.push(`versao invalida no ledger na linha ${index + 1}`);
      continue;
    }
    if (record.name !== null && record.name !== undefined && typeof record.name !== 'string') {
      errors.push(`name invalido no ledger para ${record.version}`);
      continue;
    }
    if (record.statements !== null && record.statements !== undefined
        && (!Array.isArray(record.statements) || record.statements.some((item) => typeof item !== 'string'))) {
      errors.push(`statements invalido no ledger para ${record.version}`);
      continue;
    }
    records.push({
      version: record.version,
      name: record.name?.trim() || null,
      statements: record.statements || [],
    });
  }

  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.version)) errors.push(`versao duplicada no ledger: ${record.version}`);
    seen.add(record.version);
  }

  return { records: records.sort((a, b) => a.version.localeCompare(b.version)), errors };
}

function compare(migrations, records, exceptionsByVersion) {
  const errors = [];
  const warnings = [];
  const byFileVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  const byLedgerVersion = new Map(records.map((record) => [record.version, record]));
  const withoutRecord = migrations.filter(({ version }) => !byLedgerVersion.has(version));
  const withoutFile = records.filter(({ version }) => !byFileVersion.has(version));
  let verifiedEvidence = 0;

  if (withoutRecord.length) {
    errors.push('Arquivo no repo sem registro no banco (db push tentaria aplicar):');
    errors.push(...withoutRecord.map(({ version, fileName }) => `  ${version}  ${fileName}`));
  }
  if (withoutFile.length) {
    errors.push('Registro no banco sem arquivo no repo (DDL fora do Git):');
    errors.push(...withoutFile.map(({ version, name }) => `  ${version}${name ? `  ${name}` : ''}`));
  }

  for (const migration of migrations) {
    const record = byLedgerVersion.get(migration.version);
    if (!record) continue;
    const exception = exceptionsByVersion.get(migration.version);

    if (record.name) {
      const ledgerName = normalizeLedgerName(record.version, record.name);
      if (ledgerName !== migration.name) {
        errors.push(
          `nome divergente em ${migration.version}: arquivo=${migration.name}; ledger=${record.name}`,
        );
      }
    }
    if (exception) {
      if (!record.name) {
        errors.push(`ledger_name ausente para excecao ${migration.version}`);
      } else if (normalizeLedgerName(record.version, record.name)
          !== normalizeLedgerName(exception.version, exception.ledger_name)) {
        errors.push(
          `ledger_name divergente do manifesto em ${migration.version}: `
          + `esperado=${exception.ledger_name}; ledger=${record.name}`,
        );
      }
    }

    const sourceReferences = new Set();
    const sourceRe = /(?:source|fonte|file|arquivo)[^\n]{0,80}\b(\d{14}_[a-z0-9][a-z0-9_-]*\.sql)\b/giu;
    for (const statement of record.statements) {
      for (const match of statement.matchAll(sourceRe)) sourceReferences.add(match[1]);
    }
    for (const source of sourceReferences) {
      if (source !== migration.fileName) {
        errors.push(`fonte divergente em ${migration.version}: arquivo=${migration.fileName}; ledger=${source}`);
      }
    }

    const fileHashMarkers = collectHashMarkers(record.statements, 'file');
    const sqlHashMarkers = collectHashMarkers(record.statements, 'sql');
    const fileHashes = fileHashMarkers.values;
    const sqlHashes = sqlHashMarkers.values;
    if (fileHashMarkers.invalid) errors.push(`marcador file-sha256 invalido no ledger para ${migration.version}`);
    if (sqlHashMarkers.invalid) errors.push(`marcador sql-sha256 invalido no ledger para ${migration.version}`);
    if (fileHashes.length > 1) errors.push(`hashes de arquivo conflitantes no ledger para ${migration.version}`);
    if (sqlHashes.length > 1) errors.push(`hashes SQL conflitantes no ledger para ${migration.version}`);

    let hasEvidence = Boolean(exception && record.name);
    if (fileHashes.length === 1) {
      hasEvidence = true;
      if (fileHashes[0] !== migration.rawHash) {
        errors.push(`hash de arquivo divergente em ${migration.version}`);
      }
    }
    if (sqlHashes.length === 1) {
      hasEvidence = true;
      if (sqlHashes[0] !== migration.sqlHash) {
        errors.push(`hash SQL divergente em ${migration.version}`);
      }
    }

    const ledgerSql = canonicalStatements(record.statements);
    if (ledgerSql) {
      hasEvidence = true;
      const fileSql = canonicalSql(migration.content);
      if (ledgerSql !== fileSql) {
        errors.push(
          `conteudo SQL divergente em ${migration.version} `
          + `(arquivo=${sha256(fileSql)}, ledger=${sha256(ledgerSql)})`,
        );
      }
    }

    if (hasEvidence) verifiedEvidence += 1;
    else warnings.push(`${migration.version} (${migration.fileName})`);
  }

  return { errors, warnings, verifiedEvidence };
}

function printErrors(errors) {
  for (const error of errors) console.error(error);
}

function main() {
  let evidence;
  let local;
  try {
    evidence = loadEvidence(EVIDENCE_PATH);
    local = loadMigrations(DIR, evidence);
  } catch (error) {
    console.error(`FALHA: nao foi possivel ler migrations/evidencias: ${error.message}`);
    return 2;
  }

  console.log(`arquivos validos em ${DIR}: ${local.migrations.length}`);
  if (evidence.errors.length || local.errors.length) {
    console.error('\nFALHA: migrations locais invalidas:');
    printErrors([...evidence.errors, ...local.errors].map((error) => `  ${error}`));
    return 1;
  }

  if (!url) {
    console.log('DESTINO_URL ausente - estrutura local validada; comparacao com ledger pulada.');
    return 0;
  }

  let parsed;
  try {
    parsed = parseLedger(queryLedger());
  } catch (error) {
    console.error(`FALHA: ${error.message}`);
    return 2;
  }

  console.log(`registros em schema_migrations: ${parsed.records.length}`);
  if (parsed.errors.length) {
    console.error('\nFALHA: ledger invalido:');
    printErrors(parsed.errors.map((error) => `  ${error}`));
    return 1;
  }

  const result = compare(local.migrations, parsed.records, local.exceptionsByVersion);
  if (result.errors.length) {
    console.error('\nFALHA: drift de migrations detectado:');
    printErrors(result.errors.map((error) => `  ${error}`));
    console.error('\nVer docs/MIGRATIONS.md para o procedimento de reconciliacao.');
    return 1;
  }

  if (result.warnings.length) {
    console.warn(
      `ATENCAO: ${result.warnings.length} migration(s) legada(s) sem hash/SQL verificavel no ledger; `
      + 'versao e nome disponivel foram validados.',
    );
    for (const warning of result.warnings) console.warn(`  ${warning}`);
  }

  console.log(
    `OK: ${local.migrations.length} versoes unicas; nomes coerentes; `
    + `${result.verifiedEvidence} conteudo(s)/hash(es) verificado(s).`,
  );
  return 0;
}

process.exitCode = main();
