import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const SCRIPT = fileURLToPath(new URL('./seed-local-imagens.ts', import.meta.url));
const RAIZ = path.resolve(path.dirname(SCRIPT), '../..');

function rodar(env = {}) {
  const r = spawnSync('bun', [SCRIPT], { cwd: RAIZ, encoding: 'utf8', env });
  assert.equal(r.error, undefined, 'bun encontrado no PATH');
  return r;
}

test('recusa execucao com API_URL ausente', () => {
  const r = rodar({ PATH: process.env.PATH });
  assert.notEqual(r.status, 0);
  const saida = r.stderr + r.stdout;
  assert.match(saida, /API_URL/);
  assert.match(saida, /ausente/);
});

test('recusa execucao com DB_URL ausente', () => {
  const r = rodar({ PATH: process.env.PATH, API_URL: 'http://localhost:3000' });
  assert.notEqual(r.status, 0);
  const saida = r.stderr + r.stdout;
  assert.match(saida, /DB_URL/);
  assert.match(saida, /ausente/);
});

test('recusa execucao com SERVICE_ROLE_KEY ausente', () => {
  const r = rodar({
    PATH: process.env.PATH,
    API_URL: 'http://localhost:3000',
    DB_URL: 'postgres://localhost:5432/db',
  });
  assert.notEqual(r.status, 0);
  const saida = r.stderr + r.stdout;
  assert.match(saida, /SERVICE_ROLE_KEY/);
  assert.match(saida, /ausente/);
});

test('recusa API_URL apontando para host nao-local', () => {
  const r = rodar({
    PATH: process.env.PATH,
    API_URL: 'https://app.supabase.co',
    DB_URL: 'postgres://localhost:5432/db',
    SERVICE_ROLE_KEY: 'chave-de-teste',
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /host n.o-local|Proibido/);
});

test('recusa DB_URL apontando para host nao-local', () => {
  const r = rodar({
    PATH: process.env.PATH,
    API_URL: 'http://localhost:3000',
    DB_URL: 'postgres://db.supabase.co:5432/postgres',
    SERVICE_ROLE_KEY: 'chave-de-teste',
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /host n.o-local|Proibido/);
});

test('localhost passa a guarda de host (falha na conexao SQL, nao na validacao)', () => {
  const r = rodar({
    PATH: process.env.PATH,
    API_URL: 'http://localhost:54321',
    DB_URL: 'postgres://localhost:54321/db',
    SERVICE_ROLE_KEY: 'chave-de-teste',
  });
  // A guarda de host local nao pode bloquear — so deve falhar na conexao SQL
  assert.doesNotMatch(r.stderr + r.stdout, /Proibido — só banco local/);
});
