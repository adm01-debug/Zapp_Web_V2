import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SCRIPT = fileURLToPath(new URL('./check-catalog-fresh.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(SCRIPT), '../..');

const base = {
  generated_at: '2026-08-29',
  source: 'postgres schema public',
  how_to_regenerate: 'scripts/db-audit/catalog.sql',
  tables: ['contacts', 'gmail_accounts'],
  views: ['gmail_accounts_safe'],
  columns: [
    'contacts.id:uuid:not-null',
    'gmail_accounts.id:uuid:not-null',
  ],
  functions: ['get_gmail_tokens', 'store_gmail_tokens'],
};

function executar(commitado, fresco) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-fresh-test-'));
  const catalogoPath = path.join(tmp, 'catalogo.json');
  const frescoPath = path.join(tmp, 'fresco.json');
  fs.writeFileSync(catalogoPath, JSON.stringify(commitado));
  fs.writeFileSync(frescoPath, typeof fresco === 'string' ? fresco : JSON.stringify(fresco));
  const result = spawnSync(process.execPath, [SCRIPT, frescoPath], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, CATALOG_PATH: catalogoPath },
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
  const fresco = { ...base, functions: [...base.functions, 'encrypt_gmail_token'] };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /encrypt_gmail_token/);
});

test('falha fechado quando uma secao obrigatoria esta ausente', () => {
  const { columns: _columns, ...semColunas } = base;
  const result = executar(semColunas, base);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[columns\] secao ausente ou invalida/);
});

test('falha fechado quando o catalogo contem entrada duplicada', () => {
  const fresco = { ...base, functions: [...base.functions, base.functions[0]] };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /entradas duplicadas no catalogo fresco/);
});

test('falha fechado para JSON fresco malformado', () => {
  const result = executar(base, '{invalido');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /catalogo fresco invalido/);
});
