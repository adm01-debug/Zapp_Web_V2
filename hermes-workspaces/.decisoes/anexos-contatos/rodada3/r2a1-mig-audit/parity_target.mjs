#!/usr/bin/env node
// Replicates the exact hashing/canonicalization of scripts/db-audit/check-migration-drift.mjs
// and compares the repo file against the live ledger row for one version.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sqlTokens } from './repo/scripts/db-audit/sql-lexer.mjs';

const DIR = './repo/supabase/migrations';
const TARGET = '20260930370000';
const LEDGER_JSON = './ledger_target.json';

const FILE_NAME_RE = /^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const DOMAIN = 'zapp-migration-ledger-statements-v1\0';
const SQL_STARTERS = new Set(['alter','analyze','begin','call','comment','commit','copy','create','delete','discard','do','drop','execute','grant','insert','lock','merge','notify','refresh','reindex','reset','revoke','select','set','truncate','update','vacuum','with']);

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const ledgerStatementsSha256 = (st) => sha256(DOMAIN + JSON.stringify(st));
function canonicalSql(input){ const t = sqlTokens(input); while(t.at(-1)===';') t.pop(); return t.join(' '); }
function hasSqlCode(input){ return sqlTokens(input).some((t)=>t!==';'); }
function looksLikeSqlEvidence(s){ const c=canonicalSql(s); if(!c) return false; const f=c.match(/^[a-z]+/u)?.[0]; return f?SQL_STARTERS.has(f):false; }
function canonicalStatements(st){ return st.filter(looksLikeSqlEvidence).map(canonicalSql).filter(Boolean).join(' ; '); }
function normalizeLedgerName(version,name){ let n=path.basename(name.trim()); if(n.endsWith('.sql')) n=n.slice(0,-4); if(n.startsWith(version+'_')) n=n.slice(15); return n; }

const files = fs.readdirSync(DIR).filter((f)=>f.endsWith('.sql')).filter((f)=>{const m=f.match(FILE_NAME_RE); return m && m[1]===TARGET;});
console.log('repo files matching version', TARGET, ':', files);
const fileName = files[0];
const buffer = fs.readFileSync(path.join(DIR,fileName));
const content = buffer.toString('utf8');
const m = fileName.match(FILE_NAME_RE);
const fileRaw = sha256(buffer);
const fileSql = canonicalSql(content);
const fileSqlHash = sha256(fileSql);

const rec = JSON.parse(fs.readFileSync(LEDGER_JSON,'utf8'));
const ledgerSql = canonicalStatements(rec.statements);
const ledgerSqlHash = sha256(ledgerSql);
const ledgerStatementsHash = ledgerStatementsSha256(rec.statements);
const ledgerNameNorm = normalizeLedgerName(rec.version, rec.name);

const out = {
  version: TARGET,
  file: {
    fileName,
    raw_sha256: fileRaw,
    sql_sha256: fileSqlHash,
    canonical_sql: fileSql,
    raw_bytes: buffer.length,
    has_sql_code: hasSqlCode(content),
  },
  ledger: {
    name: rec.name,
    normalized_name: ledgerNameNorm,
    statements_count: rec.statements.length,
    statements_sha256: ledgerStatementsHash,
    sql_sha256: ledgerSqlHash,
    canonical_sql: ledgerSql,
  },
  checks: {
    name_match: ledgerNameNorm === m[2],
    canonical_sql_match: ledgerSql === fileSql,
    sql_sha256_match: ledgerSqlHash === fileSqlHash,
    file_uniqueness_for_version: files.length === 1,
    file_has_BEGIN_line: /^begin\b/im.test(content),
    file_has_sql_code: hasSqlCode(content),
  },
};
console.log(JSON.stringify(out, null, 2));
