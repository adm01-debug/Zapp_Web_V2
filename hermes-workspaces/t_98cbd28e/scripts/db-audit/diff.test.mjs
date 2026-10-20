import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { MANIFEST_SECTIONS } from './manifest-lib.mjs';

const SCRIPT = fileURLToPath(new URL('./diff.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(SCRIPT), '../..');
const H1 = '11111111111111111111111111111111';
const H2 = '22222222222222222222222222222222';

function manifesto(database = 'postgres') {
  return {
    format_version: 2,
    generated_at: '2026-08-29T12:00:00Z',
    database_identity: { database, schema: 'public', server_major: 17 },
    how_to_regenerate: 'scripts/db-audit/manifest.sql',
    ...Object.fromEntries(MANIFEST_SECTIONS.map((secao) => [secao, {}])),
    defaults: { 'contacts.created_at': H1 },
  };
}

function executar(A, B) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-diff-test-'));
  const a = path.join(tmp, 'a.json');
  const b = path.join(tmp, 'b.json');
  fs.writeFileSync(a, typeof A === 'string' ? A : JSON.stringify(A));
  fs.writeFileSync(b, typeof B === 'string' ? B : JSON.stringify(B));
  const result = spawnSync(process.execPath, [SCRIPT, a, b], { cwd: ROOT, encoding: 'utf8' });
  fs.rmSync(tmp, { recursive: true, force: true });
  return result;
}

test('aceita estruturas identicas de bancos com identidades diferentes', () => {
  const result = executar(manifesto('origem'), manifesto('destino'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Total de divergencias: 0/);
});

test('retorna 1 e identifica objeto divergente', () => {
  const A = manifesto();
  const B = manifesto();
  B.defaults['contacts.created_at'] = H2;
  const result = executar(A, B);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[defaults\].*divergente: 1/);
  assert.match(result.stdout, /contacts\.created_at/);
});

test('retorna 2 para manifesto invalido', () => {
  const result = executar(manifesto(), '{invalido');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /manifesto B invalido/);
});
