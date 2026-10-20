import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  buildLedgerQuery,
  decryptEvidence,
  encryptEvidence,
  parseLedger,
  parseTargetVersions,
} from './export-targeted-ledger-evidence.mjs';

const records = [
  { version: '20260906090000', name: 'first', statements: ['SELECT secret_one'] },
  { version: '20260906140000', name: 'second', statements: ['SELECT secret_two'] },
];

test('aceita somente lista pequena, explicita e unica de versions', () => {
  assert.deepEqual(parseTargetVersions('20260906140000, 20260906090000'), [
    '20260906090000', '20260906140000',
  ]);
  assert.throws(() => parseTargetVersions(''), /entre 1 e 20/u);
  assert.throws(() => parseTargetVersions('20260906090000,20260906090000'), /duplicatas/u);
  assert.throws(() => parseTargetVersions('20260906090000,1); DROP TABLE x'), /invalida/u);
});

test('query usa exclusivamente versions previamente validadas', () => {
  const query = buildLedgerQuery(parseTargetVersions('20260906090000,20260906140000'));
  assert.match(query, /WHERE version IN \('20260906090000', '20260906140000'\)/u);
  assert.doesNotMatch(query, /DROP TABLE/u);
});

test('parser exige cardinalidade, tipos e escopo exatos', () => {
  const raw = records.map((record) => JSON.stringify(record)).join('\n');
  assert.deepEqual(parseLedger(raw, records.map(({ version }) => version)), records);
  assert.throws(() => parseLedger(raw.split('\n')[0], records.map(({ version }) => version)), /incompleto/u);
  assert.throws(() => parseLedger('{', records.map(({ version }) => version)), /JSON invalido/u);
  assert.throws(() => parseLedger(JSON.stringify({ ...records[0], statements: [1] }), [records[0].version]), /statements invalidos/u);
});

test('envelope autenticado descriptografa somente com a chave privada correspondente', () => {
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const envelope = encryptEvidence(records, pair.publicKey, '2026-09-07T00:00:00.000Z');
  assert.deepEqual(decryptEvidence(envelope, pair.privateKey).records, records);
  assert.throws(() => decryptEvidence(envelope, other.privateKey));
});

test('qualquer adulteracao no ciphertext falha fechado', () => {
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const envelope = encryptEvidence(records, pair.publicKey);
  const ciphertext = Buffer.from(envelope.ciphertext_base64, 'base64');
  ciphertext[0] ^= 1;
  envelope.ciphertext_base64 = ciphertext.toString('base64');
  assert.throws(() => decryptEvidence(envelope, pair.privateKey));
});
