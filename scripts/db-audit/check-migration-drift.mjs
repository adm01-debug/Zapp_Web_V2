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
const KNOWN_FIELDS = {
  [COMMENT_ONLY_KIND]: new Set([
    'version', 'filename', 'file_sha256', 'ledger_name', 'ledger_statements_sha256',
    'kind', 'justification',
  ]),
  [NAME_ONLY_KIND]: new Set([
    'version', 'filename', 'file_sha256', 'ledger_name', 'kind', 'justification',
  ]),
  [PINNED_REPLAY_KIND]: new Set([
    'version', 'filename', 'file_sha256', 'file_sql_sha256', 'ledger_name',
    'ledger_statements_sha256', 'ledger_sql_sha256', 'kind', 'reason',
    'related_migration', 'justification', 'sql-sha256',
  ]),
};
const SOURCE_ANNOTATION_RE = /^--\s*source:\s*\S/u;
const FILE_SHA_ANNOTATION_RE = /^--\s*file-sha256:\s*([a-f0-9]{64})/iu;
const SQL_SHA_ANNOTATION_RE = /^--\s*sql-sha256:\s*([a-f0-9]{64})/iu;
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

function escapeLogName(s) {
  return s.replace(/[\x00-\x1f\x7f]/gu, (c) => {
    if (c === '\n') return '\\n';
    if (c === '\r') return '\\r';
    if (c === '\t') return '\\t';
    return `\\u${c.codePointAt(0).toString(16).padStart(4, '0')}`;
  });
}

function normalizeRecordName(version, name) {
  let s = name.trim();
  if (s.startsWith(`${version}_`)) s = s.slice(version.length + 1);
  if (s.endsWith('.sql')) s = s.slice(0, -4);
  return s;
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
  const errors = [];
  let parsed;
  try {
    const raw = fs.readFileSync(evidencePath, 'utf8');
    parsed = JSON.parse(raw);
  } catch {
    return { data: { schema_version: 2, exceptions: [] }, errors: [] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push('migration-evidence.json invalido: nao e um objeto');
    return { data: { schema_version: 2, exceptions: [] }, errors };
  }
  if (parsed.schema_version !== 2) {
    errors.push(`migration-evidence.json invalido: schema_version do manifesto deve ser 2, encontrado ${parsed.schema_version}`);
    return { data: { schema_version: 2, exceptions: [] }, errors };
  }
  if (!Array.isArray(parsed.exceptions)) {
    errors.push('migration-evidence.json invalido: exceptions deve ser array');
    return { data: { schema_version: 2, exceptions: [] }, errors };
  }
  let prevVersion = null;
  for (const exc of parsed.exceptions) {
    if (exc && typeof exc.version === 'string') {
      if (prevVersion !== null && exc.version <= prevVersion) {
        errors.push(`migration-evidence.json invalido: excecoes fora de ordem estritamente crescente (${exc.version} apos ${prevVersion})`);
        break;
      }
      prevVersion = exc.version;
    }
  }
  const HASH_FIELDS = ['file_sha256', 'file_sql_sha256', 'ledger_statements_sha256', 'ledger_sql_sha256', 'sql-sha256'];
  for (const exc of parsed.exceptions) {
    if (!exc || typeof exc !== 'object') continue;
    for (const field of HASH_FIELDS) {
      const val = exc[field];
      if (val !== undefined && (typeof val !== 'string' || val !== val.toLowerCase() || !SHA256_RE.test(val))) {
        errors.push(`migration-evidence.json invalido: ${field} invalido (nao e hex minusculo) em ${exc.version ?? '(sem version)'}`);
      }
    }
  }
  return { data: parsed, errors };
}

function buildExceptionsByVersion(exceptions) {
  const byVersion = new Map();
  const errors = [];
  for (const exc of exceptions) {
    if (!exc?.version) continue;
    const { version } = exc;
    if (byVersion.has(version)) {
      errors.push(`versao duplicada no manifesto: ${version}`);
    } else {
      byVersion.set(version, exc);
    }
  }
  return { byVersion, errors };
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
  const knownFields = KNOWN_FIELDS[kind];
  if (!knownFields) {
    errors.push(`${version}: kind desconhecido '${kind}'`);
    return errors;
  }
  const unknownFields = Object.keys(exc).filter((k) => !knownFields.has(k));
  if (unknownFields.length > 0) {
    errors.push(`${version}: campos ausentes ou desconhecidos: ${unknownFields.join(', ')}`);
  }
  if (kind === COMMENT_ONLY_KIND) {
    if (!exc.file_sha256 || !SHA256_RE.test(exc.file_sha256)) {
      errors.push(`${version}: kind=${kind} exige 'file_sha256' valido`);
    }
  } else if (kind === NAME_ONLY_KIND) {
    if (!exc.file_sha256 || !SHA256_RE.test(exc.file_sha256)) {
      errors.push(`${version}: kind=${kind} exige 'file_sha256' valido`);
    }
    if (!exc.ledger_name || typeof exc.ledger_name !== 'string') {
      errors.push(`${version}: kind=${kind} exige 'ledger_name' valido`);
    }
  } else if (kind === PINNED_REPLAY_KIND) {
    if (!PINNED_REPLAY_REASONS.has(exc.reason)) {
      errors.push(
        `${version}: reason nao permitido para kind=${kind}: '${exc.reason}'; permitidos: {${[...PINNED_REPLAY_REASONS].join(', ')}}`,
      );
    }
    if (!exc['sql-sha256'] || !SHA256_RE.test(exc['sql-sha256'])) {
      errors.push(`${version}: kind=${kind} exige 'sql-sha256' valido`);
    }
    if (exc.reason === 'version-collision') {
      const rel = exc.related_migration;
      if (
        !rel
        || typeof rel !== 'object'
        || !rel.version
        || typeof rel.version !== 'string'
        || !rel.filename
        || typeof rel.filename !== 'string'
        || !rel.file_sha256
        || !SHA256_RE.test(rel.file_sha256)
      ) {
        errors.push(
          `${version}: version-collision exige related_migration completo (version, filename, file_sha256)`,
        );
      } else if (rel.version <= version) {
        errors.push(
          `${version}: version-collision exige related_migration posterior (encontrado ${rel.version})`,
        );
      } else {
        const rm = rel.filename.match(FILE_NAME_RE);
        if (!rm || rm[1] !== rel.version) {
          errors.push(`${version}: nome do related_migration invalido: ${rel.filename}`);
        } else if (exc.ledger_name && rm[2] !== exc.ledger_name) {
          errors.push(
            `${version}: nome do related_migration (${rm[2]}) incompativel com ledger_name (${exc.ledger_name})`,
          );
        }
      }
    } else if (exc.related_migration != null) {
      errors.push(`${version}: related_migration deve ser null para reason=${exc.reason}`);
    }
    if (exc.ledger_name !== undefined) {
      if (typeof exc.ledger_name !== 'string' || exc.ledger_name !== exc.ledger_name.trim()) {
        errors.push(`${version}: ledger_name invalido (nao pode ter espacos iniciais/finais)`);
      } else if (exc.reason !== 'version-collision') {
        const fm = exc.filename?.match(FILE_NAME_RE);
        const slug = fm?.[2];
        if (slug && exc.ledger_name && exc.ledger_name !== slug) {
          errors.push(`${version}: ledger_name so pode divergir com reason=version-collision`);
        }
      }
    }
  }
  return errors;
}

function parseMigrationFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  // O lexer deve receber o arquivo inteiro: ';' pode pertencer a uma string,
  // identificador ou corpo de funcao. Cortar por regex corrompe o SQL e seus
  // hashes (e remover comentarios antes do lexer altera corpos dollar-quoted).
  const statements = [raw];
  const hasSql = hasSqlCode(raw);
  const hasContent = raw.trim().length > 0;
  return { statements, hasSql, hasContent };
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
  const { data: evidence, errors: evidenceErrors } = loadEvidence(evidencePath);
  errors.push(...evidenceErrors);
  const { byVersion: exceptionsByVersion, errors: buildErrors } = buildExceptionsByVersion(evidence.exceptions);
  errors.push(...buildErrors);

  for (const entry of entries.sort()) {
    if (!entry.endsWith('.sql')) continue;
    const m = entry.match(FILE_NAME_RE);
    if (!m) {
      errors.push(`nome/formato invalido: ${entry}`);
      continue;
    }
    const version = m[1];
    const filePath = path.join(migrationsDir, entry);
    const { statements, hasSql, hasContent } = parseMigrationFile(filePath);
    const fileSha256 = computeFileSha256(filePath);
    migrations.push({ version, fileName: entry, filePath, statements, hasSql, hasContent, fileSha256 });
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

  const filesByVersion = new Map(migrations.map((m) => [m.version, m]));
  for (const [excVersion] of exceptionsByVersion) {
    if (!filesByVersion.has(excVersion)) {
      errors.push(`excecao orfa no manifesto: ${excVersion}`);
    }
  }
  const relatedVersionsUsed = new Map();
  for (const [excVersion, exc] of exceptionsByVersion) {
    if (exc.kind !== PINNED_REPLAY_KIND || exc.reason !== 'version-collision') continue;
    const rel = exc.related_migration;
    if (!rel?.version || !rel?.filename) continue;
    const relExc = exceptionsByVersion.get(rel.version);
    if (relExc?.kind === PINNED_REPLAY_KIND && relExc?.reason === 'version-collision') {
      errors.push(`${excVersion}: ciclo/cadeia de version-collision via ${rel.version}`);
      continue;
    }
    if (relatedVersionsUsed.has(rel.version)) {
      errors.push(
        `${excVersion}: related_migration reutilizada (${rel.version} ja referenciada por ${relatedVersionsUsed.get(rel.version)})`,
      );
    } else {
      relatedVersionsUsed.set(rel.version, excVersion);
    }
    const relMigration = filesByVersion.get(rel.version);
    if (!relMigration) {
      errors.push(`${excVersion}: related_migration orfa: ${rel.version} nao encontrado em migrations/`);
      continue;
    }
    if (relMigration.fileSha256 !== rel.file_sha256) {
      errors.push(`${excVersion}: file_sha256 do related_migration divergente para ${rel.version}`);
    }
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
      errors.push(`registro invalido no ledger: ${line.slice(0, 80)}`);
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
  return statements.map(canonicalSql).filter(Boolean).join(' ; ');
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
  const { version, statements: fileStmts, fileSha256, fileName } = migration;
  const { statements: ledgerStmts, name: ledgerName } = record;
  const exc = exceptionsByVersion.get(version);

  if (exc?.kind === COMMENT_ONLY_KIND) {
    const errs = [];
    if (exc.file_sha256 !== fileSha256) {
      errs.push(
        `${version}: file_sha256 divergente do manifesto: esperado ${exc.file_sha256}, encontrado ${fileSha256}`,
      );
    }
    if (!ledgerName) {
      errs.push(`${version}: ledger_name ausente para excecao`);
    } else if (exc.ledger_name && exc.ledger_name !== ledgerName) {
      errs.push(
        `${version}: ledger_name divergente do manifesto: esperado ${exc.ledger_name}, encontrado ${ledgerName}`,
      );
    }
    const excLedgerStmtsSha = exc.ledger_statements_sha256;
    if (excLedgerStmtsSha !== undefined) {
      const actualLedgerStmtsSha = ledgerStatementsSha256(ledgerStmts ?? []);
      if (excLedgerStmtsSha !== actualLedgerStmtsSha) {
        errs.push(`${version}: ledger_statements_sha256 divergente: esperado=${excLedgerStmtsSha}; ledger=${actualLedgerStmtsSha}`);
      }
    }
    if (canonicalStatements(ledgerStmts ?? []).length > 0) {
      errs.push(`${version}: comment-only exige ledger sem SQL canonico`);
    }
    return errs;
  }

  if (exc?.kind === NAME_ONLY_KIND) {
    const errs = [];
    if (exc.file_sha256 !== fileSha256) {
      errs.push(
        `${version}: file_sha256 divergente do manifesto: esperado ${exc.file_sha256}, encontrado ${fileSha256}`,
      );
    }
    if (exc.ledger_name !== ledgerName) {
      errs.push(
        `${version}: ledger_name divergente do manifesto: esperado ${exc.ledger_name}, encontrado ${ledgerName}`,
      );
    }
    if (ledgerStmts && ledgerStmts.length > 0) {
      const hasRealSql = ledgerStmts.some(looksLikeSqlEvidence);
      if (hasRealSql) {
        errs.push(`${version}: name-and-file-pinned exige ledger sem SQL/hash historico`);
      }
    }
    return errs;
  }

  if (!ledgerStmts || ledgerStmts.length === 0) {
    if (!exc && !ledgerName) return [];
    return [
      `statements IS NULL ou vazio para ${version} no ledger (sem excecao em migration-evidence.json)`,
    ];
  }

  if (exc?.kind === PINNED_REPLAY_KIND) {
    const excLedgerSha = exc.ledger_statements_sha256 ?? exc['sql-sha256'];
    const actualLedgerSha = ledgerStatementsSha256(ledgerStmts);
    if (excLedgerSha !== actualLedgerSha) {
      return [`${version}: ledger_statements_sha256 divergente: esperado=${excLedgerSha}; ledger=${actualLedgerSha}`];
    }
    if (exc.ledger_sql_sha256 === sha256('')) {
      return [`${version}: pinned-replay exige ledgerSql canonico nao vazio`];
    }
    if (exc.file_sha256 !== fileSha256) {
      return [`${version}: file_sha256 divergente: esperado ${exc.file_sha256}, encontrado ${fileSha256}`];
    }
    const actualFileSqlSha = sha256(canonicalStatements(fileStmts));
    if (exc.file_sql_sha256 !== actualFileSqlSha) {
      return [`${version}: file_sql_sha256 divergente: esperado ${exc.file_sql_sha256}, encontrado ${actualFileSqlSha}`];
    }
    if (exc.ledger_name && exc.ledger_name !== ledgerName) {
      return [`${version}: ledger_name divergente do manifesto: esperado ${exc.ledger_name}, encontrado ${ledgerName}`];
    }
    const ledgerFileMarkers = collectHashMarkers(ledgerStmts, 'file');
    if (ledgerFileMarkers.has('MALFORMED')) {
      return [`${version}: marcador file-sha256 invalido`];
    }
    const ledgerSqlMarkers = collectHashMarkers(ledgerStmts, 'ledger');
    if (ledgerSqlMarkers.size > 1) {
      return [`${version}: hashes SQL conflitantes`];
    }
    const canonicalFile = canonicalStatements(fileStmts);
    const canonicalLedger = canonicalStatements(ledgerStmts);
    const actualLedgerSqlSha = sha256(canonicalLedger);
    if (exc.ledger_sql_sha256 !== actualLedgerSqlSha) {
      return [`${version}: ledger_sql_sha256 divergente: esperado=${exc.ledger_sql_sha256}; ledger=${actualLedgerSqlSha}`];
    }
    if (canonicalFile === canonicalLedger) {
      return [`${version}: pinned-replay obsoleta`];
    }
    const fileMarkers = collectHashMarkers(fileStmts, 'file');
    if (fileMarkers.size > 0) {
      for (const marker of fileMarkers) {
        if (marker === 'MALFORMED') {
          return [`${version}: marcador file-sha256 malformado no arquivo`];
        }
        if (!ledgerSqlMarkers.has(marker) && marker !== fileSha256) {
          return [
            `${version}: pinned-replay: file-sha256 ${marker} nao encontrado no ledger nem igual ao sha256 do arquivo atual`,
          ];
        }
      }
      return [];
    }
    // Todas as dimensoes da excecao foram verificadas acima. Uma divergencia
    // endpoint-literal-update revisada nao exige marker adicional no SQL.
    return [];
  }

  const hasFileSha256Annotation = ledgerStmts.some((s) => /^--\s*file-sha256:/i.test(s));
  if (hasFileSha256Annotation && !ledgerStmts.some((s) => SOURCE_ANNOTATION_RE.test(s))) {
    const validHashes = ledgerStmts
      .map((s) => FILE_SHA_ANNOTATION_RE.exec(s)?.[1])
      .filter(Boolean);
    if (validHashes.length === 0) {
      return [`${version}: marcador file-sha256 invalido`];
    }
    if (!validHashes.some((h) => h === fileSha256)) {
      return [`${version}: hash de arquivo divergente`];
    }
    return [];
  }

  const sqlSha256Markers = collectHashMarkers(ledgerStmts, 'ledger');
  const hasSqlSha256Annotation = sqlSha256Markers.size > 0
    && !ledgerStmts.some((s) => SOURCE_ANNOTATION_RE.test(s));

  if (hasSqlSha256Annotation) {
    if (sqlSha256Markers.has('MALFORMED')) {
      return [`${version}: marcador sql-sha256 invalido`];
    }
    if (sqlSha256Markers.size > 1) {
      return [`${version}: hashes SQL conflitantes`];
    }
    const [sqlSha] = sqlSha256Markers;
    const fileCanonical = canonicalStatements(fileStmts);
    const expectedSqlSha = sha256(fileCanonical);
    if (sqlSha !== expectedSqlSha) {
      return [`${version}: hash SQL divergente`];
    }
    return [];
  }

  const ledgerHasSourceRef = ledgerStmts.some((s) => SOURCE_ANNOTATION_RE.test(s));
  if (ledgerHasSourceRef) {
    const errs = [];
    const slug = fileName.match(FILE_NAME_RE)?.[2];
    if (slug && ledgerName && slug !== ledgerName) {
      errs.push(`${version}: nome divergente (arquivo: ${slug}, ledger: ${ledgerName})`);
    }
    if (errs.length > 0) {
      errs.push(`${version}: fonte divergente`);
      return errs;
    }
    const isAnnotationStmt = (s) =>
      SOURCE_ANNOTATION_RE.test(s) || FILE_SHA_ANNOTATION_RE.test(s) || SQL_SHA_ANNOTATION_RE.test(s);
    const realStmts = ledgerStmts.filter((s) => !isAnnotationStmt(s));
    if (realStmts.length > 0) {
      const sqlErrs = diffStatements(fileStmts, realStmts, version);
      if (sqlErrs.length > 0) return [...sqlErrs, `${version}: fonte divergente`];
      return [];
    }
    const fileHashes = ledgerStmts
      .map((s) => FILE_SHA_ANNOTATION_RE.exec(s)?.[1])
      .filter(Boolean);
    const uniqueFileHashes = new Set(fileHashes);
    if (uniqueFileHashes.size > 1) {
      return [`${version}: hashes de arquivo conflitantes no ledger`, `${version}: fonte divergente`];
    }
    if (fileHashes.length > uniqueFileHashes.size) {
      return [`${version}: fonte divergente`];
    }
    if (fileHashes.length > 0) {
      if (fileHashes[0] === fileSha256) return [];
    }
    const sqlHashes = ledgerStmts
      .map((s) => SQL_SHA_ANNOTATION_RE.exec(s)?.[1])
      .filter(Boolean);
    if (sqlHashes.length > 0) {
      const fileCanonical = canonicalStatements(fileStmts);
      const expectedSqlSha = sha256(fileCanonical);
      if (sqlHashes.some((h) => h === expectedSqlSha)) return [];
    }
    return [`${version}: fonte divergente`];
  }

  const slug = fileName?.match(FILE_NAME_RE)?.[2];
  if (slug && ledgerName && slug !== ledgerName) {
    return [`${version}: nome divergente (arquivo: ${slug}, ledger: ${escapeLogName(ledgerName)})`];
  }

  const diffs = diffStatements(fileStmts, ledgerStmts, version);
  if (diffs.length > 0) {
    const stmts = ledgerStmts ?? [];
    if (ledgerName) diffs.push(`  ledger_name="${ledgerName}"`);
    diffs.push(`  ledger_statements_sha256=${ledgerStatementsSha256(stmts)}`);
    diffs.push(`  ledger_sql_sha256=${sha256(canonicalStatements(stmts))}`);
  }
  return diffs;
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
    if (record.name != null && !/^[a-z0-9][a-z0-9_-]*$/.test(record.name)) {
      errors.push(`name malformado no ledger para ${record.version}`);
      if (byFileVersion.has(version)) {
        const ledgerEscaped = escapeLogName(record.name);
        errors.push(`ledger="${ledgerEscaped}"`);
      }
      // records without a matching file are reported in the withoutFile section below
    }
  }

  if (withoutRecord.length) {
    applyPending.push('Arquivo no repo sem registro no banco (apply pendente — lote nao aplicado ainda):');
    applyPending.push(...withoutRecord.map(({ version, fileName }) => `  ${version}  ${fileName}`));
  }
  if (withoutFile.length) {
    errors.push('Registro no banco sem arquivo no repo (DDL fora do Git):');
    for (const record of withoutFile) {
      const label = exceptionsByVersion.has(record.version) ? ' [excecao]' : '';
      const stmts = record.statements ?? [];
      const nameField = record.name != null ? `"${escapeLogName(record.name)}"` : 'null';
      const normField =
        record.name != null
          ? `"${escapeLogName(normalizeRecordName(record.version, record.name))}"`
          : 'null';
      errors.push(
        `  version=${record.version}${label} ledger_name=${nameField} normalized_name=${normField}`,
      );
      errors.push(`  ledger_statements_sha256=${ledgerStatementsSha256(stmts)}`);
      errors.push(`  ledger_sql_sha256=${sha256(canonicalStatements(stmts))}`);
    }
  }

  for (const migration of migrations) {
    const { version } = migration;
    const record = byLedgerVersion.get(version);
    if (!record) continue;
    const stmtErrors = compareStatements(migration, record, exceptionsByVersion);
    if (stmtErrors.length) errors.push(...stmtErrors);
  }

  const legacyFixed = [];
  for (const record of records) {
    const { version, statements: recStmts, name: recName } = record;
    const migration = byFileVersion.get(version);
    if (!migration) continue;
    const exc = exceptionsByVersion.get(version);
    if (exc && exc.kind === NAME_ONLY_KIND) {
      legacyFixed.push(`${version}: ${describeException(exc)}`);
    } else if (!exc && !recName && (!recStmts || recStmts.length === 0)) {
      warnings.push(`${version}: sem nome e sem SQL no ledger, sem excecao registrada`);
    }
  }

  return { errors, applyPending, warnings, legacyFixed };
}

function validateLocalMigrations(migrations, exceptionsByVersion) {
  const errors = [];
  const seenVersions = new Map();
  const seenNames = new Map();
  for (const migration of migrations) {
    const { version, fileName, filePath, statements, hasSql, hasContent, fileSha256 } = migration;
    if (seenVersions.has(version)) {
      errors.push(`versao duplicada ${version} em ${fileName} e ${seenVersions.get(version)}`);
    } else {
      seenVersions.set(version, fileName);
    }
    const baseName = path.basename(fileName, '.sql');
    if (seenNames.has(baseName)) {
      errors.push(`nome duplicado: ${baseName} em ${fileName} e ${seenNames.get(baseName)}`);
    } else {
      seenNames.set(baseName, fileName);
    }
    if (!hasSql) {
      const exc = exceptionsByVersion?.get(version);
      const isEmpty = !hasContent;
      if (!fs.existsSync(filePath)) {
        errors.push(`arquivo nao encontrado: ${filePath}`);
      } else if (isEmpty) {
        errors.push(`arquivo vazio ou sem SQL: ${fileName}`);
        if (exc?.kind === COMMENT_ONLY_KIND) {
          errors.push(`excecao comment-only nao pode cobrir arquivo vazio ou sem SQL`);
        }
      } else {
        // has content but no executable SQL (comment-only file)
        if (exc?.kind === COMMENT_ONLY_KIND) {
          if (exc.file_sha256 !== fileSha256) {
            errors.push(`file_sha256 divergente do manifesto: ${version}`);
          }
          // allowed — validated against ledger in compareStatements
        } else if (exc?.kind === NAME_ONLY_KIND) {
          errors.push(`name-and-file-pinned exige SQL executavel: ${fileName}`);
        } else {
          errors.push(`arquivo vazio ou somente comentarios sem excecao exata: ${fileName}`);
        }
      }
    } else {
      // hasSql is true
      const exc = exceptionsByVersion?.get(version);
      if (exc?.kind === COMMENT_ONLY_KIND) {
        errors.push(`excecao comment-only nao pode cobrir SQL executavel: ${fileName}`);
      }
      if (
        (exc?.kind === NAME_ONLY_KIND || exc?.kind === PINNED_REPLAY_KIND) &&
        exc.file_sha256 !== fileSha256
      ) {
        errors.push(`file_sha256 divergente do manifesto: ${version}`);
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

  const localValidationErrors = validateLocalMigrations(local.migrations, local.exceptionsByVersion);
  if (localValidationErrors.length) {
    console.error('\nFALHA: migrations locais invalidas:');
    printErrors(localValidationErrors.map((e) => `  ${e}`));
    return 1;
  }

  if (!url) {
    console.log(`OK: estrutura local validada — ${local.migrations.length} migrations locais validas (sem DESTINO_URL, ledger nao consultado).`);
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
  const legacyFixed = result.legacyFixed ?? [];
  const legacyCount = legacyFixed.length;
  const verifiedCount = totalLedger - result.warnings.length - legacyCount;
  const legacyStr = legacyCount > 0 ? `, ${legacyCount} arquivo(s) legado(s) fixado(s) sem prova de conteudo historico` : '';
  console.log(`OK: ${totalMigrations} migrations locais, ${totalLedger} no ledger, sem drift. ${verifiedCount} conteudo(s)/hash(es) historico(s) verificado(s)${legacyStr}`);
  return 0;
}

process.exitCode = main();
