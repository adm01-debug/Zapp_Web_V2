import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const installer = await readFile(new URL('scripts/ci/install-postgresql-client.sh', root), 'utf8');
const workflows = [
  '.github/workflows/db-live-guard.yml',
  '.github/workflows/db-migrate.yml',
  '.github/workflows/supabase-sync.yml',
  '.github/workflows/targeted-ledger-evidence.yml',
  '.github/workflows/types-sync.yml',
];
const inlineAptPattern = /\b(?:sudo\s+)?apt(?:-get)?\b/;

test('installer uses only the official Ubuntu source and fails closed', () => {
  assert.match(installer, /ubuntu\.sources/);
  assert.match(installer, /Dir::Etc::sourceparts=-/);
  assert.match(installer, /Acquire::Retries=3/);
  assert.match(installer, /--no-install-recommends postgresql-client/);
  assert.match(installer, /command -v psql/);
});

test('database workflows share the hardened PostgreSQL client installer', async () => {
  for (const path of workflows) {
    const workflow = await readFile(new URL(path, root), 'utf8');
    assert.match(workflow, /bash scripts\/ci\/install-postgresql-client\.sh/, path);
    assert.doesNotMatch(workflow, inlineAptPattern, path);
  }
});

test('inline APT guard rejects command variants and intermediate options', () => {
  for (const command of [
    'apt update',
    'apt-get update',
    'sudo apt-get -qq update',
    'sudo apt -y install postgresql-client',
    'sudo apt-get --option Acquire::Retries=3 install postgresql-client',
  ]) {
    assert.match(command, inlineAptPattern, command);
  }
});
