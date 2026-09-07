#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VERSION_RE = /^\d{14}$/u;
const OUTPUT_PATH = process.env.LEDGER_EVIDENCE_OUTPUT
  || '/tmp/targeted-ledger-evidence.json';
const PSQL_BIN = process.env.PSQL_BIN || 'psql';

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function parseTargetVersions(input) {
  const versions = String(input || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (versions.length === 0 || versions.length > 20) {
    throw new Error('informe entre 1 e 20 versions');
  }
  if (versions.some((version) => !VERSION_RE.test(version))) {
    throw new Error('TARGET_VERSIONS possui version invalida');
  }
  if (new Set(versions).size !== versions.length) {
    throw new Error('TARGET_VERSIONS possui duplicatas');
  }
  return versions.sort();
}

export function buildLedgerQuery(versions) {
  const literals = versions.map((version) => `'${version}'`).join(', ');
  return `
SELECT json_build_object(
  'version', version,
  'name', name,
  'statements', statements
)::text
FROM supabase_migrations.schema_migrations
WHERE version IN (${literals})
ORDER BY version`;
}

export function parseLedger(raw, expectedVersions) {
  const records = String(raw).split('\n').map((line) => line.trim()).filter(Boolean).map((line, index) => {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new Error(`ledger retornou JSON invalido na linha ${index + 1}`);
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)
        || !VERSION_RE.test(record.version || '')) {
      throw new Error(`ledger retornou registro invalido na linha ${index + 1}`);
    }
    if (record.name !== null && record.name !== undefined && typeof record.name !== 'string') {
      throw new Error(`ledger retornou name invalido para ${record.version}`);
    }
    if (!Array.isArray(record.statements)
        || record.statements.some((statement) => typeof statement !== 'string')) {
      throw new Error(`ledger retornou statements invalidos para ${record.version}`);
    }
    return { version: record.version, name: record.name ?? null, statements: record.statements };
  }).sort((a, b) => a.version.localeCompare(b.version));

  const obtained = records.map(({ version }) => version);
  if (new Set(obtained).size !== obtained.length
      || JSON.stringify(obtained) !== JSON.stringify(expectedVersions)) {
    throw new Error('ledger incompleto, duplicado ou fora do escopo solicitado');
  }
  return records;
}

export function encryptEvidence(records, publicKeyPem, generatedAt = new Date().toISOString()) {
  const plaintext = Buffer.from(JSON.stringify({
    schema_version: 1,
    purpose: 'zapp-v2-targeted-migration-ledger-reconciliation',
    generated_at: generatedAt,
    records,
  }), 'utf8');
  const contentKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', contentKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const wrappedKey = crypto.publicEncrypt({
    key: publicKeyPem,
    oaepHash: 'sha256',
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  }, contentKey);
  contentKey.fill(0);

  return {
    schema_version: 1,
    purpose: 'zapp-v2-targeted-migration-ledger-reconciliation',
    generated_at: generatedAt,
    algorithms: { payload: 'aes-256-gcm', key_wrap: 'rsa-oaep-sha256' },
    versions: records.map(({ version }) => version),
    plaintext_sha256: sha256(plaintext),
    wrapped_key_base64: wrappedKey.toString('base64'),
    iv_base64: iv.toString('base64'),
    auth_tag_base64: authTag.toString('base64'),
    ciphertext_base64: ciphertext.toString('base64'),
  };
}

export function decryptEvidence(envelope, privateKeyPem) {
  if (envelope?.schema_version !== 1
      || envelope?.algorithms?.payload !== 'aes-256-gcm'
      || envelope?.algorithms?.key_wrap !== 'rsa-oaep-sha256') {
    throw new Error('envelope de evidencia invalido');
  }
  const contentKey = crypto.privateDecrypt({
    key: privateKeyPem,
    oaepHash: 'sha256',
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  }, Buffer.from(envelope.wrapped_key_base64 || '', 'base64'));
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    contentKey,
    Buffer.from(envelope.iv_base64 || '', 'base64'),
  );
  decipher.setAuthTag(Buffer.from(envelope.auth_tag_base64 || '', 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext_base64 || '', 'base64')),
    decipher.final(),
  ]);
  contentKey.fill(0);
  if (sha256(plaintext) !== envelope.plaintext_sha256) {
    throw new Error('hash da evidencia descriptografada diverge');
  }
  return JSON.parse(plaintext.toString('utf8'));
}

function safeError(stderr, connectionString) {
  return String(stderr || '')
    .replaceAll(connectionString || '', '<DESTINO_URL>')
    .replace(/postgres(?:ql)?:\/\/\S+/giu, '<DESTINO_URL>')
    .trim()
    .slice(0, 1000);
}

function main() {
  const connectionString = process.env.DESTINO_URL;
  if (!connectionString) throw new Error('DESTINO_URL ausente');
  const versions = parseTargetVersions(process.env.TARGET_VERSIONS);
  const publicKeyPem = Buffer.from(
    process.env.LEDGER_EVIDENCE_PUBLIC_KEY_BASE64 || '',
    'base64',
  ).toString('utf8');
  crypto.createPublicKey(publicKeyPem);

  let raw;
  try {
    raw = execFileSync(PSQL_BIN, [
      '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--tuples-only', '--no-align',
      '--quiet', '--dbname', connectionString, '--command', buildLedgerQuery(versions),
    ], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=15000',
      },
    });
  } catch (error) {
    throw new Error(`falha na consulta read-only: ${safeError(error?.stderr, connectionString)}`);
  }

  const records = parseLedger(raw, versions);
  const output = path.resolve(OUTPUT_PATH);
  const temporary = `${output}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(encryptEvidence(records, publicKeyPem), null, 2)}\n`, {
    encoding: 'utf8', mode: 0o600, flag: 'wx',
  });
  fs.renameSync(temporary, output);
  fs.chmodSync(output, 0o600);
  console.log(`OK: ${records.length} registros cifrados; nenhum statement foi registrado.`);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  try {
    main();
  } catch (error) {
    console.error(`FALHA: ${error.message}`);
    process.exitCode = 1;
  }
}
