import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { sha256 } from './database-identity.mjs';
import { MANIFEST_SECTIONS } from './manifest-lib.mjs';

const SCRIPT = fileURLToPath(new URL('./check-manifest-fresh.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(SCRIPT), '../..');
const PROJECT_REF = 'tnnnlkbymytvtqngbbqh';
const DESTINO_URL =
  'postgresql://postgres.' + PROJECT_REF + ':senha-nao-pode-vazar' +
  '@aws-0-sa-east-1.pooler.supabase.com:6543/postgres';
const H1 = '11111111111111111111111111111111';
const H2 = '22222222222222222222222222222222';

const base = {
  format_version: 2,
  generated_at: '2026-08-29T12:00:00Z',
  database_identity: { database: 'postgres', schema: 'public', server_major: 17 },
  how_to_regenerate: 'scripts/db-audit/manifest.sql',
  columns: { 'contacts.id': H1 },
  defaults: { 'contacts.created_at': H1 },
  constraints: { 'relation:contacts.contacts_pkey': H1 },
  indexes: { 'contacts.contacts_pkey': H1 },
  views: { 'v:active_contacts': H1 },
  types: { 'e:contact_state': H1 },
  rls: { contacts: H1 },
  policies: { 'contacts.contacts_select': H1 },
  triggers: { 'contacts.set_updated_at': H1 },
  functions: { 'f:get_contact(uuid)': H1 },
  relation_grants: { 'r:public.contacts|authenticated|SELECT|grantor=postgres': H1 },
  column_grants: { 'r:public.contacts.email|authenticated|SELECT|grantor=postgres': H1 },
  routine_grants: { 'f:get_contact(uuid)|authenticated|EXECUTE|grantor=postgres': H1 },
  type_grants: { 'e:public.contact_state|authenticated|USAGE|grantor=postgres': H1 },
  default_grants: { 'public|postgres|r|authenticated|SELECT|grantor=postgres': H1 },
  schema_grants: { 'public|authenticated|USAGE|grantor=postgres': H1 },
};

function executar(commitado, fresco, opcoes = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-fresh-test-'));
  const commitadoPath = path.join(tmp, 'schema-manifest.json');
  const frescoPath = path.join(tmp, 'fresh-manifest.json');
  const identidadePath = path.join(tmp, 'database-identity.json');
  if (!opcoes.omitirCommitado) {
    fs.writeFileSync(commitadoPath, typeof commitado === 'string' ? commitado : JSON.stringify(commitado));
  }
  fs.writeFileSync(frescoPath, typeof fresco === 'string' ? fresco : JSON.stringify(fresco));
  fs.writeFileSync(identidadePath, JSON.stringify({
    format_version: 1,
    connection_provider: 'supabase-cloud',
    project_ref_sha256: sha256(PROJECT_REF),
    database: 'postgres',
    schema: 'public',
    server_major: 17,
  }));

  const result = spawnSync(process.execPath, [SCRIPT, frescoPath], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      MANIFEST_PATH: commitadoPath,
      CATALOG_IDENTITY_PATH: identidadePath,
      DESTINO_URL,
      ...opcoes.env,
    },
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  return result;
}

test('aceita manifesto identico apesar da ordem e do generated_at', () => {
  const fresco = {
    ...base,
    generated_at: '2026-08-30T00:00:00Z',
    columns: Object.fromEntries(Object.entries(base.columns).reverse()),
  };
  const result = executar(base, fresco);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OK: manifesto estrutural em sincronia/);
});

for (const secao of MANIFEST_SECTIONS) {
  test('detecta objeto novo na secao ' + secao, () => {
    const fresco = { ...base, [secao]: { ...base[secao], ['novo.' + secao]: H2 } };
    const result = executar(base, fresco);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, new RegExp('\\[' + secao + '\\].*so em banco: 1'));
  });
}

test('detecta alteracao de default pelo hash', () => {
  const fresco = { ...base, defaults: { 'contacts.created_at': H2 } };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[defaults\].*divergente: 1/);
  assert.match(result.stdout, /contacts\.created_at/);
});

test('detecta constraint removida do banco', () => {
  const fresco = { ...base, constraints: {} };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[constraints\] so em arquivo: 1/);
});

test('retorna 2 quando secao falta no manifesto fresco', () => {
  const { indexes: _indexes, ...fresco } = base;
  const result = executar(base, fresco);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /manifesto fresco: secao \[indexes\] ausente ou invalida/);
});

test('retorna 2 para hash malformado no manifesto fresco', () => {
  const fresco = { ...base, indexes: { 'contacts.contacts_pkey': 'nao-e-md5' } };
  const result = executar(base, fresco);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /\[indexes\] hash invalido/);
});

test('retorna 1 quando o snapshot commitado e estruturalmente antigo', () => {
  const { defaults: _defaults, ...commitado } = base;
  const result = executar(commitado, base);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DRIFT: manifesto commitado: secao \[defaults\] ausente ou invalida/);
});

test('retorna 1 para bootstrap sem snapshot somente apos provar o banco fresco', () => {
  const result = executar(base, base, { omitirCommitado: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /snapshot commitado ausente.*identidade comprovada/);
});

test('bloqueia bootstrap sem snapshot quando o destino nao e o oficial', () => {
  const result = executar(base, base, {
    omitirCommitado: true,
    env: {
      DESTINO_URL:
        'postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:segredo' +
        '@aws-0.pooler.supabase.com:6543/postgres',
    },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /fingerprint divergente/);
  assert.doesNotMatch(result.stderr + result.stdout, /segredo|aaaaaaaaaaaaaaaaaaaa/);
});

test('retorna 2 quando identidade fresca diverge', () => {
  const fresco = {
    ...base,
    database_identity: { ...base.database_identity, database: 'outro' },
  };
  const result = executar(base, fresco);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /database esperado="postgres" obtido="outro"/);
});

test('retorna 2 para outro projeto e nao vaza URL ou senha', () => {
  const result = executar(base, base, {
    env: {
      DESTINO_URL:
        'postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:senha-ultrassecreta' +
        '@aws-0.pooler.supabase.com:6543/postgres',
    },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /fingerprint divergente/);
  assert.doesNotMatch(result.stderr + result.stdout, /senha-ultrassecreta|aaaaaaaaaaaaaaaaaaaa/);
});

test('retorna 2 sem DESTINO_URL', () => {
  const result = executar(base, base, { env: { DESTINO_URL: '' } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /DESTINO_URL ausente/);
});

test('retorna 2 para JSON fresco malformado', () => {
  const result = executar(base, '{invalido');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /manifesto fresco invalido/);
});
