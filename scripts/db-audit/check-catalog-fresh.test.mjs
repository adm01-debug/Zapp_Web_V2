import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { sha256 } from './database-identity.mjs';

const SCRIPT = fileURLToPath(new URL('./check-catalog-fresh.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(SCRIPT), '../..');
const PROJECT_REF = 'tnnnlkbymytvtqngbbqh';
const DESTINO_URL =
  'postgresql://postgres.' + PROJECT_REF + ':senha-nao-pode-vazar' +
  '@aws-0-sa-east-1.pooler.supabase.com:6543/postgres';

const base = {
  format_version: 2,
  generated_at: '2026-08-29',
  source: 'postgres schema public',
  database_identity: { database: 'postgres', schema: 'public', server_major: 17 },
  how_to_regenerate: 'scripts/db-audit/catalog.sql',
  tables: ['contacts', 'gmail_accounts'],
  views: ['gmail_accounts_safe'],
  columns: [
    'contacts.id:uuid:not-null',
    'gmail_accounts.id:uuid:not-null',
  ],
  functions: ['get_gmail_tokens', 'store_gmail_tokens'],
  function_signatures: [
    'get_gmail_tokens(uuid)->jsonb|kind=f',
    'store_gmail_tokens(uuid, text)->void|kind=f',
  ],
};

function executar(commitado, fresco, opcoes = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-fresh-test-'));
  const catalogoPath = path.join(tmp, 'catalogo.json');
  const frescoPath = path.join(tmp, 'fresco.json');
  const identidadePath = path.join(tmp, 'identidade.json');
  fs.writeFileSync(catalogoPath, JSON.stringify(commitado));
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
      CATALOG_PATH: catalogoPath,
      CATALOG_IDENTITY_PATH: identidadePath,
      DESTINO_URL: DESTINO_URL,
      ...opcoes.env,
    },
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  return result;
}

test('aceita conjuntos identicos em ordem diferente', () => {
  const fresco = Object.fromEntries(
    Object.entries(base).map(([chave, valor]) => [chave, Array.isArray(valor) ? [...valor].reverse() : valor]),
  );
  const result = executar(base, fresco);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OK: catalogo em sincronia/);
});

test('falha quando surge coluna nova no banco', () => {
  const fresco = { ...base, columns: [...base.columns, 'contacts.workspace_id:uuid:nullable'] };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contacts\.workspace_id:uuid:nullable/);
});

test('falha quando o tipo de uma coluna muda', () => {
  const fresco = { ...base, columns: ['contacts.id:text:not-null', base.columns[1]] };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contacts\.id:text:not-null/);
});

test('falha quando a nulabilidade de uma coluna muda', () => {
  const fresco = { ...base, columns: ['contacts.id:uuid:nullable', base.columns[1]] };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contacts\.id:uuid:nullable/);
});

test('falha quando surge funcao nova no banco', () => {
  const fresco = {
    ...base,
    functions: [...base.functions, 'encrypt_gmail_token'],
    function_signatures: [
      ...base.function_signatures,
      'encrypt_gmail_token(text)->text|kind=f',
    ],
  };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /encrypt_gmail_token/);
});

test('falha quando surge overload com o mesmo nome de funcao', () => {
  const fresco = {
    ...base,
    function_signatures: [
      ...base.function_signatures,
      'get_gmail_tokens(uuid, boolean)->jsonb|kind=f',
    ],
  };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /get_gmail_tokens\(uuid, boolean\)->jsonb\|kind=f/);
});

test('falha quando retorno de funcao muda', () => {
  const fresco = {
    ...base,
    function_signatures: [
      'get_gmail_tokens(uuid)->text|kind=f',
      base.function_signatures[1],
    ],
  };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /get_gmail_tokens\(uuid\)->text\|kind=f/);
});

test('falha quando identidade estrutural aponta para outro database', () => {
  const fresco = {
    ...base,
    source: 'outro schema public',
    database_identity: { ...base.database_identity, database: 'outro' },
  };
  const result = executar(base, fresco);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /database esperado="postgres" obtido="outro"/);
});

test('falha quando DESTINO_URL aponta para outro projeto sem vazar credencial', () => {
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

test('falha fechado sem DESTINO_URL', () => {
  const result = executar(base, base, { env: { DESTINO_URL: '' } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /DESTINO_URL ausente/);
});

test('falha fechado quando uma secao obrigatoria esta ausente', () => {
  const { columns: _columns, ...semColunas } = base;
  const result = executar(semColunas, base);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[columns\] secao ausente ou invalida/);
});

test('retorna 2 quando uma secao obrigatoria falta no catalogo fresco', () => {
  const { function_signatures: _signatures, ...fresco } = base;
  const result = executar(base, fresco);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /\[function_signatures\] secao ausente ou invalida no catalogo fresco/);
});

test('retorna 2 quando how_to_regenerate e invalido no catalogo fresco', () => {
  const fresco = { ...base, how_to_regenerate: 'script-nao-oficial.sql' };
  const result = executar(base, fresco);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /how_to_regenerate ausente ou invalido no catalogo fresco/);
});

test('retorna 1 quando how_to_regenerate e invalido no catalogo commitado', () => {
  const commitado = { ...base, how_to_regenerate: 'script-antigo.sql' };
  const result = executar(commitado, base);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /how_to_regenerate ausente ou invalido no catalogo commitado/);
});

test('falha fechado quando o catalogo contem entrada duplicada', () => {
  const fresco = { ...base, functions: [...base.functions, base.functions[0]] };
  const result = executar(base, fresco);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /entradas duplicadas no catalogo fresco/);
});

test('falha fechado para JSON fresco malformado', () => {
  const result = executar(base, '{invalido');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /catalogo fresco invalido/);
});
