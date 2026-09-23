import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SCRIPT = fileURLToPath(new URL('./check-grants-fresh.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(SCRIPT), '../..');

const base = {
  generated_at: '2026-09-16T00:00:00Z',
  note: 'gerado por grants-baseline.sql',
  how_to_regenerate: 'scripts/db-audit/grants-baseline.sql',
  anon_execute: ['func_a', 'func_b'],
  anon_table_select: ['tabela_a', 'tabela_b'],
  authenticated_execute_count: 81,
  service_role_execute_count: 124,
};

function executar(commitado, fresco, opcoes = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grants-fresh-test-'));
  const commitadoPath = path.join(tmp, 'baseline.json');
  const frescoPath = path.join(tmp, 'fresco.json');
  fs.writeFileSync(commitadoPath, typeof commitado === 'string' ? commitado : JSON.stringify(commitado));
  fs.writeFileSync(frescoPath, typeof fresco === 'string' ? fresco : JSON.stringify(fresco));
  const result = spawnSync(process.execPath, [SCRIPT, frescoPath], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      GRANTS_BASELINE_PATH: commitadoPath,
      ...opcoes.env,
    },
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  return result;
}

test('aceita baselines identicas', () => {
  const result = executar(base, base);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OK: baseline de grants em sincronia/);
});

test('ignora mudanca so em metadados (generated_at/note/how_to_regenerate)', () => {
  const fresco = {
    ...base,
    generated_at: '2026-09-23T12:00:00Z',
    note: 'regerado hoje',
    how_to_regenerate: 'outro comando qualquer',
  };
  const result = executar(base, fresco);
  assert.equal(result.status, 0, result.stderr);
});

test('falha quando um grant novo aparece no banco (anon_execute)', () => {
  const fresco = { ...base, anon_execute: ['func_a', 'func_b', 'func_c'] };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
});

test('falha quando um grant e removido do banco (anon_table_select)', () => {
  const fresco = { ...base, anon_table_select: ['tabela_a'] };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
});

test('falha quando um contador de execute muda', () => {
  const fresco = { ...base, authenticated_execute_count: base.authenticated_execute_count + 1 };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
});

test('retorna 2 para JSON fresco malformado', () => {
  const result = executar(base, '{invalido');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /baseline de grants fresco invalido/);
});

test('retorna 2 para JSON commitado malformado', () => {
  const result = executar('{invalido', base);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /baseline de grants commitado invalido/);
});

test('retorna 2 quando array de grants nao esta ordenado (formato invalido)', () => {
  const fresco = { ...base, anon_execute: ['func_b', 'func_a'] };
  const result = executar(base, fresco);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /formato invalido/);
});

test('retorna 2 quando array de grants tem entrada duplicada', () => {
  const fresco = { ...base, anon_table_select: ['tabela_a', 'tabela_a', 'tabela_b'] };
  const result = executar(base, fresco);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /formato invalido/);
});

test('retorna 2 quando um contador de execute nao e inteiro', () => {
  const fresco = { ...base, service_role_execute_count: 1.5 };
  const result = executar(base, fresco);
  assert.equal(result.status, 2);
});

test('retorna 2 quando falta uma chave obrigatoria', () => {
  const { anon_table_select: _omitido, ...frescoSemChave } = base;
  const result = executar(base, frescoSemChave);
  assert.equal(result.status, 2);
});

test('e insensivel a ordem de chaves do objeto e a ordenacao dos arrays ja validos', () => {
  const commitadoReordenado = {
    service_role_execute_count: base.service_role_execute_count,
    authenticated_execute_count: base.authenticated_execute_count,
    anon_table_select: base.anon_table_select,
    anon_execute: base.anon_execute,
    how_to_regenerate: base.how_to_regenerate,
    note: base.note,
    generated_at: base.generated_at,
  };
  const result = executar(commitadoReordenado, base);
  assert.equal(result.status, 0, result.stderr);
});

test('exige argumento com o caminho do arquivo fresco', () => {
  const result = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /uso: node check-grants-fresh\.mjs/);
});
