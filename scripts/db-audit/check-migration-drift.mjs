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
const SHA256_RE = /^[a-f0-9]{64}$/;
const LEDGER_STATEMENTS_HASH_DOMAIN = 'zapp-migration-ledger-statements-v1\0';
const COMMENT_ONLY_KIND = 'ledger-only/comment-only';
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
  return {
    values: [...values],
    invalid: markerCount !== validCount,
    occurrences: markerCount,
  };
}

function normalizeLedgerName(version, name) {
  let normalized = path.basename(name.trim());
  if (normalized.endsWith('.sql')) normalized = normalized.slice(0, -4);
  if (normalized.startsWith(version + '_')) normalized = normalized.slice(15);
  return normalized;
}

function hasExactKeys(value, expectedKeys) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expectedKeys].sort());
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
  if (document?.schema_version !== 2) errors.push('schema_version do manifesto deve ser 2');
  if (!Array.isArray(document?.exceptions)) errors.push('exceptions deve ser um array');

  const exceptions = [];
  const rawExceptions = Array.isArray(document?.exceptions) ? document.exceptions : [];
  let previousVersion = null;
  for (const [index, item] of rawExceptions.entries()) {
    const label = `excecao ${index + 1}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${label} deve ser um objeto`);
      continue;
    }

    if (typeof item.version === 'string' && /^\d{14}$/.test(item.version)) {
      if (previousVersion !== null && item.version <= previousVersion) {
        errors.push('exceptions deve estar em ordem estritamente crescente por version');
      }
      previousVersion = item.version;
    }

    const expectedKeys = item.kind === COMMENT_ONLY_KIND
      ? [
        'file_sha256', 'filename', 'justification', 'kind', 'ledger_name',
        'ledger_statements_sha256', 'version',
      ]
      : item.kind === PINNED_REPLAY_KIND
        ? [
          'file_sha256', 'file_sql_sha256', 'filename', 'justification', 'kind',
          'ledger_name', 'ledger_sql_sha256', 'ledger_statements_sha256',
          'reason', 'related_migration', 'version',
        ]
        : null;
    if (!expectedKeys) {
      errors.push(`${label} possui kind nao permitido`);
      continue;
    }
    if (!hasExactKeys(item, expectedKeys)) {
      errors.push(`${label} possui campos ausentes ou desconhecidos`);
      continue;
    }

    let valid = true;
    const fail = (message) => {
      errors.push(`${label} ${message}`);
      valid = false;
    };
    const match = typeof item.filename === 'string' ? item.filename.match(FILE_NAME_RE) : null;
    if (typeof item.version !== 'string' || !/^\d{14}$/.test(item.version)) {
      fail('possui version invalida');
    }
    if (!match || match[1] !== item.version) {
      fail('possui filename invalido ou de outra versao');
    }
    if (typeof item.file_sha256 !== 'string' || !SHA256_RE.test(item.file_sha256)) {
      fail('possui file_sha256 invalido');
    }
    if (typeof item.ledger_statements_sha256 !== 'string'
        || !SHA256_RE.test(item.ledger_statements_sha256)) {
      fail('possui ledger_statements_sha256 invalido');
    }
    if (typeof item.ledger_name !== 'string'
        || item.ledger_name !== item.ledger_name.trim()
        || item.ledger_name.length === 0
        || item.ledger_name.length > 255
        || /[\0-\x1f\x7f]/u.test(item.ledger_name)) {
      fail('possui ledger_name invalido');
    }
    if (typeof item.justification !== 'string'
        || item.justification !== item.justification.trim()
        || item.justification.length < 40
        || item.justification.length > 1000) {
      fail('precisa de justificativa factual entre 40 e 1000 caracteres');
    }

    if (item.kind === COMMENT_ONLY_KIND) {
      if (match && typeof item.ledger_name === 'string'
          && normalizeLedgerName(item.version, item.ledger_name) !== match[2]) {
        fail('possui ledger_name divergente do filename');
      }
    } else {
      if (typeof item.file_sql_sha256 !== 'string' || !SHA256_RE.test(item.file_sql_sha256)) {
        fail('possui file_sql_sha256 invalido');
      }
      if (typeof item.ledger_sql_sha256 !== 'string' || !SHA256_RE.test(item.ledger_sql_sha256)) {
        fail('possui ledger_sql_sha256 invalido');
      }
      if (!PINNED_REPLAY_REASONS.has(item.reason)) fail('possui reason nao permitido');

      const ledgerName = match && typeof item.ledger_name === 'string'
        ? normalizeLedgerName(item.version, item.ledger_name)
        : null;
      if (item.reason === 'version-collision') {
        if (ledgerName !== null && ledgerName === match[2]) {
          fail('version-collision exige ledger_name divergente do filename principal');
        }
        const related = item.related_migration;
        const relatedKeys = ['file_sha256', 'file_sql_sha256', 'filename', 'version'];
        if (!related || typeof related !== 'object' || Array.isArray(related)
            || !hasExactKeys(related, relatedKeys)) {
          fail('version-collision exige related_migration completo');
        } else {
          const relatedMatch = typeof related.filename === 'string'
            ? related.filename.match(FILE_NAME_RE)
            : null;
          if (typeof related.version !== 'string' || !/^\d{14}$/.test(related.version)) {
            fail('possui related_migration.version invalida');
          }
          if (!relatedMatch || relatedMatch[1] !== related.version) {
            fail('possui related_migration.filename invalido ou de outra versao');
          }
          if (typeof related.file_sha256 !== 'string' || !SHA256_RE.test(related.file_sha256)) {
            fail('possui related_migration.file_sha256 invalido');
          }
          if (typeof related.file_sql_sha256 !== 'string'
              || !SHA256_RE.test(related.file_sql_sha256)) {
            fail('possui related_migration.file_sql_sha256 invalido');
          }
          if (typeof related.version === 'string' && typeof item.version === 'string'
              && related.version <= item.version) {
            fail('version-collision exige related_migration posterior');
          }
          if (relatedMatch && ledgerName !== null && relatedMatch[2] !== ledgerName) {
            fail('nome do related_migration deve corresponder ao ledger_name');
          }
        }
      } else {
        if (item.related_migration !== null) {
          fail('related_migration deve ser null fora de version-collision');
        }
        if (ledgerName !== null && ledgerName !== match[2]) {
          fail('ledger_name so pode divergir do filename em version-collision');
        }
      }
    }

    if (valid) exceptions.push(item);
  }

  const versions = new Set();
  const filenames = new Set();
  const relatedVersions = new Set();
  for (const item of exceptions) {
    if (versions.has(item.version)) errors.push(`versao duplicada no manifesto: ${item.version}`);
    if (filenames.has(item.filename)) errors.push(`filename duplicado no manifesto: ${item.filename}`);
    versions.add(item.version);
    filenames.add(item.filename);
    if (item.kind === PINNED_REPLAY_KIND && item.related_migration) {
      const relatedVersion = item.related_migration.version;
      if (relatedVersions.has(relatedVersion)) {
        errors.push(`related_migration reutilizada no manifesto: ${relatedVersion}`);
      }
      relatedVersions.add(relatedVersion);
    }
  }
  for (const item of exceptions) {
    if (item.kind === PINNED_REPLAY_KIND && item.related_migration
        && relatedVersions.has(item.version)) {
      errors.push(`ciclo/cadeia de version-collision no manifesto: ${item.version}`);
    }
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
    if (exception.file_sha256 !== migration.rawHash) {
      errors.push(`file_sha256 divergente do manifesto em ${migration.version}`);
    }
    if (exception.kind === COMMENT_ONLY_KIND) {
      if (!migration.commentOnly) {
        const reason = migration.hasCode ? 'SQL executavel' : 'arquivo vazio ou sem SQL';
        errors.push(`excecao comment-only nao pode cobrir ${reason}: ${migration.fileName}`);
      }
    } else {
      if (!migration.hasCode) {
        errors.push(`excecao pinned-replay exige SQL executavel: ${migration.fileName}`);
      }
      if (exception.file_sql_sha256 !== migration.sqlHash) {
        errors.push(`file_sql_sha256 divergente do manifesto em ${migration.version}`);
      }
    }
  }
  for (const exception of evidence.exceptions) {
    if (!migrationsByVersion.has(exception.version)) {
      errors.push(`excecao orfa no manifesto: ${exception.version} (${exception.filename})`);
    }
    const related = exception.kind === PINNED_REPLAY_KIND
      ? exception.related_migration
      : null;
    if (!related) continue;
    const migration = migrationsByVersion.get(related.version);
    if (!migration) {
      errors.push(`related_migration orfa no manifesto: ${related.version} (${related.filename})`);
      continue;
    }
    if (migration.fileName !== related.filename) {
      errors.push(`filename do related_migration divergente em ${exception.version}`);
    }
    if (!migration.hasCode) {
      errors.push(`related_migration exige SQL executavel em ${exception.version}`);
    }
    if (migration.rawHash !== related.file_sha256) {
      errors.push(`file_sha256 do related_migration divergente em ${exception.version}`);
    }
    if (migration.sqlHash !== related.file_sql_sha256) {
      errors.push(`file_sql_sha256 do related_migration divergente em ${exception.version}`);
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
    const errorsBeforeMigration = errors.length;
    const ledgerName = record.name
      ? normalizeLedgerName(record.version, record.name)
      : null;

    const sourceReferences = new Set();
    const sourceRe = /(?:source|fonte|file|arquivo)[^\n]{0,80}\b(\d{14}_[a-z0-9][a-z0-9_-]*\.sql)\b/giu;
    for (const statement of record.statements) {
      for (const match of statement.matchAll(sourceRe)) sourceReferences.add(match[1]);
    }

    const fileHashMarkers = collectHashMarkers(record.statements, 'file');
    const sqlHashMarkers = collectHashMarkers(record.statements, 'sql');
    const fileHashes = fileHashMarkers.values;
    const sqlHashes = sqlHashMarkers.values;
    if (fileHashMarkers.invalid) errors.push(`marcador file-sha256 invalido no ledger para ${migration.version}`);
    if (sqlHashMarkers.invalid) errors.push(`marcador sql-sha256 invalido no ledger para ${migration.version}`);
    if (fileHashes.length > 1) errors.push(`hashes de arquivo conflitantes no ledger para ${migration.version}`);
    if (sqlHashes.length > 1) errors.push(`hashes SQL conflitantes no ledger para ${migration.version}`);

    const ledgerSql = canonicalStatements(record.statements);
    const fileSql = canonicalSql(migration.content);
    const ledgerSqlHash = sha256(ledgerSql);
    const statementsHash = ledgerStatementsSha256(record.statements);

    if (exception?.kind === COMMENT_ONLY_KIND) {
      if (!record.name) {
        errors.push(`ledger_name ausente para excecao ${migration.version}`);
      } else if (record.name !== exception.ledger_name) {
        errors.push(
          `ledger_name divergente do manifesto em ${migration.version}: `
          + `esperado=${exception.ledger_name}; ledger=${record.name}`,
        );
      }
      if (statementsHash !== exception.ledger_statements_sha256) {
        errors.push(`ledger_statements_sha256 divergente do manifesto em ${migration.version}`);
      }
      if (ledgerSql) {
        errors.push(`excecao comment-only exige ledger sem SQL canonico em ${migration.version}`);
      }
      if (fileHashes.length === 1 && fileHashes[0] !== migration.rawHash) {
        errors.push(`hash de arquivo divergente em ${migration.version}`);
      }
      if (sqlHashes.length === 1 && sqlHashes[0] !== migration.sqlHash) {
        errors.push(`hash SQL divergente em ${migration.version}`);
      }
      for (const source of sourceReferences) {
        if (source !== migration.fileName) {
          errors.push(`fonte divergente em ${migration.version}: arquivo=${migration.fileName}; ledger=${source}`);
        }
      }
      if (errors.length === errorsBeforeMigration) verifiedEvidence += 1;
      continue;
    }

    if (exception?.kind === PINNED_REPLAY_KIND) {
      if (!record.name) {
        errors.push(`ledger_name ausente para excecao ${migration.version}`);
      } else if (record.name !== exception.ledger_name) {
        errors.push(
          `ledger_name divergente do manifesto em ${migration.version}: `
          + `esperado=${exception.ledger_name}; ledger=${record.name}`,
        );
      }
      if (statementsHash !== exception.ledger_statements_sha256) {
        errors.push(`ledger_statements_sha256 divergente do manifesto em ${migration.version}`);
      }
      if (ledgerSqlHash !== exception.ledger_sql_sha256) {
        errors.push(`ledger_sql_sha256 divergente do manifesto em ${migration.version}`);
      }
      if (!ledgerSql) {
        errors.push(`excecao pinned-replay exige ledgerSql canonico nao vazio em ${migration.version}`);
      }
      if (ledgerName === migration.name && ledgerSql === fileSql) {
        errors.push(`excecao pinned-replay obsoleta em ${migration.version}`);
      }
      // Uma excecao pinned valida o array integral do ledger. Por isso referencias
      // historicas de source e markers validos nao precisam apontar para o replay.
      // Markers malformados/conflitantes continuam falhando acima.
      if (errors.length === errorsBeforeMigration) verifiedEvidence += 1;
      continue;
    }

    const namesMatch = ledgerName !== null && ledgerName === migration.name;
    if (record.name && !namesMatch) {
      errors.push(
        `nome divergente em ${migration.version}: arquivo=${migration.name}; ledger=${record.name}`,
      );
    }

    // Nome exato + uma prova de conteudo validada sao mais fortes que uma
    // referencia textual stale em comments do ledger. A mera presenca de um
    // marker nunca basta: ele precisa ser unico, bem-formado e corresponder ao
    // arquivo atual. Erros de marker continuam registrados e fail-closed acima.
    const exactFileHash = !fileHashMarkers.invalid
      && fileHashMarkers.occurrences === 1
      && fileHashes.length === 1
      && fileHashes[0] === migration.rawHash;
    const exactSqlHash = !sqlHashMarkers.invalid
      && sqlHashMarkers.occurrences === 1
      && sqlHashes.length === 1
      && sqlHashes[0] === migration.sqlHash;
    const exactCanonicalSql = Boolean(ledgerSql) && ledgerSql === fileSql;
    const strongEvidenceAndName = namesMatch
      && (exactCanonicalSql || exactFileHash || exactSqlHash);
    if (!strongEvidenceAndName) {
      for (const source of sourceReferences) {
        if (source !== migration.fileName) {
          errors.push(`fonte divergente em ${migration.version}: arquivo=${migration.fileName}; ledger=${source}`);
        }
      }
    }

    let hasEvidence = false;
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
    if (ledgerSql) {
      hasEvidence = true;
      if (ledgerSql !== fileSql) {
        errors.push(
          `conteudo SQL divergente em ${migration.version} `
          + `(arquivo=${sha256(fileSql)}, ledger=${ledgerSqlHash})`,
        );
      }
    }

    if (hasEvidence && errors.length === errorsBeforeMigration) verifiedEvidence += 1;
    else if (!hasEvidence) warnings.push(`${migration.version} (${migration.fileName})`);
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
