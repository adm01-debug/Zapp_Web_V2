#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TARGET_VERSIONS = Object.freeze([
  '20260319210215',
  '20260319210228',
  '20260827000100',
  '20260827120100',
  '20260827130000',
  '20260827130100',
  '20260827130400',
  '20260827130500',
  '20260827130600',
  '20260827180000',
  '20260827210000',
  '20260827210100',
  '20260827210200',
  '20260828200100',
  '20260828210000',
  '20260829020000',
]);

const OUTPUT_PATH = process.env.LEDGER_EVIDENCE_OUTPUT
  || '/tmp/migration-ledger-evidence.json';
const PSQL_BIN = process.env.PSQL_BIN || 'psql';
const VERSION_RE = /^\d{14}$/;

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function safeError(stderr, connectionString) {
  const raw = typeof stderr === 'string' ? stderr : String(stderr || '');
  return raw
    .replaceAll(connectionString || '', '<DESTINO_URL>')
    .replace(/postgres(?:ql)?:\/\/\S+/giu, '<DESTINO_URL>')
    .trim()
    .slice(0, 1000);
}

export function buildLedgerQuery(versions = TARGET_VERSIONS) {
  if (!Array.isArray(versions) || versions.length === 0
      || versions.some((version) => !VERSION_RE.test(version))) {
    throw new Error('lista de versions invalida');
  }
  const unique = [...new Set(versions)].sort();
  if (unique.length !== versions.length) throw new Error('lista de versions possui duplicatas');
  const literals = unique.map((version) => `'${version}'`).join(', ');
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

export function parseLedger(raw, versions = TARGET_VERSIONS) {
  const expected = [...versions].sort();
  const records = [];
  const lines = String(raw).split('\n').map((line) => line.trim()).filter(Boolean);

  for (const [index, line] of lines.entries()) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new Error(`ledger retornou JSON invalido na linha ${index + 1}`);
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`ledger retornou registro invalido na linha ${index + 1}`);
    }
    if (!VERSION_RE.test(record.version || '')) {
      throw new Error(`ledger retornou version invalida na linha ${index + 1}`);
    }
    if (record.name !== null && record.name !== undefined && typeof record.name !== 'string') {
      throw new Error(`ledger retornou name invalido para ${record.version}`);
    }
    if (record.statements !== null && record.statements !== undefined
        && (!Array.isArray(record.statements)
          || record.statements.some((statement) => typeof statement !== 'string'))) {
      throw new Error(`ledger retornou statements invalidos para ${record.version}`);
    }
    records.push({
      version: record.version,
      name: record.name?.trim() || null,
      statements: record.statements || [],
    });
  }

  records.sort((a, b) => a.version.localeCompare(b.version));
  const obtained = records.map(({ version }) => version);
  if (new Set(obtained).size !== obtained.length) {
    throw new Error('ledger retornou versions duplicadas');
  }
  if (JSON.stringify(obtained) !== JSON.stringify(expected)) {
    const missing = expected.filter((version) => !obtained.includes(version));
    const extra = obtained.filter((version) => !expected.includes(version));
    throw new Error(
      `ledger incompleto ou fora do escopo (ausentes=${missing.join(',') || '0'}; `
      + `extras=${extra.join(',') || '0'})`,
    );
  }
  return records;
}

export function encryptEvidence(records, publicKeyPem, generatedAt = new Date().toISOString()) {
  const payload = Buffer.from(JSON.stringify({
    schema_version: 1,
    purpose: 'zapp-v2-migration-ledger-reconciliation',
    generated_at: generatedAt,
    records,
  }), 'utf8');
  const contentKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', contentKey, iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const wrappedKey = crypto.publicEncrypt({
    key: publicKeyPem,
    oaepHash: 'sha256',
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  }, contentKey);

  contentKey.fill(0);
  return {
    schema_version: 1,
    purpose: 'zapp-v2-migration-ledger-reconciliation',
    generated_at: generatedAt,
    algorithms: {
      payload: 'aes-256-gcm',
      key_wrap: 'rsa-oaep-sha256',
    },
    versions: records.map(({ version }) => version),
    plaintext_sha256: sha256(payload),
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
  const authTag = Buffer.from(envelope.auth_tag_base64 || '', 'base64');
  if (authTag.length !== 16) {
    throw new Error('tag de autenticacao GCM invalida');
  }
  const contentKey = crypto.privateDecrypt({
    key: privateKeyPem,
    oaepHash: 'sha256',
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  }, Buffer.from(envelope.wrapped_key_base64, 'base64'));
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    contentKey,
    Buffer.from(envelope.iv_base64, 'base64'),
  );
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext_base64, 'base64')),
    decipher.final(),
  ]);
  contentKey.fill(0);
  if (sha256(plaintext) !== envelope.plaintext_sha256) {
    throw new Error('hash da evidencia descriptografada diverge');
  }
  return JSON.parse(plaintext.toString('utf8'));
}

function queryLedger(connectionString) {
  try {
    return execFileSync(
      PSQL_BIN,
      [
        '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--tuples-only', '--no-align',
        '--quiet', '--dbname', connectionString, '--command', buildLedgerQuery(),
      ],
      {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PGOPTIONS: process.env.PGOPTIONS
            || '-c default_transaction_read_only=on -c statement_timeout=15000',
        },
      },
    );
  } catch (error) {
    const detail = safeError(error?.stderr, connectionString);
    throw new Error(`falha ao consultar ledger em modo somente leitura${detail ? `: ${detail}` : ''}`);
  }
}

export function main() {
  const connectionString = process.env.DESTINO_URL;
  const publicKeyBase64 = process.env.LEDGER_EVIDENCE_PUBLIC_KEY_BASE64;
  if (!connectionString) throw new Error('DESTINO_URL ausente');
  if (!publicKeyBase64 || !/^[A-Za-z0-9+/=]+$/.test(publicKeyBase64)) {
    throw new Error('chave publica base64 ausente ou invalida');
  }

  let publicKeyPem;
  try {
    publicKeyPem = Buffer.from(publicKeyBase64, 'base64').toString('utf8');
    crypto.createPublicKey(publicKeyPem);
  } catch {
    throw new Error('chave publica nao e uma PEM valida');
  }

  const records = parseLedger(queryLedger(connectionString));
  const envelope = encryptEvidence(records, publicKeyPem);
  const output = path.resolve(OUTPUT_PATH);
  const temporary = `${output}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify(envelope, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  fs.renameSync(temporary, output);
  fs.chmodSync(output, 0o600);
  console.log(`OK: ${records.length} registros do ledger cifrados; SQL bruto nao foi registrado.`);
}

const isCli = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  try {
    main();
  } catch (error) {
    console.error(`FALHA: ${error.message}`);
    process.exitCode = 1;
  }
}
