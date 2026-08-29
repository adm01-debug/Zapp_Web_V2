import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  TARGET_VERSIONS,
  buildLedgerQuery,
  decryptEvidence,
  encryptEvidence,
  parseLedger,
} from './export-migration-ledger-evidence.mjs';

const SCRIPT = fileURLToPath(new URL('./export-migration-ledger-evidence.mjs', import.meta.url));
const SECRET_SQL = "SELECT 'nao-pode-vazar'";

function keys() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

function ledgerLines(versions = TARGET_VERSIONS) {
  return versions.map((version) => JSON.stringify({
    version,
    name: `migration_${version}`,
    statements: [SECRET_SQL],
  })).join('\n');
}

test('query limita a extracao as versions auditadas', () => {
  const query = buildLedgerQuery();
  assert.match(query, /supabase_migrations\.schema_migrations/);
  for (const version of TARGET_VERSIONS) assert.match(query, new RegExp(version));
  assert.match(query, /ORDER BY version/);
});

test('parser exige exatamente o conjunto esperado e rejeita duplicatas', () => {
  const parsed = parseLedger(ledgerLines());
  assert.equal(parsed.length, TARGET_VERSIONS.length);
  assert.throws(() => parseLedger(ledgerLines(TARGET_VERSIONS.slice(1))), /ausentes=/);
  assert.throws(
    () => parseLedger(ledgerLines([...TARGET_VERSIONS, TARGET_VERSIONS[0]])),
    /versions duplicadas/,
  );
});

test('parser aceita statements nulos do ledger legado e normaliza para array vazio', () => {
  const raw = TARGET_VERSIONS.map((version) => JSON.stringify({
    version,
    name: `migration_${version}`,
    statements: null,
  })).join('\n');
  const parsed = parseLedger(raw);
  assert.ok(parsed.every(({ statements }) => Array.isArray(statements) && statements.length === 0));
});

test('envelope cifra e autentica o SQL sem deixa-lo em texto claro', () => {
  const pair = keys();
  const records = parseLedger(ledgerLines());
  const envelope = encryptEvidence(records, pair.publicKey, '2026-08-29T00:00:00.000Z');
  assert.doesNotMatch(JSON.stringify(envelope), /nao-pode-vazar/);
  const decrypted = decryptEvidence(envelope, pair.privateKey);
  assert.deepEqual(decrypted.records, records);

  const tampered = { ...envelope, auth_tag_base64: Buffer.alloc(16).toString('base64') };
  assert.throws(() => decryptEvidence(tampered, pair.privateKey));

  const shortTag = { ...envelope, auth_tag_base64: Buffer.alloc(15).toString('base64') };
  assert.throws(
    () => decryptEvidence(shortTag, pair.privateKey),
    /tag de autenticacao GCM invalida/,
  );
});

test('CLI consulta psql fake, grava modo 0600 e nao vaza URL ou SQL', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-evidence-test-'));
  const fakePsql = path.join(tmp, 'psql-fake');
  const output = path.join(tmp, 'evidence.json');
  const pair = keys();
  fs.writeFileSync(fakePsql, '#!/usr/bin/env bash\nprintf \'%s\\n\' "$FAKE_LEDGER"\n');
  fs.chmodSync(fakePsql, 0o700);

  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DESTINO_URL: 'postgresql://usuario:senha-ultrassecreta@db.example/postgres',
      LEDGER_EVIDENCE_PUBLIC_KEY_BASE64: Buffer.from(pair.publicKey).toString('base64'),
      LEDGER_EVIDENCE_OUTPUT: output,
      PSQL_BIN: fakePsql,
      FAKE_LEDGER: ledgerLines(),
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /nao-pode-vazar|senha-ultrassecreta/);
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  const envelope = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(decryptEvidence(envelope, pair.privateKey).records.length, TARGET_VERSIONS.length);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('CLI falha fechado quando o ledger omite uma version e nao cria artefato', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-evidence-test-'));
  const fakePsql = path.join(tmp, 'psql-fake');
  const output = path.join(tmp, 'evidence.json');
  const pair = keys();
  fs.writeFileSync(fakePsql, '#!/usr/bin/env bash\nprintf \'%s\\n\' "$FAKE_LEDGER"\n');
  fs.chmodSync(fakePsql, 0o700);

  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DESTINO_URL: 'postgresql://usuario:segredo@db.example/postgres',
      LEDGER_EVIDENCE_PUBLIC_KEY_BASE64: Buffer.from(pair.publicKey).toString('base64'),
      LEDGER_EVIDENCE_OUTPUT: output,
      PSQL_BIN: fakePsql,
      FAKE_LEDGER: ledgerLines(TARGET_VERSIONS.slice(1)),
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /ledger incompleto/);
  assert.equal(fs.existsSync(output), false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('CLI captura stderr do psql e redige a credencial antes de registrar erro', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-evidence-test-'));
  const fakePsql = path.join(tmp, 'psql-fake');
  const output = path.join(tmp, 'evidence.json');
  const pair = keys();
  fs.writeFileSync(
    fakePsql,
    '#!/usr/bin/env bash\nprintf \'psql falhou em %s\\n\' "$DESTINO_URL" >&2\nexit 2\n',
  );
  fs.chmodSync(fakePsql, 0o700);
  const secretUrl = 'postgresql://usuario:senha-ultrassecreta@db.example/postgres';

  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DESTINO_URL: secretUrl,
      LEDGER_EVIDENCE_PUBLIC_KEY_BASE64: Buffer.from(pair.publicKey).toString('base64'),
      LEDGER_EVIDENCE_OUTPUT: output,
      PSQL_BIN: fakePsql,
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /<DESTINO_URL>/);
  assert.doesNotMatch(result.stderr + result.stdout, /senha-ultrassecreta|db\.example/);
  assert.equal(fs.existsSync(output), false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('CLI rejeita base64 que nao contem chave publica PEM', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-evidence-test-'));
  const output = path.join(tmp, 'evidence.json');
  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DESTINO_URL: 'postgresql://usuario:segredo@db.example/postgres',
      LEDGER_EVIDENCE_PUBLIC_KEY_BASE64: Buffer.from('nao-e-chave').toString('base64'),
      LEDGER_EVIDENCE_OUTPUT: output,
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PEM valida/);
  assert.equal(fs.existsSync(output), false);
  fs.rmSync(tmp, { recursive: true, force: true });
});
